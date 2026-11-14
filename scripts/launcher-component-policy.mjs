import ts from "typescript";

// Portable rules from Workbench's launcher-preview/source-check.mjs (de7883f).
// Workbench evaluates any separately reviewed artifacts during intake.
const forbiddenNames = new Set([
  "window", "document", "globalThis", "global", "self", "top", "parent", "frames", "opener",
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "navigator", "location", "history",
  "localStorage", "sessionStorage", "indexedDB", "caches", "Worker", "SharedWorker", "ServiceWorker",
  "BroadcastChannel", "MessageChannel", "postMessage", "Function", "eval", "require", "process",
  "Deno", "Bun", "Buffer", "WebAssembly", "importScripts", "ethereum", "walletClient",
  "signMessage", "signTransaction", "sendTransaction", "writeContract", "request", "constructor",
  "__proto__", "setTimeout", "setInterval",
]);
const resourceTags = new Set(["script", "style", "base", "meta", "iframe", "frame", "object", "embed",
  "img", "image", "video", "audio", "source", "link", "a", "form"]);
const resourceAttributes = new Set(["src", "srcSet", "href", "srcDoc", "dangerouslySetInnerHTML", "action", "formAction"]);
const configActions = new Set(["simulateAction", "writeContract", "simulateContract", "sendTransaction"]);
const configTransactions = new Set(["submit", "quote", "encode", "wallet", "findSalt", "checkReceipt", "openLauncher"]);
const resourceUrl = /url\s*\(|(?:javascript|https?|data):/i;
const useHostCapability = "Use the Launcher context or a capability supplied by the host.";

function isTaxInfoLink(node, source) {
  if (node.tagName.getText(source) !== "a") return false;
  const attrs = node.attributes.properties;
  const attr = name => attrs.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === name)?.initializer;
  const href = attr("href");
  const target = attr("target");
  const rel = attr("rel");
  return href && ts.isJsxExpression(href) && href.expression && ts.isPropertyAccessExpression(href.expression)
    && ts.isIdentifier(href.expression.expression) && href.expression.expression.text === "context"
    && href.expression.name.text === "tokenTaxInfoHref" && target && ts.isStringLiteral(target)
    && target.text === "_blank" && rel && ts.isStringLiteral(rel) && rel.text === "noopener noreferrer"
    && attrs.every(item => ts.isJsxAttribute(item)
      && ["href", "target", "rel", "className", "style", "title", "aria-label"].includes(item.name.getText(source)))
    && new Set(attrs.map(item => item.name.getText(source))).size === attrs.length;
}

function isConfigHostUse(node, component, allowTransactions) {
  const use = node.parent;
  if (ts.isPropertySignature(use) && use.name === node) return true;
  if (ts.isBindingElement(use) && !use.propertyName && use.name === node
    && ts.isObjectBindingPattern(use.parent)) return component.parameters[0] === use.parent.parent;
  if (!ts.isPropertyAccessExpression(use)) return false;
  let member = use;
  if (use.expression !== node) {
    const props = component.parameters[0]?.name;
    member = use.parent;
    if (use.name !== node || !props || !ts.isIdentifier(props) || !ts.isIdentifier(use.expression)
      || props.text !== use.expression.text || !ts.isPropertyAccessExpression(member) || member.expression !== use) return false;
  }
  return member.name.text === "redirect" || (allowTransactions && configTransactions.has(member.name.text));
}

