import { FSI_QUERY_PREFIXES, resolveFsiQueryPrefix, isFsiQueryUrl } from "../src/sdk/fsiPolicy.mjs";

const fsiBases = FSI_QUERY_PREFIXES.map((prefix) => new URL(prefix));
// Select the policy even when credentials, fragments or encoded syntax make
// the URL invalid; an invalid FSI URL must not fall back to generic fetch rules.
export function isFsiFetchTarget(url) {
  return fsiBases.some((base) => url?.origin === base.origin && (url.pathname === base.pathname || url.pathname.startsWith(`${base.pathname}/`)));
}

function unwrap(node, ts) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

// Only the query may vary in raw fetch. Dynamic paths go through sdk.readFsi.
export function dynamicFsiQueryPrefix(target, ts, declaredUrls, isDeclaredUrl) {
  target = unwrap(target, ts);
  if (!target || !ts.isTemplateExpression(target)) return null;
  const prefix = target.head.text;
  if (!prefix.includes("?") || !isFsiQueryUrl(prefix) || !isDeclaredUrl(prefix, declaredUrls)) return null;
  return prefix;
}

// Raw fetch has no runtime wrapper. Require a statically safe request and
// encoded value-only interpolation; use sdk.readFsi for more complex requests.
export function fsiFetchSafetyIssue(target, init, staticTarget, ts, isGlobalEncoder) {
  target = unwrap(target, ts);
  let shape = staticTarget;
  if (ts.isTemplateExpression(target)) {
    shape = target.head.text;
    for (const span of target.templateSpans) {
      const expression = unwrap(span.expression, ts);
      const callee = ts.isCallExpression(expression) ? unwrap(expression.expression, ts) : null;
      if (!/(?:\?|&)[^?&#=]+=[^?&#]*$/.test(shape) ||
          !callee || !ts.isIdentifier(callee) || callee.text !== "encodeURIComponent" ||
          expression.arguments.length !== 1 || ts.isSpreadElement(expression.arguments[0]) || !isGlobalEncoder(callee)) {
        return "FSI fetch interpolation must be a query value encoded with the global encodeURIComponent(value). Use sdk.readFsi for dynamic paths or parameter objects.";
      }
      shape += `encoded${span.literal.text}`;
    }
  }
  if (!isFsiQueryUrl(shape)) return "FSI fetch requires an allowlisted URL without traversal, encoded path syntax or fragments.";

  init = unwrap(init, ts);
  if (!init || !ts.isObjectLiteralExpression(init)) return "FSI fetch requires a literal options object with method GET, credentials omit, redirect error and referrerPolicy no-referrer.";
  const required = { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" };
  const allowed = { ...required, cache: "no-store" };
  const seen = new Set();
  for (const property of init.properties) {
    if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) {
      return "FSI fetch options must use explicit literal properties without spreads, shorthand or computed keys.";
    }
    const key = property.name.text;
    const value = unwrap(property.initializer, ts);
    if (seen.has(key) || !Object.hasOwn(allowed, key) ||
        (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) || value.text !== allowed[key]) {
      return "FSI fetch permits only GET, credentials omit, redirect error, referrerPolicy no-referrer and optional cache no-store; body, headers and overrides are not allowed.";
    }
    seen.add(key);
  }
  if (Object.keys(required).some((key) => !seen.has(key))) return "FSI fetch must explicitly set method GET, credentials omit, redirect error and referrerPolicy no-referrer.";
  return null;
}

export function collectFsiReadIssues(sourceFile, ts, endpoints, file) {
  const issues = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && (
      (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "readFsi") ||
      (ts.isIdentifier(node.expression) && node.expression.text === "readFsi")
    )) {
      const prefix = resolveFsiQueryPrefix(endpoints);
      const allowed = prefix !== null;
      const reviewPrefix = prefix ?? FSI_QUERY_PREFIXES[0];
      issues.push({
        severity: allowed ? "warning" : "blocking",
        ruleId: allowed ? "manual-review/external-endpoint" : "endpoint-policy/fsi-declaration-required",
        message: allowed
          ? "sdk.readFsi uses the platform query allowlist. Review the declared FSI prefix, dynamic path and query parameters before publish."
          : `sdk.readFsi requires ${FSI_QUERY_PREFIXES.join(" or ")} in manifest.endpoints for review.`,
        fixHint: `Declare ${FSI_QUERY_PREFIXES.join(" or ")} in manifest.endpoints and use sdk.readFsi for dynamic paths and query parameters.`,
        source: "sdk.readFsi",
        url: reviewPrefix,
        origin: new URL(reviewPrefix).origin,
        pathname: new URL(reviewPrefix).pathname,
        dynamicQuery: true,
        pathExpression: node.arguments[0]?.getText(sourceFile),
        paramsExpression: node.arguments[1]?.getText(sourceFile),
        file,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues;
}
