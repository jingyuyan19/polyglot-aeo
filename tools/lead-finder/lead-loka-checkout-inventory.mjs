#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_SEARCH_ROOTS = [
  path.resolve(process.cwd(), ".."),
  path.resolve(process.env.HOME || "", "Documents/LokaFramerPlugin"),
];
const DEFAULT_OUTPUT = ".tmp/loka-checkout-origin-inventory.md";
const DEFAULT_JSON = ".tmp/loka-checkout-origin-inventory.json";
const DEFAULT_PRODUCT_ID = "prod_4XxS1DWWjH5IHwNTmOEX9h";
const DEFAULT_URLS = ["https://getloka.dev/", "https://getloka.dev/pricing"];

function usage() {
  return `
Usage:
  pnpm lead:loka-checkout

Options:
  --search-root <dir>   Local directory to search. Can be repeated. Default: ${DEFAULT_SEARCH_ROOTS.join(", ")}
  --product-id <id>     Creem product id. Default: ${DEFAULT_PRODUCT_ID}
  --url <url>           Public URL to inspect. Can be repeated. Default: ${DEFAULT_URLS.join(", ")}
  --output <file>       Markdown output. Default: ${DEFAULT_OUTPUT}
  --json <file>         JSON output. Default: ${DEFAULT_JSON}
  --help                Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    searchRoots: [...DEFAULT_SEARCH_ROOTS],
    productId: DEFAULT_PRODUCT_ID,
    urls: [...DEFAULT_URLS],
    output: DEFAULT_OUTPUT,
    json: DEFAULT_JSON,
  };

  let customUrls = false;
  let customSearchRoots = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--") continue;
    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }
    if (key === "--url") {
      if (!customUrls) {
        args.urls = [];
        customUrls = true;
      }
      args.urls.push(value);
      index += 1;
      continue;
    }
    if (key === "--search-root") {
      if (!customSearchRoots) {
        args.searchRoots = [];
        customSearchRoots = true;
      }
      args.searchRoots.push(value);
      index += 1;
      continue;
    }
    const map = {
      "--product-id": "productId",
      "--output": "output",
      "--json": "json",
    };
    if (map[key]) {
      args[map[key]] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${key}`);
  }
  return args;
}

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "LokaCheckoutInventory/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();
    const creemLinkOccurrences = extractCreemLinkOccurrences(html);
    return {
      url,
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      server: response.headers.get("server") || "",
      cache_status: response.headers.get("cache-status") || "",
      x_nf_request_id: response.headers.get("x-nf-request-id") || "",
      creem_links: Array.from(new Set(creemLinkOccurrences)),
      creem_link_occurrences: creemLinkOccurrences,
      matching_lines: matchingHtmlLines(html),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      final_url: url,
      error: error?.message || String(error),
      creem_links: [],
      creem_link_occurrences: [],
      matching_lines: [],
    };
  }
}

function extractCreemLinkOccurrences(html) {
  return String(html || "").match(/https:\/\/(?:www\.)?creem\.io\/payment\/[A-Za-z0-9_-]+/g) || [];
}

function matchingHtmlLines(html) {
  return String(html || "")
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((row) => /creem\.io\/payment|prod_|checkout|Loka Pro/i.test(row.text))
    .slice(0, 30);
}

async function searchLocal(roots, productId) {
  const pattern = [
    productId,
    "creem\\.io/payment",
    "www\\.creem\\.io/payment",
    "getloka\\.dev",
    "Loka Pro",
    "loka_pro",
  ].join("|");
  const args = [
    "-n",
    "--hidden",
    "--glob",
    "!node_modules",
    "--glob",
    "!.git",
    "--glob",
    "!out",
    "--glob",
    "!dist",
    "--glob",
    "!build",
    pattern,
    ...roots,
  ];
  try {
    const { stdout } = await execFileAsync("rg", args, { maxBuffer: 20 * 1024 * 1024 });
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parseRgLine)
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 1) return [];
    return [{ file: "", line: "", text: "", error: error?.message || String(error), category: "search_error" }];
  }
}

function parseRgLine(line) {
  const match = line.match(/^(.+?):(\d+):(.*)$/);
  if (!match) return null;
  const file = match[1];
  return {
    file,
    line: Number(match[2]),
    text: match[3].trim(),
    category: categorizeLocalFile(file),
  };
}

