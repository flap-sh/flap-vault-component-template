import { useEffect, useMemo, useRef, useState } from "react";
import { createDrivingAudio } from "./audioPlayback";

// Audio elements use bundled assets only. Playback begins from a visible user action.
export function useDrivingSound() {
  const music = useRef<HTMLAudioElement>(null);
  const siren = useRef<HTMLAudioElement>(null);
  const engine = useRef<HTMLAudioElement>(null);
  const tires = useRef<HTMLAudioElement>(null);
  const impact = useRef<HTMLAudioElement>(null);
  const checkpoint = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const controls = useMemo(() => {
    const refs = { music, siren, engine, tires, impact, checkpoint };
    return createDrivingAudio((name) => refs[name].current, setEnabled, setFailed);
  }, []);
  useEffect(() => controls.pause, [controls]);
  return { music, siren, engine, tires, impact, checkpoint, enabled, failed, ...controls };
}
