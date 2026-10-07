import type { Drive } from "./driving";

const LOOPS = ["music", "engine", "tires", "siren"] as const;
const TRACKS = [...LOOPS, "impact", "checkpoint"] as const;
export type AudioTrack = typeof TRACKS[number];
export type AudioPlayer = Pick<HTMLAudioElement, "play" | "pause" | "volume" | "muted" | "currentTime">;

export function soundMix(drive: Drive) {
  const speed = Math.min(1, Math.abs(drive.speed) / 32);
  const active = drive.phase === "playing";
  const siren = 0.38 * (1 - Math.min(1, Math.hypot(drive.x - drive.police.x, drive.z - drive.police.z) / 90));
  return {
    music: active ? drive.police.active ? 0.06 : drive.impactAge < 0.6 ? 0.085 : 0.15 : 0,
    engine: active ? 0.12 + Math.floor(speed * 4) * 0.05 + (drive.boosting ? 0.07 : 0) : 0,
    tires: active && drive.skid > 0.25 ? drive.skid > 0.65 ? 0.24 : 0.12 : 0,
    siren: active && drive.police.active ? Math.max(0.04, Math.ceil(siren / 0.08) * 0.08) : 0,
  };
}

// Keep desired state in JS instead of reading media properties every frame.
export function createSoundWriter() {
  const previous = new WeakMap<AudioPlayer, { volume: number; muted: boolean }>();
  return (audio: AudioPlayer, volume: number) => {
    const cached = previous.get(audio);
    const muted = volume === 0;
    if (cached?.volume === volume && cached.muted === muted) return;
    if (cached?.volume !== volume) audio.volume = volume;
    if (cached?.muted !== muted) audio.muted = muted;
    previous.set(audio, { volume, muted });
  };
}

export function createDrivingAudio(
  getPlayer: (name: AudioTrack) => AudioPlayer | null,
  onEnabled: (enabled: boolean) => void,
  onFailed: (failed: boolean) => void,
) {
  const write = createSoundWriter();
  const wanted: Record<AudioTrack, boolean> = { music: false, engine: false, tires: false, siren: false, impact: false, checkpoint: false };
  let enabled = false;
  let running = false;
  let generation = 0;
  let lastMix = -Infinity;

  const pause = () => {
    running = false;
    generation++;
    for (const name of TRACKS) {
      wanted[name] = false;
      getPlayer(name)?.pause();
    }
  };
  const fail = () => {
    enabled = false;
    onEnabled(false);
    onFailed(true);
    pause();
  };
  const play = (name: AudioTrack, audio: AudioPlayer) => {
    const epoch = generation;
    void audio.play().then(() => {
      // A late play promise must respect a newer mute, pause or unmount.
      if (!wanted[name] || getPlayer(name) !== audio) audio.pause();
    }).catch((error: unknown) => {
      if (generation === epoch && !(error instanceof Error && error.name === "AbortError")) fail();
    });
  };
  const begin = () => {
    if (!enabled) return;
    running = true;
    generation++;
    lastMix = -Infinity;
    for (const name of TRACKS) {
      const audio = getPlayer(name);
      wanted[name] = name === "music" || name === "engine";
      if (!audio) continue;
      write(audio, name === "music" ? 0.15 : name === "engine" ? 0.12 : 0);
      // Unlock each bundled element within the Start/Resume user gesture.
      // Idle effects are paused as soon as playback starts, not kept looping.
      play(name, audio);
    }
  };
  const start = () => {
    pause();
    enabled = true;
    onEnabled(true);
    onFailed(false);
    const music = getPlayer("music");
    if (music) music.currentTime = 0;
    begin();
  };
  const toggle = (playing: boolean) => {
    enabled = !enabled;
    onEnabled(enabled);
    onFailed(false);
    if (enabled && playing) begin();
    else pause();
  };
  const oneShot = (name: "impact" | "checkpoint", volume: number) => {
    const audio = getPlayer(name);
    if (!audio) return;
    wanted[name] = true;
    audio.currentTime = 0;
    write(audio, volume);
    play(name, audio);
  };
  const tick = (drive: Drive, previousBumps: number, previousCheckpoint: number) => {
    if (!enabled) return;
    if (drive.phase !== "playing") {
      if (drive.phase !== "complete") { if (running) pause(); return; }
      if (running) {
        running = false;
        for (const name of LOOPS) {
          wanted[name] = false;
          getPlayer(name)?.pause();
        }
      }
    }
    // Event cues stay immediate, including the last checkpoint on completion.
    if (drive.bumps > previousBumps) oneShot("impact", 0.22 + drive.impact * 0.35);
    if (drive.checkpoint > previousCheckpoint) oneShot("checkpoint", 0.35);
    if (drive.phase !== "playing" || drive.elapsed - lastMix < 0.2) return;
    lastMix = drive.elapsed;
    const mix = soundMix(drive);
    for (const name of LOOPS) {
      const audio = getPlayer(name);
      if (!audio) continue;
      const active = mix[name] > 0;
      // Native-speed clips avoid repeatedly reconfiguring Safari's media rate.
      write(audio, mix[name]);
      if (wanted[name] === active) continue;
      wanted[name] = active;
      if (active) play(name, audio);
      else audio.pause();
    }
  };
  return { start, begin, pause, toggle, tick, fail };
}
