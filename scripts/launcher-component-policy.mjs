import ts from "typescript";
import { launcherComputedKeys } from "./launcher-computed-keys.mjs";

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
const reactElementApis = new Set(["createElement", "cloneElement"]);
const configActions = new Set(["simulateAction", "writeContract", "simulateContract", "sendTransaction"]);
const configTransactions = new Set(["submit", "quote", "encode", "wallet", "findSalt", "checkReceipt", "openLauncher"]);
const resourceUrl = /url\s*\(|(?:javascript|https?|data):/i;
const computedNamespaces = new Set(["Array", "Object", "Reflect", "String", "Number", "BigInt", "Boolean",
  "Promise", "Date", "RegExp", "Error", "Symbol", "Math", "JSON", "Intl", "host"]);
const useExplicitAccess = "Use a statically known member or an explicit numeric index for data.";
const useHostCapability = "Use the Launcher context or a capability supplied by the host.";
const useConfigCapabilities = "Use onChange for draft updates. Use host.redirect on the generic configuration profile and declare transactions.create for its supported creation actions.";
const useIndividualHostMembers = "Keep host in the component props. Save or pass only permitted members, such as host.redirect or host?.submit when creation is declared.";
const constructorHints = new Map([
  ["Array", "Use an array literal for known items or Array.from for a sized or derived array."],
  ["Date", "Keep the timestamp as a number and pass milliseconds to Intl.DateTimeFormat(...).format() or .formatToParts()."],
  ["Error", "Call Error(message) directly to create the error."],
  ["Intl.DateTimeFormat", "Call Intl.DateTimeFormat(locale, options) directly and pass milliseconds to .format() or .formatToParts()."],
  ["Promise", "Use an async function and await an existing promise. Use Promise.resolve only when a microtask is sufficient."],
  ["URL", "Build a site-relative path from a fixed path and validated parameters, then pass it to host.redirect."],
]);

function getConstructorHint(expression) {
  const name = expression.getText();
  if (/^(?:(?:Uint|Int)(?:8|16|32)|Uint8Clamped|Float(?:16|32|64)|Big(?:Uint|Int)64)Array$/.test(name)) {
    const zero = name.startsWith("Big") ? "0n" : "0";
    return `Use ${name}.from(values) for existing data or ${name}.from({ length }, () => ${zero}) for a zero-filled array.`;
  }
  return constructorHints.get(name) ?? "Use an allowed function or literal to build this value.";
}

function isTaxInfoLink(node, source, symbolFor) {
  if (node.tagName.getText(source) !== "a") return false;
  const attrs = node.attributes.properties;
  const attr = name => attrs.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === name)?.initializer;
  const href = attr("href");
  const target = attr("target");
  const rel = attr("rel");
  const expression = href && ts.isJsxExpression(href) ? href.expression : undefined;
  if (!expression || !ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) return false;
  const binding = symbolFor(expression.expression)?.valueDeclaration;
  return binding && ts.isBindingElement(binding) && isComponentContextBinding(binding, source)
    && expression.name.text === "tokenTaxInfoHref" && target && ts.isStringLiteral(target)
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

function getDefaultReactImports(source) {
  const names = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "react" || statement.importClause?.isTypeOnly) continue;
    const clause = statement.importClause;
    if (clause?.name) names.push(clause.name);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        if (!specifier.isTypeOnly && specifier.propertyName?.text === "default") names.push(specifier.name);
      }
    }
  }
  return names;
}

function isTypeReference(node) {
  return ts.isQualifiedName(node.parent) || ts.isTypeQueryNode(node.parent);
}

