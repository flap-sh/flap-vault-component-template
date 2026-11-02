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

test("default SDK aliases, static keys and SDK bridge reexports retain the routing gate", () => {
  for (const source of [
    'import sdk from "@/src/sdk"; sdk.useMiniAppRouter();',
    'import {default as sdk} from "@/src/sdk"; sdk.useMiniAppRouter();',
    'import sdk from "@/src/sdk"; const alias = sdk; alias.useMiniAppRouter();',
    'import sdk from "@/src/sdk"; let alias; alias = sdk; alias.useMiniAppRouter();',
    'import sdk from "@/src/sdk"; const {...alias} = sdk; alias.useMiniAppRouter();',
    'import sdk from "@/src/sdk"; const {["useMiniAppRouter"]: route} = sdk; route();',
    'import sdk from "@/src/sdk"; let route; ({[`useMiniAppRouter`]: route} = sdk); route();',
    'import sdk from "@/src/sdk"; sdk[`useMiniAppRouter`]();',
    'export {useMiniAppRouter as route} from "@/src/sdk";',
    'export * from "@/src/sdk";',
    'export * as sdk from "@/src/sdk";',
    'export {default as sdk} from "@/src/sdk";',
    'import sdk from "@/src/sdk"; export default sdk;',
    'import sdk from "@/src/sdk"; const alias=sdk; export {alias};',
  ]) {
    assert.equal(usesMiniAppRouting(source, "VaultABI.ts"), true, source);
    assert.equal(collectMiniAppRoutingIssues(source, "VaultABI.ts", manifest, { runtimeAvailable: false })[0].ruleId, "runtime-policy/mini-app-routing-unavailable");
  }
  for (const source of [
    'import sdk from "@/src/sdk"; sdk.useMiniAppSdk();',
    'import sdk from "@/src/sdk"; sdk[`useMiniAppSdk`]();',
    'export type {MiniAppRouter} from "@/src/sdk";',
    'import sdk from "@/src/sdk"; export const n=1;',
    'export {useMiniAppSdk} from "@/src/sdk";',
  ]) assert.equal(usesMiniAppRouting(source), false, source);
});
