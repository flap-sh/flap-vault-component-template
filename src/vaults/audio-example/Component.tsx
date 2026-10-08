"use client";

import { useEffect, useRef, useState } from "react";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/src/ui";
import chimeUrl from "./chime.wav";

export default function AudioExample() {
  const { context, i18n, wallet } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskLabel = riskLevel === null ? i18n.t("risk.missing") : `${i18n.t("risk.current")}: ${riskLevel}`;
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      requestRef.current += 1;
      audio?.pause();
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++requestRef.current;
    if (playing) {
      audio.pause();
      return;
    }
    setUnavailable(false);
    void audio.play().then(() => {
      if (requestRef.current !== request) audio.pause();
    }).catch(() => {
      if (requestRef.current === request) setUnavailable(true);
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <StatusBadge>{riskLabel}</StatusBadge>
        {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
        <CardTitle>{i18n.t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {wallet.isWrongNetwork ? <Alert>{i18n.t("wallet.wrongNetwork", undefined, { chain: wallet.requiredChainLabel })}</Alert> : null}
        <p className="text-sm text-white/60">{i18n.t("description")}</p>
        <audio
          ref={audioRef}
          src={chimeUrl}
          preload="metadata"
          muted={muted}
          loop={repeat}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => { setPlaying(false); setUnavailable(true); }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={togglePlayback}>{i18n.t(playing ? "pause" : "play")}</Button>
          <Button type="button" variant="secondary" aria-pressed={muted} onClick={() => setMuted(!muted)}>
            {i18n.t(muted ? "unmute" : "mute")}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
            {i18n.t("repeat")}
          </label>
        </div>
        {unavailable ? <Alert>{i18n.t("unavailable")}</Alert> : null}
      </CardContent>
    </Card>
  );
}
