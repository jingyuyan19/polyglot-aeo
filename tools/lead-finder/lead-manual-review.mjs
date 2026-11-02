#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CRM = "tools/lead-finder/outreach.local.csv";
const DEFAULT_OUTPUT = ".tmp/framer-manual-review.md";
const DEFAULT_JSON = ".tmp/framer-manual-review.json";
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRIES = 2;

function usage() {
  return `
Usage:
  pnpm lead:manual-review

Options:
  --crm <file>          Local CRM CSV. Default: ${DEFAULT_CRM}
  --output <file>       Markdown report. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON report. Default: ${DEFAULT_JSON}
  --status <status>     CRM status to inspect. Default: manual_review
  --timeout-ms <n>      Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --retries <n>         Retries for transient fetch failures. Default: ${DEFAULT_RETRIES}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    crm: DEFAULT_CRM,
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
    status: "manual_review",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--crm") {
      args.crm = value;
      index += 1;
      continue;
    }
    if (key === "--output") {
      args.output = value;
      index += 1;
      continue;
    }
    if (key === "--json") {
      args.json = value;
      index += 1;
      continue;
    }
    if (key === "--status") {
      args.status = value;
      index += 1;
      continue;
    }
    if (key === "--timeout-ms") {
      args.timeoutMs = positiveInt(value, key);
      index += 1;
      continue;
    }
    if (key === "--retries") {
      args.retries = positiveInt(value, key);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${key}`);
  }

  return args;
}

function positiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function readRows(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function host(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeHtml(match[1] || match[2] || match[3] || "") : "";
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractEmails(text) {
  return Array.from(
    new Set(
      Array.from(String(text || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
        .map((match) => match[0].toLowerCase())
        .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp|avif)$/i.test(email))
        .filter((email) => {
          const [local, domain] = email.split("@");
          if (["email", "name", "user", "test", "example", "jane", "john", "designer"].includes(local)) {
            return false;
          }
          return !/^(example|domain|test)\./i.test(domain || "");
        }),
    ),
  );
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(String(html || "")))) {
    const rawHref = decodeHtml(match[1] || match[2] || match[3] || "").trim();
    const text = stripTags(match[4] || "");
    if (!rawHref) continue;

    if (/^mailto:/i.test(rawHref)) {
      links.push({ href: rawHref, text });
      continue;
    }

    try {
      const resolved = new URL(rawHref, baseUrl);
      resolved.hash = "";
      links.push({ href: resolved.href, text });
    } catch {
      // Ignore malformed links in manual review.
    }
  }

  return links;
}

function sameSite(a, b) {
  return Boolean(host(a) && host(a) === host(b));
}

function contactLinks(links, baseUrl) {
  const contactWords = /(contact|about|connect|work|hire|book|schedule|inquiry|enquiry|start|hello|mail)/i;
  return links
    .filter((link) => /^mailto:/i.test(link.href) || (sameSite(link.href, baseUrl) && contactWords.test(`${link.href} ${link.text}`)))
    .slice(0, 8);
}

function socialLinks(links) {
  return links
    .filter((link) => /(linkedin\.com|x\.com|twitter\.com|instagram\.com|behance\.net|dribbble\.com|github\.com)/i.test(link.href))
    .slice(0, 8);
}

async function fetchText(url, args) {
  let last = { ok: false, status: 0, url, text: "", error: "not fetched" };

  for (let attempt = 0; attempt <= args.retries; attempt += 1) {
    last = await fetchOnce(url, args.timeoutMs);
    const transient = !last.ok && (last.status === 0 || last.status >= 500);
    if (!transient || attempt === args.retries) return last;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }

  return last;
}