export function checkLauncherComponentPolicy(source, manifest) {
  const allowTaxInfoLink = manifest.configContract === "crowd-native-create/v1";
  const protectContext = allowTaxInfoLink || manifest.configContract === "agent-raise-create/v1";
  const allowConfigRedirect = manifest.configContract === "launcher-config-preview/v1";
  const allowConfigTransactions = manifest.transactions?.create === true;
  const issues = [];

  function add(node, rule, message, fixHint, namespace = "launcher-preview") {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    issues.push({ ruleId: `${namespace}/${rule}`, severity: "blocking", file: "Component.tsx",
      line: line + 1, column: character + 1, message, fixHint });
  }

  function visit(node, config) {
    if (ts.isFunctionDeclaration(node) && node.parent === source && node.name?.text === "LauncherConfig"
      && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) config = node;

    if (config && ((ts.isIdentifier(node) && (configActions.has(node.text)
      || (node.text === "host" && (!allowConfigRedirect || !isConfigHostUse(node, config, allowConfigTransactions)))))
      || (allowConfigRedirect && ts.isElementAccessExpression(node) && node.argumentExpression
        && ts.isStringLiteralLike(node.argumentExpression)
        && (node.argumentExpression.text === "host" || configActions.has(node.argumentExpression.text))))) {
      add(node, "config-action", "LauncherConfig uses a host action unavailable to this profile.",
        "Use onChange for draft updates. Use host.redirect on the generic configuration profile and declare transactions.create for its supported creation actions.");
    }

    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== "react") {
        add(node.moduleSpecifier, "source-import", "Launcher imports must come from react.",
          "Remove third-party and local imports. Use host React and inline JSX for simple icons.");
      }
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        add(bindings, "namespace-import", "Launcher does not allow namespace imports.", "Import the required React exports by name.");
      }
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || ts.isImportEqualsDeclaration(node)) {
      add(node, "source-export", "Launcher requires direct named function exports and standard imports.",
        "Use export function Launcher, and export function LauncherConfig if the manifest declares it.");
    }
    if (ts.isNewExpression(node)) {
      add(node, "source-constructor", "Launcher does not allow new expressions.",
        "Use an allowed function or literal. For dates, call Intl.DateTimeFormat(...) and pass the timestamp to .format() or .formatToParts().");
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, "dynamic-import", "Launcher does not allow dynamic imports.", "Use a static import from react.");
    }
    if (ts.isIdentifier(node) && forbiddenNames.has(node.text)) {
      add(node, "forbidden-api", `Launcher does not allow ${node.text}.`, useHostCapability);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "prototype") {
      add(node, "prototype-access", "Launcher does not allow direct prototype access.", "Remove the prototype access.");
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
      && forbiddenNames.has(node.argumentExpression.text)) {
      add(node, "computed-capability", "Launcher does not allow computed access to this capability.", useHostCapability);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && resourceTags.has(node.tagName.getText(source))
      && !(allowTaxInfoLink && isTaxInfoLink(node, source))) {
      add(node.tagName, "resource-tag", `Launcher does not allow <${node.tagName.getText(source)}> in this profile.`,
        "Remove the tag. Use inline SVG paths for decorative icons or host.redirect for same-site navigation.");
    }
    if (ts.isJsxAttribute(node) && resourceAttributes.has(node.name.getText(source))) {
      if (!(allowTaxInfoLink && node.name.getText(source) === "href" && isTaxInfoLink(node.parent.parent, source))) {
        add(node.name, "resource-attribute", `Launcher does not allow the ${node.name.getText(source)} attribute here.`,
          "Remove the attribute and use a host capability where available.");
      }
    }
    if (protectContext && (((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)
      && node.name.text === "context") || (ts.isBindingElement(node) && ts.isIdentifier(node.name)
      && node.name.text === "context" && !isComponentContextBinding(node)))) {
      add(node, "context-shadow", "Launcher cannot shadow the host context.", "Keep context as the host-supplied component prop.",
        "launcher-runtime");
    }
    if (protectContext && ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && (node.left.getText(source) === "context" || node.left.getText(source).startsWith("context."))) {
      add(node, "context-write", "Launcher cannot assign to the host context.", "Keep draft state separate from the host context.",
        "launcher-runtime");
    }
    if (ts.isJsxSpreadAttribute(node)) {
      add(node, "jsx-spread", "Launcher does not allow JSX prop spreads.", "Write each permitted JSX prop explicitly.");
    }
    if (ts.isStringLiteralLike(node) && resourceUrl.test(node.text)) {
      add(node, "resource-url", "Launcher does not allow URL literals, data URIs or CSS url(...).",
        "Remove the resource URL. Use inline SVG paths for decorative icons, or host.redirect with a relative app route.");
    }
    ts.forEachChild(node, child => visit(child, config));
  }

  visit(source);
  return issues;
}

function isComponentContextBinding(node) {
  const parameter = node.parent.parent;
  return ts.isParameter(parameter) && ts.isFunctionDeclaration(parameter.parent)
    && ["Launcher", "LauncherConfig"].includes(parameter.parent.name?.text);
}
