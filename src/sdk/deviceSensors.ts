/** Host-owned browser device access. Importing this module never touches hardware. */
export const DEVICE_SENSORS_VERSION = 1;
export type DeviceCapability = "location" | "motion" | "orientation";
export type DeviceSensorMode = "real" | "mock";
export type DeviceSensorPermission = "unknown" | "prompt" | "granted" | "denied";
export type DeviceSensorStatus = "idle" | "requesting" | "active" | "paused" | "denied" | "unsupported" | "insecure" | "policy-blocked" | "timeout" | "unavailable" | "not-declared" | "cancelled";

export interface DeviceLocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}
export interface DeviceVector { x: number | null; y: number | null; z: number | null }
export interface DeviceRotationRate { alpha: number | null; beta: number | null; gamma: number | null }
export interface DeviceMotionData {
  acceleration: DeviceVector | null;
  accelerationIncludingGravity: DeviceVector | null;
  rotationRate: DeviceRotationRate | null;
  interval: number | null;
  timestamp: number;
}
export interface DeviceOrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  timestamp: number;
}
export interface DeviceSensorState<T> {
  status: DeviceSensorStatus;
  permission: DeviceSensorPermission;
  data: T | null;
  mode: DeviceSensorMode;
}
export interface DeviceSensorRequestOptions { timeoutMs?: number; signal?: AbortSignal }
export interface DeviceLocationRequestOptions extends DeviceSensorRequestOptions {
  watch?: boolean;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
}
export interface DeviceSensor<T, O extends DeviceSensorRequestOptions = DeviceSensorRequestOptions> {
  getSnapshot(): DeviceSensorState<T>;
  subscribe(listener: () => void): () => void;
  /** Call directly from a user action. Resolves after data or a normalized failure. */
  request(options?: O): Promise<DeviceSensorState<T>>;
  /** Stops this capability's shared session, including all of its subscribers. */
  stop(): void;
}
export interface DeviceSensors {
  readonly version: typeof DEVICE_SENSORS_VERSION;
  readonly mode: DeviceSensorMode;
  location: DeviceSensor<DeviceLocationData, DeviceLocationRequestOptions>;
  motion: DeviceSensor<DeviceMotionData>;
  orientation: DeviceSensor<DeviceOrientationData>;
  /** Stops work and invalidates callbacks; services may safely be restarted. */
  dispose(): void;
}

interface DeviceEventTarget {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
/** Structural host adapter, also useful for deterministic tests without hardware. */
export interface DeviceSensorEnvironment {
  secure: boolean;
  window: DeviceEventTarget & {
    DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
    DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
  };
  document: DeviceEventTarget & {
    visibilityState?: string;
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  };
  geolocation?: {
    getCurrentPosition(success: (value: any) => void, failure: (error: any) => void, options: PositionOptions): void;
    watchPosition(success: (value: any) => void, failure: (error: any) => void, options: PositionOptions): number;
    clearWatch(id: number): void;
  };
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(id: unknown): void;
  now(): number;
}
export interface BrowserDeviceSensorsOptions {
  capabilities?: readonly DeviceCapability[];
  /** Hosts normally omit this. No navigator access occurs until request(). */
  environment?: DeviceSensorEnvironment | (() => DeviceSensorEnvironment | undefined);
}

const ALL: readonly DeviceCapability[] = ["location", "motion", "orientation"];
const DEFAULT_TIMEOUT_MS = 10_000;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const nonnegative = (value: unknown): number | null => { const number = finite(value); return number !== null && number >= 0 ? number : null; };
const boundedTimeout = (value: unknown) => Math.min(120_000, Math.max(1, nonnegative(value) ?? DEFAULT_TIMEOUT_MS));

function browserEnvironment(): DeviceSensorEnvironment | undefined {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof navigator === "undefined") return undefined;
  return {
    secure: window.isSecureContext === true,
    window: window as unknown as DeviceSensorEnvironment["window"],
    document: document as DeviceSensorEnvironment["document"],
    geolocation: navigator.geolocation,
    setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimeout: (id) => window.clearTimeout(id as number),
    now: Date.now,
  };
}
function locationData(value: any, now: number): DeviceLocationData | null {
  const coords = value?.coords;
  const latitude = finite(coords?.latitude), longitude = finite(coords?.longitude), accuracy = nonnegative(coords?.accuracy);
  if (latitude === null || Math.abs(latitude) > 90 || longitude === null || Math.abs(longitude) > 180 || accuracy === null) return null;
  return { latitude, longitude, accuracy, altitude: finite(coords.altitude), altitudeAccuracy: nonnegative(coords.altitudeAccuracy), heading: finite(coords.heading), speed: nonnegative(coords.speed), timestamp: finite(value.timestamp) ?? now };
}
function vector(value: any): DeviceVector | null {
  const result = { x: finite(value?.x), y: finite(value?.y), z: finite(value?.z) };
  return Object.values(result).some((item) => item !== null) ? result : null;
}
function motionData(value: any, now: number): DeviceMotionData | null {
  const acceleration = vector(value?.acceleration), accelerationIncludingGravity = vector(value?.accelerationIncludingGravity);
  const rotation = { alpha: finite(value?.rotationRate?.alpha), beta: finite(value?.rotationRate?.beta), gamma: finite(value?.rotationRate?.gamma) };
  const rotationRate = Object.values(rotation).some((item) => item !== null) ? rotation : null;
  if (!acceleration && !accelerationIncludingGravity && !rotationRate) return null;
  return { acceleration, accelerationIncludingGravity, rotationRate, interval: nonnegative(value?.interval), timestamp: now };
}
function orientationData(value: any, now: number): DeviceOrientationData | null {
  const alpha = finite(value?.alpha), beta = finite(value?.beta), gamma = finite(value?.gamma);
  return alpha === null && beta === null && gamma === null ? null : { alpha, beta, gamma, absolute: value?.absolute === true, timestamp: now };
}

