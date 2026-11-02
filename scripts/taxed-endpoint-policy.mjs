// Platform-owned native-fetch query exception; manifest declarations remain mandatory.
const subdomainSuffix = ".taxed.fun";
const encodedPathSyntax = /%(?:2e|2f|5c|25|0[0-9a-f]|1[0-9a-f]|20|7f)/i;
const hasDotSegment = (path) => path.split("/").some((part) => part === "." || part === "..");

// Select this policy before checking URL safety, so unsafe taxed.fun requests
// cannot fall through to the less restrictive generic static-fetch policy.
export function isTaxedFetchTarget(url) {
  return typeof url?.hostname === "string" && url.hostname.toLowerCase().replace(/\.+$/, "").endsWith(subdomainSuffix);
}

function isTaxedQueryUrl(value) {
  try {
    if (typeof value !== "string" || /[\\#\u0000-\u0020\u007f]/.test(value)) return false;
    const raw = value.match(/^https:\/\/([^/?#]+)([^?#]*)/i);
    if (!raw) return false;
    const [, authority, rawPath] = raw;
    const host = authority.replace(/:443$/, "").toLowerCase();
    if (host.length > 253 || !host.endsWith(subdomainSuffix) ||
        !host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return false;
    if (encodedPathSyntax.test(rawPath) || hasDotSegment(rawPath)) return false;
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      url.hostname === host && isTaxedFetchTarget(url) && !encodedPathSyntax.test(url.pathname);
  } catch {
    return false;
  }
}

function unwrap(node, ts) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
}

// A fixed query declaration authorizes only that exact URL, never new values.
export function queryFreeDeclarations(declaredUrls) {
  return Array.from(declaredUrls).filter((value) => {
    try { return !new URL(value).search; } catch { return false; }
  });
}

// Check every source file, even one without fetch, because imported modules
// must not replace the encoder used by a different component's query values.
export function collectQueryEncoderMutationIssues(sourceFile, ts, isGlobalEncoder, file) {
  const issues = [];
  const reported = new Set();
  const assigned = (target) => {
    target = unwrap(target, ts);
    if (!target) return;
    if (ts.isIdentifier(target)) {
      if (target.text === "encodeURIComponent" && isGlobalEncoder(target) && !reported.has(target)) {
        reported.add(target);
        issues.push({
          severity: "blocking",
          ruleId: "forbidden-api/browser-global-escape",
          message: "Artifact source must not modify the global encodeURIComponent; query interpolation depends on the unmodified global encoder.",
          file,
          line: sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile)).line + 1,
        });
      }
    } else if (ts.isObjectLiteralExpression(target)) {
      for (const property of target.properties) {
        if (ts.isShorthandPropertyAssignment(property)) assigned(property.name);
        else if (ts.isPropertyAssignment(property)) assigned(property.initializer);
        else if (ts.isSpreadAssignment(property)) assigned(property.expression);
      }
    } else if (ts.isArrayLiteralExpression(target)) {
      for (const element of target.elements) assigned(element);
    } else if (ts.isSpreadElement(target)) assigned(target.expression);
    else if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) assigned(target.left);
  };
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      assigned(node.left);
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      assigned(node.operand);
    } else if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) && !ts.isVariableDeclarationList(node.initializer)) {
      assigned(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues;
}

// The complete host and path must be literal. Only query values may vary.
export function dynamicTaxedQueryPrefix(target, ts, declaredUrls, isDeclaredUrl) {
  target = unwrap(target, ts);
  if (!target || !ts.isTemplateExpression(target)) return null;
  const prefix = target.head.text;
  if (!prefix.includes("?") || !isTaxedQueryUrl(prefix) || !isDeclaredUrl(prefix, queryFreeDeclarations(declaredUrls))) return null;
  return prefix;
}

export function taxedFetchSafetyIssue(target, init, staticTarget, ts, isGlobalEncoder) {
  target = unwrap(target, ts);
  let shape = staticTarget;
  if (target && ts.isTemplateExpression(target)) {
    shape = target.head.text;
    for (const span of target.templateSpans) {
      const expression = unwrap(span.expression, ts);
      const callee = ts.isCallExpression(expression) ? unwrap(expression.expression, ts) : null;
      if (!/(?:\?|&)[^?&#=]+=[^?&#]*$/.test(shape) ||
          !callee || !ts.isIdentifier(callee) || callee.text !== "encodeURIComponent" ||
          expression.arguments.length !== 1 || ts.isSpreadElement(expression.arguments[0]) || !isGlobalEncoder(callee)) {
        return "taxed.fun fetch interpolation must be a query value encoded with the global encodeURIComponent(value); host and path must be literal.";
      }
      shape += `encoded${span.literal.text}`;
    }
  }
  if (!isTaxedQueryUrl(shape)) return "taxed.fun fetch requires a valid HTTPS subdomain URL without credentials, alternate ports, traversal, encoded path syntax or fragments.";

  init = unwrap(init, ts);
  if (!init || !ts.isObjectLiteralExpression(init)) return "taxed.fun fetch requires a literal options object with method GET, credentials omit, redirect error and referrerPolicy no-referrer.";
  const required = { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" };
  const allowed = { ...required, cache: "no-store" };
  const seen = new Set();
  for (const property of init.properties) {
    if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) {
      return "taxed.fun fetch options must use explicit literal properties without spreads, shorthand or computed keys.";
    }
    const key = property.name.text;
    const value = unwrap(property.initializer, ts);
    if (seen.has(key) || !Object.hasOwn(allowed, key) ||
        (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) || value.text !== allowed[key]) {
      return "taxed.fun fetch permits only GET, credentials omit, redirect error, referrerPolicy no-referrer and optional cache no-store; body, headers and overrides are not allowed.";
    }
    seen.add(key);
  }
  if (Object.keys(required).some((key) => !seen.has(key))) return "taxed.fun fetch must explicitly set method GET, credentials omit, redirect error and referrerPolicy no-referrer.";
  return null;
}
