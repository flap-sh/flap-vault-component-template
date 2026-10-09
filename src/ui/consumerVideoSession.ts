import { VideoSessionReadError, type ConsumerVideoClip, type ConsumerVideoSessionReader } from "../sdk/videoSession";

export const VIDEO_WINDOW_SIZE = 4;
export const VIDEO_PICKER_PAGE_SIZE = 20;
export const VIDEO_SESSION_POLL_MS = 8000;
const MAX_CACHED_CLIPS = 128;
let nextSessionId = 0;

export interface ConsumerVideoSnapshot {
  sessionId: number;
  state: "loading" | "ready" | "empty" | "invalid" | "unsupported" | "error";
  total: number;
  start: number;
  clips: readonly ConsumerVideoClip[];
  revision: number;
  resumeAt: number;
  play: boolean;
  refreshFailed: boolean;
  preservePosition: boolean;
  firstPtsMs: bigint;
  endPtsMs: bigint;
  mediaStartPtsMs: bigint;
  mediaStartIndex: number;
  mediaVideoCid: string;
}

export function resolveVideoClipIndex(index: number, length: number) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || length < 0) throw new VideoSessionReadError("invalid", "Invalid video clip index.");
  return length === 0 ? null : Math.max(0, Math.min(length - 1, index < 0 ? length + index : index));
}

/** Use PTS differences, not an assumed fixed duration or an imprecise global number. */
export function videoClipPosition(clips: readonly ConsumerVideoClip[], timeSeconds: number, mediaStartPtsMs = clips[0]?.startPtsMs ?? 0n) {
  if (!clips.length) return null;
  const elapsedMs = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds * 1000 : 0) + Number(mediaStartPtsMs - clips[0].startPtsMs);
  let clip = clips[0];
  for (const candidate of clips) {
    if (Number(candidate.startPtsMs - clips[0].startPtsMs) <= elapsedMs) clip = candidate;
    else break;
  }
  const time = Math.max(0, Math.min(clip.durationMs, elapsedMs - Number(clip.startPtsMs - clips[0].startPtsMs))) / 1000;
  return { index: clip.index, time, duration: clip.durationMs / 1000 };
}

/** Bounded metadata cache + last-selection-wins loading, independent of React/media. */
export class ConsumerVideoSession {
  private cache = new Map<number, ConsumerVideoClip>();
  private generation = 0;
  private selectionGeneration = 0;
  private disposed = false;
  private refreshing = false;
  private advancing = false;
  private waiters = new Set<() => void>();
  private initialIndex = 0;
  private started = false;
  private snapshot: ConsumerVideoSnapshot = { sessionId: 0, state: "loading", total: 0, start: 0, clips: [], revision: 0, resumeAt: 0, play: false, refreshFailed: false, preservePosition: false, firstPtsMs: 0n, endPtsMs: 0n, mediaStartPtsMs: 0n, mediaStartIndex: 0, mediaVideoCid: "" };

  constructor(private readonly reader: ConsumerVideoSessionReader, private readonly emit: (snapshot: ConsumerVideoSnapshot) => void) { this.snapshot.sessionId = ++nextSessionId; }

