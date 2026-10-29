import ts from "typescript";

const SDK_MODULES = new Set(["@/src/sdk", "@flapsdk/vault-runtime/sdk"]);
const ROUTING_EXPORTS = new Set(["useMiniAppRouter", "MINI_APP_ROUTING_VERSION"]);
const memberName = (node) => ts.isComputedPropertyName(node) ? memberName(node.expression) : ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : undefined;
const unwrap = (node) => node && ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

/** Inspect emitted values, keeping type-only and unused imports compatible. */
export function usesMiniAppRouting(content, file = "Component.tsx") {
  const emitted = ts.transpileModule(content, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false } }).outputText;
  const source = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const namespaces = new Set();
  for (const statement of source.statements) {
    const fromSdk = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && SDK_MODULES.has(statement.moduleSpecifier.text);
    if (!fromSdk) continue;
    if (ts.isExportDeclaration(statement)) {
      // A wildcard/default namespace re-export exposes the whole SDK, including
      // routing. Every source file is checked, including the VaultABI bridge.
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) return true;
      if (statement.exportClause.elements.some((item) => ROUTING_EXPORTS.has((item.propertyName ?? item.name).text) || (item.propertyName ?? item.name).text === "default")) return true;
    }
    if (!ts.isImportDeclaration(statement)) continue;
    if (statement.importClause?.name) namespaces.add(statement.importClause.name.text);
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      if (bindings.elements.some((item) => ROUTING_EXPORTS.has((item.propertyName ?? item.name).text))) return true;
      for (const item of bindings.elements) if ((item.propertyName ?? item.name).text === "default") namespaces.add(item.name.text);
    }
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
  }
  if (!namespaces.size) return false;
  const isNamespace = (node) => {
    node = unwrap(node);
    return Boolean(node && ts.isIdentifier(node) && namespaces.has(node.text));
  };
  let used = false;
  let changed = false;
  const addAlias = (node) => {
    if (ts.isIdentifier(node) && !namespaces.has(node.text)) { namespaces.add(node.text); changed = true; }
  };
  const inspectBinding = (binding) => {
    if (ts.isIdentifier(binding)) { addAlias(binding); return; }
    if (!ts.isObjectBindingPattern(binding)) return;
    for (const item of binding.elements) {
      if (ROUTING_EXPORTS.has(memberName(item.propertyName ?? item.name))) used = true;
      if (item.dotDotDotToken) addAlias(item.name);
    }
  };
  function visit(node) {
    if (ts.isVariableDeclaration(node) && isNamespace(node.initializer)) inspectBinding(node.name);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isNamespace(node.right)) {
      const left = unwrap(node.left);
      if (ts.isIdentifier(left)) addAlias(left);
      if (ts.isObjectLiteralExpression(left)) for (const item of left.properties) {
        if ((ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) && ROUTING_EXPORTS.has(memberName(item.name))) used = true;
        if (ts.isSpreadAssignment(item)) addAlias(item.expression);
      }
    }
    if (ts.isPropertyAccessExpression(node) && isNamespace(node.expression) && ROUTING_EXPORTS.has(node.name.text)) used = true;
    if (ts.isElementAccessExpression(node) && isNamespace(node.expression) && node.argumentExpression && ROUTING_EXPORTS.has(memberName(node.argumentExpression))) used = true;
    if (ts.isExportAssignment(node) && isNamespace(node.expression)) used = true;
    if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.some((item) => namespaces.has((item.propertyName ?? item.name).text))) used = true;
    ts.forEachChild(node, visit);
  }
  do { changed = false; visit(source); } while (changed && !used);
  return used;
}

export function collectMiniAppRoutingIssues(content, file, manifest, { runtimeAvailable = true } = {}) {
  if (!usesMiniAppRouting(content, file)) return [];
  const issues = [];
  if (manifest?.schemaVersion !== 2 || manifest?.appModel !== "standalone" || manifest?.mode !== "mini-app") issues.push({ severity: "blocking", ruleId: "mini-app-routing/standalone-only", message: "useMiniAppRouter is available only to standalone Mini App v2.", file });
  if (!runtimeAvailable) issues.push({ severity: "blocking", ruleId: "runtime-policy/mini-app-routing-unavailable", message: "This component requires sdkFeatures.miniAppRouting=1. Upgrade the shared Runtime and receiving hosts before accepting it.", file });
  return issues;
}
