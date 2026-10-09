import type Mpegts from "mpegts.js";
import { createContinuousVideoLoader, type ContinuousVideoSource } from "./continuousVideoLoader";
import { resolveIpfsImageUrl } from "../sdk/ipfsImage";

export interface VideoSessionClip {
  videoCid: string;
  /** Duration from FlapAIProvider, in milliseconds. */
  durationMs: number;
}

export type VideoSessionState = "empty" | "invalid" | "loading" | "ready" | "unsupported" | "error";
type MpegtsLibrary = Pick<typeof Mpegts, "createPlayer" | "isSupported" | "Events">;
export interface VideoPlaybackUpdate {
  /** Explicit seek/window revision, including a seek back to the same clip. */
  revision: number;
  /** Position in the newly supplied bounded timeline, in seconds. */
  resumeAt: number;
}

export function videoSessionSegments(clips: unknown): Mpegts.MediaSegment[] | null {
  if (!Array.isArray(clips)) return null;
  const segments: Mpegts.MediaSegment[] = [];
  for (const clip of clips) {
    if (!clip || typeof clip.videoCid !== "string" || clip.videoCid.length > 128 ||
        !Number.isSafeInteger(clip.durationMs) || clip.durationMs <= 0) return null;
    const url = resolveIpfsImageUrl(clip.videoCid);
    if (!url) return null;
    // mpegts.js MediaSegment.duration uses milliseconds, just like the provider.
    segments.push({ url, duration: clip.durationMs });
  }
  return segments;
}

