import { URL } from "node:url";

export const PUBLIC_AUDIT_VERSION = "public-framer-v1";
export const MIN_SCORE_COVERAGE_PCT = 75;

const DIMENSION_DEFINITIONS = [
  { id: "crawl", label: "Crawl & indexability", weight: 25 },
  { id: "localization", label: "Locale discovery", weight: 30 },
  { id: "structured_data", label: "Structured data", weight: 25 },
  { id: "metadata", label: "Metadata consistency", weight: 20 },
];

const CHECK_DEFINITIONS = [
  { id: "http_status", dimension: "crawl", label: "Published URL status", maxPoints: 8 },
  { id: "indexability", dimension: "crawl", label: "Indexability directives", maxPoints: 7 },
  { id: "canonical", dimension: "crawl", label: "Canonical URLs", maxPoints: 6 },
  { id: "robots", dimension: "crawl", label: "Robots access", maxPoints: 4 },
  { id: "locale_urls", dimension: "localization", label: "Distinct locale URLs", maxPoints: 8 },
  { id: "html_lang", dimension: "localization", label: "HTML language declarations", maxPoints: 7 },
  { id: "hreflang_valid", dimension: "localization", label: "hreflang declarations", maxPoints: 7 },
  { id: "hreflang_reciprocal", dimension: "localization", label: "hreflang reciprocity", maxPoints: 8 },
  { id: "jsonld_parseable", dimension: "structured_data", label: "Parseable JSON-LD", maxPoints: 9 },
  { id: "jsonld_types", dimension: "structured_data", label: "Relevant schema types", maxPoints: 6 },
  { id: "jsonld_language", dimension: "structured_data", label: "Localized schema language", maxPoints: 10 },
  { id: "titles_present", dimension: "metadata", label: "Page titles", maxPoints: 6 },
  { id: "descriptions_present", dimension: "metadata", label: "Meta descriptions", maxPoints: 6 },
  { id: "titles_unique", dimension: "metadata", label: "Localized title uniqueness", maxPoints: 4 },
  { id: "descriptions_unique", dimension: "metadata", label: "Localized description uniqueness", maxPoints: 4 },
];

const CHECK_BY_ID = new Map(CHECK_DEFINITIONS.map((definition) => [definition.id, definition]));
const STATUS_FACTOR = {
  pass: 1,
  warning: 0.5,
  fail: 0,
  not_observed: null,
};
const LOCALE_CODES = new Set([
  "ar", "bg", "ca", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "he", "hr",
  "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "nl", "no", "pl", "pt", "ro", "ru",
  "sk", "sl", "sr", "sv", "th", "tr", "uk", "vi", "zh", "zh-cn", "zh-tw",
]);
const RECOGNIZED_SCHEMA_TYPES = new Set([
  "Article",
  "BlogPosting",
  "BreadcrumbList",
  "FAQPage",
  "LocalBusiness",
  "Organization",
  "Product",
  "WebPage",
  "WebSite",
]);
const FREE_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yandex.com",
]);
const NON_OUTREACH_MAILBOXES = new Set([
  "abuse",
  "aide",
  "ajuda",
  "asistencia",
  "assistance",
  "ayuda",
  "billing",
  "careers",
  "help",
  "hilfe",
  "jobs",
  "legal",
  "noreply",
  "no-reply",
  "privacy",
  "security",
  "support",
  "soporte",
  "suporte",
  "soutien",
]);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttributes(tag) {
  const attributes = {};
  const body = String(tag || "")
    .replace(/^<\/?[a-z0-9:-]+\s*/i, "")
    .replace(/\/?\s*>$/, "");
  const regex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = regex.exec(body))) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function tags(html, tagName) {
  return Array.from(String(html || "").matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))).map(
    (match) => ({ raw: match[0], attributes: parseAttributes(match[0]) }),
  );
}

function normalizeLocale(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function localeFamily(value) {
  const locale = normalizeLocale(value);
  if (!locale) return "";
  if (locale === "zh-cn" || locale === "zh-tw") return locale;
  return locale.split("-")[0];
}

function sameLocale(a, b) {
  return Boolean(localeFamily(a) && localeFamily(a) === localeFamily(b));
}

function normalizeUrl(raw, base) {
  if (raw == null || String(raw).trim() === "") return "";
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function comparableUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  } catch {
    return String(raw || "");
  }
}

