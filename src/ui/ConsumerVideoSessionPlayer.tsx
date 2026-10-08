"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { createConsumerVideoSessionReader, type ConsumerVideoClip } from "../sdk/videoSession";
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

const initialSnapshot: ConsumerVideoSnapshot = { state: "loading", total: 0, start: 0, clips: [], revision: 0, resumeAt: 0, play: false, refreshFailed: false, preservePosition: false };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function ConsumerVideoSessionPlayer({ consumer, startClip = 0, label, fallback = null, className, autoPlay = false, muted = false }: ConsumerVideoSessionPlayerProps) {
  const sdk = useFlapSdk();
  const { chainId } = sdk.context;
  const readContract = sdk.readContract;
  const reader = React.useMemo(() => createConsumerVideoSessionReader({ context: { chainId }, readContract }, consumer), [chainId, readContract, consumer]);
  const sessionRef = React.useRef<ConsumerVideoSession | null>(null);
  const controllerRef = React.useRef<VideoSessionController | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const previousWindow = React.useRef<readonly ConsumerVideoClip[]>([]);
  const playIntent = React.useRef(autoPlay);
  const autoPlayRef = React.useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const [snapshot, setSnapshot] = React.useState(initialSnapshot);
  const [mediaState, setMediaState] = React.useState<VideoSessionState>("loading");
  const [time, setTime] = React.useState(0);
  const [buffering, setBuffering] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [jump, setJump] = React.useState("");
  const position = videoClipPosition(snapshot.clips, time);
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
    return () => { window.clearInterval(timer); session.dispose(); sessionRef.current = null; };
  }, [reader, startClip]);

  React.useEffect(() => {
    if (!videoRef.current) return;
    const controller = new VideoSessionController(videoRef.current, async () => (await import("mpegts.js")).default, setMediaState);
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = null; };
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    const previous = previousWindow.current;
    let resumeAt = snapshot.resumeAt;
    let play = snapshot.play;
    if (snapshot.preservePosition && previous.length && snapshot.clips.length && video) {
      // Capture the live position after the metadata request finishes, not before it.
      resumeAt = Math.max(0, video.currentTime - Number(snapshot.clips[0].startPtsMs - previous[0].startPtsMs) / 1000);
      play = !video.paused || (video.ended && playIntent.current);
    }
    previousWindow.current = snapshot.clips;
    setTime(resumeAt);
    void controllerRef.current?.update(snapshot.clips, play, { revision: snapshot.revision, resumeAt });
  }, [snapshot.clips, snapshot.revision, snapshot.resumeAt, snapshot.play, snapshot.preservePosition]);

  React.useEffect(() => { setPage(Math.floor(activeIndex / VIDEO_PICKER_PAGE_SIZE)); }, [activeIndex]);

  const advance = () => {
    const video = videoRef.current;
    const current = videoClipPosition(snapshot.clips, video?.currentTime ?? 0);
    if (video && current && (current.index >= snapshot.start + snapshot.clips.length - 2 || video.ended)) {
      void sessionRef.current?.advance(current.index);
    }
  };

  // Growth only updates length. Fetch the newly needed tail if the viewer is there.
  React.useEffect(() => {
    const video = videoRef.current;
    const current = videoClipPosition(snapshot.clips, video?.currentTime ?? 0);
    if (video && current && (current.index >= snapshot.start + snapshot.clips.length - 2 || video.ended)) void sessionRef.current?.advance(current.index);
  }, [snapshot.total, snapshot.start, snapshot.clips]);

  function seek(index: number) {
    const video = videoRef.current;
    const play = video ? !video.paused || (video.ended && playIntent.current) : playIntent.current;
    void sessionRef.current?.seek(index, 0, play);
  }

  const state = snapshot.state === "ready" ? mediaState : snapshot.state;
  const showVideo = snapshot.clips.length > 0 && (state === "ready" || state === "loading");
  const first = page * VIDEO_PICKER_PAGE_SIZE;
  const count = Math.max(0, Math.min(VIDEO_PICKER_PAGE_SIZE, snapshot.total - first));
  return (
    <div className={cn("w-full min-w-0 space-y-3", className)} data-flap-video-session-state={state} data-flap-video-consumer={consumer} data-flap-video-window-start={snapshot.start} data-flap-video-window-size={snapshot.clips.length}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((event.target as HTMLElement).tagName)) return;
        const video = videoRef.current;
        if (!video) return;
        if (event.key === " ") { event.preventDefault(); if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
        if (event.key.toLowerCase() === "m") { event.preventDefault(); video.muted = !video.muted; }
        if (event.key.toLowerCase() === "n") { event.preventDefault(); seek(activeIndex + 1); }
        if (event.key.toLowerCase() === "p") { event.preventDefault(); seek(Math.max(0, activeIndex - 1)); }
      }}>
      <div className="relative overflow-hidden rounded-lg border border-[#303236] bg-black">
        <video ref={videoRef} aria-label={label} controls playsInline disablePictureInPicture disableRemotePlayback preload="metadata" muted={muted}
          className={showVideo ? "block aspect-video w-full object-contain" : "hidden"}
          onTimeUpdate={() => { setTime(videoRef.current?.currentTime ?? 0); advance(); }}
          onPlay={() => { playIntent.current = true; }}
          onPause={() => { if (!videoRef.current?.ended && mediaState === "ready") playIntent.current = false; }}
          onEnded={() => advance()} onWaiting={() => setBuffering(true)} onStalled={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onPlaying={() => setBuffering(false)} />
        {(state === "loading" || buffering && showVideo) && <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm text-white" role="status">{text(state === "loading" ? "loading" : "buffering")}</p>}
        {!showVideo && state !== "loading" && <div className="p-4">{fallback}</div>}
        {!showVideo && state === "loading" && <div className="aspect-video" />}
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
              if (video && clip) { video.currentTime = Number(clip.startPtsMs - snapshot.clips[0].startPtsMs) / 1000 + Number(event.target.value); setTime(video.currentTime); }
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