function inactiveSensor<T, O extends DeviceSensorRequestOptions>(status: DeviceSensorStatus, mode: DeviceSensorMode): DeviceSensor<T, O> {
  const snapshot: DeviceSensorState<T> = Object.freeze({ status, permission: "unknown", data: null, mode });
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, request: () => Promise.resolve(snapshot), stop() {} };
}

function createBrowserChannel<T, O extends DeviceLocationRequestOptions>(kind: DeviceCapability, declared: boolean, resolveEnvironment: () => DeviceSensorEnvironment | undefined): DeviceSensor<T, O> {
  if (!declared) return inactiveSensor("not-declared", "real");
  let state: DeviceSensorState<T> = { status: "idle", permission: "unknown", data: null, mode: "real" };
  const listeners = new Set<() => void>();
  let generation = 0;
  let pending: { promise: Promise<DeviceSensorState<T>>; resolve: (value: DeviceSensorState<T>) => void } | undefined;
  let environment: DeviceSensorEnvironment | undefined;
  let options: O = {} as O;
  let watchId: number | undefined;
  let timer: unknown;
  let eventListener: ((event: any) => void) | undefined;
  let visibilityListener: (() => void) | undefined;
  let abortListener: (() => void) | undefined;
  let shouldResume = false;
  let sawInvalidData = false;
  let sessionActive = false;
  const eventName = kind === "motion" ? "devicemotion" : "deviceorientation";

  function update(next: Partial<DeviceSensorState<T>>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }
  function settle() { const task = pending; pending = undefined; task?.resolve(state); }
  function clearTimer() { if (timer !== undefined) environment?.clearTimeout(timer); timer = undefined; }
  function detachHardware() {
    clearTimer();
    if (watchId !== undefined) environment?.geolocation?.clearWatch(watchId);
    watchId = undefined;
    if (eventListener) environment?.window.removeEventListener(eventName, eventListener);
    eventListener = undefined;
  }
  function cleanup() {
    generation += 1;
    detachHardware();
    if (visibilityListener) environment?.document.removeEventListener("visibilitychange", visibilityListener);
    visibilityListener = undefined;
    if (abortListener) options.signal?.removeEventListener("abort", abortListener);
    abortListener = undefined;
    sessionActive = false;
    shouldResume = false;
  }
  function finish(status: DeviceSensorStatus, permission = state.permission) {
    cleanup();
    update({ status, permission, data: null });
    settle();
  }
  function stop() {
    const hadWork = sessionActive || Boolean(pending);
    cleanup();
    update({ status: hadWork ? "cancelled" : "idle", data: null });
    settle();
  }
  function guard(env: DeviceSensorEnvironment | undefined): DeviceSensorStatus | null {
    if (!env) return "unsupported";
    if (!env.secure) return "insecure";
    const features = kind === "location" ? ["geolocation"] : ["accelerometer", "gyroscope"];
    const policy = env.document.permissionsPolicy ?? env.document.featurePolicy;
    try { if (policy && features.some((feature) => !policy.allowsFeature(feature))) return "policy-blocked"; }
    catch (error) {
      if ((error as { name?: string })?.name === "SecurityError") return "policy-blocked";
      // Older browsers may not expose all feature names. Try the API.
    }
    if (kind === "location" ? !env.geolocation : !(kind === "motion" ? env.window.DeviceMotionEvent : env.window.DeviceOrientationEvent)) return "unsupported";
    return null;
  }
  function accept(raw: any, token: number) {
    if (token !== generation || !sessionActive) return;
    const data = (kind === "location" ? locationData(raw, environment!.now()) : kind === "motion" ? motionData(raw, environment!.now()) : orientationData(raw, environment!.now())) as T | null;
    if (!data) { sawInvalidData = true; return; }
    clearTimer();
    update({ status: "active", permission: "granted", data });
    settle();
    if (kind === "location" && !options.watch) {
      // getCurrentPosition cannot be cancelled. Invalidate any late callbacks.
      cleanup();
    }
  }
  function startHardware() {
    const env = environment!;
    if (env.document.visibilityState === "hidden") {
      shouldResume = true;
      update({ status: "paused", data: null });
      settle();
      return;
    }
    const token = generation;
    sawInvalidData = false;
    update({ status: "requesting", data: null });
    timer = env.setTimeout(() => { if (token === generation) finish(sawInvalidData ? "unavailable" : "timeout"); }, boundedTimeout(options.timeoutMs));
    try {
      if (kind === "location") {
        const failed = (error: any) => {
          if (token !== generation || !sessionActive) return;
          const status = error?.code === 1 ? "denied" : error?.code === 3 ? "timeout" : "unavailable";
          finish(status, status === "denied" ? "denied" : state.permission);
        };
        const geoOptions = { enableHighAccuracy: options.enableHighAccuracy === true, maximumAge: nonnegative(options.maximumAge) ?? 0, timeout: boundedTimeout(options.timeoutMs) };
        if (options.watch) {
          const id = env.geolocation!.watchPosition((value) => accept(value, token), failed, geoOptions);
          if (token === generation && sessionActive) watchId = id;
          else env.geolocation!.clearWatch(id);
        } else env.geolocation!.getCurrentPosition((value) => accept(value, token), failed, geoOptions);
      } else {
        eventListener = (value) => accept(value, token);
        env.window.addEventListener(eventName, eventListener);
      }
    } catch (error) {
      if (token === generation) finish((error as { name?: string })?.name === "SecurityError" ? "policy-blocked" : "unavailable");
    }
  }
  function observeSession() {
    const env = environment!;
    visibilityListener = () => {
      if (!sessionActive) return;
      if (env.document.visibilityState === "hidden") {
        generation += 1;
        detachHardware();
        shouldResume = true;
        update({ status: "paused", data: null });
        settle();
      } else if (shouldResume) {
        shouldResume = false;
        // Never requestPermission on recovery. Reuse only an already-granted session.
        if (state.permission === "granted") startHardware();
        else finish("paused");
      }
    };
    env.document.addEventListener("visibilitychange", visibilityListener);
    if (options.signal) {
      abortListener = () => finish("cancelled");
      options.signal.addEventListener("abort", abortListener, { once: true });
    }
  }
  function request(requestOptions: O = {} as O): Promise<DeviceSensorState<T>> {
    if (pending) return pending.promise;
    if (state.status === "active" && (kind !== "location" || (options.watch && requestOptions.watch))) return Promise.resolve(state);
    cleanup();
    options = { ...requestOptions };
    let blocked: DeviceSensorStatus | null;
    try { environment = resolveEnvironment(); blocked = guard(environment); }
    catch (error) { blocked = (error as { name?: string })?.name === "SecurityError" ? "policy-blocked" : "unavailable"; }
    if (blocked) { update({ status: blocked, data: null }); return Promise.resolve(state); }
    if (options.signal?.aborted) { update({ status: "cancelled", data: null }); return Promise.resolve(state); }
    if (environment!.document.visibilityState === "hidden") { update({ status: "paused", data: null }); return Promise.resolve(state); }
    sessionActive = true;
    let resolve!: (value: DeviceSensorState<T>) => void;
    const promise = new Promise<DeviceSensorState<T>>((done) => { resolve = done; });
    pending = { promise, resolve };
    update({ status: "requesting", data: null });
    observeSession();
    const token = generation;
    if (kind === "location") startHardware();
    else {
      const constructor = kind === "motion" ? environment!.window.DeviceMotionEvent : environment!.window.DeviceOrientationEvent;
      try {
        // Do not await capability queries or other work before this call: Safari
        // requires the original click's transient activation.
        const permission = constructor?.requestPermission?.();
        if (permission) {
          Promise.resolve(permission).then((result) => {
            if (token !== generation || !sessionActive) return;
            if (result !== "granted") { finish("denied", "denied"); return; }
            update({ permission: "granted" });
            startHardware();
          }, (error) => {
            // NotAllowedError may mean missing user activation, not a user denial.
            if (token === generation && sessionActive) finish((error as { name?: string })?.name === "NotAllowedError" ? "denied" : "unavailable");
          });
        } else startHardware();
      } catch (error) {
        if (token === generation) finish((error as { name?: string })?.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    }
    return promise;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0 && sessionActive) stop();
      };
    },
    request,
    stop,
  };
}