export function checkLauncherComponentPolicy(source, manifest) {
  const allowTaxInfoLink = manifest.configContract === "crowd-native-create/v1";
  const protectContext = allowTaxInfoLink || manifest.configContract === "agent-raise-create/v1";
  const allowConfigRedirect = manifest.configContract === "launcher-config-preview/v1";
  const allowConfigTransactions = manifest.transactions?.create === true;
  const computedKeys = launcherComputedKeys(source);
  const issues = [];
  const { symbolFor } = computedKeys;
  const reactImports = getDefaultReactImports(source);
  const reactNames = new Set(reactImports.map(node => node.text));
  const reactSymbols = new Set(reactImports.map(symbolFor).filter(Boolean));

  function add(node, rule, message, fixHint, namespace = "launcher-preview") {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    issues.push({ ruleId: `${namespace}/${rule}`, severity: "blocking", file: "Component.tsx",
      line: line + 1, column: character + 1, message, fixHint });
  }

  function visit(node, config) {
    const bindingKey = ts.isBindingElement(node) && node.propertyName;
    const computedKey = ts.isElementAccessExpression(node) ? computedKeys.value(node.argumentExpression)
      : bindingKey && ts.isComputedPropertyName(bindingKey) ? computedKeys.value(bindingKey.expression)
        : bindingKey && ts.isStringLiteral(bindingKey) ? bindingKey.text : undefined;
    if (ts.isFunctionDeclaration(node) && node.parent === source && node.name?.text === "LauncherConfig"
      && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) config = node;

    const props = config?.parameters[0]?.name;
    if (props && ts.isObjectBindingPattern(props) && ts.isBindingElement(node) && node.parent === props
      && (node.dotDotDotToken || (bindingKey && ts.isComputedPropertyName(bindingKey) && computedKey === undefined))) {
      add(node, "config-action", "LauncherConfig must name each prop it reads.",
        "Destructure individual props and pass only the data or permitted host members a helper needs.");
    }
    if (props && ts.isIdentifier(props) && ts.isIdentifier(node) && node !== props && node.text === props.text
      && !isTypeReference(node) && symbolFor(node)?.valueDeclaration === props.parent) {
      const use = node.parent;
      if (!(ts.isPropertyAccessExpression(use) || ts.isElementAccessExpression(use)) || use.expression !== node) {
        add(node, "config-action", "LauncherConfig cannot use the entire props object here.",
          "Read individual props and pass only the data or permitted host members a helper needs.");
      }
    }

    if (config && ((ts.isIdentifier(node) && (configActions.has(node.text)
      || (node.text === "host" && (!allowConfigRedirect || !isConfigHostUse(node, config, allowConfigTransactions)))))
      || (computedKey === "host" || configActions.has(computedKey)))) {
      const hostReference = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
      const memberAccess = ts.isPropertyAccessExpression(hostReference.parent) && hostReference.parent.expression === hostReference;
      if (allowConfigRedirect && ts.isIdentifier(node) && node.text === "host" && !memberAccess) {
        add(node, "config-action", "LauncherConfig cannot use the entire host object here.", useIndividualHostMembers);
      } else {
        add(node, "config-action", "LauncherConfig uses a host action unavailable to this profile.", useConfigCapabilities);
      }
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
      if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "react"
        && !node.importClause?.isTypeOnly && bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          if (!specifier.isTypeOnly && reactElementApis.has((specifier.propertyName ?? specifier.name).text)) {
            add(specifier, "react-element-api", "Launcher renders elements through JSX.", "Replace the React element API with JSX.");
          }
        }
      }
    }
    if (ts.isIdentifier(node) && reactNames.has(node.text) && reactSymbols.has(symbolFor(node))
      && !reactImports.includes(node) && !isTypeReference(node)) {
      const use = node.parent;
      if (!ts.isPropertyAccessExpression(use) || use.expression !== node || reactElementApis.has(use.name.text)) {
        add(node, "react-element-api", "Launcher requires direct React members and JSX for rendering elements.",
          "Import the React members you need by name and render elements using JSX.");
      }
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || ts.isImportEqualsDeclaration(node)) {
      add(node, "source-export", "Launcher requires direct named function exports and standard imports.",
        "Use export function Launcher, and export function LauncherConfig if the manifest declares it.");
    }
    if (ts.isNewExpression(node)) {
      add(node, "source-constructor", "Launcher does not allow new expressions.", getConstructorHint(node.expression));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node, "dynamic-import", "Launcher does not allow dynamic imports.", "Use a static import from react.");
    }
    if (ts.isIdentifier(node) && forbiddenNames.has(node.text)) {
      const fixHint = node.text === "setTimeout" || node.text === "setInterval"
        ? "Use a host capability or await existing asynchronous work. Use an awaited resolved promise only when a microtask is sufficient."
        : `Rename ${node.text} if it is a local variable or field. For a browser API, use the Launcher context or a capability supplied by the host.`;
      add(node, "forbidden-api", `Launcher reserves the identifier ${node.text}.`, fixHint);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "prototype") {
      add(node, "prototype-access", "Launcher does not allow direct prototype access.", "Remove the prototype access.");
    }
    if (computedKey === "prototype") {
      add(node, "prototype-access", "Launcher does not allow computed prototype access.", "Remove the prototype access.");
    } else if (forbiddenNames.has(computedKey)) {
      add(node, "computed-capability", `Launcher does not allow computed access to ${computedKey}.`, useHostCapability);
    } else if (ts.isElementAccessExpression(node)) {
      const receiver = ts.skipOuterExpressions(node.expression);
      if (computedKey === undefined && !computedKeys.isNumeric(node.argumentExpression)
        && (computedKeys.isUnresolvedAccess(receiver)
          || (ts.isIdentifier(receiver) && (computedNamespaces.has(receiver.text)
            || (props && ts.isIdentifier(props) && props.text === receiver.text))))) {
        add(node, "computed-capability", "Launcher cannot verify this computed capability key.", useExplicitAccess);
      }
    }
    if ((ts.isCallExpression(node) && computedKeys.isUnresolvedCallable(node.expression))
      || (ts.isTaggedTemplateExpression(node) && computedKeys.isUnresolvedCallable(node.tag))) {
      add(node, "computed-capability", "Launcher cannot verify the target of this computed call.", useExplicitAccess);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && resourceTags.has(node.tagName.getText(source))
      && !(allowTaxInfoLink && isTaxInfoLink(node, source, symbolFor))) {
      add(node.tagName, "resource-tag", `Launcher does not allow <${node.tagName.getText(source)}> in this profile.`,
        "Remove the tag. Use inline SVG paths for decorative icons or host.redirect for same-site navigation.");
    }
    if (ts.isJsxAttribute(node) && resourceAttributes.has(node.name.getText(source))) {
      if (!(allowTaxInfoLink && node.name.getText(source) === "href" && isTaxInfoLink(node.parent.parent, source, symbolFor))) {
        add(node.name, "resource-attribute", `Launcher does not allow the ${node.name.getText(source)} attribute here.`,
          "Remove the attribute and use a host capability where available.");
      }
    }
    if (protectContext && (((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)
      && node.name.text === "context") || (ts.isBindingElement(node) && ts.isIdentifier(node.name)
      && node.name.text === "context" && !isComponentContextBinding(node, source)))) {
      add(node, "context-shadow", "Launcher cannot shadow the host context.", "Keep context as the host-supplied component prop.",
        "launcher-runtime");
    }
    if (protectContext && ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      let target = node.left;
      while (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)
        || ts.isParenthesizedExpression(target) || ts.isAsExpression(target)
        || ts.isTypeAssertionExpression(target) || ts.isNonNullExpression(target)) {
        target = target.expression;
      }
      if (ts.isIdentifier(target) && target.text === "context") {
        add(node, "context-write", "Launcher cannot assign to the host context.", "Keep draft state separate from the host context.",
          "launcher-runtime");
      }
    }
    if (ts.isJsxSpreadAttribute(node)) {
      add(node, "jsx-spread", "Launcher does not allow JSX prop spreads.", "Write each permitted JSX prop explicitly.");
    }
    if ((ts.isStringLiteralLike(node) || node.kind === ts.SyntaxKind.TemplateHead
      || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail)
      && resourceUrl.test(node.text)) {
      add(node, "resource-url", "Launcher does not allow URL literals, data URIs or CSS url(...).",
        "Remove the resource URL. Use inline SVG paths for decorative icons, or host.redirect with a relative app route.");
    }
    ts.forEachChild(node, child => visit(child, config));
  }

  visit(source);
  return issues;
}

function isComponentContextBinding(node, source) {
  const pattern = node.parent;
  const parameter = pattern.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(parameter) || parameter.name !== pattern
    || parameter.initializer || node.initializer || node.dotDotDotToken || !ts.isIdentifier(node.name)
    || node.name.text !== "context") return false;
  const property = node.propertyName;
  if (property && ((!ts.isIdentifier(property) && !ts.isStringLiteral(property)) || property.text !== "context")) return false;
  const component = parameter.parent;
  return ts.isFunctionDeclaration(component) && component.parent === source && component.parameters[0] === parameter
    && ["Launcher", "LauncherConfig"].includes(component.name?.text)
    && ts.getModifiers(component)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}
