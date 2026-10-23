import { test } from "node:test";
import assert from "node:assert/strict";
import { isMiniAppSlug, isStandaloneMiniApp } from "./miniApp.ts";
const app = { schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug: "flap-streets", artifactId: "app-id", match: { bindings: [] } };
test("standalone requires an explicit valid v2 discriminator and no bindings", () => {
 assert.equal(isStandaloneMiniApp(app), true);
 for (const patch of [{ schemaVersion: 3 }, { schemaVersion: undefined }, { mode: undefined }, { appModel: undefined }, { slug: "API" }, { match: { bindings: [{ chainId: 56 }] } }]) assert.equal(isStandaloneMiniApp({ ...app, ...patch }), false);
 assert.equal(isStandaloneMiniApp({ mode: "mini-app", match: { bindings: [{ chainId: 56 }] } }), false);
});
test("slugs reject routing collisions, traversal and ambiguous identifiers", () => {
 for (const slug of ["api","apps","../evil","hello_world","-abc","ABC","a", "a".repeat(65)]) assert.equal(isMiniAppSlug(slug), false);
 assert.equal(isMiniAppSlug("flap-streets"), true);
});
