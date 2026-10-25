import test from "node:test";
import assert from "node:assert/strict";
import { parseMiniAppPath, createMiniAppMemoryRouter } from "./miniAppRouting.ts";

test("App-relative snapshots decode once, retain repeated queries, and stay immutable", () => {
  const route = parseMiniAppPath("/bnb/hello%20world/?tab=a&tab=b&next=https%3A%2F%2Fexample.com");
  assert.deepEqual(route, { pathname: "/bnb/hello%20world", segments: ["bnb", "hello world"], search: "?tab=a&tab=b&next=https%3A%2F%2Fexample.com" });
  assert(Object.isFrozen(route)); assert(Object.isFrozen(route.segments));
  assert.deepEqual(parseMiniAppPath("/?"), { pathname: "/", segments: [], search: "" });
  assert.equal(parseMiniAppPath("/你好").pathname, "/%E4%BD%A0%E5%A5%BD");
});

test("unsafe or ambiguous navigation fails before state changes", () => {
  for (const path of ["https://evil.test", "//evil.test", "relative", "/a//b", "/a/../b", "/%2e%2e/b", "/%2Foutside", "/%5coutside", "/%252foutside", "/%252e%252e/b", "/a\\b", "/%00", "/%1f", "/%7f", "/bad%", "/a#fragment", "/a\nb", "/a b"]) assert.throws(() => parseMiniAppPath(path), /invalid-path/, path);
  const router = createMiniAppMemoryRouter(); const before = router.getSnapshot();
  assert.throws(() => router.push("/../other")); assert.equal(router.getSnapshot(), before);
});

test("memory push/replace/back are isolated and direct-entry back falls to App root", () => {
  const router = createMiniAppMemoryRouter("/direct?id=1"); const other = createMiniAppMemoryRouter(); let updates = 0;
  const unsubscribe = router.subscribe(() => { updates++; });
  const first = router.getSnapshot(); assert.equal(router.getSnapshot(), first);
  router.push("/orders/1"); router.replace("/orders/2?status=ok");
  assert.equal(router.getSnapshot().pathname, "/orders/2"); router.back(); assert.equal(router.getSnapshot(), first);
  router.back(); assert.equal(router.getSnapshot().pathname, "/"); router.back();
  assert.equal(updates, 4); assert.equal(other.getSnapshot().pathname, "/");
  unsubscribe(); router.push("/ignored"); assert.equal(updates, 4);
});
