"use client";

import * as React from "react";
import { VideoSessionController, type VideoSessionClip, type VideoSessionState } from "./videoSession";
import { cn } from "./utils";

export type { VideoSessionClip, VideoSessionState } from "./videoSession";

export interface VideoSessionPlayerProps {
  clips: readonly VideoSessionClip[];
  /** Localized accessible name for the native video controls. */
  label: string;
  /** Localized empty, unsupported-browser, invalid-data, or playback-error UI. */
  fallback?: React.ReactNode;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

// Keep the browser-only UMD module out of SSR and out of initial UI evaluation.
async function loadMpegts() {
  return (await import("mpegts.js")).default;
}

export function VideoSessionPlayer({ clips, label, fallback = null, className, autoPlay = false, muted = false }: VideoSessionPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controllerRef = React.useRef<VideoSessionController | null>(null);
  const [state, setState] = React.useState<VideoSessionState>("loading");

  React.useEffect(() => {
    if (!videoRef.current) return;
    const controller = new VideoSessionController(videoRef.current, loadMpegts, setState);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    // The controller compares content, so background polling with a new array
    // does not rebuild an unchanged session or retry an already failed one.
    void controllerRef.current?.update(clips, autoPlay);
  }, [clips, autoPlay]);

  const showVideo = state === "loading" || state === "ready";
  return (
    <div className={cn("w-full", className)} data-flap-video-session-state={state}>
      <video
        ref={videoRef}
        aria-label={label}
        className={showVideo ? "block w-full" : "hidden"}
        controls
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload="metadata"
        muted={muted}
      />
      {!showVideo && fallback}
    </div>
  );
}
