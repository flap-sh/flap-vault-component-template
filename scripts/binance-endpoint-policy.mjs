import {
  BINANCE_TOKEN_MARKET_OPERATIONS,
  hasBinanceTokenMarketDeclaration,
} from "../src/sdk/binanceTokenPolicy.mjs";

const operations = Object.values(BINANCE_TOKEN_MARKET_OPERATIONS);
const operationsByUrl = new Map(operations.map((operation) => [operation.url, operation]));
const { hostname } = new URL(operations[0].url);
const paths = operations.map(({ url }) => new URL(url).pathname);
const requiredOptions = { method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" };
const safeOptions = { ...requiredOptions, cache: "no-store" };

function isExpressionWrapper(node, ts) {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node);
}

function unwrap(node, ts) {
  while (node && isExpressionWrapper(node, ts)) node = node.expression;
  return node;
}

function isLiteralString(node, ts) {
  return Boolean(node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)));
}

function isEndpointPath(path) {
  return paths.some((pathname) => path === pathname || path.startsWith(`${pathname}/`));
}

// Select this policy before validating the complete URL, so a noncanonical
// variant or child path cannot fall through to the generic declaration rule.
export function isBinanceFetchTarget(url, literalTarget) {
  if (url?.hostname.replace(/\.+$/, "") !== hostname) return false;
  if (isEndpointPath(url.pathname) || operations.some(({ url: endpoint }) => literalTarget?.startsWith(`${endpoint}/`))) return true;
  try {
    return isEndpointPath(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}

function getQueryOperation(url) {
  if (typeof url !== "string") return undefined;
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? undefined : operationsByUrl.get(url.slice(0, queryStart));
}

function isAllowedQueryKey(operation, key) {
  return operation.requiredQueryKeys.includes(key) || operation.optionalQueryKeys.includes(key);
}

export function dynamicBinanceQueryPrefix(target, ts, endpoints) {
  target = unwrap(target, ts);
  if (!target || !ts.isTemplateExpression(target)) return null;
  const operation = getQueryOperation(target.head.text);
  return operation && hasBinanceTokenMarketDeclaration(endpoints, operation.url) ? target.head.text : null;
}

export function getBinanceTokenMarketQueryEndpoint(shape) {
  const operation = getQueryOperation(shape);
  if (!operation || /[\u0000-\u0020\u007f]/.test(shape)) return null;
  const parameters = shape.slice(operation.url.length + 1).split("&");
  if (parameters.length > operation.requiredQueryKeys.length + operation.optionalQueryKeys.length) return null;
  const keys = new Set();
  for (const parameter of parameters) {
    const match = /^([A-Za-z]+)=(?:[A-Za-z0-9_.!~*'()+-]|%[a-fA-F\d]{2})*$/.exec(parameter);
    if (!match || !isAllowedQueryKey(operation, match[1]) || keys.has(match[1])) return null;
    keys.add(match[1]);
  }
  return operation.requiredQueryKeys.every((key) => keys.has(key)) ? operation.url : null;
}

function hasSafeOptions(init, ts) {
  init = unwrap(init, ts);
  if (!init || !ts.isObjectLiteralExpression(init)) return false;
  const keys = new Set();
  for (const property of init.properties) {
    if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) return false;
    const key = property.name.text;
    const value = unwrap(property.initializer, ts);
    if (keys.has(key) || !Object.hasOwn(safeOptions, key) || !isLiteralString(value, ts) || value.text !== safeOptions[key]) return false;
    keys.add(key);
  }
  return Object.keys(requiredOptions).every((key) => keys.has(key));
}

export function binanceFetchSafetyIssue(target, init, staticTarget, ts, isGlobalEncoder, endpoints) {
  const operation = getQueryOperation(staticTarget);
  if (!operation) {
    return "Binance fetch requires an exact allowlisted HTTPS endpoint with literal query keys.";
  }
  if (!hasBinanceTokenMarketDeclaration(endpoints, operation.url)) {
    return `Declare the exact Binance endpoint ${operation.url} in manifest.endpoints without query parameters.`;
  }

  target = unwrap(target, ts);
  let shape = staticTarget;
  if (target && ts.isTemplateExpression(target)) {
    shape = target.head.text;
    for (const span of target.templateSpans) {
      const expression = unwrap(span.expression, ts);
      const callee = ts.isCallExpression(expression) ? unwrap(expression.expression, ts) : null;
      const key = /[?&]([A-Za-z]+)=[^?&#]*$/.exec(shape)?.[1];
      if (!key || !isAllowedQueryKey(operation, key) || !callee || !ts.isIdentifier(callee) ||
          callee.text !== "encodeURIComponent" || expression.arguments.length !== 1 ||
          ts.isSpreadElement(expression.arguments[0]) || !isGlobalEncoder(callee)) {
        return "Binance fetch interpolation must be an allowlisted query value encoded with the global encodeURIComponent(value).";
      }
      shape += `encoded${span.literal.text}`;
    }
  }
  if (!getBinanceTokenMarketQueryEndpoint(shape)) {
    return `Binance fetch requires the query keys ${operation.requiredQueryKeys.join(", ")} with encoded values. Optional keys: ${operation.optionalQueryKeys.join(", ") || "none"}. A key may appear only once.`;
  }
  if (!hasSafeOptions(init, ts)) {
    return "Binance fetch requires literal GET, credentials omit, redirect error and referrerPolicy no-referrer options. Only cache no-store is optional.";
  }
  return null;
}

function getReferencedPropertyName(node, ts, resolvePropertyKey) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  let key;
  if (ts.isElementAccessExpression(node)) {
    key = node.argumentExpression;
  } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const property = node.propertyName ?? node.name;
    if (!ts.isComputedPropertyName(property)) {
      return (ts.isIdentifier(property) || isLiteralString(property, ts)) ? property.text : null;
    }
    key = property.expression;
  }
  const name = unwrap(key, ts);
  if (!name) return null;
  return isLiteralString(name, ts) ? name.text : resolvePropertyKey?.(name) ?? null;
}

function getDirectCall(node, ts) {
  let callee = node;
  while (callee.parent && isExpressionWrapper(callee.parent, ts) && callee.parent.expression === callee) {
    callee = callee.parent;
  }
  const call = callee.parent;
  return call && ts.isCallExpression(call) && call.expression === callee ? call : null;
}

export function collectBinanceReadIssues(sourceFile, ts, endpoints, file, {
  runtimeAvailable = () => true,
  resolvePropertyKey,
} = {}) {
  const issues = [];
  const visit = (node) => {
    const method = getReferencedPropertyName(node, ts, resolvePropertyKey);
    if (Object.hasOwn(BINANCE_TOKEN_MARKET_OPERATIONS, method)) {
      const { url, requiredQueryKeys, optionalQueryKeys, runtimeFeature } = BINANCE_TOKEN_MARKET_OPERATIONS[method];
      const { origin, pathname } = new URL(url);
      const declared = hasBinanceTokenMarketDeclaration(endpoints, url);
      const source = `sdk.${method}`;
      const call = getDirectCall(node, ts);
      const query = call?.arguments[0];
      const location = { file, line: sourceFile.getLineAndCharacterOfPosition((call ?? node).getStart(sourceFile)).line + 1 };
      if (!query) {
        issues.push({
          severity: "blocking",
          ruleId: "endpoint-policy/binance-direct-call-required",
          message: `Call ${source}(query) directly so endpoint review can record the query and its location.`,
          fixHint: `Use ${source}(query) at each call site.`,
          ...location,
        });
      }
      if (!declared) {
        issues.push({
          severity: "blocking",
          ruleId: "endpoint-policy/binance-declaration-required",
          message: `${source} requires ${url} in manifest.endpoints without query parameters.`,
          ...location,
        });
      }
      if (!runtimeAvailable(runtimeFeature)) {
        issues.push({
          severity: "blocking",
          ruleId: "endpoint-policy/binance-runtime-unavailable",
          message: `${source} requires sdkFeatures.${runtimeFeature}=1. Upgrade the installed Flap SDK runtime before building this artifact.`,
          ...location,
        });
      }
      if (declared && query) {
        issues.push({
          severity: "warning",
          ruleId: "manual-review/external-endpoint",
          message: `${source} uses Binance token market data. Review the ${[...requiredQueryKeys, ...optionalQueryKeys].join(", ")} parameters before publish.`,
          source,
          url,
          origin,
          pathname,
          dynamicQuery: true,
          paramsExpression: query.getText(sourceFile),
          ...location,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues;
}
