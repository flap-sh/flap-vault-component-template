import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserDeviceSensors, createMockDeviceSensors, scopeDeviceSensors, DEVICE_SENSORS_VERSION } from "./deviceSensors.ts";

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event = {}) { for (const listener of [...(listeners.get(type) ?? [])]) listener(event); },
    count(type) { return listeners.get(type)?.size ?? 0; },
    first(type) { return [...(listeners.get(type) ?? [])][0]; },
  };
}
function fixture() {
  const window = { ...eventTarget(), DeviceMotionEvent: {}, DeviceOrientationEvent: {} };
  const document = { ...eventTarget(), visibilityState: "visible", permissionsPolicy: { allowsFeature: () => true } };
  const timers = new Map();
  let id = 0;
  const reads = [], watches = [], cleared = [];
  const environment = {
    secure: true, window, document, now: () => 1000,
    setTimeout(callback, ms) { const next = ++id; timers.set(next, { callback, ms }); return next; },
    clearTimeout(id) { timers.delete(id); },
    geolocation: {
      getCurrentPosition(success, failure, options) { reads.push({ success, failure, options }); },
      watchPosition(success, failure, options) { const id = watches.length + 1; watches.push({ id, success, failure, options }); return id; },
      clearWatch(id) { cleared.push(id); },
    },
  };
  const service = createBrowserDeviceSensors({ environment });
  return { service, environment, window, document, reads, watches, cleared, timers,
    expire() { const all = [...timers.values()]; timers.clear(); for (const timer of all) timer.callback(); },
    visibility(value) { document.visibilityState = value; document.emit("visibilitychange"); },
  };
}
const position = { coords: { latitude: 31.2, longitude: 121.5, accuracy: 250, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: 900 };
const motion = { acceleration: { x: 0, y: 1, z: 0 } };
const orientation = { alpha: 0, beta: 5, gamma: -10, absolute: false };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("construction and subscriptions never prompt or read hardware", () => {
  const f = fixture();
  let prompts = 0; f.window.DeviceMotionEvent.requestPermission = () => { prompts++; return Promise.resolve("granted"); };
  const unsubscribe = f.service.motion.subscribe(() => {});
  assert.equal(f.service.version, DEVICE_SENSORS_VERSION);
  assert.equal(f.service.motion.getSnapshot().permission, "unknown");
  assert.equal(prompts, 0); assert.equal(f.reads.length, 0); assert.equal(f.window.count("devicemotion"), 0);
  unsubscribe(); f.service.dispose();
});

test("declaration scoping blocks access even to a permissive injected host service", async () => {
  const f = fixture();
  const device = scopeDeviceSensors(f.service, ["motion"]);
  assert.equal((await device.location.request()).status, "not-declared");
  assert.equal((await device.orientation.request()).status, "not-declared");
  assert.equal(f.reads.length, 0);
  assert.equal((await scopeDeviceSensors(f.service).motion.request()).status, "not-declared");
});

test("motion permission is requested synchronously from the original user action", async () => {
  const f = fixture(), permission = deferred(); let prompts = 0;
  f.window.DeviceMotionEvent.requestPermission = () => { prompts++; return permission.promise; };
  const task = f.service.motion.request();
  assert.equal(prompts, 1); assert.equal(f.window.count("devicemotion"), 0);
  assert.equal(f.service.motion.getSnapshot().permission, "unknown");
  permission.resolve("granted"); await Promise.resolve();
  assert.equal(f.service.motion.getSnapshot().permission, "granted");
  assert.equal(f.service.motion.getSnapshot().status, "requesting");
  assert.equal(f.service.motion.getSnapshot().data, null);
  f.window.emit("devicemotion", motion);
  assert.equal((await task).status, "active"); f.service.dispose();
});

test("a permission grant does not count as hardware availability", async () => {
  const f = fixture(); f.window.DeviceMotionEvent.requestPermission = () => Promise.resolve("granted");
  const task = f.service.motion.request({ timeoutMs: 20 }); await Promise.resolve();
  f.window.emit("devicemotion", { acceleration: null, rotationRate: { alpha: NaN } });
  f.expire();
  const state = await task;
  assert.equal(state.status, "unavailable"); assert.equal(state.permission, "granted"); assert.equal(state.data, null);
  assert.equal(f.window.count("devicemotion"), 0); assert.equal(f.document.count("visibilitychange"), 0);
});

test("motion supports finite partial readings and zero values", async () => {
  const f = fixture(), task = f.service.motion.request();
  f.window.emit("devicemotion", { acceleration: { x: 0, y: NaN, z: Infinity }, rotationRate: { alpha: 2 } });
  const state = await task;
  assert.deepEqual(state.data.acceleration, { x: 0, y: null, z: null });
  assert.deepEqual(state.data.rotationRate, { alpha: 2, beta: null, gamma: null });
  assert.equal(state.permission, "granted"); f.service.dispose();
});

test("orientation uses its own permission API and accepts a zero heading", async () => {
  const f = fixture(); let prompts = 0;
  f.window.DeviceOrientationEvent.requestPermission = () => { prompts++; return Promise.resolve("granted"); };
  const task = f.service.orientation.request(); assert.equal(prompts, 1); await Promise.resolve();
  f.window.emit("deviceorientation", orientation);
  assert.deepEqual((await task).data, { ...orientation, timestamp: 1000 }); f.service.dispose();
});

test("permission denial is normalized without starting listeners", async () => {
  const f = fixture(); f.window.DeviceMotionEvent.requestPermission = () => Promise.resolve("denied");
  const state = await f.service.motion.request();
  assert.equal(state.status, "denied"); assert.equal(state.permission, "denied");
  assert.equal(f.window.count("devicemotion"), 0);
  assert.equal(f.document.count("visibilitychange"), 0);
});

test("rejected or thrown activation errors settle as denial", async () => {
  for (const throws of [false, true]) {
    const f = fixture(); f.window.DeviceOrientationEvent.requestPermission = () => {
      const error = Object.assign(new Error(), { name: "NotAllowedError" });
      if (throws) throw error; return Promise.reject(error);
    };
    assert.equal((await f.service.orientation.request()).status, "denied");
    assert.equal(f.service.orientation.getSnapshot().permission, "unknown");
    assert.equal(f.document.count("visibilitychange"), 0);
  }
});

test("insecure, policy-blocked, missing browser and missing hardware fail without prompting", async () => {
  const insecure = fixture(); insecure.environment.secure = false;
  assert.equal((await insecure.service.location.request()).status, "insecure");
  const blocked = fixture(); blocked.document.permissionsPolicy.allowsFeature = () => false;
  assert.equal((await blocked.service.motion.request()).status, "policy-blocked");
  assert.equal((await createBrowserDeviceSensors({ environment: () => undefined }).location.request()).status, "unsupported");
  const missing = fixture(); delete missing.window.DeviceMotionEvent;
  assert.equal((await missing.service.motion.request()).status, "unsupported");
  assert.equal(insecure.reads.length, 0); assert.equal(blocked.window.count("devicemotion"), 0);
});

test("no events settles as timeout and releases browser resources", async () => {
  const f = fixture(), task = f.service.orientation.request({ timeoutMs: 30 });
  assert.equal([...f.timers.values()][0].ms, 30); f.expire();
  assert.equal((await task).status, "timeout"); assert.equal(f.window.count("deviceorientation"), 0);
});

test("environment and policy getters normalize errors instead of throwing to callers", async () => {
  const throws = createBrowserDeviceSensors({ environment: () => { throw new Error("unavailable"); } });
  assert.equal((await throws.location.request()).status, "unavailable");
  const f = fixture(); f.document.permissionsPolicy.allowsFeature = () => { throw Object.assign(new Error(), { name: "SecurityError" }); };
  assert.equal((await f.service.motion.request()).status, "policy-blocked");
  assert.equal(f.window.count("devicemotion"), 0);
});

test("geolocation starts its own request and retains accuracy and optional nulls", async () => {
  const f = fixture(); const task = f.service.location.request({ enableHighAccuracy: true, maximumAge: 300, timeoutMs: 500 });
  assert.equal(f.reads.length, 1); assert.deepEqual(f.reads[0].options, { enableHighAccuracy: true, maximumAge: 300, timeout: 500 });
  f.reads[0].success(position);
  assert.deepEqual((await task).data, { ...position.coords, timestamp: 900 });
  assert.equal(f.timers.size, 0); assert.equal(f.document.count("visibilitychange"), 0);
});

test("invalid coordinates never become successful data", async () => {
  const f = fixture(); const task = f.service.location.request();
  f.reads[0].success({ coords: { latitude: 300, longitude: 0, accuracy: 5 } }); f.expire();
  assert.equal((await task).status, "unavailable");
});

test("geolocation errors distinguish denied, timeout and unavailable", async () => {
  for (const [code, status] of [[1, "denied"], [2, "unavailable"], [3, "timeout"]]) {
    const f = fixture(), task = f.service.location.request(); f.reads[0].failure({ code });
    assert.equal((await task).status, status);
    assert.equal(f.service.location.getSnapshot().permission, code === 1 ? "denied" : "unknown");
  }
});

test("multiple observers share one session and only the final unsubscribe stops it", async () => {
  const f = fixture(); const unsubscribeA = f.service.motion.subscribe(() => {}), unsubscribeB = f.service.motion.subscribe(() => {});
  const a = f.service.motion.request(), b = f.service.motion.request(); assert.equal(a, b);
  assert.equal(f.window.count("devicemotion"), 1); f.window.emit("devicemotion", motion); await a;
  unsubscribeA(); assert.equal(f.window.count("devicemotion"), 1);
  unsubscribeB(); assert.equal(f.window.count("devicemotion"), 0);
});

test("an aborted request ignores a later permission grant and can be restarted", async () => {
  const f = fixture(), permission = deferred(), controller = new AbortController();
  f.window.DeviceMotionEvent.requestPermission = () => permission.promise;
  const task = f.service.motion.request({ signal: controller.signal }); controller.abort();
  assert.equal((await task).status, "cancelled"); permission.resolve("granted"); await Promise.resolve();
  assert.equal(f.window.count("devicemotion"), 0);
  f.window.DeviceMotionEvent = {}; const restart = f.service.motion.request(); f.window.emit("devicemotion", motion);
  assert.equal((await restart).status, "active"); f.service.dispose();
});

test("backgrounding pauses a watch, ignores old callbacks and resumes without a new prompt", async () => {
  const f = fixture(), task = f.service.location.request({ watch: true }); f.watches[0].success(position); await task;
  f.visibility("hidden"); assert.equal(f.service.location.getSnapshot().status, "paused"); assert.deepEqual(f.cleared, [1]);
  f.watches[0].success({ ...position, coords: { ...position.coords, latitude: 40 } });
  assert.equal(f.service.location.getSnapshot().data, null);
  f.visibility("visible"); assert.equal(f.watches.length, 2);
  f.watches[1].success(position); assert.equal(f.service.location.getSnapshot().status, "active"); f.service.dispose();
  assert.deepEqual(f.cleared, [1, 2]);
});

test("motion resumes an authorized session without asking again", async () => {
  const f = fixture(); let prompts = 0;
  f.window.DeviceMotionEvent.requestPermission = () => { prompts++; return Promise.resolve("granted"); };
  const task = f.service.motion.request(); await Promise.resolve(); f.window.emit("devicemotion", motion); await task;
  const late = f.window.first("devicemotion");
  f.visibility("hidden"); assert.equal(f.window.count("devicemotion"), 0);
  f.visibility("visible"); assert.equal(prompts, 1); assert.equal(f.window.count("devicemotion"), 1);
  late({ acceleration: { x: 99 } }); assert.equal(f.service.motion.getSnapshot().status, "requesting");
  f.window.emit("devicemotion", motion); assert.equal(f.service.motion.getSnapshot().status, "active"); f.service.dispose();
});

test("requesting from a hidden page does not prompt; hiding a pending grant cannot reopen it", async () => {
  const f = fixture(), permission = deferred(); let prompts = 0;
  f.window.DeviceOrientationEvent.requestPermission = () => { prompts++; return permission.promise; };
  f.visibility("hidden"); assert.equal((await f.service.orientation.request()).status, "paused"); assert.equal(prompts, 0);
  f.visibility("visible"); const task = f.service.orientation.request(); assert.equal(prompts, 1);
  f.visibility("hidden"); assert.equal((await task).status, "paused");
  permission.resolve("granted"); await Promise.resolve(); f.visibility("visible");
  assert.equal(prompts, 1); assert.equal(f.window.count("deviceorientation"), 0);
});

test("dispose settles pending work, invalidates late GPS callbacks and allows StrictMode restart", async () => {
  const f = fixture(), task = f.service.location.request({ watch: true }); f.service.dispose();
  assert.equal((await task).status, "cancelled"); f.watches[0].success(position);
  assert.equal(f.service.location.getSnapshot().data, null);
  const next = f.service.location.request({ watch: true }); f.watches[1].success(position);
  assert.equal((await next).status, "active"); f.service.dispose();
});

test("mock results stay explicit and never silently replace failed real readings", async () => {
  for (const outcome of ["granted", "denied", "unsupported", "unavailable", "timeout"]) {
    const service = createMockDeviceSensors({ outcome, location: { accuracy: 900 } });
    const state = await service.location.request(); assert.equal(state.mode, "mock");
    assert.equal(state.status, outcome === "granted" ? "active" : outcome);
    assert.equal(state.data?.accuracy, outcome === "granted" ? 900 : undefined); service.dispose();
  }
  const real = fixture(); const task = real.service.location.request(); real.reads[0].failure({ code: 2 });
  assert.equal((await task).mode, "real"); assert.equal(real.service.location.getSnapshot().data, null);
});
