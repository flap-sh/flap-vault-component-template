"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { createConsumerVideoSessionReader } from "../sdk/videoSession";
import { useFlapSdk } from "../sdk/runtimeStore";
import type { Address } from "../sdk/types";
import { Button } from "./Button";
import { Input } from "./Input";
import { cn } from "./utils";
import { ConsumerVideoSession, VIDEO_PICKER_PAGE_SIZE, VIDEO_SESSION_POLL_MS, videoClipPosition, type ConsumerVideoSnapshot } from "./consumerVideoSession";
import { VideoSessionController, type VideoSessionState } from "./videoSession";
import { videoPlayerMessages } from "./videoPlayerMessages";

export interface ConsumerVideoSessionPlayerProps {
  consumer: Address;
  /** Zero-based clip index. Negative indices count back from the current end. */
  startClip?: number;
  label: string;
  fallback?: React.ReactNode;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

const initialSnapshot: ConsumerVideoSnapshot = { sessionId: 0, state: "loading", total: 0, start: 0, clips: [], revision: 0, resumeAt: 0, play: false, refreshFailed: false, preservePosition: false, firstPtsMs: 0n, endPtsMs: 0n, mediaStartPtsMs: 0n, mediaStartIndex: 0, mediaVideoCid: "" };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function ConsumerVideoSessionPlayer({ consumer, startClip = 0, label, fallback = null, className, autoPlay = false, muted = false }: ConsumerVideoSessionPlayerProps) {
  const sdk = useFlapSdk();
  const { chainId } = sdk.context;
  const readContractRef = React.useRef(sdk.readContract);
  readContractRef.current = sdk.readContract;
  // Host polling can replace SDK callbacks without changing this movie/session.
  const reader = React.useMemo(() => createConsumerVideoSessionReader({
    context: { chainId }, readContract: (request) => readContractRef.current(request),
  }, consumer), [chainId, consumer]);
  const sessionRef = React.useRef<ConsumerVideoSession | null>(null);
  const controllerRef = React.useRef<VideoSessionController | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const playIntent = React.useRef(autoPlay);
  const autoPlayRef = React.useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [mediaState, setMediaState] = React.useState<VideoSessionState>("loading");
  const [time, setTime] = React.useState(0);
  const [paused, setPaused] = React.useState(true);
  const [isMuted, setIsMuted] = React.useState(muted);
  const [volume, setVolume] = React.useState(1);
  React.useEffect(() => { setIsMuted(muted); }, [muted]);
  const [buffering, setBuffering] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [jump, setJump] = React.useState("");
  const position = videoClipPosition(snapshot.clips, time, snapshot.mediaStartPtsMs);
  const duration = Number(snapshot.endPtsMs - snapshot.firstPtsMs) / 1000;
  const globalTime = Math.max(0, Math.min(duration, Number(snapshot.mediaStartPtsMs - snapshot.firstPtsMs) / 1000 + time));
  const activeIndex = position?.index ?? snapshot.start;
  const strings = videoPlayerMessages[sdk.i18n.locale.split("-")[0] as keyof typeof videoPlayerMessages] ?? videoPlayerMessages.en;
  const text = (key: keyof typeof videoPlayerMessages.en, params?: Record<string, number>) => sdk.i18n.t(`runtime.video.${key}`, strings[key], params);

  React.useEffect(() => {
    const session = new ConsumerVideoSession(reader, setSnapshot);
    sessionRef.current = session;
    setSnapshot(initialSnapshot);
    setTime(0);
    playIntent.current = autoPlayRef.current;
    void session.refresh(startClip, autoPlayRef.current);
    const timer = window.setInterval(() => { void session.refresh(); }, VIDEO_SESSION_POLL_MS);
    return () => { window.clearInterval(timer); void controllerRef.current?.update([]); session.dispose(); sessionRef.current = null; };
  }, [reader, startClip]);

  React.useEffect(() => {
    if (!videoRef.current) return;
    const controller = new VideoSessionController(videoRef.current, async () => (await import("mpegts.js")).default, setMediaState);
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = null; };
  }, []);

