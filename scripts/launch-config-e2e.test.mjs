import assert from "node:assert/strict";
import test from "node:test";
import { createLaunchConfigCase, invalidLaunchConfigInputs, validateLaunchConfigValues } from "./launch-config-e2e.mjs";

const field = (name, fieldType, decimals = 0) => ({ name, fieldType, description: "test", decimals });
const schema = (...fields) => ({ description: "test", isArray: false, fields });
const address = "0x1111111111111111111111111111111111111111";

test("address-only forms receive an address instead of the threshold example's number", () => {
  const result = createLaunchConfigCase(schema(field("projectOwner", "address")));
  assert.deepEqual(result.inputs, { projectOwner: address });
  assert.deepEqual(result.values, { projectOwner: address });
});

test("sample generation covers ABI integer widths, booleans, strings, and bytes", () => {
  const result = createLaunchConfigCase(schema(
    field("small", "uint8"), field("large", "uint256"), field("signed", "int8"),
    field("enabled", "bool"), field("memo", "string"), field("data", "bytes"), field("tag", "bytes2"),
  ));
  assert.deepEqual(result.values, { small: "1", large: "1000", signed: "-1", enabled: true, memo: "launch-config-test", data: "0x1212", tag: "0x1212" });
});

test("decimals are metadata until the control explicitly declares human units", () => {
  const launchSchema = schema(field("amount", "uint256", 18));
  assert.equal(createLaunchConfigCase(launchSchema).values.amount, "1000");
  assert.equal(createLaunchConfigCase(launchSchema, undefined, { amount: { unit: "human" } }).values.amount, "1000000000000000000000");
  const baseUnitSchema = schema(field("amount", "uint256", 0));
  assert.equal(createLaunchConfigCase(baseUnitSchema, undefined, { amount: { unit: "human" } }).values.amount, "1000");
});

test("business fixtures preserve independently declared UI inputs and base-unit outputs", () => {
  const launchSchema = schema(field("amount", "uint256", 18));
  const fixture = { inputs: { amount: "2500" }, values: { amount: "2500000000000000000000" }, invalidInputs: { amount: "2499" } };
  assert.deepEqual(createLaunchConfigCase(launchSchema, fixture), fixture);
});

test("ABI-valid zero, false, empty strings, and empty dynamic bytes remain valid", () => {
  const launchSchema = schema(field("count", "uint8"), field("enabled", "bool"), field("memo", "string"), field("data", "bytes"));
  const values = { count: "0", enabled: false, memo: "", data: "0x" };
  const fixture = { inputs: values, values };
  assert.equal(validateLaunchConfigValues(launchSchema, values, values).valid, true);
  assert.deepEqual(createLaunchConfigCase(launchSchema, fixture).values, values);
});

test("typed dynamic and fixed arrays use bounded JSON-editable samples", () => {
  const launchSchema = schema(field("owners", "address[]"), field("weights", "uint8[2]"), field("flags", "bool[]"));
  assert.deepEqual(createLaunchConfigCase(launchSchema).values, { owners: [address, address], weights: ["1", "1"], flags: [true, true] });
  assert.equal(validateLaunchConfigValues(launchSchema, { owners: [address], weights: ["1"], flags: [] }).valid, false);
});

test("output comparison uses schema fields and values, not text or object order", () => {
  const launchSchema = schema(field("owner", "address"), field("count", "uint256"));
  assert.equal(validateLaunchConfigValues(launchSchema, { count: 1000, owner: address.toUpperCase().replace("0X", "0x") }, { owner: address, count: "1000" }).valid, true);
  assert.equal(validateLaunchConfigValues(launchSchema, { owner: address, count: "1001" }, { owner: address, count: "1000" }).valid, false);
  assert.equal(validateLaunchConfigValues(launchSchema, { owner: address, count: "1000", summary: "1000" }).valid, false);
  assert.equal(validateLaunchConfigValues(launchSchema, { owner: address }).valid, false);
});