export function createBrowserDeviceSensors(options: BrowserDeviceSensorsOptions = {}): DeviceSensors {
  const allowed = new Set(options.capabilities ?? ALL);
  const environment = () => typeof options.environment === "function" ? options.environment() : options.environment ?? browserEnvironment();
  const location = createBrowserChannel<DeviceLocationData, DeviceLocationRequestOptions>("location", allowed.has("location"), environment);
  const motion = createBrowserChannel<DeviceMotionData, DeviceSensorRequestOptions>("motion", allowed.has("motion"), environment);
  const orientation = createBrowserChannel<DeviceOrientationData, DeviceSensorRequestOptions>("orientation", allowed.has("orientation"), environment);
  return { version: DEVICE_SENSORS_VERSION, mode: "real", location, motion, orientation, dispose() { location.stop(); motion.stop(); orientation.stop(); } };
}

export interface MockDeviceSensorsOptions {
  capabilities?: readonly DeviceCapability[];
  outcome?: "granted" | "denied" | "unsupported" | "unavailable" | "timeout";
  location?: Partial<DeviceLocationData>;
  motion?: Partial<DeviceMotionData>;
  orientation?: Partial<DeviceOrientationData>;
}
export function createMockDeviceSensors(options: MockDeviceSensorsOptions = {}): DeviceSensors {
  const allowed = new Set(options.capabilities ?? ALL);
  function channel<T, O extends DeviceSensorRequestOptions>(capability: DeviceCapability, data: T): DeviceSensor<T, O> {
    if (!allowed.has(capability)) return inactiveSensor("not-declared", "mock");
    let state: DeviceSensorState<T> = { status: "idle", permission: "unknown", data: null, mode: "mock" };
    const listeners = new Set<() => void>();
    const update = (next: DeviceSensorState<T>) => { state = next; for (const listener of listeners) listener(); };
    return {
      getSnapshot: () => state,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      request(requestOptions) {
        const outcome = options.outcome ?? "granted";
        const status = requestOptions?.signal?.aborted ? "cancelled" : outcome === "granted" ? "active" : outcome;
        update({ status, permission: status === "active" ? "granted" : status === "denied" ? "denied" : "unknown", data: status === "active" ? data : null, mode: "mock" });
        return Promise.resolve(state);
      },
      stop() { update({ ...state, status: "idle", data: null }); },
    };
  }
  const location = channel<DeviceLocationData, DeviceLocationRequestOptions>("location", { latitude: 0, longitude: 0, accuracy: 100, altitude: null, altitudeAccuracy: null, heading: null, speed: null, timestamp: 0, ...options.location });
  const motion = channel<DeviceMotionData, DeviceSensorRequestOptions>("motion", { acceleration: { x: 0, y: 0, z: 0 }, accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 }, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, interval: 16, timestamp: 0, ...options.motion });
  const orientation = channel<DeviceOrientationData, DeviceSensorRequestOptions>("orientation", { alpha: 0, beta: 0, gamma: 0, absolute: false, timestamp: 0, ...options.orientation });
  return { version: DEVICE_SENSORS_VERSION, mode: "mock", location, motion, orientation, dispose() { location.stop(); motion.stop(); orientation.stop(); } };
}

