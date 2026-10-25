import assert from "node:assert/strict";
import test from "node:test";
import { checkDeviceCapabilityManifest, collectDeviceCapabilityIssues } from "./device-capability-policy.mjs";

const manifest = { deviceCapabilities: ["location", "motion", "orientation"] };
const scan = (source, declaration = manifest, options) => collectDeviceCapabilityIssues(source, "Component.tsx", declaration, options);
const blocked = (source, declaration = manifest, options) => scan(source, declaration, options).filter((issue) => issue.severity === "blocking");

test("old and empty manifests remain valid; declarations are bounded, unique and reviewed", () => {
  assert.deepEqual(checkDeviceCapabilityManifest({}), []);
  assert.deepEqual(checkDeviceCapabilityManifest({ deviceCapabilities: [] }), []);
  assert.equal(checkDeviceCapabilityManifest(manifest)[0].ruleId, "manual-review/device-capabilities");
  for (const value of ["location", ["gps"], ["location", "location"], null, ["motion", 1]]) {
    assert.equal(checkDeviceCapabilityManifest({ deviceCapabilities: value })[0].severity, "blocking");
  }
});

test("checks SDK hooks including renamed and namespace imports", () => {
  for (const source of [
    'import {useGeolocation} from "@/src/sdk"; useGeolocation();',
    'import {useDeviceMotion as useShake} from "@/src/sdk"; useShake();',
    'import * as SDK from "@/src/sdk"; SDK.useDeviceOrientation();',
  ]) {
    assert.deepEqual(blocked(source), []);
    assert.equal(blocked(source, {})[0].ruleId, "device-policy/undeclared-capability");
    assert.equal(blocked(source, manifest, { runtimeAvailable: false }).at(-1).ruleId, "runtime-policy/device-sensors-unavailable");
  }
  assert(blocked('import {useDeviceMotion as useShake} from "@/src/sdk"; const retained=useShake;', {}).some((issue) => issue.ruleId === "device-policy/undeclared-capability"));
  assert(blocked('import * as SDK from "@/src/sdk"; const retained=SDK.useDeviceMotion;', {}).some((issue) => issue.ruleId === "device-policy/undeclared-capability"));
});

test("tracks SDK result, retained channels and destructuring without treating arbitrary device objects as SDK", () => {
  for (const source of [
    'import {useFlapSdk as useSdk} from "@/src/sdk"; const sdk = useSdk(); sdk.device.location.request();',
    'import {useMiniAppSdk} from "@/src/sdk"; const sdk=useMiniAppSdk(); const devices=sdk.device; const motion=devices.motion; motion.request();',
    'import {useFlapSdk} from "@/src/sdk"; const {device:{orientation:tilt}}=useFlapSdk(); tilt.request();',
    'import {useFlapSdk} from "@/src/sdk"; const sdk=useFlapSdk(); const {motion}=sdk.device; motion.request();',
    'import * as SDK from "@/src/sdk"; const sdk=SDK.useMiniAppSdk(); sdk["device"]["location"].request();',
  ]) {
    assert.deepEqual(blocked(source), []);
    assert(blocked(source, {}).some((issue) => issue.ruleId === "device-policy/undeclared-capability"), source);
  }
  assert.deepEqual(blocked('const device={location:{request(){}}}; device.location.request();', {}), []);
  assert.deepEqual(blocked('const obj={useGeolocation(){}}; obj.useGeolocation();', {}), []);
  assert(blocked('import {useFlapSdk} from "@/src/sdk"; const sdk=useFlapSdk(); sdk.device[kind].request();').some((issue) => issue.ruleId === "device-policy/dynamic-capability"));
});

test("declaration alone requires a receiving Runtime that supports the feature", () => {
  assert.deepEqual(blocked("const x=1;", {}, { runtimeAvailable: false }), []);
  assert.equal(blocked("const x=1;", { deviceCapabilities: ["motion"] }, { runtimeAvailable: false })[0].ruleId, "runtime-policy/device-sensors-unavailable");
  assert(blocked('import {useFlapSdk} from "@/src/sdk"; const sdk=useFlapSdk(); const {device}=sdk;', {}, { runtimeAvailable: false }).some((issue) => issue.ruleId === "runtime-policy/device-sensors-unavailable"));
});

test("native sensors and browser motion listeners remain blocked even after declaration", () => {
  for (const source of [
    'DeviceMotionEvent.requestPermission();', 'window.DeviceOrientationEvent.requestPermission();',
    'const Sensor = Gyroscope; new Sensor();', 'new Accelerometer();',
    'navigator.geolocation.getCurrentPosition(callback);', 'window.navigator.permissions.query({name:"geolocation"});',
    'window.addEventListener("devicemotion", listener);', 'addEventListener("deviceorientation", listener);',
    'globalThis["ondevicemotion"]=listener;', 'self.ondeviceorientation=listener;',
  ]) assert(blocked(source).some((issue) => issue.ruleId === "forbidden-api/browser-permission"), source);
  assert.deepEqual(blocked('const data={DeviceMotionEvent:"business label"}; const event="devicemotion";', {}), []);
});
