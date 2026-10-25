import ts from "typescript";

export const MAP_CAPABILITIES = Object.freeze(["street-map-v1"]);
const MAP_CAPABILITY = MAP_CAPABILITIES[0];

/** Additive declaration. It grants no raw network, worker or source-file access. */
export function checkMapCapabilityManifest(manifest) {
  const capabilities = manifest?.mapCapabilities;
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities) || capabilities.length > 1 || capabilities.some((value) => value !== MAP_CAPABILITY) || new Set(capabilities).size !== capabilities.length) {
    return [{ severity: "blocking", ruleId: "map-policy/invalid-capabilities", field: "mapCapabilities", message: "mapCapabilities must contain only the unique street-map-v1 entry. Omit it when no street map is needed." }];
  }
  return capabilities.length ? [{ severity: "warning", ruleId: "manual-review/street-map", field: "mapCapabilities", mapCapabilities: [...capabilities], message: "Review the fixed OpenFreeMap street map, point limits, attribution and usable fallback. The map provider receives network and viewport information. This declaration grants no raw network, custom style, worker or additional source files." }] : [];
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}
function member(node) {
  if (ts.isPropertyAccessExpression(node)) return { target: unwrap(node.expression), key: node.name.text };
  if (ts.isElementAccessExpression(node)) {
    const key = unwrap(node.argumentExpression);
    return { target: unwrap(node.expression), key: key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) ? key.text : undefined };
  }
  return undefined;
}

/** Shared by template checks and receiving-host intake; native APIs remain forbidden. */
export function collectMapCapabilityIssues(content, file, manifest, { runtimeAvailable = true } = {}) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declared = Array.isArray(manifest?.mapCapabilities) && manifest.mapCapabilities.includes(MAP_CAPABILITY);
  const namespaces = new Set();
  const components = new Set();
  const issues = [];
  const seen = new Set();
  let usesMap = declared;
  const add = (node, ruleId, message) => {
    const key = `${ruleId}:${node?.pos ?? -1}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ severity: "blocking", ruleId, message, file, ...(node ? { line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 } : {}) });
  };
  const requireMap = (node) => {
    usesMap = true;
    if (!declared) add(node, "map-policy/undeclared-capability", 'Declare mapCapabilities: ["street-map-v1"] before importing or using FlapStreetMap from the shared UI.');
  };
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "@/src/ui" || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
      if (!item.isTypeOnly && (item.propertyName?.text ?? item.name.text) === "FlapStreetMap") {
        components.add(item.name.text);
        requireMap(item);
      }
    }
  }
  const isNamespace = (node) => Boolean(unwrap(node) && ts.isIdentifier(unwrap(node)) && namespaces.has(unwrap(node).text));
  const isComponent = (node) => {
    const target = unwrap(node);
    if (!target) return false;
    if (ts.isIdentifier(target)) return components.has(target.text);
    const access = target && member(target);
    return access?.key === "FlapStreetMap" && isNamespace(access.target);
  };
  // Track retained namespace/component references and object destructuring.
  for (let pass = 0; pass < 5; pass += 1) {
    function collect(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name)) {
          if (isNamespace(node.initializer)) namespaces.add(node.name.text);
          if (isComponent(node.initializer)) components.add(node.name.text);
        }
        if (ts.isObjectBindingPattern(node.name) && isNamespace(node.initializer)) {
          for (const item of node.name.elements) {
            const key = item.propertyName ?? item.name;
            if ((ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === "FlapStreetMap" && ts.isIdentifier(item.name)) components.add(item.name.text);
          }
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        if (isNamespace(node.right)) namespaces.add(node.left.text);
        if (isComponent(node.right)) components.add(node.left.text);
      }
      ts.forEachChild(node, collect);
    }
    collect(source);
  }
  function visit(node) {
    if (isComponent(node)) requireMap(node);
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && isNamespace(node.initializer)) {
      for (const item of node.name.elements) if (ts.isIdentifier(item.name) && components.has(item.name.text)) requireMap(item);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (usesMap && !runtimeAvailable) add(undefined, "runtime-policy/street-map-unavailable", "This component requires FlapStreetMap and uiFeatures.streetMap=1. Upgrade the shared Runtime and receiving hosts before accepting it.");
  return issues;
}