/** Owns the asynchronous player lifecycle independently of React re-renders. */
export class VideoSessionController {
  private player: Mpegts.Player | null = null;
  private removeListeners: (() => void) | null = null;
  private segments: Mpegts.MediaSegment[] = [];
  private key: string | undefined;
  private generation = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly loadMpegts: () => Promise<MpegtsLibrary>,
    private readonly onState: (state: VideoSessionState) => void,
  ) {}

  async update(clips: unknown, autoPlay = false, playback?: VideoPlaybackUpdate) {
    const segments = videoSessionSegments(clips);
    const key = JSON.stringify([segments, playback?.revision]);
    if (key === this.key) return;
    this.key = key;
    const generation = ++this.generation;
    if (!segments?.length) {
      this.destroyPlayer();
      this.segments = [];
      this.onState(segments ? "empty" : "invalid");
      return;
    }
    const isAppend = !playback && this.player !== null && this.segments.length <= segments.length &&
      this.segments.every((segment, index) => segment.url === segments[index].url && segment.duration === segments[index].duration);
    const resumeAt = playback ? Math.max(0, playback.resumeAt) : isAppend ? this.video.currentTime : 0;
    const shouldPlay = isAppend ? this.video.ended || !this.video.paused : autoPlay;
    // Stop the previous stream before waiting for the browser module/new metadata.
    this.destroyPlayer();
    this.onState("loading");

    try {
      const mpegts = await this.loadMpegts();
      if (generation !== this.generation) return;
      if (!mpegts.isSupported()) {
        this.destroyPlayer();
        this.onState("unsupported");
        return;
      }

      const player = mpegts.createPlayer(
        { type: "mse", isLive: false, cors: true, withCredentials: false, segments },
        {
          enableWorker: false, enableWorkerForMSE: false, accurateSeek: true,
          // Load far enough to restore a paused viewer without an early,
          // unbuffered TS seek snapping to a different keyframe.
          lazyLoadMaxDuration: Math.max(180, Math.ceil(resumeAt) + 30),
          referrerPolicy: "no-referrer",
        },
      );
      this.player = player;
      this.segments = segments;
      const isCurrent = () => generation === this.generation && this.player === player;
      const onError = () => {
        if (!isCurrent()) return;
        this.destroyPlayer();
        this.onState("error");
      };
      let metadataLoaded = false;
      let restored = false;
      const restorePlayback = () => {
        if (!isCurrent() || !metadataLoaded || restored) return;
        let target = resumeAt;
        if (target > 0) {
          const buffered = this.video.buffered;
          let available = false;
          for (let index = 0; index < buffered.length; index++) {
            const start = buffered.start(index);
            // Permit a small audio/video boundary gap when resuming at clip end.
            if (target >= start - 0.25 && target < buffered.end(index)) {
              target = Math.max(target, start);
              available = true;
              break;
            }
          }
          if (!available) return;
        }
        restored = true;
        this.video.removeEventListener("progress", restorePlayback);
        try {
          if (target > 0) player.currentTime = target;
          this.onState("ready");
          if (shouldPlay) {
            // Autoplay rejection leaves controls available for a user gesture.
            player.play()?.catch(() => undefined);
          }
        } catch {
          onError();
        }
      };
      const onMetadata = () => {
        metadataLoaded = true;
        restorePlayback();
      };
      player.on(mpegts.Events.ERROR, onError);
      this.video.addEventListener("error", onError);
      this.video.addEventListener("loadedmetadata", onMetadata, { once: true });
      this.video.addEventListener("progress", restorePlayback);
      this.removeListeners = () => {
        player.off(mpegts.Events.ERROR, onError);
        this.video.removeEventListener("error", onError);
        this.video.removeEventListener("loadedmetadata", onMetadata);
        this.video.removeEventListener("progress", restorePlayback);
      };
      player.attachMediaElement(this.video);
      player.load();
    } catch {
      if (generation !== this.generation) return;
      this.destroyPlayer();
      this.onState("error");
    }
  }

  async updateContinuous(source: ContinuousVideoSource, autoPlay = false, resumeAt = 0) {
    const key = `continuous:${source.revision}`;
    if (this.key === key) return;
    this.key = key;
    const generation = ++this.generation;
    this.destroyPlayer();
    this.onState("loading");
    try {
      const mpegts = await this.loadMpegts();
      if (generation !== this.generation) return;
      if (!mpegts.isSupported()) { this.onState("unsupported"); return; }
      const player = mpegts.createPlayer({ type: "mse", isLive: false, cors: true, withCredentials: false,
        url: resolveIpfsImageUrl(source.firstVideoCid)! }, {
        enableWorker: false, enableWorkerForMSE: false, accurateSeek: true, lazyLoad: false,
        autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30,
        customLoader: createContinuousVideoLoader(source, this.video), referrerPolicy: "no-referrer",
      });
      if (generation !== this.generation) { player.destroy(); return; }
      this.player = player;
      let ready = false;
      const current = () => generation === this.generation && this.player === player;
      const onError = () => { if (current()) { this.destroyPlayer(); this.onState("error"); } };
      const restore = () => {
        if (!current() || ready || this.video.readyState < 1) return;
        if (resumeAt > 0 && !Array.from({ length: this.video.buffered.length }, (_, i) => i)
          .some(i => resumeAt >= this.video.buffered.start(i) - 0.25 && resumeAt < this.video.buffered.end(i))) return;
        ready = true;
        try {
          if (resumeAt > 0) player.currentTime = resumeAt;
          this.onState("ready");
          if (autoPlay) player.play()?.catch(() => undefined);
        } catch { onError(); }
      };
      player.on(mpegts.Events.ERROR, onError);
      this.video.addEventListener("error", onError);
      this.video.addEventListener("loadedmetadata", restore);
      this.video.addEventListener("progress", restore);
      this.removeListeners = () => {
        player.off(mpegts.Events.ERROR, onError);
        this.video.removeEventListener("error", onError);
        this.video.removeEventListener("loadedmetadata", restore);
        this.video.removeEventListener("progress", restore);
      };
      player.attachMediaElement(this.video);
      player.load();
    } catch { if (generation === this.generation) { this.destroyPlayer(); this.onState("error"); } }
  }

  dispose() {
    ++this.generation;
    this.destroyPlayer();
  }

  private destroyPlayer() {
    this.removeListeners?.();
    this.removeListeners = null;
    const player = this.player;
    this.player = null;
    // A partially attached player can throw during teardown. Still clear ownership.
    try { player?.destroy(); } catch { /* The error state/fallback remains usable. */ }
  }
}
