"use client";

import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { MiniAppContext, RuntimeContext } from "./runtimeStore";
import { createBrowserDeviceSensors, scopeDeviceSensors, unavailableDeviceSensors } from "./deviceSensors";
import type { DeviceCapability, DeviceLocationData, DeviceLocationRequestOptions, DeviceMotionData, DeviceOrientationData, DeviceSensor, DeviceSensorRequestOptions, DeviceSensors } from "./deviceSensors";
import type { VaultManifest } from "./types";

const unavailable = unavailableDeviceSensors();

/** Host lifecycle adapter. Creating/subscribing does not request any permission. */
export function useRuntimeDeviceSensors(manifest: VaultManifest, injected?: DeviceSensors): DeviceSensors {
  const scopeKey = JSON.stringify([manifest.artifactId, manifest.deviceCapabilities ?? []]);
  const device = useMemo(() => {
    const [, capabilities] = JSON.parse(scopeKey) as [string, DeviceCapability[]];
    return scopeDeviceSensors(injected ?? createBrowserDeviceSensors({ capabilities }), capabilities);
  }, [scopeKey, injected]);
  useEffect(() => () => device.dispose(), [device]);
  return device;
}

function useDeviceSensors(): DeviceSensors {
  const vault = useContext(RuntimeContext), app = useContext(MiniAppContext);
  const runtime = app ?? vault;
  if (!runtime) throw new Error("Device sensors require a Flap runtime provider.");
  // A hook bundled by a newer artifact can encounter an older injected SDK.
  return runtime.device ?? unavailable;
}

function useSensor<T, O extends DeviceSensorRequestOptions>(sensor: DeviceSensor<T, O>, options?: O) {
  const state = useSyncExternalStore(sensor.subscribe, sensor.getSnapshot, sensor.getSnapshot);
  return { ...state, request: (overrides?: O) => sensor.request({ ...options, ...overrides } as O), stop: sensor.stop };
}

export function useGeolocation(options?: DeviceLocationRequestOptions) {
  return useSensor<DeviceLocationData, DeviceLocationRequestOptions>(useDeviceSensors().location, options);
}
export function useDeviceMotion(options?: DeviceSensorRequestOptions) {
  return useSensor<DeviceMotionData, DeviceSensorRequestOptions>(useDeviceSensors().motion, options);
}
export function useDeviceOrientation(options?: DeviceSensorRequestOptions) {
  return useSensor<DeviceOrientationData, DeviceSensorRequestOptions>(useDeviceSensors().orientation, options);
}
