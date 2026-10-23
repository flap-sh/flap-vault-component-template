import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { runLaunchConfigChecks } from "./launch-config-e2e.mjs";

const VIEWPORTS = [
  { name: "PC", width: 1440, height: 1000 },
  { name: "iPad", width: 820, height: 1180 },
  { name: "H5", width: 375, height: 812 },
];
const address = "0x1111111111111111111111111111111111111111";
const field = (name, fieldType, decimals = 0) => ({ name, fieldType, decimals, description: name });

// This harness exercises the production runner with actual browser controls and
// asynchronous form callbacks. It neither reads chain state nor creates QA proof.
async function renderForm(page, fields, options = {}) {
  await page.setContent('<main data-vault-e2e-scope="vault-preview"><div data-flap-launch-config="true"></div><button data-launch-config-confirm="true" disabled>Confirm</button></main>');
  await page.evaluate(({ fields, options }) => {
    const scope = document.querySelector("[data-vault-e2e-scope]");
    if (!options.missingSchema) scope.setAttribute("data-launch-config-schema", JSON.stringify({ description: "Browser regression fixture", isArray: options.schemaArray ?? false, fields }));
    const root = scope.querySelector("[data-flap-launch-config]");
    const confirm = scope.querySelector("button");
    const controls = new Map();
    globalThis.observed = [];
    globalThis.confirmed = 0;
    confirm.addEventListener("click", () => { globalThis.confirmed += 1; });
    const ordered = options.reverse ? [...fields].reverse() : fields;
    for (const field of ordered) {
      const kind = options.controls?.[field.name] ?? (field.fieldType === "bool" ? "checkbox" : field.fieldType.includes("[") ? "textarea" : "text");
      const input = document.createElement(kind === "textarea" ? "textarea" : kind === "select" ? "select" : "input");
      if (input.tagName === "INPUT") input.type = kind;
      input.required = options.required?.includes(field.name) ?? false;
      if (kind === "number" && options.humanUnits?.includes(field.name)) input.step = "any";
      if (kind === "select") {
        for (const value of options.selectOptions?.[field.name] ?? ["", "false", "true"]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value || "Choose";
          input.append(option);
        }
      }
      if (!options.unmarked) {
        const marker = options.marker ?? "name";
        input.setAttribute(marker, field.name);
      }
      if (options.humanUnits?.includes(field.name)) input.setAttribute("data-launch-config-unit", "human");
      if (options.initial?.[field.name] !== undefined) {
        if (kind === "checkbox") input.checked = options.initial[field.name];
        else input.value = String(options.initial[field.name]);
      }
      const label = document.createElement("label");
      label.textContent = field.name;
      label.append(input);
      root.append(label);
      controls.set(field.name, input);
      if (options.duplicateField === field.name) root.append(input.cloneNode(true));
    }

    const parseValue = (value, fieldType, required = false) => {
      const array = /^(.*)\[(\d*)\]$/.exec(fieldType);
      if (array) {
        const values = typeof value === "string" ? JSON.parse(value) : value;
        if (!Array.isArray(values) || (array[2] && values.length !== Number(array[2]))) throw new Error("array");
        return values.map((item) => parseValue(item, array[1]));
      }
      if (fieldType === "address") {
        if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) throw new Error("address");
        return value;
      }
      const integer = /^(u?int)(\d*)$/.exec(fieldType);
      if (integer) {
        if (typeof value !== "string" || !/^-?\d+$/.test(value)) throw new Error("integer");
        const parsed = BigInt(value);
        const bits = BigInt(integer[2] || 256);
        const signed = integer[1] === "int";
        if (parsed < (signed ? -(1n << (bits - 1n)) : 0n) || parsed >= (1n << (bits - (signed ? 1n : 0n)))) throw new Error("range");
        return parsed.toString();
      }
      if (fieldType === "bool") {
        if (value !== true && value !== false && value !== "true" && value !== "false") throw new Error("bool");
        return value === true || value === "true";
      }
      if (fieldType === "string") {
        if (typeof value !== "string" || (required && !value.length)) throw new Error("string");
        return value;
      }
      const bytes = /^bytes(\d*)$/.exec(fieldType);
      if (bytes) {
        if (typeof value !== "string" || !/^0x(?:[a-fA-F0-9]{2})*$/.test(value) || (bytes[1] && value.length !== 2 + Number(bytes[1]) * 2)) throw new Error("bytes");
        return value;
      }
      throw new Error("unsupported");
    };
    function humanToBase(value, decimals) {
      if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("human amount");
      const negative = value.startsWith("-");
      const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
      if (fraction.length > decimals) throw new Error("precision");
      const amount = BigInt(whole + fraction.padEnd(decimals, "0"));
      return (negative ? -amount : amount).toString();
    }
    let timer;
    function update() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        let values = {};
        try {
          for (const field of fields) {
            const input = controls.get(field.name);
            let raw = input.type === "checkbox" ? input.checked : input.value;
            if (input.tagName === "SELECT" && raw === "" && Object.hasOwn(options.selectDefaults ?? {}, field.name)) raw = options.selectDefaults[field.name];
            const human = options.humanUnits?.includes(field.name);
            let value = parseValue(human ? humanToBase(raw, field.decimals) : raw, field.fieldType, input.required);
            const minimum = options.minimum?.[field.name];
            if (minimum !== undefined && BigInt(value) < BigInt(human ? humanToBase(String(minimum), field.decimals) : minimum)) throw new Error("minimum");
            if (options.requireTrue?.includes(field.name) && value !== true) throw new Error("required agreement");
            if (options.minLength?.[field.name] !== undefined && value.length < options.minLength[field.name]) throw new Error("minimum length");
            values[field.name] = value;
          }
        } catch {
          globalThis.observed.push({ valid: false });
          if (!options.keepValuesOnInvalid) scope.querySelector("[data-launch-config-values]")?.remove();
          if (!options.keepEnabledOnInvalid) confirm.disabled = true;
          return;
        }
        globalThis.observed.push({ valid: true, values });
        if (options.corrupt === "missing-field") delete values[fields[0].name];
        if (options.corrupt === "extra-field") values.unexpected = "extra";
        if (options.corrupt === "wrong-value") values[fields[0].name] = "0x2222222222222222222222222222222222222222";
        if (options.corrupt === "invalid-address") values[fields[0].name] = "1000";
        if (options.corrupt === "integer-overflow") values[fields[0].name] = "256";
        if (options.corrupt === "unsafe-number") values[fields[0].name] = Number.MAX_SAFE_INTEGER + 1;
        let output = scope.querySelector("[data-launch-config-values]");
        if (!output) {
          output = document.createElement("pre");
          output.setAttribute("data-launch-config-values", "");
          scope.insertBefore(output, confirm);
        }
        output.textContent = options.corrupt === "invalid-json" ? "not JSON" : JSON.stringify(values);
        confirm.disabled = false;
      }, options.delayMs ?? 0);
    }
    for (const input of controls.values()) {
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    }
    update();
  }, { fields, options });
  return page.locator("[data-vault-e2e-scope]");
}

