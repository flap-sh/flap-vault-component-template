import test from "node:test";
import assert from "node:assert/strict";
import { usesMiniAppRouting, collectMiniAppRoutingIssues } from "./mini-app-routing-policy.mjs";
const manifest = { schemaVersion: 2, appModel: "standalone", mode: "mini-app" };
test("routing policy detects live named, alias, and namespace imports", () => {
  for (const source of ['import {useMiniAppRouter} from "@/src/sdk"; useMiniAppRouter();', 'import {useMiniAppRouter as route} from "@/src/sdk"; route();', 'import * as sdk from "@/src/sdk"; sdk.useMiniAppRouter();', 'import * as sdk from "@/src/sdk"; sdk["useMiniAppRouter"]();']) {
    assert(usesMiniAppRouting(source));
    assert.deepEqual(collectMiniAppRoutingIssues(source, "Component.tsx", manifest), []);
    assert.equal(collectMiniAppRoutingIssues(source, "Component.tsx", manifest, { runtimeAvailable: false })[0].ruleId, "runtime-policy/mini-app-routing-unavailable");
    assert.equal(collectMiniAppRoutingIssues(source, "Component.tsx", {}, { runtimeAvailable: true })[0].ruleId, "mini-app-routing/standalone-only");
  }
});
test("type-only, unused and legacy SDK imports do not add routing requirements", () => {
  for (const source of ['import type {MiniAppRouter} from "@/src/sdk";', 'import type {useMiniAppRouter} from "@/src/sdk";', 'import {useMiniAppRouter} from "@/src/sdk"; export const n=1;', 'import {useMiniAppSdk} from "@/src/sdk"; useMiniAppSdk();']) assert.equal(usesMiniAppRouting(source), false);
});
