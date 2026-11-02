const CLOSED_WARNING_STATUSES = new Set(["done", "resolved", "skipped"]);

const SCOPES = [
  {
    id: "loka_pro",
    product: "Loka Pro",
    terms: ["loka pro", "getloka.dev", "loka_pro", "prod_4xxs1dwwjh5ihwntmoex9h"],
  },
  {
    id: "ally_auditor",
    product: "Ally Auditor",
    terms: ["ally auditor", "ally_auditor"],
  },
  {
    id: "gaode_maps_assistant",
    product: "Gaode Maps Assistant",
    terms: ["gaode maps assistant", "gaode"],
  },
  {
    id: "polyglot_aeo",
    product: "Polyglot AEO",
    terms: [
      "polyglot aeo",
      "polyglotaeo",
      "polyglotaeo.com",
      "license.polyglotaeo.com",
      "polyglot-license",
    ],
  },
];

export function isOpenCreemComplianceWarning(row) {
  return Boolean(
    row?.type === "compliance_warning" &&
      row?.channel === "creem" &&
      !CLOSED_WARNING_STATUSES.has(row?.status),
  );
}

export function inferComplianceScope(row) {
  const haystack = [
    row?.campaign,
    row?.target,
    row?.evidence,
    row?.note,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const explicit = haystack.match(/\b(?:product_scope|scope|store|product)\s*=\s*([a-z0-9_-]+)/i)?.[1];
  if (explicit) {
    const scope = SCOPES.find((item) => item.id === explicit || item.product.toLowerCase().replace(/\s+/g, "_") === explicit);
    if (scope) return { ...scope, reason: `explicit ${explicit}` };
  }

  for (const scope of SCOPES) {
    if (scope.terms.some((term) => haystack.includes(term.toLowerCase()))) {
      return { ...scope, reason: `matched ${scope.product}` };
    }
  }

  return {
    id: "unknown",
    product: "Unknown store",
    terms: [],
    reason: "no product marker",
  };
}

export function annotateComplianceWarning(row) {
  const scope = inferComplianceScope(row);
  return {
    ...row,
    product_scope: scope.id,
    product: scope.product,
    scope_reason: scope.reason,
  };
}

export function isPolyglotComplianceWarning(row) {
  const scope = inferComplianceScope(row);
  return scope.id === "polyglot_aeo" || scope.id === "unknown";
}

export function isOtherProductComplianceWarning(row) {
  const scope = inferComplianceScope(row);
  return scope.id !== "polyglot_aeo" && scope.id !== "unknown";
}

export function openComplianceWarningsForScope(rows, scopeId = "polyglot_aeo") {
  return (Array.isArray(rows) ? rows : [])
    .filter(isOpenCreemComplianceWarning)
    .filter((row) => {
      if (scopeId === "polyglot_aeo") return isPolyglotComplianceWarning(row);
      return inferComplianceScope(row).id === scopeId;
    })
    .map(annotateComplianceWarning)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.__index || 0) - (a.__index || 0));
}

export function otherProductComplianceWarnings(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(isOpenCreemComplianceWarning)
    .filter(isOtherProductComplianceWarning)
    .map(annotateComplianceWarning)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.__index || 0) - (a.__index || 0));
}
