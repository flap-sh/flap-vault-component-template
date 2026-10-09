import { TsTimeline } from "./tsTimeline";
import type Mpegts from "mpegts.js";
import type { ConsumerVideoClip } from "../sdk/videoSession";
import { resolveIpfsImageUrl } from "../sdk/ipfsImage";

export interface ContinuousVideoSource {
  revision: number;
  startIndex: number;
  startPtsMs: bigint;
  firstVideoCid: string;
  resumeAt: number;
  readClip(index: number, signal: AbortSignal): Promise<ConsumerVideoClip>;
  playIntent(): boolean;
}

/** One IO stream feeds the same transmuxer across paginated TS clips. No player window rebuild. */
export function createContinuousVideoLoader(source: ContinuousVideoSource, video: HTMLVideoElement,
  fetchImpl: typeof fetch = fetch): Mpegts.CustomLoaderConstructor {
  return class implements Mpegts.BaseLoader {
    _status = 0;
    _needStash = false;
    readonly type = "flap-continuous-video";
    get status() { return this._status; }
    get needStashBuffer() { return this._needStash; }
    onContentLengthKnown = (_length: number) => {};
    onURLRedirect = (_url: string) => {};
    onDataArrival = (_chunk: ArrayBuffer, _byteStart: number, _receivedLength?: number) => {};
    onError = (_type: Mpegts.LoaderErrors, _error: Mpegts.LoaderErrorMessage) => {};
    onComplete = (_from: number, _to: number) => {};
    private abortController: AbortController | null = null;
    isWorking() { return this._status === 1 || this._status === 2; }
    destroy() { this.abort(); }
    abort() { this.abortController?.abort(); this.abortController = null; this._status = 0; }
    open(_data: Mpegts.MediaSegment, range: Mpegts.Range) {
      this.abort();
      const controller = new AbortController();
      this.abortController = controller;
      this._status = 1;
      // Unbuffered timeline jumps belong to the consumer seek path, not a concatenated byte range.
      if (range.from !== 0) { this.fail(controller); return; }
      void this.pump(controller);
    }
    private fail(controller: AbortController) {
      if (controller.signal.aborted) return;
      this._status = 3;
      controller.abort();
      this.onError("Exception" as unknown as Mpegts.LoaderErrors, { code: -1, msg: "Could not load video clip." });
    }
    private async waitUntil(predicate: () => boolean, signal: AbortSignal) {
      while (!predicate()) {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => { clearTimeout(timer); video.removeEventListener("timeupdate", wake); signal.removeEventListener("abort", abort); };
          const wake = () => { cleanup(); resolve(); };
          const abort = () => { cleanup(); reject(signal.reason); };
          const timer = setTimeout(wake, 250);
          video.addEventListener("timeupdate", wake, { once: true });
          signal.addEventListener("abort", abort, { once: true });
        });
      }
    }
    private async pump(controller: AbortController) {
      const signal = controller.signal;
      let byteStart = 0;
      let expectedPts = source.startPtsMs;
      try {
        for (let index = source.startIndex; ; index++) {
          const clip = await source.readClip(index, signal);
          signal.throwIfAborted();
          if (clip.index !== index || clip.startPtsMs !== expectedPts) throw new Error("Discontinuous clips");
          expectedPts += BigInt(clip.durationMs);
          const start = Number(clip.startPtsMs - source.startPtsMs) / 1000;
          await this.waitUntil(() => start <= Math.max(video.currentTime, source.resumeAt) + 24, signal);
          const url = resolveIpfsImageUrl(clip.videoCid);
          if (!url) throw new Error("Invalid clip CID");
          const response = await fetchImpl(url, { signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
          if (!response.ok || !response.body) throw new Error("Clip unavailable");
          const timeline = new TsTimeline(start * 1000);
          const reader = response.body.getReader();
          try {
            while (true) {
              await this.waitUntil(() => !video.buffered.length || video.buffered.end(video.buffered.length - 1) <= Math.max(video.currentTime, source.resumeAt) + 32, signal);
              const { done, value } = await reader.read();
              signal.throwIfAborted();
              const bytes = timeline.push(value ?? new Uint8Array(0), done).buffer as ArrayBuffer;
              if (bytes.byteLength === 0) { if (done) break; continue; }
              this._status = 2;
              this.onDataArrival(bytes, byteStart, byteStart + bytes.byteLength);
              byteStart += bytes.byteLength;
              if (video.ended && source.playIntent()) void video.play().catch(() => undefined);
              if (done) break;
            }
          } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        }
      } catch {
        this.fail(controller);
      }
    }
  };
}