function categorizeLocalFile(file) {
  const normalized = file.replace(/\\/g, "/");
  if (/\/tools\/lead-finder\//.test(normalized) || /\/docs\/growth\//.test(normalized)) return "growth_ops_record";
  if (/\.env\.example$|README\.md$/.test(normalized)) return "example_or_docs";
  if (/\/docs\//.test(normalized)) return "docs";
  return "source_candidate";
}

function assess({ pages, localMatches, productId }) {
  const publicCreemLinks = pages.flatMap((page) =>
    page.creem_links.map((link) => ({ url: page.url, link })),
  );
  const publicCreemOccurrences = pages.flatMap((page) =>
    (page.creem_link_occurrences || []).map((link) => ({ url: page.url, link })),
  );
  const productLinks = publicCreemLinks.filter((item) => item.link.includes(productId));
  const productOccurrences = publicCreemOccurrences.filter((item) => item.link.includes(productId));
  const sourceCandidates = localMatches.filter((row) => row.category === "source_candidate");
  const onlyOpsMatches = localMatches.length > 0 && sourceCandidates.length === 0;

  const findings = [];
  if (productOccurrences.length) {
    findings.push(`Public getloka.dev surfaces expose ${productOccurrences.length} direct Creem payment link occurrence(s), using ${productLinks.length} unique URL(s) for ${productId}.`);
  }
  if (onlyOpsMatches) {
    findings.push("Local search did not find a Loka source repository; matches are growth ops records, docs, or examples.");
  }
  if (sourceCandidates.length) {
    findings.push(`Local search found ${sourceCandidates.length} Loka source candidate match(es); review them for direct Creem links or checkout bypasses.`);
  }
  if (!localMatches.length) {
    findings.push("Local search found no Loka/Creem checkout matches under the selected search root.");
  }
  findings.push("This inventory does not prove which origin triggered Creem; the provider still needs to name the exact referrer/origin.");

  const nextActions = [
    "Wait for Creem human support to identify the exact origin/referrer before changing payment configuration.",
  ];
  if (sourceCandidates.length) {
    nextActions.push("Verify Loka source candidates keep purchase traffic on the approved getloka.dev checkout bridge and do not contain direct Creem payment URLs.");
  } else {
    nextActions.push("Locate the Loka source/Netlify project; if plugin or Marketplace surfaces link directly to Creem, route them through an approved getloka.dev checkout bridge instead.");
  }
  if (productOccurrences.length) {
    nextActions.push("Replace any public direct Creem payment link with the owned getloka.dev checkout bridge before sending more traffic.");
  }
  nextActions.push("If Creem says getloka.dev itself is unregistered or unapproved, add/approve a separate Loka store/site in Creem before sending more checkout traffic.");
  nextActions.push("After the fix, record provider/dashboard evidence in the action log and rerun this inventory.");

  return {
    public_creem_link_count: publicCreemLinks.length,
    public_creem_link_occurrences: publicCreemOccurrences.length,
    product_link_count: productLinks.length,
    product_link_occurrences: productOccurrences.length,
    local_match_count: localMatches.length,
    source_candidate_count: sourceCandidates.length,
    risk_level: productLinks.length ? "needs_provider_origin" : "unknown",
    findings,
    next_actions: nextActions,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Loka Checkout Origin Inventory",
    "",
    `Generated: ${report.generated_at}`,
    `Search roots: ${report.search_roots.join(", ")}`,
    `Product id: ${report.product_id}`,
    "",
    "## Assessment",
    "",
    `- Risk level: ${report.assessment.risk_level}`,
    `- Public unique Creem links: ${report.assessment.public_creem_link_count}`,
    `- Public Creem link occurrences: ${report.assessment.public_creem_link_occurrences}`,
    `- Product-specific unique links: ${report.assessment.product_link_count}`,
    `- Product-specific occurrences: ${report.assessment.product_link_occurrences}`,
    `- Local matches: ${report.assessment.local_match_count}`,
    `- Local source candidates: ${report.assessment.source_candidate_count}`,
    "",
    "Findings:",
    ...report.assessment.findings.map((item) => `- ${item}`),
    "",
    "Next actions:",
    ...report.assessment.next_actions.map((item) => `- ${item}`),
    "",
    "## Public Pages",
    "",
    "| URL | Status | Final URL | Netlify evidence | Creem links |",
    "|---|---:|---|---|---:|",
  ];

  for (const page of report.pages) {
    const netlify = [page.server, page.cache_status, page.x_nf_request_id ? "x-nf-request-id present" : ""]
      .filter(Boolean)
      .join("; ");
    lines.push(`| ${page.url} | ${page.status} | ${page.final_url || ""} | ${pipe(netlify || page.error || "")} | ${page.creem_links.length} |`);
  }

  lines.push("", "## Direct Creem Links", "");
  const linkRows = report.pages.flatMap((page) => page.creem_links.map((link) => ({ url: page.url, link })));
  if (!linkRows.length) {
    lines.push("No direct Creem payment links found in fetched public pages.", "");
  } else {
    lines.push("| Page | Link |");
    lines.push("|---|---|");
    for (const row of linkRows) lines.push(`| ${row.url} | ${row.link} |`);
    lines.push("");
  }

  lines.push("## Local Matches", "");
  if (!report.local_matches.length) {
    lines.push("No local matches found.", "");
  } else {
    lines.push("| Category | File | Line | Text |");
    lines.push("|---|---|---:|---|");
    for (const row of report.local_matches.slice(0, 80)) {
      lines.push(`| ${row.category || ""} | ${pipe(row.file || row.error || "")} | ${row.line || ""} | ${pipe(row.text || "")} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function pipe(value) {
  return String(value || "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}

async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const [pages, localMatches] = await Promise.all([
    Promise.all(args.urls.map((url) => fetchPage(url))),
    searchLocal(args.searchRoots, args.productId),
  ]);
  const report = {
    generated_at: new Date().toISOString(),
    search_roots: args.searchRoots,
    product_id: args.productId,
    pages,
    local_matches: localMatches,
    assessment: assess({ pages, localMatches, productId: args.productId }),
  };

  await Promise.all([
    writeText(args.output, renderMarkdown(report)),
    writeText(args.json, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  process.stdout.write(`Loka checkout inventory: ${args.output}\n`);
  process.stdout.write(`Finding: ${report.assessment.findings[0] || "none"}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
