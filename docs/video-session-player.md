# Consumer video session player

`VideoSessionPlayer` from `@/src/ui` plays the continuous MPEG-TS sequence that FlapAIProvider stores for a consumer address. A consumer may be a Vault or a separate contract for one movie. Each player follows that address independently.

```tsx
import { VideoSessionPlayer } from "@/src/ui";

<VideoSessionPlayer
  consumer={consumerAddress}
  label={i18n.t("video.label")}
  fallback={<p>{i18n.t("video.unavailable")}</p>}
/>

// Start from the last clip currently available:
<VideoSessionPlayer consumer={consumerAddress} startClip={-1}
  label={i18n.t("video.label")} fallback={<p>{i18n.t("video.unavailable")}</p>} />
```

Only `consumer` supplies session data. The player consumes the shared SDK context, selects the current chain's built-in provider, and owns its minimal read-only ABI. Do not pass an SDK instance, provider address, RPC, ABI, URL, gateway, or loader. No manifest capability or `externalContracts` declaration is needed for this built-in path. Chains 56 and 97 are currently configured; other chains show the supplied fallback. Zero/invalid addresses are rejected before any contract call. A valid address with no clips shows the empty fallback.

Add `video.label` and `video.unavailable` to every declared locale in the Vault's `i18n.json`. Keep the current host-derived risk status before media in ordinary Vault UI. Built-in controls have English, Chinese and Korean defaults; optional `runtime.video.*` i18n keys can override them.

## Initial position and seeking

`startClip` defaults to `0` and uses zero-based indices: `499` starts at the 500th clip. Negative indices count backwards from the current end (`-1` = last, `-2` = second-last). Out-of-range integer indices clamp to the first/last available clip. Fractional or non-finite values are invalid. Negative indices resolve on the first non-empty load, once; periodic refresh never jumps the viewer to a newly appended clip. Changing `consumer`, runtime chain or `startClip` explicitly starts the corresponding session/position again.

The player reads length first, then at most **four clips starting at the selected clip**. Seeking to clip 500 passes clips 500–503 to mpegts.js and never fetches or passes clips 1–499. Explicit seek immediately tears down the previous media loader. Rapid selections ignore stale async results. The metadata cache holds at most 128 clips; it is not a whole-session cache.

The clip picker shows at most 20 buttons per page. First/previous/next/latest controls and a direct one-based clip-number input support long sessions. A separate scrubber seeks within the current clip. Native video controls provide play/pause, mute/volume and fullscreen; their duration bar describes the loaded window, not a synthesized whole-session MP4. Keyboard shortcuts while video controls have focus are Space (play/pause), M (mute), N/P (next/previous clip).

During playback the window rolls forward near its end, reusing cached overlap and reading only missing metadata. `startPtsMs` differences determine clip boundaries, including variable durations; large absolute timestamps remain `bigint`. The player keeps the same video element and preserves play/pause, audio settings and current position across window replacement. The replacement can briefly buffer. Seek restoration waits for metadata and the target bytes. Browser/device fullscreen behavior still needs target-device testing.

Length polling runs every eight seconds. An unchanged session does not reread clip metadata or rebuild media. Appended clips become available without resetting the selected position. When the viewer reaches the tail, newly available clips can extend the rolling window. Refresh failure keeps existing playback available with a localized warning/retry control. Empty, invalid, unsupported-browser/chain and playback-error states use the supplied fallback.

Autoplay defaults to off; `autoPlay` and `muted` are optional. Browsers may reject autoplay; native controls remain available. Unmount, address/chain changes, clearing data and playback failures tear down players/listeners. Late imports and contract responses cannot revive a removed session.

## Existing clips API

The existing API remains supported, including use outside the shared SDK context:

```tsx
<VideoSessionPlayer clips={orderedClips} label={i18n.t("video.label")}
  fallback={<p>{i18n.t("video.unavailable")}</p>} />
```

Each clip contains `{ videoCid: string, durationMs: number }`. Choose either `consumer` or `clips`; never pass both. The legacy mode accepts the supplied ordered list without consumer polling or the paged picker. Equivalent arrays do not rebuild media; append restores position and pause/play intent. Replacing, reordering or shortening starts a new timeline. For large provider sessions, use consumer mode to avoid building an unbounded list.

**Keep durations in milliseconds.** `mpegts.js@1.8.2` `MediaSegment.duration` and the provider's `durationMs` both use milliseconds. Only media currentTime and seek positions use seconds. Do not copy the demo's division by 1000 into segment metadata. The provider ABI uses `uint8 referenceType`, not the older boolean shape.

CIDs are validated and turned into HTTPS URLs by the existing Flap gateway resolver. URLs, paths, query strings and malformed CIDs are rejected. The gateway must support CORS. Runtime owns the pinned lazy browser-only mpegts chunk, disables workers and credentials, and uses no-referrer requests. SSR never evaluates mpegts. Browser MSE/Managed Media Source and the clip codecs must be supported; runtime does not transcode. Direct mpegts imports, arbitrary remote video URLs and decoder/CDN configuration remain outside the Vault source boundary.

## SDK helpers and validation

`@/src/sdk` also exports `readVideoSessionLength`, `readVideoSessionSlice` (1–50 clips) and `createConsumerVideoSessionReader` for paginated data views. They call the host's existing `sdk.readContract` and add no required host SDK methods. Provider addresses are runtime-owned in `src/sdk/hostRuntimeConfig.ts`:

| Chain | Provider |
| --- | --- |
| BNB 56 | `0xaEe3a7Ca6fe6b53f6c32a3e8407eC5A9dF8B7E39` |
| BNB testnet 97 | `0xFfddcE44e8cFf7703Fd85118524bfC8B2f70b744` |

Run `yarn test:video-session`, `yarn test:video-session:browser` (Chromium plus public immutable TS clips), `yarn lint` and `yarn typecheck`. Browser regression covers both legacy append restoration and a 1000-clip consumer with a direct jump to clip 500, bounded reads, rolling position, scrubbing, controls and cleanup. Deterministic tests cover empty/invalid sessions, negative indices, growth/shrink, RPC failures, stale responses, cache bounds and millisecond/PTS handling.

This is additive in candidate `0.1.32-next.1`; runtime contract version 1 and source-package format 6 stay unchanged. Workbench and beta consume the bundled runtime UI and need no separate mpegts installation. Before merge, build a clean committed feature canary with `runtime:pack:canary` and test the same archive in both consumers using `runtime:test:canary`. Canary archives are private and unpublishable. To release a public testing package, merge to official `next`, build/verify from its clean exact head with `FLAP_TEMPLATE_FRESHNESS_REF=upstream/next`, publish only to `next`, then pin/rebuild both consumers. See [versioning.md](versioning.md).