  React.useEffect(() => {
    const controller = controllerRef.current;
    const session = sessionRef.current;
    if (!controller || !session) return;
    if (snapshot.state !== "ready") {
      if (!snapshot.clips.length) void controller.update([]);
      return;
    }
    setTime(snapshot.resumeAt);
    void controller.updateContinuous({
      revision: snapshot.revision, startIndex: snapshot.mediaStartIndex, startPtsMs: snapshot.mediaStartPtsMs,
      firstVideoCid: snapshot.mediaVideoCid, resumeAt: snapshot.resumeAt,
      readClip: (index, signal) => session.readClip(index, signal), playIntent: () => playIntent.current,
    }, snapshot.play, snapshot.resumeAt);
    // Metadata windows and tail growth do not change the media stream's origin/revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.sessionId, snapshot.revision, snapshot.state]);

  React.useEffect(() => { setPage(Math.floor(activeIndex / VIDEO_PICKER_PAGE_SIZE)); }, [activeIndex]);

  const advance = () => {
    const video = videoRef.current;
    const current = videoClipPosition(snapshot.clips, video?.currentTime ?? 0, snapshot.mediaStartPtsMs);
    if (video && current && (current.index >= snapshot.start + snapshot.clips.length - 2 || video.ended)) {
      void sessionRef.current?.advance(current.index);
    }
  };

  // Growth only updates length. Fetch the newly needed tail if the viewer is there.
  React.useEffect(() => {
    const video = videoRef.current;
    const current = videoClipPosition(snapshot.clips, video?.currentTime ?? 0, snapshot.mediaStartPtsMs);
    if (video && current && (current.index >= snapshot.start + snapshot.clips.length - 2 || video.ended)) void sessionRef.current?.advance(current.index);
  }, [snapshot.total, snapshot.start, snapshot.clips, snapshot.mediaStartPtsMs]);

  function seek(index: number) {
    const video = videoRef.current;
    const play = video ? !video.paused || (video.ended && playIntent.current) : playIntent.current;
    void sessionRef.current?.seek(index, 0, play);
  }

  const state = snapshot.state === "ready" ? mediaState : snapshot.state;
  // Keep the native fullscreen element visible while an explicit seek reloads.
  const showVideo = state === "loading" || state === "ready";
  const first = page * VIDEO_PICKER_PAGE_SIZE;
  const count = Math.max(0, Math.min(VIDEO_PICKER_PAGE_SIZE, snapshot.total - first));
  return (
    <div className={cn("w-full min-w-0 space-y-3", className)} data-flap-video-session-state={state} data-flap-video-consumer={consumer} data-flap-video-window-start={snapshot.start} data-flap-video-window-size={snapshot.clips.length} data-flap-video-global-time={globalTime} data-flap-video-media-revision={snapshot.revision}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((event.target as HTMLElement).tagName)) return;
        const video = videoRef.current;
        if (!video) return;
        if (event.key === " ") { event.preventDefault(); if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
        if (event.key.toLowerCase() === "m") { event.preventDefault(); video.muted = !video.muted; }
        if (event.key.toLowerCase() === "n") { event.preventDefault(); seek(activeIndex + 1); }
        if (event.key.toLowerCase() === "p") { event.preventDefault(); seek(Math.max(0, activeIndex - 1)); }
      }}>
      <div ref={frameRef} className="relative overflow-hidden rounded-lg border border-[#303236] bg-black [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen>video]:h-0 [&:fullscreen>video]:min-h-0 [&:fullscreen>video]:flex-1 [&:fullscreen>video]:aspect-auto">
        <video ref={videoRef} aria-label={label} playsInline disablePictureInPicture disableRemotePlayback preload="metadata" muted={isMuted} tabIndex={0}
          className={showVideo ? "block aspect-video w-full object-contain" : "hidden"}
          onTimeUpdate={() => { setTime(videoRef.current?.currentTime ?? 0); advance(); }}
          onPlay={() => { playIntent.current = true; setPaused(false); }}
          onPause={() => { setPaused(true); if (!videoRef.current?.ended && mediaState === "ready") playIntent.current = false; }}
          onVolumeChange={() => { if (videoRef.current) { setIsMuted(videoRef.current.muted); setVolume(videoRef.current.volume); } }}
          onEnded={() => advance()} onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onPlaying={() => setBuffering(false)} />
        {(state === "loading" || buffering && showVideo) && <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm text-white" role="status">{text(state === "loading" ? "loading" : "buffering")}</p>}
        {!showVideo && <div className="p-4">{fallback}</div>}
        {showVideo && snapshot.total > 0 && <div className="space-y-2 border-t border-[#303236] bg-black p-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" aria-label={text(paused ? "play" : "pause")} onClick={() => {
              const video = videoRef.current;
              if (video) { if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
            }}>{paused ? <Play aria-hidden="true" className="h-4 w-4" /> : <Pause aria-hidden="true" className="h-4 w-4" />}</Button>
            <span className="flex-1 text-xs text-white" aria-label={text("timeline")} data-flap-video-time>{clock(globalTime)} / {clock(duration)}</span>
            <Button type="button" variant="ghost" aria-label={text(isMuted ? "unmute" : "mute")} onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}>
              {isMuted ? <VolumeX aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
            </Button>
            <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} aria-label={text("volume")} className="w-16 accent-[#D0FF00]" onChange={event => {
              if (videoRef.current) { videoRef.current.volume = Number(event.target.value); videoRef.current.muted = Number(event.target.value) === 0; }
            }} />
            <Button type="button" variant="ghost" aria-label={text("fullscreen")} onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
              else void frameRef.current?.requestFullscreen?.().catch(() => undefined);
            }}><Maximize aria-hidden="true" className="h-4 w-4" /></Button>
          </div>
          <input type="range" min={0} max={duration} step={0.05} value={globalTime} disabled={state !== "ready"} aria-label={text("timelineSeek")}
            className="block min-h-6 w-full accent-[#D0FF00]" onChange={event => {
              const video = videoRef.current;
              const play = video ? !video.paused || (video.ended && playIntent.current) : playIntent.current;
              void sessionRef.current?.seekTime(Number(event.target.value), play);
            }} />
        </div>}
      </div>
      {snapshot.total > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#D4D4D4]">
            <span role="status">{text("position", { index: activeIndex + 1, total: snapshot.total })}</span>
            <span>{clock(position?.time ?? 0)} / {clock(position?.duration ?? 0)}</span>
          </div>
          <input type="range" aria-label={text("time")} min={0} max={position?.duration ?? 0} step={0.05} value={position?.time ?? 0} disabled={!position || state !== "ready"}
            className="block min-h-6 w-full accent-[#D0FF00]" onChange={(event) => {
              const video = videoRef.current;
              const clip = snapshot.clips.find((item) => item.index === activeIndex);
              if (video && clip) { video.currentTime = Number(clip.startPtsMs - snapshot.mediaStartPtsMs) / 1000 + Number(event.target.value); setTime(video.currentTime); }
            }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={activeIndex === 0} onClick={() => seek(0)} aria-label={text("first")}><SkipBack aria-hidden="true" className="h-4 w-4" />{text("first")}</Button>
            <Button type="button" variant="outline" disabled={activeIndex === 0} onClick={() => seek(activeIndex - 1)} aria-label={text("previous")}><ChevronLeft aria-hidden="true" className="h-4 w-4" />{text("previous")}</Button>
            <Button type="button" variant="outline" disabled={activeIndex >= snapshot.total - 1} onClick={() => seek(activeIndex + 1)} aria-label={text("next")}>{text("next")}<ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" disabled={activeIndex >= snapshot.total - 1} onClick={() => seek(-1)} aria-label={text("latest")}>{text("latest")}<SkipForward aria-hidden="true" className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
            {Array.from({ length: count }, (_, offset) => first + offset).map((index) => <button key={index} type="button" aria-label={text("clip", { index: index + 1 })} aria-pressed={index === activeIndex}
              className={cn("min-h-11 min-w-11 rounded-md border px-2 text-sm", index === activeIndex ? "border-[#D0FF00] bg-[#D0FF00] text-black" : "border-[#303236] bg-[#171717] text-white hover:border-[#D0FF00]", "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D0FF00]")}
              onClick={() => seek(index)}>{index + 1}</button>)}
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (Number.isSafeInteger(Number(jump)) && Number(jump) >= 1 && Number(jump) <= snapshot.total) seek(Number(jump) - 1); }}>
            <label className="min-w-0 flex-1 space-y-1 text-xs text-[#84888C]"><span>{text("jump")}</span><Input type="number" min={1} max={snapshot.total} step={1} value={jump} onChange={(event) => setJump(event.target.value)} /></label>
            <Button type="submit" variant="outline" disabled={!Number.isSafeInteger(Number(jump)) || Number(jump) < 1 || Number(jump) > snapshot.total}>{text("go")}</Button>
          </form>
          {snapshot.total > VIDEO_PICKER_PAGE_SIZE && <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={page === 0} onClick={() => setPage((value) => value - 1)} aria-label={text("previousPage")}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button>
            <span className="text-xs text-[#84888C]">{text("page", { first: first + 1, last: first + count, total: snapshot.total })}</span>
            <Button type="button" variant="ghost" disabled={first + count >= snapshot.total} onClick={() => setPage((value) => value + 1)} aria-label={text("nextPage")}><ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
          </div>}
        </>
      )}
      {snapshot.refreshFailed && <p className="text-sm text-[#FFB35C]" role="status">{text("refreshFailed")}</p>}
      {(snapshot.refreshFailed || state === "error" || state === "invalid") && <Button type="button" variant="outline" onClick={() => { if (snapshot.total) seek(activeIndex); else void sessionRef.current?.refresh(startClip, playIntent.current); }}>{text("retry")}</Button>}
    </div>
  );
}
