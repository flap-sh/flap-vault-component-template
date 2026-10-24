import ts from "typescript";

export const DEVICE_CAPABILITIES = Object.freeze(["location", "motion", "orientation"]);
const CAPABILITIES = new Set(DEVICE_CAPABILITIES);
const HOOK_CAPABILITIES = new Map([["useGeolocation", "location"], ["useDeviceMotion", "motion"], ["useDeviceOrientation", "orientation"]]);
const SDK_HOOKS = new Set(["useFlapSdk", "useMiniAppSdk"]);
const BROWSER_GLOBALS = new Set(["window", "globalThis", "self", "navigator", "document"]);
const NATIVE_SENSORS = new Set(["DeviceMotionEvent", "DeviceOrientationEvent", "Gyroscope", "Accelerometer", "LinearAccelerationSensor", "GravitySensor", "AbsoluteOrientationSensor", "RelativeOrientationSensor", "Magnetometer"]);

/** Additive manifest contract: omitted/empty declarations preserve old packages. */
export function checkDeviceCapabilityManifest(manifest) {
  const capabilities = manifest?.deviceCapabilities;
  if (capabilities === undefined) return [];
  if (!Array.isArray(capabilities) || capabilities.length > DEVICE_CAPABILITIES.length || capabilities.some((value) => !CAPABILITIES.has(value)) || new Set(capabilities).size !== capabilities.length) {
    return [{ severity: "blocking", ruleId: "device-policy/invalid-capabilities", field: "deviceCapabilities", message: "deviceCapabilities must contain only unique location, motion or orientation entries. Omit it when no device features are needed." }];
  }
  return capabilities.length ? [{ severity: "warning", ruleId: "manual-review/device-capabilities", field: "deviceCapabilities", deviceCapabilities: [...capabilities], message: `Review device access (${capabilities.join(", ")}), the user-triggered permission request, purpose and usable fallback. Declaration does not grant browser permission or prove hardware compatibility.` }] : [];
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}
function member(node) {
  if (ts.isPropertyAccessExpression(node)) return { target: node.expression, key: node.name.text };
  if (ts.isElementAccessExpression(node)) {
    const key = unwrap(node.argumentExpression);
    return { target: node.expression, key: key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) ? key.text : undefined };
  }
  return undefined;
}

