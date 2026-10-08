# Vault UI and Mini App audio

Ordinary Vault UI (mode omitted) and Mini Apps with `manifest.mode: "mini-app"` may include background music and sound effects. Mini App token-only bindings must use either all `7777` Tax Tokens or all `8888` zero-tax tokens. Audio does not require `three-r3f-v1` or a new SDK API; it also works in a 3D Mini App.

Mode-less ordinary Vault UI packages use the same audio rules, including ordinary 2D and 3D Vaults. Ordinary Vault risk-status, binding and contract-call rules remain required.

The playback snippet below is an audio-only fragment: ordinary Vault components must also render host-derived risk status before media, including an Alert for missing risk data. The template provides a complete `audio-example` component.

## Source package

Place lowercase `.mp3`, `.wav`, `.ogg`, `.m4a`, or `.aac` files directly beside `Component.tsx`. Use static imports such as `import shotUrl from "./shot.wav"`. Each file must be non-empty and at most 5 MiB; all packaged audio together must be at most 12 MiB. Nested audio folders, symlinks, remote audio, and source-authored data URLs remain blocked.

Audio files are included in the source-package inventory and hashed as raw binary bytes. Reports expose `review.audioAssets` and retain `review.miniAppAudioAssets` as a compatibility alias for historical consumers. The template checker and Workbench preserve `manual-review/mini-app-audio-asset` warnings for source/license, playback timing, controls, fallback, and mobile impact. Passing automated checks does not clear this review.

## Playback

Use a component-owned `<audio>` element with a React ref. Start playback in a user click/tap handler, keep visible pause/mute controls, handle rejected playback and decoding errors, and pause the player when the component unmounts. Avoid hidden autoplay. A short sound can reset `currentTime` to replay when the player is ready.

```tsx
import { useEffect, useRef, useState } from "react";
import { useFlapSdk } from "@/src/sdk";
import shotUrl from "./shot.wav";

export default function Component() {
  const { i18n } = useFlapSdk();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  const playShot = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError(false);
    if (audio.readyState >= 1) audio.currentTime = 0;
    void audio.play().catch(() => setAudioError(true));
  };

  return (
    <div className="min-h-screen">
      <audio
        ref={audioRef}
        src={shotUrl}
        controls
        preload="metadata"
        onError={() => setAudioError(true)}
      />
      <button type="button" onClick={playShot}>
        {i18n.t("audio.playEffect")}
      </button>
      {audioError ? <p role="alert">{i18n.t("audio.unavailable")}</p> : null}
    </div>
  );
}
```

Add `audio.playEffect` and `audio.unavailable` to every locale in `i18n.json`. Keep gameplay available if audio cannot play. For BGM, `loop` is allowed, but playback must still begin with user interaction and expose pause/mute controls. Prefetch choices and simultaneous sound counts need mobile review.

## Final artifact

Workbench uses the same audio handling in write-free bundle validation and final builds. Imported audio emits as `assets/<sha256>.<ext>`; `metadata.json` lists its path, bytes, SHA-256, and audio MIME type. Publish and serve the declared asset set with the final artifact.

The built URL resolves against the host-injected `__FLAP_VAULT_ARTIFACT_COMPONENT_URL__` when the verified component loads through a Blob URL, and against HTTP `import.meta.url` in direct Workbench preview. Audio uses `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4`, or `audio/aac` according to its extension.

Authors must rerun the template check, E2E, package, and verification workflow after adding audio. Workbench must build a new artifact from that package. An old immutable artifact path does not acquire audio after the platform update.

## Ordinary Vault example and compatibility

The template registers `/audio-example`. Its `chime.wav` is an original one-second 660 Hz sine tone with a sine-squared amplitude envelope, mono 22,050 Hz / 16-bit PCM (44,144 bytes), generated locally without samples or external assets and distributed under the template MIT license. Playback starts only on a click, supports pause, mute and repeat, catches playback failures, and pauses on unmount. The public 7777 token binding is preview evidence only, not a new production mapping or a claim about project contract behavior.

This example uses the read-only information pattern in both market phases. It performs no contract reads or writes of its own, renders host-derived risk status (or a missing-risk warning), and shows a wrong-network notice without blocking local playback. Audio remains review-required.

`manual-review/mini-app-audio-asset`, the historical size/path rule IDs, `allowedMiniAppAudioAssets`, and `review.miniAppAudioAssets` retain their existing names for compatibility and now apply to both modes. New report consumers can read `review.audioAssets`. Source package format and SDK/runtime APIs do not change. Deploy the Workbench change before distributing ordinary Vault packages containing audio.
