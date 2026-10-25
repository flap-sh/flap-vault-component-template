import ts from "typescript";

/** Build-derived feature requirements avoid adding a route DSL to manifests. */
export function usesMiniAppRouting(content, file = "Component.tsx") {
  const emitted = ts.transpileModule(content, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false } }).outputText;
  const source = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const namespaces = new Set();
  const exports = new Set(["useMiniAppRouter", "MINI_APP_ROUTING_VERSION"]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !["@/src/sdk", "@flapsdk/vault-runtime/sdk"].includes(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((item) => exports.has((item.propertyName ?? item.name).text))) return true;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
  }
  let used = false;
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && namespaces.has(node.expression.getText(source)) && exports.has(node.name.text)) used = true;
    if (ts.isElementAccessExpression(node) && namespaces.has(node.expression.getText(source)) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression) && exports.has(node.argumentExpression.text)) used = true;
    ts.forEachChild(node, visit);
  }
  visit(source);
  return used;
}

export function collectMiniAppRoutingIssues(content, file, manifest, { runtimeAvailable = true } = {}) {
  if (!usesMiniAppRouting(content, file)) return [];
  const issues = [];
  if (manifest?.schemaVersion !== 2 || manifest?.appModel !== "standalone" || manifest?.mode !== "mini-app") issues.push({ severity: "blocking", ruleId: "mini-app-routing/standalone-only", message: "useMiniAppRouter is available only to standalone Mini App v2.", file });
  if (!runtimeAvailable) issues.push({ severity: "blocking", ruleId: "runtime-policy/mini-app-routing-unavailable", message: "This component requires sdkFeatures.miniAppRouting=1. Upgrade the shared Runtime and receiving hosts before accepting it.", file });
  return issues;
}
