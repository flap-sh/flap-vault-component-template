import assert from "node:assert/strict";
import test from "node:test";
import { routingRuntimeEnvironment } from "./runtime-routing-command.mjs";

test("dedicated routing entry fixes runtime-only channel and rejects package/source skip arguments", () => {
  const env = routingRuntimeEnvironment({ FLAP_TEMPLATE_CHANNEL: "next", FLAP_TEMPLATE_WORKFLOW: "app" });
  assert.equal(env.FLAP_TEMPLATE_CHANNEL, "routing");
  assert.equal(env.FLAP_TEMPLATE_WORKFLOW, "runtime");
  assert.equal(env.FLAP_TEMPLATE_FRESHNESS_REF, "origin/feat/mini-app-routing");
  assert.equal(routingRuntimeEnvironment({ FLAP_TEMPLATE_FRESHNESS_REF: "upstream/feat/mini-app-routing" }).FLAP_TEMPLATE_FRESHNESS_REF, "upstream/feat/mini-app-routing");
  for (const args of [["my-app"], ["--canary"], ["--no-git"], ["--no-npm"], ["--sync"]]) assert.throws(() => routingRuntimeEnvironment({}, args), /no arguments/);
  for (const env of [{ FLAP_TEMPLATE_FRESHNESS_REF: "origin/main" }, { FLAP_TEMPLATE_FRESHNESS_REF: "origin/next" }, { FLAP_TEMPLATE_NPM_PACKAGE: "other" }]) assert.throws(() => routingRuntimeEnvironment(env), /official feat\/mini-app-routing/);
});
