import { FSI_QUERY_PREFIX, hasFsiQueryDeclaration, isFsiQueryUrl } from "../src/sdk/fsiPolicy.mjs";

// Only the query may vary in raw fetch. Dynamic paths go through sdk.readFsi.
export function dynamicFsiQueryPrefix(target, ts, declaredUrls, isDeclaredUrl) {
  while (target && (ts.isParenthesizedExpression(target) || ts.isAsExpression(target) || ts.isNonNullExpression(target))) target = target.expression;
  if (!target || !ts.isTemplateExpression(target)) return null;
  const prefix = target.head.text;
  if (!prefix.includes("?") || !isFsiQueryUrl(prefix) || !isDeclaredUrl(prefix, declaredUrls)) return null;
  return prefix;
}

export function collectFsiReadIssues(sourceFile, ts, endpoints, file) {
  const issues = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && (
      (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "readFsi") ||
      (ts.isIdentifier(node.expression) && node.expression.text === "readFsi")
    )) {
      const allowed = hasFsiQueryDeclaration(endpoints);
      issues.push({
        severity: allowed ? "warning" : "blocking",
        ruleId: allowed ? "manual-review/external-endpoint" : "endpoint-policy/fsi-declaration-required",
        message: allowed
          ? "sdk.readFsi uses the platform query allowlist. Review the declared FSI prefix, dynamic path and query parameters before publish."
          : `sdk.readFsi requires ${FSI_QUERY_PREFIX} in manifest.endpoints for review.`,
        fixHint: `Declare ${FSI_QUERY_PREFIX} in manifest.endpoints and use sdk.readFsi for dynamic paths and query parameters.`,
        source: "sdk.readFsi",
        url: FSI_QUERY_PREFIX,
        origin: new URL(FSI_QUERY_PREFIX).origin,
        pathname: new URL(FSI_QUERY_PREFIX).pathname,
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