async function fetchOnce(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "PolyglotAEOManualReview/1.0 (+https://polyglotaeo.com)",
      },
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      text: "",
      error: error?.name === "AbortError" ? "timeout" : error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectRow(row, args) {
  const startUrl = normalizeUrl(row.final_url || row.domain);
  const homepage = startUrl ? await fetchText(startUrl, args) : { ok: false, status: 0, url: startUrl, text: "" };
  const title = extractTitle(homepage.text);
  const links = extractLinks(homepage.text, homepage.url || startUrl);
  const emails = new Set(extractEmails(homepage.text));
  const mailtoLinks = links.filter((link) => /^mailto:/i.test(link.href));
  for (const link of mailtoLinks) {
    for (const email of extractEmails(link.href.replace(/^mailto:/i, "").split("?")[0])) {
      emails.add(email);
    }
  }

  const existingContact = normalizeUrl(row.contact_url);
  const candidates = contactLinks(links, homepage.url || startUrl);
  if (existingContact && !candidates.some((link) => link.href === existingContact)) {
    candidates.unshift({ href: existingContact, text: "existing CRM contact" });
  }

  const fetchedContactPages = [];
  for (const link of candidates.filter((item) => /^https?:\/\//i.test(item.href)).slice(0, 3)) {
    const page = await fetchText(link.href, args);
    fetchedContactPages.push({ href: link.href, text: link.text, status: page.status, ok: page.ok, title: extractTitle(page.text) });
    for (const email of extractEmails(page.text)) emails.add(email);
    for (const mailto of extractLinks(page.text, page.url || link.href).filter((item) => /^mailto:/i.test(item.href))) {
      for (const email of extractEmails(mailto.href.replace(/^mailto:/i, "").split("?")[0])) emails.add(email);
    }
  }

  const emailList = Array.from(emails);
  const socials = socialLinks(links);
  const recommendation = emailList.length
    ? "email_found"
    : candidates.length
      ? "contact_page_ready"
      : socials.length
        ? "social_research"
        : "manual_research";

  return {
    domain: row.domain,
    status: row.status,
    score: row.score,
    final_url: row.final_url,
    homepage: {
      url: homepage.url,
      status: homepage.status,
      ok: homepage.ok,
      title,
      error: homepage.error || "",
    },
    emails: emailList,
    contact_candidates: candidates.map((link) => ({ href: link.href, text: link.text })),
    fetched_contact_pages: fetchedContactPages,
    social_candidates: socials.map((link) => ({ href: link.href, text: link.text })),
    recommendation,
    crm_command: crmCommand(row, { email: emailList[0], candidates, recommendation }),
  };
}

function crmCommand(row, result) {
  if (result.email) {
    return `pnpm lead:crm -- --domain ${shellQuote(row.domain)} --contact-url ${shellQuote(`mailto:${result.email}`)} --contact-channel email --set-status verified --note "manual review: email found"`;
  }

  const contactPage = result.candidates.find((link) => /^https?:\/\//i.test(link.href));
  if (contactPage) {
    return `pnpm lead:crm -- --domain ${shellQuote(row.domain)} --contact-url ${shellQuote(contactPage.href)} --contact-channel contact_page --next-action manual_contact_page_review --next-followup "$(date +%F)" --note "manual review: contact page found"`;
  }

  return `pnpm lead:crm -- --domain ${shellQuote(row.domain)} --next-action manual_find_contact_or_close --next-followup "$(date +%F)" --note "manual review: no direct contact found"`;
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

function renderMarkdown(results, args) {
  const lines = [
    "# Framer Manual Review",
    "",
    `CRM: ${args.crm}`,
    `Status: ${args.status}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  if (!results.length) {
    lines.push("No leads matched the selected status.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Recommendation | Domain | HTTP | Title | Email(s) | Contact candidates |");
  lines.push("|---|---|---:|---|---|---|");
  for (const item of results) {
    lines.push(
      `| ${item.recommendation} | ${item.domain} | ${item.homepage.status || 0} | ${escapeCell(item.homepage.title || "")} | ${item.emails.join(", ") || ""} | ${item.contact_candidates.map((link) => link.href).join("<br>") || ""} |`,
    );
  }
  lines.push("");

  for (const item of results) {
    lines.push(`## ${item.domain}`);
    lines.push("");
    lines.push(`- Recommendation: ${item.recommendation}`);
    lines.push(`- Homepage: ${item.homepage.url || item.final_url || item.domain} (${item.homepage.status || 0})`);
    if (item.homepage.title) lines.push(`- Title: ${item.homepage.title}`);
    if (item.emails.length) lines.push(`- Email: ${item.emails.join(", ")}`);
    if (item.contact_candidates.length) {
      lines.push("- Contact candidates:");
      for (const link of item.contact_candidates) {
        lines.push(`  - ${link.href}${link.text ? ` (${link.text})` : ""}`);
      }
    }
    if (item.social_candidates.length) {
      lines.push("- Social candidates:");
      for (const link of item.social_candidates) {
        lines.push(`  - ${link.href}${link.text ? ` (${link.text})` : ""}`);
      }
    }
    if (item.fetched_contact_pages.length) {
      lines.push("- Fetched contact pages:");
      for (const page of item.fetched_contact_pages) {
        lines.push(`  - ${page.href} (${page.status})${page.title ? ` - ${page.title}` : ""}`);
      }
    }
    lines.push("");
    lines.push("Suggested CRM command:");
    lines.push("");
    lines.push("```bash");
    lines.push(item.crm_command);
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "/").slice(0, 120);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const rows = (await readRows(args.crm)).filter((row) => row.status === args.status);
  const results = [];
  for (const row of rows) {
    results.push(await inspectRow(row, args));
  }

  await writeText(args.output, renderMarkdown(results, args));
  await writeText(args.json, `${JSON.stringify({ generated_at: new Date().toISOString(), crm: args.crm, status: args.status, results }, null, 2)}\n`);

  const counts = results.reduce((map, item) => {
    map.set(item.recommendation, (map.get(item.recommendation) || 0) + 1);
    return map;
  }, new Map());
  process.stdout.write(`Manual review leads: ${results.length}\n`);
  for (const [recommendation, count] of Array.from(counts.entries()).sort()) {
    process.stdout.write(`- ${recommendation}: ${count}\n`);
  }
  process.stdout.write(`Markdown: ${args.output}\n`);
  process.stdout.write(`JSON: ${args.json}\n`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
