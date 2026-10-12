import ts from "typescript";

const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const COMPONENTS = new Set(["IpfsImage", "IpfsBackground", "IpfsText"]);
const FORBIDDEN_PROPS = new Set(["src", "srcSet", "dangerouslySetInnerHTML", "children", "gateway", "gatewayUrl", "url", "fetchImpl"]);

function validCid(value) {
  return typeof value === "string" && value.length <= 128 && CID_RE.test(value.trim());
}

function validPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.split("/").every((part) => part && part !== "." && part !== ".." && /^[A-Za-z0-9._~-]+$/.test(part));
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function valueOf(node) {
  const expression = unwrap(node);
  if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) return { value: expression.text, dynamic: false };
  const dynamic = expression && ![ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NumericLiteral].includes(expression.kind);
  return { value: undefined, dynamic: Boolean(dynamic), expression: expression?.getText() };
}

/** Shared template/Workbench boundary. Dynamic CID values are validated by the pinned runtime. */
export function collectIpfsContentIssues(content, file, { runtimeAvailable = true } = {}) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Map([...COMPONENTS].map((name) => [name, name]));
  const namespaces = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "@/src/ui") continue;
    const binding = statement.importClause?.namedBindings;
    if (binding && ts.isNamespaceImport(binding)) namespaces.add(binding.name.text);
    if (binding && ts.isNamedImports(binding)) for (const item of binding.elements) {
      const original = item.propertyName?.text ?? item.name.text;
      if (COMPONENTS.has(original)) aliases.set(item.name.text, original);
    }
  }
  const issues = [];
  const add = (node, severity, ruleId, message, extra = {}) => issues.push({ severity, ruleId, message, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, ...extra });
  const review = (node, component, cid, path) => add(node, "warning", "manual-review/ipfs-content", `Review ${component} content source: CID ${cid.expression ?? JSON.stringify(cid.value)}${path ? `, path ${path.expression ?? JSON.stringify(path.value)}` : ""}. Runtime permits only bare CIDs and safe relative paths on platform IPFS gateways. Text is bounded UTF-8 and rendered without HTML. Paginate dynamic content.`, { component, cidExpression: cid.expression, pathExpression: path?.expression });

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName;
      const component = ts.isIdentifier(tag) ? aliases.get(tag.text) : ts.isPropertyAccessExpression(tag) && namespaces.has(tag.expression.getText()) ? tag.name.text : undefined;
      if (COMPONENTS.has(component)) {
        const attrs = new Map();
        let invalidProps = false;
        for (const attr of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(attr)) { invalidProps = true; continue; }
          const name = attr.name.getText();
          if (attrs.has(name) || FORBIDDEN_PROPS.has(name)) invalidProps = true;
          attrs.set(name, attr.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer);
        }
        if (invalidProps) add(node, "blocking", "media-policy/invalid-ipfs-content-props", "IPFS components must not use spreads, duplicate attributes, raw URLs, src/srcSet, caller gateways, children or HTML injection props.");
        const cid = valueOf(attrs.get("cid"));
        const path = attrs.has("path") ? valueOf(attrs.get("path")) : undefined;
        const validationPath = attrs.has("validationPath") ? valueOf(attrs.get("validationPath")) : undefined;
        if (!cid.dynamic && !validCid(cid.value) || component === "IpfsBackground" && cid.dynamic) {
          add(node, "blocking", "media-policy/invalid-ipfs-image-cid", "Pass a bare file/directory CID. URLs, ipfs:// values and missing/invalid CIDs are blocked; IpfsBackground keeps its static-CID requirement.");
        }
        const invalidPath = path && !path.dynamic && !validPath(path.value);
        const invalidValidation = validationPath && (validationPath.dynamic || !validPath(validationPath.value));
        const needsSample = component === "IpfsImage" && !cid.dynamic && path?.dynamic;
        if (invalidPath || invalidValidation || component === "IpfsBackground" && (path || validationPath) || component === "IpfsText" && validationPath || needsSample && !validationPath || validationPath && !path?.dynamic) {
          add(node, "blocking", "media-policy/invalid-ipfs-image-path", "Use only safe relative IPFS paths. A dynamic path below a static IpfsImage CID requires a static validationPath sample. IpfsText has no validationPath; IpfsBackground is CID-only.");
        }
        if (cid.dynamic || component === "IpfsText") review(node, component, cid, path);
      }
    }
    if (ts.isCallExpression(node)) {
      const target = unwrap(node.expression);
      const method = ts.isPropertyAccessExpression(target) ? target.name.text : ts.isElementAccessExpression(target) ? valueOf(target.argumentExpression).value : ts.isIdentifier(target) ? target.text : undefined;
      if (method === "readIpfsText") {
        const cid = valueOf(node.arguments[0]);
        const path = node.arguments.length > 1 ? valueOf(node.arguments[1]) : undefined;
        if (!cid.dynamic && !validCid(cid.value)) add(node, "blocking", "media-policy/invalid-ipfs-image-cid", "sdk.readIpfsText requires a bare CID, not a URL or ipfs:// value.");
        if (path && !path.dynamic && !validPath(path.value)) add(node, "blocking", "media-policy/invalid-ipfs-image-path", "sdk.readIpfsText requires a safe relative path.");
        review(node, "sdk.readIpfsText", cid, path);
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "readIpfsText" && !(ts.isCallExpression(node.parent) && node.parent.expression === node) || ts.isBindingElement(node) && (node.propertyName?.getText() ?? node.name.getText()) === "readIpfsText") {
      review(node, "sdk.readIpfsText reference", { expression: `${node.getText()} (CID supplied at call time)` });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!runtimeAvailable && issues.some((item) => item.ruleId === "manual-review/ipfs-content")) {
    issues.push({ severity: "blocking", ruleId: "runtime-policy/ipfs-content-unavailable", message: "The installed runtime does not support controlled dynamic IPFS content. Upgrade the shared runtime before accepting this component.", file });
  }
  return issues;
}