/** The declaration narrows a host adapter; it never creates browser permission. */
export function scopeDeviceSensors(sensors: DeviceSensors, capabilities: readonly DeviceCapability[] = []): DeviceSensors {
  const declared = new Set(capabilities);
  const location = declared.has("location") ? sensors.location : inactiveSensor<DeviceLocationData, DeviceLocationRequestOptions>("not-declared", sensors.mode);
  const motion = declared.has("motion") ? sensors.motion : inactiveSensor<DeviceMotionData, DeviceSensorRequestOptions>("not-declared", sensors.mode);
  const orientation = declared.has("orientation") ? sensors.orientation : inactiveSensor<DeviceOrientationData, DeviceSensorRequestOptions>("not-declared", sensors.mode);
  return { version: DEVICE_SENSORS_VERSION, mode: sensors.mode, location, motion, orientation, dispose() { location.stop(); motion.stop(); orientation.stop(); } };
}

export function unavailableDeviceSensors(): DeviceSensors {
  const location = inactiveSensor<DeviceLocationData, DeviceLocationRequestOptions>("unsupported", "real");
  const motion = inactiveSensor<DeviceMotionData, DeviceSensorRequestOptions>("unsupported", "real");
  const orientation = inactiveSensor<DeviceOrientationData, DeviceSensorRequestOptions>("unsupported", "real");
  return { version: DEVICE_SENSORS_VERSION, mode: "real", location, motion, orientation, dispose() {} };
}