async function check(page, fields, options = {}, fixture) {
  const previewScope = await renderForm(page, fields, options);
  const issues = await runLaunchConfigChecks({ page, previewScope, fixture, timeoutMs: options.timeoutMs ?? 1500 });
  assert.equal(await page.evaluate(() => globalThis.confirmed), 0, "E2E must never click the launch confirmation");
  return issues;
}

function assertRule(issues, ruleId) {
  assert(issues.some((issue) => issue.ruleId === ruleId), `Expected ${ruleId}, received ${JSON.stringify(issues)}`);
}

test("launch-config runner exercises real browser controls without weakening validation", { timeout: 120_000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      await t.test(`address-only legacy form passes on ${viewport.name}`, async () => {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        try {
          const issues = await check(page, [field("projectOwner", "address")], { unmarked: true, delayMs: 40 });
          assert.deepEqual(issues, []);
          const history = await page.evaluate(() => globalThis.observed);
          const firstValid = history.findIndex((entry) => entry.valid && entry.values.projectOwner === address);
          assert(firstValid >= 0);
          assert(history.slice(firstValid + 1).some((entry) => !entry.valid), "invalid input must be exercised after the valid address");
          assert.equal(history.at(-1).valid, true, "the runner must restore valid form state");
        } finally { await page.close(); }
      });
    }

    const page = await browser.newPage();
    try {
      await t.test("18-decimal human amount retains the shipped example semantics", async () => {
        assert.deepEqual(await check(page, [field("minBurnAmount", "uint256", 18)], { humanUnits: ["minBurnAmount"], minimum: { minBurnAmount: "100" } }), []);
        assert((await page.evaluate(() => globalThis.observed)).some((entry) => entry.values?.minBurnAmount === "1000000000000000000000"));
      });
      await t.test("fractional human amounts in number controls remain valid base-unit integers", async () => {
        assert.deepEqual(await check(page, [field("amount", "uint256", 18)], { controls: { amount: "number" }, humanUnits: ["amount"] }, {
          inputs: { amount: "0.5" }, values: { amount: "500000000000000000" },
        }), []);
        assert((await page.evaluate(() => globalThis.observed)).some((entry) => entry.values?.amount === "500000000000000000"));
      });
      await t.test("decimals metadata alone does not scale base-unit controls", async () => {
        assert.deepEqual(await check(page, [field("amount", "uint256", 18)]), []);
        assert((await page.evaluate(() => globalThis.observed)).some((entry) => entry.values?.amount === "1000"));
      });
      await t.test("zero-decimal and narrow signed fields use in-range samples", async () => {
        assert.deepEqual(await check(page, [field("count", "uint32"), field("offset", "int8")]), []);
      });
      await t.test("multiple fields are located by name even when DOM order differs", async () => {
        assert.deepEqual(await check(page, [field("projectOwner", "address"), field("amount", "uint256")], { reverse: true }), []);
      });
      for (const marker of ["data-launch-config-field", "id"]) {
        await t.test(`${marker} is a stable field locator`, async () => {
          assert.deepEqual(await check(page, [field("projectOwner", "address"), field("amount", "uint256")], { marker }), []);
        });
      }
      await t.test("checkbox booleans test false as a valid value", async () => {
        assert.deepEqual(await check(page, [field("enabled", "bool")]), []);
        const history = await page.evaluate(() => globalThis.observed);
        const firstTrue = history.findIndex((entry) => entry.values?.enabled === true);
        assert(firstTrue >= 0);
        assert(history.slice(firstTrue + 1).some((entry) => entry.values?.enabled === false));
      });
      await t.test("select booleans include false without treating it as invalid", async () => {
        assert.deepEqual(await check(page, [field("enabled", "bool")], { controls: { enabled: "select" } }), []);
        assert((await page.evaluate(() => globalThis.observed)).some((entry) => entry.values?.enabled === false));
      });
      await t.test("optional string selects may use an ABI-valid empty option", async () => {
        assert.deepEqual(await check(page, [field("label", "string")], {
          controls: { label: "select" }, selectOptions: { label: ["", "launch-config-test"] },
        }), []);
      });
      await t.test("optional numeric selects may map an empty option to a valid default", async () => {
        assert.deepEqual(await check(page, [field("count", "uint256")], {
          controls: { count: "select" }, selectOptions: { count: ["", "1000"] }, selectDefaults: { count: "0" },
        }), []);
      });
      await t.test("strings, bytes and address arrays use their actual controls", async () => {
        assert.deepEqual(await check(page, [field("label", "string"), field("salt", "bytes4"), field("owners", "address[]")]), []);
      });
      await t.test("empty strings remain valid when the control does not require a value", async () => {
        assert.deepEqual(await check(page, [field("label", "string")]), []);
        const history = await page.evaluate(() => globalThis.observed);
        const firstText = history.findIndex((entry) => entry.values?.label === "launch-config-test");
        assert(firstText >= 0);
        assert(history.slice(firstText + 1).some((entry) => entry.values?.label === ""));
      });
      await t.test("required strings exercise the empty error state", async () => {
        assert.deepEqual(await check(page, [field("label", "string")], { required: ["label"] }), []);
      });
      await t.test("empty dynamic bytes are tested as a valid value", async () => {
        assert.deepEqual(await check(page, [field("payload", "bytes")]), []);
        assert((await page.evaluate(() => globalThis.observed)).some((entry) => entry.values?.payload === "0x"));
      });
      await t.test("required checkbox agreements test false as an invalid business state", async () => {
        assert.deepEqual(await check(page, [field("accepted", "bool")], { required: ["accepted"], requireTrue: ["accepted"] }), []);
      });
      await t.test("business fixtures can declare false invalid without changing ABI boolean semantics", async () => {
        assert.deepEqual(await check(page, [field("accepted", "bool")], { requireTrue: ["accepted"] }, {
          inputs: { accepted: true }, values: { accepted: true }, invalidInputs: { accepted: false },
        }), []);
      });
      await t.test("business fixtures can declare an otherwise ABI-valid empty string invalid", async () => {
        assert.deepEqual(await check(page, [field("label", "string")], { minLength: { label: 1 } }, {
          inputs: { label: "project" }, values: { label: "project" }, invalidInputs: { label: "" },
        }), []);
      });
      await t.test("reviewed fixtures handle business constraints with exact expected values", async () => {
        assert.deepEqual(await check(page, [field("minimum", "uint256", 18)], { humanUnits: ["minimum"], minimum: { minimum: "2000" } }, {
          inputs: { minimum: "2500" }, values: { minimum: "2500000000000000000000" },
        }), []);
      });
      for (const corrupt of ["missing-field", "extra-field", "wrong-value", "invalid-address", "invalid-json"]) {
        await t.test(`structured-output gate rejects ${corrupt}`, async () => {
          const issues = await check(page, [field("projectOwner", "address")], { corrupt, timeoutMs: 150 });
          assertRule(issues, "launch-config/structured-output");
        });
      }
      for (const corrupt of ["integer-overflow", "unsafe-number"]) {
        await t.test(`ABI value gate rejects ${corrupt}`, async () => {
          const issues = await check(page, [field("count", "uint8")], { corrupt, timeoutMs: 150 });
          assertRule(issues, "launch-config/structured-output");
        });
      }
      for (const behavior of ["keepEnabledOnInvalid", "keepValuesOnInvalid"]) {
        await t.test(`invalid-state gate rejects ${behavior}`, async () => {
          const issues = await check(page, [field("projectOwner", "address")], { [behavior]: true, timeoutMs: 150 });
          assertRule(issues, "launch-config/invalid-state");
        });
      }
      await t.test("missing schema is blocking", async () => {
        assertRule(await check(page, [field("projectOwner", "address")], { missingSchema: true, timeoutMs: 150 }), "launch-config/schema-unavailable");
      });
      await t.test("unsupported schema is blocking", async () => {
        assertRule(await check(page, [field("record", "tuple")], { timeoutMs: 150 }), "launch-config/unsupported-type");
      });
      await t.test("top-level row arrays require supported explicit test configuration", async () => {
        assertRule(await check(page, [field("projectOwner", "address")], { schemaArray: true, timeoutMs: 150 }), "launch-config/unsupported-schema");
      });
      await t.test("ambiguous field locators cannot silently select the first input", async () => {
        assertRule(await check(page, [field("projectOwner", "address")], { duplicateField: "projectOwner", timeoutMs: 150 }), "launch-config/field-control-missing");
      });
      await t.test("zero is an accepted numeric fixture instead of a universal invalid sample", async () => {
        assert.deepEqual(await check(page, [field("count", "uint256")], {}, { inputs: { count: "0" }, values: { count: "0" } }), []);
      });
      await t.test("false is accepted in an explicit fixture", async () => {
        assert.deepEqual(await check(page, [field("enabled", "bool")], {}, { inputs: { enabled: false }, values: { enabled: false } }), []);
      });
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