  private publish(value: Partial<ConsumerVideoSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...value };
    this.emit(this.snapshot);
    for (const wake of this.waiters) wake();
  }

  async refresh(initialIndex?: number, play = false) {
    if (this.disposed || this.refreshing) return;
    this.refreshing = true;
    if (initialIndex !== undefined) this.initialIndex = initialIndex;
    try {
      const total = await this.reader.readLength();
      if (this.disposed) return;
      if (!Number.isSafeInteger(total) || total < 0) throw new VideoSessionReadError("invalid", "Invalid video session length.");
      const previous = this.snapshot.total;
      const shrank = total < previous;
      if (shrank) this.cache.clear();
      let firstPtsMs = this.snapshot.firstPtsMs;
      let endPtsMs = this.snapshot.endPtsMs;
      if (total && (total !== previous || !this.started)) {
        const [first, last] = await Promise.all([
          this.reader.readSlice(0, 1), this.reader.readSlice(total - 1, 1),
        ]);
        if (this.disposed) return;
        if (first.length !== 1 || last.length !== 1 || first[0].index !== 0 || last[0].index !== total - 1) {
          throw new VideoSessionReadError("invalid", "Incomplete video timeline.");
        }
        firstPtsMs = first[0].startPtsMs;
        endPtsMs = last[0].startPtsMs + BigInt(last[0].durationMs);
        if (endPtsMs <= firstPtsMs || endPtsMs - firstPtsMs > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new VideoSessionReadError("invalid", "Invalid video timeline.");
        }
      }
      this.publish({ total, firstPtsMs, endPtsMs, refreshFailed: false });
      if (total === 0) {
        ++this.generation;
        this.publish({ state: "empty", clips: [], start: 0 });
      } else if (initialIndex !== undefined || previous === 0 || shrank || this.snapshot.state === "error") {
        await this.seek(this.started ? this.snapshot.start : this.initialIndex, 0, play);
      }
    } catch (error) {
      if (this.snapshot.clips.length) this.publish({ refreshFailed: true });
      else this.fail(error);
    } finally {
      this.refreshing = false;
    }
  }

  async seek(index: number, resumeAt = 0, play = false) {
    ++this.selectionGeneration;
    const generation = ++this.generation;
    this.advancing = false;
    try {
      const start = resolveVideoClipIndex(index, this.snapshot.total);
      if (start === null) { this.publish({ state: "empty", clips: [] }); return; }
      // Clear media immediately on explicit seek, rather than downloading the old window.
      this.started = true;
      this.publish({ state: "loading", start, clips: [], resumeAt: 0, preservePosition: false, revision: this.snapshot.revision + 1 });
      const clips = await this.readWindow(start);
      if (this.disposed || generation !== this.generation) return;
      this.publish({ state: "ready", start, clips, resumeAt, play, mediaStartPtsMs: clips[0].startPtsMs, mediaStartIndex: start, mediaVideoCid: clips[0].videoCid, refreshFailed: false, revision: this.snapshot.revision + 1 });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  /** Roll only the bounded metadata view; keep the current media stream alive. */
  async advance(index: number) {
    if (this.disposed || this.advancing || this.snapshot.refreshFailed || this.snapshot.state !== "ready" || index < this.snapshot.start || index >= this.snapshot.start + this.snapshot.clips.length ||
        this.snapshot.start + this.snapshot.clips.length >= this.snapshot.total) return;
    const generation = this.generation;
    this.advancing = true;
    try {
      const clips = await this.readWindow(index);
      if (this.disposed || generation !== this.generation) return;
      this.publish({ state: "ready", start: index, clips, preservePosition: true, refreshFailed: false });
    } catch {
      if (generation === this.generation) this.publish({ refreshFailed: true });
    } finally {
      if (generation === this.generation) this.advancing = false;
    }
  }

  /** The media loader waits at the tail so newly generated clips continue the same stream. */
  async readClip(index: number, signal: AbortSignal): Promise<ConsumerVideoClip> {
    while (index >= this.snapshot.total) {
      signal.throwIfAborted();
      if (this.disposed) throw new DOMException("Session disposed", "AbortError");
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { this.waiters.delete(wake); signal.removeEventListener("abort", abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal.reason); };
        this.waiters.add(wake);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
    signal.throwIfAborted();
    const cached = this.cache.get(index);
    const clip = cached ?? (await this.readWindow(index))[0];
    signal.throwIfAborted();
    if (!clip || this.disposed) throw new DOMException("Session changed", "AbortError");
    return clip;
  }

  async seekTime(seconds: number, play: boolean) {
    if (!Number.isFinite(seconds) || !this.snapshot.total) return;
    const generation = this.generation;
    const selection = ++this.selectionGeneration;
    try {
      const millis = Math.min(Number(this.snapshot.endPtsMs - this.snapshot.firstPtsMs), Math.max(0, seconds) * 1000);
      const target = this.snapshot.firstPtsMs + BigInt(Math.round(millis));
      let low = 0, high = this.snapshot.total - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const [clip] = await this.readWindow(mid);
        if (this.disposed || generation !== this.generation || selection !== this.selectionGeneration || !clip) return;
        if (clip.startPtsMs <= target) low = mid; else high = mid - 1;
      }
      const [clip] = await this.readWindow(low);
      if (this.disposed || generation !== this.generation || selection !== this.selectionGeneration || !clip) return;
      const offset = Math.max(0, Math.min(clip.durationMs - 1, Number(target - clip.startPtsMs))) / 1000;
      await this.seek(low, offset, play);
    } catch {
      if (generation === this.generation && selection === this.selectionGeneration) this.publish({ refreshFailed: true });
    }
  }

  private async readWindow(start: number) {
    const generation = this.generation;
    const end = Math.min(this.snapshot.total, start + VIDEO_WINDOW_SIZE);
    for (let index = start; index < end;) {
      if (this.cache.has(index)) { index++; continue; }
      let count = 1;
      while (index + count < end && !this.cache.has(index + count)) count++;
      const values = await this.reader.readSlice(index, count);
      if (this.disposed || generation !== this.generation) return [];
      if (values.length !== count || values.some((clip, offset) => clip.index !== index + offset)) throw new VideoSessionReadError("invalid", "Incomplete video session window.");
      for (const clip of values) this.cache.set(clip.index, clip);
      index += count;
    }
    const clips = Array.from({ length: end - start }, (_, offset) => this.cache.get(start + offset)!);
    for (let index = 1; index < clips.length; index++) {
      if (clips[index].startPtsMs !== clips[index - 1].startPtsMs + BigInt(clips[index - 1].durationMs)) throw new VideoSessionReadError("invalid", "Discontinuous video session timestamps.");
    }
    // Touch the current window last so it survives cache eviction.
    for (const clip of clips) { this.cache.delete(clip.index); this.cache.set(clip.index, clip); }
    while (this.cache.size > MAX_CACHED_CLIPS) this.cache.delete(this.cache.keys().next().value!);
    return clips;
  }

  private fail(error: unknown) {
    if (error instanceof VideoSessionReadError && error.code === "invalid") this.cache.clear();
    this.publish({ state: error instanceof VideoSessionReadError ? error.code : "error", clips: [] });
  }

  dispose() { this.disposed = true; ++this.generation; this.cache.clear(); for (const wake of this.waiters) wake(); this.waiters.clear(); }
}
