const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";
const CONTROLS = "input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select";

class LaunchConfigCaseError extends Error {
  constructor(ruleId, message) {
    super(message);
    this.ruleId = `launch-config/${ruleId}`;
  }
}

function caseError(ruleId, message) {
  throw new LaunchConfigCaseError(ruleId, message);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldsFor(schema) {
  if (!record(schema) || !Array.isArray(schema.fields) || schema.fields.length > 100 || typeof schema.isArray !== "boolean") {
    caseError("schema-invalid", "The host did not expose a valid launch schema.");
  }
  if (schema.isArray) {
    caseError("unsupported-schema", "Array-of-row launch forms need an explicit row-control adapter; no launch test was skipped.");
  }
  const names = new Set();
  for (const field of schema.fields) {
    if (!record(field) || typeof field.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(field.name)
      || ["__proto__", "constructor", "prototype"].includes(field.name) || names.has(field.name)
      || typeof field.fieldType !== "string" || !Number.isInteger(field.decimals) || field.decimals < 0 || field.decimals > 255) {
      caseError("schema-invalid", "The host launch schema contains malformed or duplicate fields.");
    }
    names.add(field.name);
    fieldType(field.fieldType);
  }
  return schema.fields;
}

function fieldType(source, depth = 0) {
  if (typeof source !== "string" || source.length > 100 || depth > 4) caseError("unsupported-type", "Unsupported launch field type.");
  const type = source.trim();
  const array = /^(.*)\[(\d*)\]$/.exec(type);
  if (array) {
    if (array[2] && !/^[1-9]\d*$/.test(array[2])) caseError("unsupported-type", `Invalid launch array type ${type}.`);
    const length = array[2] ? Number(array[2]) : null;
    if (length !== null && (!Number.isInteger(length) || length < 1 || length > 32)) {
      caseError("unsupported-type", `Launch array type ${type} exceeds the bounded test adapter; provide a supported form adapter.`);
    }
    return { kind: "array", item: fieldType(array[1], depth + 1), length };
  }
  const integer = /^(u?int)(\d*)$/.exec(type);
  if (integer) {
    if (integer[2] && !/^[1-9]\d*$/.test(integer[2])) caseError("unsupported-type", `Invalid launch integer type ${type}.`);
    const bits = integer[2] ? Number(integer[2]) : 256;
    if (bits < 8 || bits > 256 || bits % 8 !== 0) caseError("unsupported-type", `Invalid launch integer type ${type}.`);
    return { kind: "integer", signed: integer[1] === "int", bits };
  }
  const fixedBytes = /^bytes(\d+)$/.exec(type);
  if (fixedBytes) {
    if (!/^[1-9]\d*$/.test(fixedBytes[1])) caseError("unsupported-type", `Invalid launch byte type ${type}.`);
    const length = Number(fixedBytes[1]);
    if (length < 1 || length > 32) caseError("unsupported-type", `Invalid launch byte type ${type}.`);
    return { kind: "bytes", length };
  }
  if (["address", "bool", "string", "bytes"].includes(type)) return { kind: type, ...(type === "bytes" ? { length: null } : {}) };
  caseError("unsupported-type", `Launch field type ${type} needs an explicit test adapter; the form was not accepted without testing.`);
}

function sample(type, budget = { remaining: 256 }) {
  if (--budget.remaining < 0) caseError("unsupported-type", "The launch array sample exceeds the bounded test adapter.");
  if (type.kind === "array") return Array.from({ length: type.length ?? 2 }, () => sample(type.item, budget));
  if (type.kind === "integer") return type.signed ? "-1" : type.bits < 16 ? "1" : "1000";
  if (type.kind === "address") return TEST_ADDRESS;
  if (type.kind === "bool") return true;
  if (type.kind === "string") return "launch-config-test";
  return `0x${"12".repeat(type.length ?? 2)}`;
}

function normalize(type, value, location, budget) {
  if (--budget.remaining < 0) throw new Error("Launch values exceed the bounded test adapter's element budget.");
  if (type.kind === "array") {
    if (!Array.isArray(value) || value.length > 100 || (type.length !== null && value.length !== type.length)) throw new Error(`${location} is not a valid ABI array.`);
    return value.map((entry, index) => normalize(type.item, entry, `${location}[${index}]`, budget));
  }
  if (type.kind === "integer") {
    if (!((typeof value === "string" && /^-?\d+$/.test(value) && value.length <= 80)
      || (typeof value === "number" && Number.isSafeInteger(value)))) throw new Error(`${location} must be an integer in base units.`);
    const number = BigInt(value);
    const min = type.signed ? -(1n << BigInt(type.bits - 1)) : 0n;
    const max = (1n << BigInt(type.bits - (type.signed ? 1 : 0))) - 1n;
    if (number < min || number > max) throw new Error(`${location} is outside its ABI integer range.`);
    return number.toString();
  }
  if (type.kind === "address") {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${location} must be an address.`);
    return value.toLowerCase();
  }
  if (type.kind === "bool") {
    if (typeof value !== "boolean") throw new Error(`${location} must be a boolean.`);
    return value;
  }
  if (typeof value !== "string") throw new Error(`${location} must be a string.`);
  if (value.length > 262144) throw new Error(`${location} exceeds the launch test value size limit.`);
  if (type.kind === "bytes") {
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value) || (type.length !== null && value.length !== 2 + type.length * 2)) throw new Error(`${location} must contain the expected ABI bytes.`);
    return value.toLowerCase();
  }
  return value;
}

function normalizeValues(schema, values) {
  const fields = fieldsFor(schema);
  if (!record(values) || Object.keys(values).length !== fields.length || fields.some((field) => !Object.hasOwn(values, field.name))) {
    throw new Error("Launch values must contain exactly the schema field names.");
  }
  const budget = { remaining: 1000 };
  return Object.fromEntries(fields.map((field) => [field.name, normalize(fieldType(field.fieldType), values[field.name], field.name, budget)]));
}

/** Validate ABI-compatible structured values and compare every field, independently of UI summary text. */
export function validateLaunchConfigValues(schema, actual, expected) {
  try {
    const normalized = normalizeValues(schema, actual);
    if (expected !== undefined && JSON.stringify(normalized) !== JSON.stringify(normalizeValues(schema, expected))) {
      return { valid: false, error: "The host-visible launch values do not match the tested inputs." };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function expectedValue(field, input, metadata) {
  const type = fieldType(field.fieldType);
  let value = input;
  if (type.kind === "array" && typeof input === "string") {
    try { value = JSON.parse(input); } catch { caseError("test-case-invalid", `The sample for ${field.name} must be a JSON array.`); }
  }
  if (type.kind === "bool" && typeof input === "string" && ["true", "false"].includes(input)) value = input === "true";
  if (metadata?.unit === "human") {
    if (type.kind !== "integer" || !/^-?\d+(?:\.\d+)?$/.test(String(input))) caseError("test-case-invalid", `Human-unit conversion requires a numeric input for ${field.name}.`);
    const negative = String(input).startsWith("-");
    const [whole, fraction = ""] = String(input).replace(/^-/, "").split(".");
    if (fraction.length > field.decimals) caseError("test-case-invalid", `The sample for ${field.name} has more decimal places than its declared scale.`);
    value = `${negative ? "-" : ""}${BigInt(`${whole}${fraction.padEnd(field.decimals, "0")}`).toString()}`;
  }
  try { return normalize(type, value, field.name, { remaining: 1000 }); } catch (error) {
    caseError("test-case-invalid", error.message);
  }
}

/** Fixtures describe UI inputs and independently expected base-unit values, never a bypass or a passing report. */
export function createLaunchConfigCase(schema, fixture, metadata = {}) {
  const fields = fieldsFor(schema);
  if (fixture !== undefined) {
    if (!record(fixture) || Object.keys(fixture).some((key) => !["inputs", "values", "invalidInputs"].includes(key))
      || !record(fixture.inputs) || !record(fixture.values)) caseError("test-case-invalid", "A launch fixture must contain inputs and values objects, with optional invalidInputs.");
    if (Object.keys(fixture.inputs).length !== fields.length || fields.some((field) => !Object.hasOwn(fixture.inputs, field.name))) caseError("test-case-invalid", "Fixture inputs must contain exactly the schema field names.");
    if (fixture.invalidInputs !== undefined && (!record(fixture.invalidInputs) || Object.keys(fixture.invalidInputs).some((name) => !fields.some((field) => field.name === name)))) caseError("test-case-invalid", "Fixture invalidInputs must refer to schema fields.");
  }
  const budget = { remaining: 1000 };
  const inputs = Object.fromEntries(fields.map((field) => [field.name, fixture ? fixture.inputs[field.name] : sample(fieldType(field.fieldType), budget)]));
  const values = fixture ? fixture.values : Object.fromEntries(fields.map((field) => [field.name, expectedValue(field, inputs[field.name], metadata[field.name])]));
  const validation = validateLaunchConfigValues(schema, values);
  if (!validation.valid) caseError("test-case-invalid", `Invalid launch fixture: ${validation.error}`);
  return { inputs, values, invalidInputs: fixture?.invalidInputs ?? {} };
}

async function findControl(root, field, fieldCount) {
  const named = root.locator(`[data-launch-config-field="${field.name}"], [name="${field.name}"], [id="${field.name}"]`);
  let control = named;
  if (await named.count() === 0 && fieldCount === 1) control = root.locator(CONTROLS);
  if (await control.count() !== 1) caseError("field-control-missing", `Cannot uniquely locate ${field.name}. Add name="${field.name}" or data-launch-config-field="${field.name}" to its editable control.`);
  if (!(await control.isVisible()) || !(await control.isEnabled()) || !(await control.evaluate((node) => node.matches("input,textarea,select") && !node.readOnly))) {
    caseError("field-control-missing", `${field.name} is not an editable launch control.`);
  }
  return control;
}

function textInput(value) {
  return typeof value === "string" ? value : Array.isArray(value) ? JSON.stringify(value) : String(value);
}

async function fill(control, metadata, value) {
  if (metadata.type === "checkbox") {
    if (typeof value !== "boolean") caseError("test-case-invalid", "Checkbox samples must be booleans.");
    await control.setChecked(value);
  } else if (metadata.tag === "select") {
    await control.selectOption(textInput(value));
  } else {
    await control.fill(textInput(value));
  }
}

function generatedInvalidInputs(field, metadata) {
  const type = fieldType(field.fieldType);
  if (metadata.type === "checkbox") return metadata.required ? [false] : [];
  if (metadata.tag === "select") return metadata.required && metadata.options.includes("") ? [""] : [];
  if (type.kind === "address") return ["1000", ""];
  if (type.kind === "integer") {
    // A fractional human amount can encode to integral base units; number inputs cannot express arbitrary text.
    if (metadata.type === "number" && metadata.unit === "human") return [""];
    return [metadata.type === "number" ? "0.5" : "not-an-integer", ""];
  }
  if (type.kind === "array") return ["not-json"];
  if (type.kind === "bool") return ["not-a-boolean"];
  if (type.kind === "bytes") return type.length !== null || metadata.required ? ["not-bytes", ""] : ["not-bytes"];
  return metadata.required ? [""] : [];
}

/** Business samples add coverage; they never replace malformed/clear checks. */
export function invalidLaunchConfigInputs(field, metadata, fixtureValue) {
  const samples = generatedInvalidInputs(field, metadata);
  if (fixtureValue !== undefined && !samples.some((value) => value === fixtureValue)) samples.push(fixtureValue);
  return samples;
}

/** Exercise a real form through its controls. Confirmation is observed only and is never clicked. */
export async function runLaunchConfigChecks({ page, previewScope, fixture, timeoutMs = 5000 }) {
  const { expect } = await import("@playwright/test");
  const issues = [];
  try {
    await expect.poll(() => previewScope.getAttribute("data-launch-config-schema"), { timeout: timeoutMs }).not.toBeNull();
    let schema;
    try { schema = JSON.parse(await previewScope.getAttribute("data-launch-config-schema")); } catch { caseError("schema-invalid", "The preview did not expose readable launch schema JSON."); }
    const fields = fieldsFor(schema);
    const root = previewScope.locator("[data-flap-launch-config='true']");
    await expect(root).toHaveCount(1, { timeout: timeoutMs });
    const confirm = previewScope.locator("[data-launch-config-confirm='true']");
    const snapshot = () => previewScope.evaluate((scope) => {
      const confirm = scope.querySelector("[data-launch-config-confirm='true']");
      const output = scope.querySelectorAll("[data-launch-config-values]");
      const text = output.length === 1 ? output[0].textContent ?? "" : "";
      const bounded = text.length <= 262144 && new TextEncoder().encode(text).byteLength <= 262144;
      return { disabled: confirm ? confirm.disabled : null, count: output.length, text: bounded ? text : null };
    });
    const matchesValues = (state, expected) => {
      if (state.disabled !== false || state.count !== 1 || state.text === null) return false;
      try { return validateLaunchConfigValues(schema, JSON.parse(state.text), expected).valid; } catch { return false; }
    };
    const controls = {};
    const metadata = {};
    for (const field of fields) {
      controls[field.name] = await findControl(root, field, fields.length);
      metadata[field.name] = await controls[field.name].evaluate((node) => ({
        tag: node.tagName.toLowerCase(), type: node.type, unit: node.getAttribute("data-launch-config-unit"),
        required: node.required, options: node.tagName === "SELECT" ? Array.from(node.options, (option) => option.value) : [],
      }));
    }
    const testCase = createLaunchConfigCase(schema, fixture, metadata);
    const fillValid = async () => {
      for (const field of fields) await fill(controls[field.name], metadata[field.name], testCase.inputs[field.name]);
    };
    const checkValid = async (expected) => {
      await expect.poll(async () => matchesValues(await snapshot(), expected), { timeout: timeoutMs }).toBe(true);
    };
    await fillValid();
    try { await expect(confirm).toBeEnabled({ timeout: timeoutMs }); } catch {
      caseError("test-case-invalid", "The schema-generated sample was not accepted. Supply --launch-config-fixture with business-valid inputs and expected base-unit values; the E2E gate remains blocking.");
    }
    try { await checkValid(testCase.values); } catch {
      caseError("structured-output", "The host-visible JSON does not match all expected schema fields and ABI values.");
    }
    for (const field of fields) {
      const control = controls[field.name];
      const meta = metadata[field.name];
      const invalidSamples = invalidLaunchConfigInputs(field, meta, testCase.invalidInputs[field.name]);
      for (const invalid of invalidSamples) {
        await fill(control, meta, invalid);
        try {
          await expect.poll(async () => {
            const state = await snapshot();
            return state.disabled === true && state.count === 0;
          }, { timeout: timeoutMs }).toBe(true);
        } catch {
          caseError("invalid-state", `${field.name} did not revoke host confirmation and old structured values after invalid input.`);
        }
        await fill(control, meta, testCase.inputs[field.name]);
        try { await checkValid(testCase.values); } catch { caseError("valid-state", `${field.name} did not restore the expected valid result after correcting its input.`); }
      }
      // false, empty strings, and empty dynamic bytes are ABI-valid values, not universal errors.
      const type = fieldType(field.fieldType);
      let alternate;
      if (type.kind === "bool") alternate = !(testCase.values[field.name]);
      else if (type.kind === "string" && !meta.required) alternate = "";
      else if (type.kind === "bytes" && type.length === null && !meta.required) alternate = "0x";
      if (alternate !== undefined && !invalidSamples.some((value) => value === alternate)
        && (meta.tag !== "select" || meta.options.includes(String(alternate)))) {
        await fill(control, meta, alternate);
        try {
          // ABI legality does not establish business policy: a coherent invalid result is also allowed.
          await expect.poll(async () => {
            const state = await snapshot();
            return (state.disabled === true && state.count === 0)
              || matchesValues(state, { ...testCase.values, [field.name]: alternate });
          }, { timeout: timeoutMs }).toBe(true);
        } catch {
          caseError("structured-output", `${field.name} left stale or incorrect structured values after changing its input.`);
        }
        await fill(control, meta, testCase.inputs[field.name]);
        try { await checkValid(testCase.values); } catch { caseError("valid-state", `${field.name} did not restore its valid value.`); }
      }
    }
  } catch (error) {
    const schema = await previewScope.getAttribute("data-launch-config-schema").catch(() => null);
    issues.push({ ruleId: error.ruleId ?? (schema ? "launch-config/check-error" : "launch-config/schema-unavailable"), message: error.ruleId ? error.message : `Launch Config test could not complete: ${error.message.slice(0, 500)}` });
  }
  return issues;
}