test("shape-valid values are rejected when their ABI types are invalid", () => {
  for (const [type, values] of [
    ["address", ["1000", "0x1234", 1000]],
    ["uint8", ["-1", "256", "1.5", Number.MAX_SAFE_INTEGER + 1]],
    ["int8", ["-129", "128"]],
    ["bool", ["false", 0]],
    ["bytes", ["hello", "0x123"]],
    ["bytes2", ["0x12", "0x123456"]],
  ]) {
    const launchSchema = schema(field("value", type));
    for (const value of values) assert.equal(validateLaunchConfigValues(launchSchema, { value }).valid, false, `${type}: ${String(value)}`);
  }
});

test("ABI integer bounds use exact bigint arithmetic", () => {
  for (const [type, min, max] of [
    ["uint256", 0n, (1n << 256n) - 1n],
    ["int256", -(1n << 255n), (1n << 255n) - 1n],
  ]) {
    const launchSchema = schema(field("value", type));
    for (const value of [min, max]) assert.equal(validateLaunchConfigValues(launchSchema, { value: value.toString() }).valid, true);
    for (const value of [min - 1n, max + 1n]) assert.equal(validateLaunchConfigValues(launchSchema, { value: value.toString() }).valid, false);
  }
});

test("unsupported types and ambiguous schemas fail explicitly", () => {
  for (const type of ["tuple", "uint7", "uint08", "bytes33", "bytes01", "address[0]", "uint256[33]", "uint256[32][32]"]) {
    assert.throws(() => createLaunchConfigCase(schema(field("value", type))), /launch|Launch|Invalid|Unsupported|bounded/);
  }
  assert.throws(() => createLaunchConfigCase({ ...schema(field("owner", "address")), isArray: true }), /Array-of-row/);
  assert.throws(() => createLaunchConfigCase(schema(field("same", "bool"), field("same", "bool"))), /duplicate/);
  assert.throws(() => createLaunchConfigCase(schema(field("__proto__", "bool"))), /malformed/);
});

test("fixtures cannot omit, add, or change ABI field types", () => {
  const launchSchema = schema(field("owner", "address"));
  for (const fixture of [
    {}, { inputs: {}, values: { owner: address } },
    { inputs: { owner: address }, values: { owner: "1000" } },
    { inputs: { owner: address, extra: true }, values: { owner: address } },
    { inputs: { owner: address }, values: { owner: address }, skip: true },
    { inputs: { owner: address }, values: { owner: address }, invalidInputs: { unknown: "" } },
  ]) assert.throws(() => createLaunchConfigCase(launchSchema, fixture));
});

test("empty field schemas still require an exact empty structured result", () => {
  const launchSchema = schema();
  assert.deepEqual(createLaunchConfigCase(launchSchema).values, {});
  assert.equal(validateLaunchConfigValues(launchSchema, {}).valid, true);
  assert.equal(validateLaunchConfigValues(launchSchema, { extra: 1 }).valid, false);
});

test("fractional human amounts are not mistaken for invalid ABI integer input", () => {
  const amount = field("amount", "uint256", 18);
  assert.deepEqual(invalidLaunchConfigInputs(amount, { tag: "input", type: "number", unit: "human" }), [""]);
  assert.deepEqual(invalidLaunchConfigInputs(amount, { tag: "input", type: "number" }), ["0.5", ""]);
  assert.deepEqual(invalidLaunchConfigInputs(amount, { tag: "input", type: "text", unit: "human" }), ["not-an-integer", ""]);
});

test("an empty select option implies invalidity only when required or explicitly declared", () => {
  const label = field("label", "string");
  const optional = { tag: "select", options: ["", "launch-config-test"], required: false };
  assert.deepEqual(invalidLaunchConfigInputs(label, optional), []);
  assert.deepEqual(invalidLaunchConfigInputs(label, { ...optional, required: true }), [""]);
  assert.deepEqual(invalidLaunchConfigInputs(label, optional, ""), [""]);
  assert.deepEqual(invalidLaunchConfigInputs(field("enabled", "bool"), optional), []);
});

test("business invalid samples retain the generated malformed and empty checks", () => {
  const owner = field("owner", "address");
  const input = { tag: "input", type: "text" };
  assert.deepEqual(invalidLaunchConfigInputs(owner, input, "blocked-owner"), ["1000", "", "blocked-owner"]);
  assert.deepEqual(invalidLaunchConfigInputs(owner, input, "1000"), ["1000", ""]);
});