/** Same source policy is used by template checks and Workbench intake. */
export function collectDeviceCapabilityIssues(content, file, manifest, { runtimeAvailable = true } = {}) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Map();
  const imported = new Map();
  const namespaces = new Set();
  const issues = [];
  const seen = new Set();
  const declared = new Set(Array.isArray(manifest?.deviceCapabilities) ? manifest.deviceCapabilities : []);
  let usesDevice = declared.size > 0;
  const add = (node, ruleId, message, extra = {}) => {
    const key = `${ruleId}:${node?.pos ?? -1}:${extra.capability ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ severity: "blocking", ruleId, message, file, ...(node ? { line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 } : {}), ...extra });
  };
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "@/src/sdk" || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) if (!item.isTypeOnly) imported.set(item.name.text, item.propertyName?.text ?? item.name.text);
  }
  const hookName = (node) => {
    const target = unwrap(node);
    if (!target) return undefined;
    if (ts.isIdentifier(target)) return imported.get(target.text);
    const access = member(target);
    return access && ts.isIdentifier(unwrap(access.target)) && namespaces.has(unwrap(access.target).text) ? access.key : undefined;
  };
  const pathOf = (node) => {
    const target = unwrap(node);
    if (!target) return undefined;
    if (ts.isIdentifier(target)) return aliases.get(target.text);
    if (ts.isCallExpression(target) && SDK_HOOKS.has(hookName(target.expression))) return ["sdk"];
    const access = member(target);
    const parent = access && pathOf(access.target);
    return parent ? [...parent, access.key ?? "*"] : undefined;
  };
  function bind(pattern, path) {
    if (!path) return;
    if (ts.isIdentifier(pattern)) aliases.set(pattern.text, path);
    if (ts.isObjectBindingPattern(pattern)) for (const binding of pattern.elements) {
      const name = binding.propertyName ?? binding.name;
      const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : "*";
      bind(binding.name, [...path, key]);
    }
  }
  // Resolve retained/destructured SDK/channel references, including forward aliases.
  for (let pass = 0; pass < 5; pass += 1) {
    function collect(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, pathOf(node.initializer));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) bind(node.left, pathOf(node.right));
      ts.forEachChild(node, collect);
    }
    collect(source);
  }
  const requireCapability = (node, capability) => {
    usesDevice = true;
    if (!declared.has(capability)) add(node, "device-policy/undeclared-capability", `Declare deviceCapabilities: [\"${capability}\"] before using this SDK device feature.`, { capability });
  };
  function visit(node) {
    if (ts.isImportSpecifier(node) && !node.isTypeOnly && imported.has(node.name.text)) {
      const capability = HOOK_CAPABILITIES.get(imported.get(node.name.text));
      if (capability) requireCapability(node, capability);
    }
    if (ts.isCallExpression(node)) {
      const capability = HOOK_CAPABILITIES.get(hookName(node.expression));
      if (capability) requireCapability(node, capability);
    }
    const access = member(node);
    const importedHook = access && HOOK_CAPABILITIES.get(hookName(node));
    if (importedHook) requireCapability(node, importedHook);
    const sdkPath = access ? pathOf(node) : undefined;
    if (sdkPath?.[0] === "sdk" && sdkPath[1] === "device") {
      usesDevice = true;
      if (CAPABILITIES.has(sdkPath[2])) requireCapability(node, sdkPath[2]);
      if (sdkPath[2] === "*") add(node, "device-policy/dynamic-capability", "Select a static SDK device channel (location, motion or orientation) so its declaration can be checked.");
    }
    // Destructuring a retained service/channel is still a device capability use.
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      for (const element of node.name.elements) {
        const path = ts.isIdentifier(element.name) ? aliases.get(element.name.text) : undefined;
        if (path?.[0] === "sdk" && path[1] === "device") {
          usesDevice = true;
          if (CAPABILITIES.has(path[2])) requireCapability(element, path[2]);
        }
      }
    }
    // Native sensor objects/events remain host-only, even when declared.
    if (ts.isIdentifier(node) && NATIVE_SENSORS.has(node.text)) {
      const isPropertyName = ts.isPropertyAssignment(node.parent) && node.parent.name === node || ts.isPropertySignature(node.parent) && node.parent.name === node;
      if (!isPropertyName) add(node, "forbidden-api/browser-permission", "Direct browser sensor APIs are host-owned. Use the declared shared SDK device channel or hook.");
    }
    if (access && BROWSER_GLOBALS.has(unwrap(access.target)?.getText(source)) && ["ondevicemotion", "ondeviceorientation", "ondeviceorientationabsolute"].includes(access.key)) add(node, "forbidden-api/browser-permission", "Direct browser motion listeners are host-owned. Subscribe through the shared SDK device channel.");
    if (access && ["navigator", "window.navigator", "globalThis.navigator", "self.navigator"].includes(unwrap(access.target)?.getText(source)) && ["geolocation", "permissions"].includes(access.key)) add(node, "forbidden-api/browser-permission", "Direct browser location and permission APIs are host-owned. Use the shared Runtime device channel.");
    if (ts.isCallExpression(node)) {
      const target = unwrap(node.expression);
      const callMember = member(target);
      const event = unwrap(node.arguments[0]);
      if ((ts.isIdentifier(target) && ["addEventListener", "removeEventListener"].includes(target.text) || callMember && ["addEventListener", "removeEventListener"].includes(callMember.key) && BROWSER_GLOBALS.has(unwrap(callMember.target)?.getText(source))) && event && (ts.isStringLiteral(event) || ts.isNoSubstitutionTemplateLiteral(event)) && ["devicemotion", "deviceorientation", "deviceorientationabsolute"].includes(event.text)) add(node, "forbidden-api/browser-permission", "Direct browser motion listeners are host-owned. Subscribe through the shared SDK device channel.");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (usesDevice && !runtimeAvailable) add(undefined, "runtime-policy/device-sensors-unavailable", "This component requires sdkFeatures.deviceSensors=1. Upgrade the shared Runtime and receiving hosts before accepting it.");
  return issues;
}