function sameSite(a, b) {
  try {
    return new URL(a).hostname.toLowerCase().replace(/^www\./, "") ===
      new URL(b).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

export function isPublicAuditUrl(raw) {
  try {
    const url = new URL(/^https?:\/\//i.test(String(raw || "")) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname === "::1") return false;
    if (isPrivateIpv4(hostname)) return false;
    if (/^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/i.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isCompanyDomainEmail(value) {
  const email = String(value || "")
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
  const domain = email.split("@")[1] || "";
  return Boolean(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !FREE_EMAIL_DOMAINS.has(domain));
}

function normalizedEmail(value) {
  return String(value || "")
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .trim()
    .toLowerCase();
}

export function isOutreachMailbox(value) {
  const email = normalizedEmail(value);
  const mailbox = email.split("@")[0]?.split("+")[0] || "";
  return isCompanyDomainEmail(email) && !NON_OUTREACH_MAILBOXES.has(mailbox);
}

export function emailMatchesSiteDomain(value, site) {
  const emailDomain = normalizedEmail(value).split("@")[1] || "";
  let siteDomain = "";
  try {
    siteDomain = new URL(/^https?:\/\//i.test(String(site || "")) ? site : `https://${site}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return false;
  }
  return Boolean(
    emailDomain &&
      siteDomain &&
      (emailDomain === siteDomain || emailDomain.endsWith(`.${siteDomain}`) || siteDomain.endsWith(`.${emailDomain}`)),
  );
}

export function isCustomDomain(value) {
  try {
    const host = new URL(/^https?:\/\//i.test(String(value || "")) ? value : `https://${value}`).hostname.toLowerCase();
    return Boolean(host && !host.endsWith(".framer.website") && !host.endsWith(".framer.app"));
  } catch {
    return false;
  }
}

async function fetchTextOnce(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "PolyglotAEOPublicAudit/1.0 (+https://polyglotaeo.com; public-site QA)",
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
    });
    const text = await response.text();
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

async function fetchText(url, options) {
  let result;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    result = await fetchTextOnce(url, options);
    const transient = !result.ok && (result.status === 0 || result.status >= 500);
    if (!transient || attempt === options.retries) return result;
  }
  return result;
}

function findMetaContent(html, name) {
  const expected = String(name || "").toLowerCase();
  const tag = tags(html, "meta").find(({ attributes }) =>
    [attributes.name, attributes.property, attributes["http-equiv"]]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === expected),
  );
  return String(tag?.attributes.content || "").trim();
}

function extractTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractHtmlLang(html) {
  const htmlTag = String(html || "").match(/<html\b[^>]*>/i)?.[0] || "";
  return normalizeLocale(parseAttributes(htmlTag).lang || "");
}

function extractCanonical(html, pageUrl) {
  const link = tags(html, "link").find(({ attributes }) =>
    String(attributes.rel || "")
      .toLowerCase()
      .split(/\s+/)
      .includes("canonical"),
  );
  return normalizeUrl(link?.attributes.href, pageUrl);
}

function extractAlternates(html, pageUrl) {
  return tags(html, "link")
    .filter(({ attributes }) =>
      String(attributes.rel || "")
        .toLowerCase()
        .split(/\s+/)
        .includes("alternate"),
    )
    .map(({ attributes }) => ({
      locale: normalizeLocale(attributes.hreflang),
      url: normalizeUrl(attributes.href, pageUrl),
    }))
    .filter((item) => item.locale && item.locale !== "x-default" && item.url);
}

function extractLocaleAnchors(html, pageUrl) {
  const results = [];
  for (const { attributes } of tags(html, "a")) {
    const url = normalizeUrl(attributes.href, pageUrl);
    if (!url || !sameSite(url, pageUrl)) continue;
    let firstSegment = "";
    try {
      firstSegment = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    } catch {
      continue;
    }
    if (LOCALE_CODES.has(firstSegment)) results.push({ locale: firstSegment, url });
  }
  return results;
}

function flattenJsonLd(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  output.push(value);
  if (Array.isArray(value["@graph"])) flattenJsonLd(value["@graph"], output);
  return output;
}

function analyzeJsonLd(html) {
  const scriptRegex = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let match;
  while ((match = scriptRegex.exec(String(html || "")))) blocks.push(match[1] || "");

  const nodes = [];
  let invalidCount = 0;
  for (const block of blocks) {
    try {
      flattenJsonLd(JSON.parse(block.trim()), nodes);
    } catch {
      invalidCount += 1;
    }
  }

  const types = new Set();
  const languages = new Set();
  for (const node of nodes) {
    const rawTypes = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    for (const type of rawTypes.filter(Boolean)) types.add(String(type));
    const rawLanguages = Array.isArray(node.inLanguage) ? node.inLanguage : [node.inLanguage];
    for (const language of rawLanguages.filter(Boolean)) languages.add(normalizeLocale(language));
  }

  return {
    block_count: blocks.length,
    valid_count: blocks.length - invalidCount,
    invalid_count: invalidCount,
    types: Array.from(types).sort(),
    in_languages: Array.from(languages).sort(),
  };
}

function analyzePage(response, expectedLocale = "") {
  const html = response.text || "";
  const robotsMeta = `${findMetaContent(html, "robots")} ${findMetaContent(html, "googlebot")}`.toLowerCase();
  return {
    url: response.url,
    requested_url: response.requestedUrl || response.url,
    status: response.status,
    ok: response.ok,
    expected_locale: normalizeLocale(expectedLocale),
    html_lang: extractHtmlLang(html),
    title: extractTitle(html),
    description: findMetaContent(html, "description"),
    canonical: extractCanonical(html, response.url),
    noindex: /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robotsMeta),
    alternates: extractAlternates(html, response.url),
    locale_anchors: extractLocaleAnchors(html, response.url),
    jsonld: analyzeJsonLd(html),
  };
}

function statusCount(values, predicate) {
  return values.filter(predicate).length;
}

function createCheck(id, status, detail) {
  const definition = CHECK_BY_ID.get(id);
  if (!definition) throw new Error(`Unknown public audit check: ${id}`);
  return {
    id,
    dimension: definition.dimension,
    label: definition.label,
    status,
    max_points: definition.maxPoints,
    evidence_url: detail.evidenceUrl || "",
    observed: detail.observed,
    impact: detail.impact,
    first_fix: detail.firstFix,
    confidence: detail.confidence || "high",
  };
}

function robotsBlocksRoot(text) {
  let applies = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*";
    } else if (applies && key === "disallow" && value === "/") {
      return true;
    }
  }
  return false;
}

function buildChecks({ rootUrl, pages, robots, localeCandidates }) {
  const checks = [];
  const okPages = pages.filter((page) => page.ok);
  const expectedPages = pages.filter((page) => page.expected_locale);
  const localeFamilies = Array.from(
    new Set(localeCandidates.map((item) => localeFamily(item.locale)).filter(Boolean)),
  );
  const rootPage = pages[0];

  checks.push(
    createCheck(
      "http_status",
      !rootPage?.ok || pages.some((page) => !page.ok) ? "fail" : "pass",
      {
        evidenceUrl: pages.find((page) => !page.ok)?.url || rootUrl,
        observed: !rootPage?.ok
          ? `The published root returned HTTP ${rootPage?.status || 0}.`
          : pages.some((page) => !page.ok)
            ? `${statusCount(pages, (page) => !page.ok)} sampled locale URL(s) did not return a successful response.`
            : `All ${pages.length} sampled public URL(s) returned successful responses.`,
        impact: "Unavailable public URLs cannot be fetched reliably by visitors or crawlers.",
        firstFix: "Restore a 200 response for every published locale URL, then rerun the public check.",
      },
    ),
  );

  checks.push(
    createCheck(
      "indexability",
      okPages.length === 0 ? "not_observed" : okPages.some((page) => page.noindex) ? "fail" : "pass",
      {
        evidenceUrl: okPages.find((page) => page.noindex)?.url || rootUrl,
        observed:
          okPages.length === 0
            ? "Indexability directives could not be observed."
            : okPages.some((page) => page.noindex)
              ? `${statusCount(okPages, (page) => page.noindex)} sampled page(s) declare noindex.`
              : "No noindex directive was observed on sampled pages.",
        impact: "A noindex directive asks compatible search engines not to index that page.",
        firstFix: "Remove accidental noindex directives from public locale pages and republish.",
      },
    ),
  );

  const canonicalConflicts = okPages.filter(
    (page) => page.canonical && comparableUrl(page.canonical) !== comparableUrl(page.url),
  );
  const missingCanonicals = okPages.filter((page) => !page.canonical);
  checks.push(
    createCheck(
      "canonical",
      okPages.length === 0
        ? "not_observed"
        : canonicalConflicts.length > 0
          ? "fail"
          : missingCanonicals.length > 0
            ? "warning"
            : "pass",
      {
        evidenceUrl: canonicalConflicts[0]?.url || missingCanonicals[0]?.url || rootUrl,
        observed:
          okPages.length === 0
            ? "Canonical declarations could not be observed."
            : canonicalConflicts.length
              ? `${canonicalConflicts.length} sampled page(s) canonicalize to another URL.`
              : missingCanonicals.length
                ? `${missingCanonicals.length} sampled page(s) have no canonical URL.`
                : "Every sampled page declares a self-referencing canonical URL.",
        impact: "Conflicting canonicals can consolidate a localized page into a different URL.",
        firstFix: "Give each published locale page a self-referencing canonical URL.",
      },
    ),
  );

  const robotsStatus = robots.status === 404
    ? "pass"
    : robots.ok
      ? robotsBlocksRoot(robots.text)
        ? "fail"
        : "pass"
      : robots.status === 401 || robots.status === 403
        ? "warning"
        : "not_observed";
  checks.push(
    createCheck("robots", robotsStatus, {
      evidenceUrl: robots.url,
      observed:
        robots.status === 404
          ? "No robots.txt file was present; no root-wide block was observed."
          : robots.ok && robotsBlocksRoot(robots.text)
            ? "robots.txt disallows the entire site for the wildcard user agent."
            : robots.ok
              ? "No root-wide wildcard block was observed in robots.txt."
              : robots.status === 401 || robots.status === 403
                ? `robots.txt returned HTTP ${robots.status}.`
                : "robots.txt could not be observed.",
      impact: "A root-wide robots block prevents compliant crawlers from fetching public pages.",
      firstFix: "Allow the public locale paths that should be discoverable, then verify the live robots.txt file.",
    }),
  );

  checks.push(
    createCheck(
      "locale_urls",
      localeFamilies.length >= 2 && expectedPages.filter((page) => page.ok).length >= 2
        ? "pass"
        : localeFamilies.length >= 2
          ? "warning"
          : "fail",
      {
        evidenceUrl: rootUrl,
        observed:
          localeFamilies.length >= 2
            ? `${localeFamilies.length} locale families were discovered; ${expectedPages.filter((page) => page.ok).length} locale URL(s) were fetched.`
            : "Fewer than two distinct public locale URL families were discovered.",
        impact: "Distinct locale URLs give search systems stable public destinations for language variants.",
        firstFix: "Publish one stable URL per language and expose those URLs in the page markup.",
      },
    ),
  );

  const langMissing = expectedPages.filter((page) => page.ok && !page.html_lang);
  const langMismatch = expectedPages.filter(
    (page) => page.ok && page.html_lang && !sameLocale(page.html_lang, page.expected_locale),
  );
  checks.push(
    createCheck(
      "html_lang",
      expectedPages.length === 0
        ? "not_observed"
        : langMismatch.length
          ? "fail"
          : langMissing.length
            ? "warning"
            : "pass",
      {
        evidenceUrl: langMismatch[0]?.url || langMissing[0]?.url || rootUrl,
        observed:
          expectedPages.length === 0
            ? "No locale-specific page language could be compared."
            : langMismatch.length
              ? `${langMismatch.length} page(s) declare an HTML language that conflicts with their locale mapping.`
              : langMissing.length
                ? `${langMissing.length} sampled locale page(s) omit the HTML lang attribute.`
                : "Sampled locale pages declare matching HTML language values.",
        impact: "Accurate language declarations make each localized document easier to classify.",
        firstFix: "Set the HTML lang value to the language actually used on each locale page.",
      },
    ),
  );

  const rootAlternates = rootPage?.alternates || [];
  const invalidAlternates = rootAlternates.filter((item) => !sameSite(item.url, rootUrl));
  checks.push(
    createCheck(
      "hreflang_valid",
      localeFamilies.length < 2
        ? "not_observed"
        : rootAlternates.length >= 2 && invalidAlternates.length === 0
          ? "pass"
          : rootAlternates.length > 0
            ? "warning"
            : "fail",
      {
        evidenceUrl: rootUrl,
        observed:
          localeFamilies.length < 2
            ? "A multilingual hreflang set could not be evaluated."
            : rootAlternates.length >= 2 && invalidAlternates.length === 0
              ? `${rootAlternates.length} same-site hreflang targets were found on the root page.`
              : rootAlternates.length > 0
                ? "The root page exposes only a partial or cross-site hreflang set."
                : "No hreflang declarations were found for the discovered locale URLs.",
        impact: "hreflang helps Google map equivalent language or regional versions to each other.",
        firstFix: "Add a complete hreflang set for every published locale URL.",
      },
    ),
  );

  const expectedKeys = new Set(localeCandidates.map((item) => comparableUrl(item.url)));
  const reciprocalPages = expectedPages.filter((page) => page.ok);
  const reciprocalCounts = reciprocalPages.map((page) => {
    const targets = new Set(page.alternates.map((item) => comparableUrl(item.url)));
    return Array.from(expectedKeys).filter((key) => targets.has(key)).length;
  });
  const fullyReciprocal =
    expectedKeys.size >= 2 && reciprocalPages.length >= 2 && reciprocalCounts.every((count) => count === expectedKeys.size);
  const partiallyReciprocal = reciprocalCounts.some((count) => count > 0);
  checks.push(
    createCheck(
      "hreflang_reciprocal",
      expectedKeys.size < 2 || reciprocalPages.length < 2
        ? "not_observed"
        : fullyReciprocal
          ? "pass"
          : partiallyReciprocal
            ? "warning"
            : "fail",
      {
        evidenceUrl: reciprocalPages.find((page, index) => reciprocalCounts[index] !== expectedKeys.size)?.url || rootUrl,
        observed:
          expectedKeys.size < 2 || reciprocalPages.length < 2
            ? "At least two fetched locale pages are required to verify reciprocity."
            : fullyReciprocal
              ? "Every sampled locale page links back to the complete hreflang set."
              : partiallyReciprocal
                ? "The sampled hreflang set is only partially reciprocal."
                : "Sampled locale pages do not link back to one another with hreflang.",
        impact: "Non-reciprocal annotations can be ignored when language variants are evaluated.",
        firstFix: "Place the same complete, self-inclusive hreflang set on every locale page.",
      },
    ),
  );

  const jsonLdBlocks = okPages.reduce((sum, page) => sum + page.jsonld.block_count, 0);
  const jsonLdValid = okPages.reduce((sum, page) => sum + page.jsonld.valid_count, 0);
  const jsonLdInvalid = okPages.reduce((sum, page) => sum + page.jsonld.invalid_count, 0);
  checks.push(
    createCheck(
      "jsonld_parseable",
      okPages.length === 0
        ? "not_observed"
        : jsonLdBlocks === 0
          ? "warning"
          : jsonLdValid === 0
            ? "fail"
            : jsonLdInvalid > 0
              ? "warning"
              : "pass",
      {
        evidenceUrl: okPages.find((page) => page.jsonld.invalid_count > 0)?.url || rootUrl,
        observed:
          okPages.length === 0
            ? "JSON-LD could not be observed."
            : jsonLdBlocks === 0
              ? "No JSON-LD block was observed on sampled pages."
              : jsonLdValid === 0
                ? "JSON-LD blocks were present but none could be parsed."
                : jsonLdInvalid > 0
                  ? `${jsonLdValid} JSON-LD block(s) parsed and ${jsonLdInvalid} failed to parse.`
                  : `${jsonLdValid} JSON-LD block(s) parsed successfully.`,
        impact: "Valid structured data provides explicit page and entity context and can support eligible search features.",
        firstFix: "Add or repair JSON-LD that accurately describes visible page content, then validate the published HTML.",
      },
    ),
  );

  const schemaTypes = new Set(okPages.flatMap((page) => page.jsonld.types));
  const recognizedTypes = Array.from(schemaTypes).filter((type) => RECOGNIZED_SCHEMA_TYPES.has(type));
  checks.push(
    createCheck(
      "jsonld_types",
      jsonLdValid === 0 ? "not_observed" : recognizedTypes.length > 0 ? "pass" : "warning",
      {
        evidenceUrl: rootUrl,
        observed:
          jsonLdValid === 0
            ? "Schema types could not be evaluated without parseable JSON-LD."
            : recognizedTypes.length
              ? `Recognized public page/entity types: ${recognizedTypes.join(", ")}.`
              : "JSON-LD parsed, but no common public page or entity type was observed.",
        impact: "Relevant schema types make the structured description easier to interpret and validate.",
        firstFix: "Use the schema type that matches the visible page, organization, product, article, or local business.",
        confidence: recognizedTypes.length ? "high" : "medium",
      },
    ),
  );

  const pagesWithJsonLd = expectedPages.filter((page) => page.ok && page.jsonld.valid_count > 0);
  const schemaLanguageMissing = pagesWithJsonLd.filter((page) => page.jsonld.in_languages.length === 0);
  const schemaLanguageMismatch = pagesWithJsonLd.filter(
    (page) =>
      page.jsonld.in_languages.length > 0 &&
      !page.jsonld.in_languages.some((language) => sameLocale(language, page.expected_locale)),
  );
  checks.push(
    createCheck(
      "jsonld_language",
      pagesWithJsonLd.length === 0
        ? "not_observed"
        : schemaLanguageMismatch.length
          ? "fail"
          : schemaLanguageMissing.length
            ? "warning"
            : "pass",
      {
        evidenceUrl: schemaLanguageMismatch[0]?.url || schemaLanguageMissing[0]?.url || rootUrl,
        observed:
          pagesWithJsonLd.length === 0
            ? "No locale page with parseable JSON-LD was available for language comparison."
            : schemaLanguageMismatch.length
              ? `${schemaLanguageMismatch.length} locale page(s) declare conflicting JSON-LD language values.`
              : schemaLanguageMissing.length
                ? `${schemaLanguageMissing.length} locale page(s) have JSON-LD without inLanguage.`
                : "Sampled locale schema carries matching inLanguage values.",
        impact: "Matching language values keep structured descriptions aligned with the localized page.",
        firstFix: "Set inLanguage and localized schema text for every locale variant.",
      },
    ),
  );

  const missingTitles = okPages.filter((page) => !page.title);
  const missingDescriptions = okPages.filter((page) => !page.description);
  checks.push(
    createCheck("titles_present", okPages.length === 0 ? "not_observed" : missingTitles.length === okPages.length ? "fail" : missingTitles.length ? "warning" : "pass", {
      evidenceUrl: missingTitles[0]?.url || rootUrl,
      observed:
        okPages.length === 0
          ? "Page titles could not be observed."
          : missingTitles.length
            ? `${missingTitles.length} sampled page(s) have no title.`
            : "Every sampled page has a title.",
      impact: "A clear title helps identify the page and shapes how it may be presented in search interfaces.",
      firstFix: "Give every locale page a concise title written for that language.",
    }),
  );
  checks.push(
    createCheck("descriptions_present", okPages.length === 0 ? "not_observed" : missingDescriptions.length === okPages.length ? "fail" : missingDescriptions.length ? "warning" : "pass", {
      evidenceUrl: missingDescriptions[0]?.url || rootUrl,
      observed:
        okPages.length === 0
          ? "Meta descriptions could not be observed."
          : missingDescriptions.length
            ? `${missingDescriptions.length} sampled page(s) have no meta description.`
            : "Every sampled page has a meta description.",
      impact: "Localized descriptions provide concise, language-specific page summaries.",
      firstFix: "Write a distinct meta description for every published locale page.",
    }),
  );

  function uniquenessCheck(id, field, label) {
    const comparablePages = expectedPages.filter((page) => page.ok && page[field]);
    if (comparablePages.length < 2) {
      return createCheck(id, "not_observed", {
        evidenceUrl: rootUrl,
        observed: `At least two populated locale ${label}s are required for comparison.`,
        impact: `Distinct localized ${label}s make language variants easier to differentiate.`,
        firstFix: `Publish language-specific ${label}s, then rerun the comparison.`,
      });
    }
    const normalized = comparablePages.map((page) => String(page[field]).trim().toLowerCase().replace(/\s+/g, " "));
    const uniqueCount = new Set(normalized).size;
    const status = uniqueCount === comparablePages.length ? "pass" : uniqueCount === 1 ? "fail" : "warning";
    return createCheck(id, status, {
      evidenceUrl: comparablePages[1]?.url || rootUrl,
      observed:
        status === "pass"
          ? `Sampled locale ${label}s are distinct.`
          : status === "fail"
            ? `All sampled locale ${label}s match exactly.`
            : `Some sampled locale ${label}s match another locale.`,
      impact: `Repeated ${label}s make localized pages look less distinct in public metadata.`,
      firstFix: `Rewrite repeated ${label}s for the language and intent of each locale page.`,
    });
  }

  checks.push(uniquenessCheck("titles_unique", "title", "title"));
  checks.push(uniquenessCheck("descriptions_unique", "description", "description"));
  return checks;
}

export function scorePublicAuditChecks(checks) {
  const dimensions = DIMENSION_DEFINITIONS.map((definition) => {
    const dimensionChecks = checks.filter((check) => check.dimension === definition.id);
    const observed = dimensionChecks.filter((check) => STATUS_FACTOR[check.status] !== null);
    const observedMax = observed.reduce((sum, check) => sum + check.max_points, 0);
    const earnedRaw = observed.reduce(
      (sum, check) => sum + check.max_points * STATUS_FACTOR[check.status],
      0,
    );
    const normalizedScore = observedMax > 0 ? Math.round((earnedRaw / observedMax) * definition.weight) : null;
    return {
      id: definition.id,
      label: definition.label,
      max_points: definition.weight,
      observed_points: observedMax,
      earned_points: normalizedScore,
      coverage_pct: Math.round((observedMax / definition.weight) * 100),
      status_counts: {
        pass: statusCount(dimensionChecks, (check) => check.status === "pass"),
        warning: statusCount(dimensionChecks, (check) => check.status === "warning"),
        fail: statusCount(dimensionChecks, (check) => check.status === "fail"),
        not_observed: statusCount(dimensionChecks, (check) => check.status === "not_observed"),
      },
    };
  });

  const totalMax = CHECK_DEFINITIONS.reduce((sum, definition) => sum + definition.maxPoints, 0);
  const observedChecks = checks.filter((check) => STATUS_FACTOR[check.status] !== null);
  const observedMax = observedChecks.reduce((sum, check) => sum + check.max_points, 0);
  const coveragePct = Math.round((observedMax / totalMax) * 100);
  const observedDimensions = dimensions.filter((dimension) => dimension.earned_points !== null);
  const observedDimensionWeight = observedDimensions.reduce((sum, dimension) => sum + dimension.max_points, 0);
  const earnedDimensionPoints = observedDimensions.reduce((sum, dimension) => sum + dimension.earned_points, 0);
  const score = coveragePct >= MIN_SCORE_COVERAGE_PCT && observedDimensionWeight > 0
    ? Math.round((earnedDimensionPoints / observedDimensionWeight) * 100)
    : null;
  const rating = score === null
    ? "Evidence incomplete"
    : score >= 80
      ? "Strong"
      : score >= 60
        ? "Needs attention"
        : "Limited public signals";

  return {
    score,
    rating,
    coverage_pct: coveragePct,
    observed_points: observedMax,
    total_points: totalMax,
    dimensions,
  };
}

function findingSeverity(check) {
  if (check.status === "fail") return check.max_points >= 7 ? "high" : "medium";
  return check.max_points >= 8 ? "medium" : "low";
}

function findingSort(a, b) {
  const statusOrder = { fail: 0, warning: 1 };
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  return (
    statusOrder[a.status] - statusOrder[b.status] ||
    confidenceOrder[a.confidence] - confidenceOrder[b.confidence] ||
    b.max_points - a.max_points ||
    a.id.localeCompare(b.id)
  );
}

function buildFindings(checks, checkedAt) {
  return checks
    .filter((check) => check.status === "fail" || check.status === "warning")
    .sort(findingSort)
    .slice(0, 3)
    .map((check) => ({
      id: check.id,
      dimension: check.dimension,
      severity: findingSeverity(check),
      status: check.status,
      evidence_url: check.evidence_url,
      checked_at: checkedAt,
      observed: check.observed,
      impact: check.impact,
      first_fix: check.first_fix,
      confidence: check.confidence,
    }));
}

function reportChecks(audit) {
  const issueChecks = audit.checks
    .filter((check) => check.status === "fail" || check.status === "warning")
    .sort(findingSort);
  const passChecks = audit.checks
    .filter((check) => check.status === "pass")
    .sort((a, b) => b.max_points - a.max_points || a.id.localeCompare(b.id));
  return [...issueChecks, ...passChecks].slice(0, 3);
}

async function checkOptionalLlms(rootUrl, options) {
  const url = new URL("/llms.txt", rootUrl).href;
  const response = await fetchText(url, options);
  const present = response.ok && response.text.trim().length > 20;
  return {
    url,
    status: response.status,
    present,
    scored: false,
    note: "Optional interoperability signal only. Google Search does not use llms.txt, so this result does not affect the score.",
  };
}

export async function auditPublicSite(rawUrl, options = {}) {
  if (!isPublicAuditUrl(rawUrl)) throw new Error(`Public audit requires a public HTTP(S) URL: ${rawUrl}`);
  const normalizedInput = normalizeUrl(/^https?:\/\//i.test(String(rawUrl)) ? rawUrl : `https://${rawUrl}`);
  const requestOptions = {
    fetchImpl: options.fetchImpl || fetch,
    timeoutMs: options.timeoutMs || 12000,
    retries: Number.isInteger(options.retries) ? options.retries : 1,
  };
  const maxPages = Math.max(2, options.maxPages || 4);
  const checkedAt = options.checkedAt || new Date().toISOString();

  const rootResponse = await fetchText(normalizedInput, requestOptions);
  rootResponse.requestedUrl = normalizedInput;
  const effectiveRoot = rootResponse.url || normalizedInput;
  const rootPage = analyzePage(rootResponse);
  const localeMap = new Map();
  for (const alternate of rootPage.alternates) {
    if (sameSite(alternate.url, effectiveRoot)) localeMap.set(comparableUrl(alternate.url), alternate);
  }
  for (const anchor of rootPage.locale_anchors) {
    if (!localeMap.has(comparableUrl(anchor.url))) localeMap.set(comparableUrl(anchor.url), anchor);
  }
  if (rootPage.html_lang) {
    localeMap.set(comparableUrl(effectiveRoot), { locale: rootPage.html_lang, url: effectiveRoot });
  }

  const localeCandidates = Array.from(localeMap.values())
    .filter((item) => item.url && sameSite(item.url, effectiveRoot))
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.url.localeCompare(b.url));
  const expectedLocaleByUrl = new Map(
    localeCandidates.map((item) => [comparableUrl(item.url), normalizeLocale(item.locale)]),
  );
  rootPage.expected_locale = expectedLocaleByUrl.get(comparableUrl(effectiveRoot)) || rootPage.html_lang;

  const pages = [rootPage];
  for (const candidate of localeCandidates) {
    if (pages.length >= maxPages) break;
    if (comparableUrl(candidate.url) === comparableUrl(effectiveRoot)) continue;
    const response = await fetchText(candidate.url, requestOptions);
    response.requestedUrl = candidate.url;
    const analyzed = analyzePage(response, candidate.locale);
    if (pages.some((page) => comparableUrl(page.url) === comparableUrl(analyzed.url))) continue;
    pages.push(analyzed);
  }

  const robotsUrl = new URL("/robots.txt", effectiveRoot).href;
  const [robots, llmsTxt] = await Promise.all([
    fetchText(robotsUrl, requestOptions),
    checkOptionalLlms(effectiveRoot, requestOptions),
  ]);
  const checks = buildChecks({ rootUrl: effectiveRoot, pages, robots, localeCandidates });
  const scored = scorePublicAuditChecks(checks);
  const findings = buildFindings(checks, checkedAt);
  const localeFamilies = Array.from(
    new Set(localeCandidates.map((item) => localeFamily(item.locale)).filter(Boolean)),
  ).sort();

  return {
    audit_version: PUBLIC_AUDIT_VERSION,
    checked_at: checkedAt,
    domain: new URL(effectiveRoot).hostname.toLowerCase().replace(/^www\./, ""),
    requested_url: normalizedInput,
    final_url: effectiveRoot,
    pages_checked: pages.map((page) => ({
      url: page.url,
      status: page.status,
      expected_locale: page.expected_locale,
      html_lang: page.html_lang,
      canonical: page.canonical,
    })),
    locales_checked: localeFamilies,
    score: scored.score,
    rating: scored.rating,
    coverage_pct: scored.coverage_pct,
    dimensions: scored.dimensions,
    findings,
    checks,
    optional_signals: {
      llms_txt: llmsTxt,
    },
    methodology: {
      public_pages_only: true,
      project_access: false,
      unknown_checks_excluded_from_score: true,
      minimum_score_coverage_pct: MIN_SCORE_COVERAGE_PCT,
      llms_txt_scored: false,
    },
  };
}

function markdownEscape(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

export function renderPublicAuditMarkdown(audit) {
  const lines = [
    `# Public Framer readiness report: ${audit.domain}`,
    "",
    `- Checked: ${audit.checked_at}`,
    `- Scope: public pages only; no Framer project or private CMS access`,
    `- Rating: ${audit.rating}${audit.score === null ? "" : ` (${audit.score}/100)`}`,
    `- Evidence coverage: ${audit.coverage_pct}%`,
    `- Locale families: ${audit.locales_checked.join(", ") || "not observed"}`,
    "",
    "## Dimensions",
    "",
    "| Dimension | Score | Coverage |",
    "|---|---:|---:|",
    ...audit.dimensions.map(
      (dimension) =>
        `| ${markdownEscape(dimension.label)} | ${dimension.earned_points === null ? "—" : `${dimension.earned_points}/${dimension.max_points}`} | ${dimension.coverage_pct}% |`,
    ),
    "",
    "## Highest-impact findings",
    "",
  ];

  if (!audit.findings.length) lines.push("No warning or failed check was observed in the sampled public pages.", "");
  for (const [index, finding] of audit.findings.entries()) {
    lines.push(
      `### ${index + 1}. ${finding.id}`,
      "",
      `- Status: ${finding.status}; severity: ${finding.severity}; confidence: ${finding.confidence}`,
      `- Checked: ${finding.checked_at}`,
      `- Evidence: ${finding.evidence_url}`,
      `- Observed: ${finding.observed}`,
      `- Why it matters: ${finding.impact}`,
      `- First fix: ${finding.first_fix}`,
      "",
    );
  }

  lines.push(
    "## Optional signal",
    "",
    `- llms.txt: ${audit.optional_signals.llms_txt.present ? "present" : "not observed"} (not scored)`,
    `- Note: ${audit.optional_signals.llms_txt.note}`,
    "",
    "## Method",
    "",
    "Pass earns full points, warning earns half, fail earns zero, and not-observed checks are excluded. A numeric score is withheld below 75% evidence coverage.",
  );
  return `${lines.join("\n")}\n`;
}

function clip(value, max = 126) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).replace(/[\s,;:.]+$/g, "")}…`;
}

function brandFromAudit(audit, row = {}) {
  const explicit = String(row.brand || row.company || "").trim();
  if (explicit) return explicit;
  const rootTitle = String(row.title || "").trim();
  if (rootTitle) return rootTitle.split(/[|–—]/)[0].trim();
  return audit.domain
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dimensionLine(audit) {
  return audit.dimensions
    .map((dimension) => {
      const short = {
        crawl: "Crawl",
        localization: "Locales",
        structured_data: "Schema",
        metadata: "Metadata",
      }[dimension.id];
      return `${short} ${dimension.earned_points === null ? "—" : `${dimension.earned_points}/${dimension.max_points}`}`;
    })
    .join(" · ");
}

export function reportEmailBlockers(audit, row = {}, options = {}) {
  const blockers = [];
  const contact = row.contact_email || row.contact_url || "";
  const liveLocaleFamilies = new Set(
    audit.pages_checked
      .filter((page) => page.status >= 200 && page.status < 300)
      .map((page) => localeFamily(page.expected_locale))
      .filter(Boolean),
  );
  if (audit.score === null || audit.coverage_pct < MIN_SCORE_COVERAGE_PCT) blockers.push("numeric score is unavailable or evidence coverage is below 75%");
  if (audit.findings.filter((finding) => finding.confidence === "high").length < 2) blockers.push("fewer than two high-confidence findings");
  if (!options.postalAddress) blockers.push("SENDER_POSTAL_ADDRESS is not configured");
  if (!isCompanyDomainEmail(contact)) blockers.push("contact is missing or not a company-domain email");
  else if (!emailMatchesSiteDomain(contact, audit.domain)) blockers.push("contact email domain does not match the audited site");
  else if (!isOutreachMailbox(contact)) blockers.push("contact mailbox is reserved for support, legal, privacy, billing, security, or hiring");
  if (!isCustomDomain(audit.final_url)) blockers.push("site does not use a custom domain");
  if (liveLocaleFamilies.size < 2) blockers.push("fewer than two live locale families were verified");
  return blockers;
}

export function renderReportFirstEmail(audit, row = {}, options = {}) {
  const brand = brandFromAudit(audit, row);
  const senderName = options.senderName || "Jimmy";
  const postalAddress = options.postalAddress || "[SENDER_POSTAL_ADDRESS REQUIRED BEFORE SEND]";
  const checks = reportChecks(audit);
  const scoreLine = audit.score === null
    ? `PUBLIC FRAMER READINESS · ${audit.rating.toUpperCase()}`
    : `PUBLIC FRAMER READINESS · ${audit.rating.toUpperCase()} · ${audit.score}/100`;
  const checkLines = checks.map((check, index) => {
    return `${index + 1}. ${check.label} · ${check.status} · ${check.confidence} confidence · ${audit.checked_at.slice(0, 10)}\n` +
      `Observed: ${clip(check.observed, 44)} Impact: ${clip(check.impact, 44)} Fix: ${clip(check.first_fix, 44)}\n` +
      `Evidence: ${check.evidence_url}`;
  });
  const productLink = options.includeProductLink && options.productUrl
    ? `\nPolyglot AEO for Framer: ${options.productUrl}`
    : "";
  const greeting = String(row.greeting || `${brand} team`).trim();
  const body = `Hi ${greeting},

I checked ${audit.domain}'s public Framer locale setup.

${scoreLine}
Checked ${audit.checked_at.slice(0, 10)} · ${audit.pages_checked.length} page(s) · ${audit.coverage_pct}% coverage
${dimensionLine(audit)}

${checkLines.join("\n")}

Public pages only—no Framer project or private CMS access. I ran it with Polyglot AEO, the Framer QA plugin I'm building.

Reply “fix” for the smallest Framer-side fix to item #1—no call.${productLink}

Best,
${senderName}

Polyglot AEO · one-to-one business outreach
${postalAddress}
Reply “no” to opt out.`;

  return {
    subject: `3 public Framer checks for ${brand}`,
    body,
    checks: checks.map((check) => check.id),
    blockers: reportEmailBlockers(audit, row, options),
  };
}
