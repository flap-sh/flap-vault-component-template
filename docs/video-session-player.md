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

The player reads the length plus the first and last clip's metadata to establish the full timeline, then loads at most **four metadata records starting at the selected clip**. Seeking to clip 500 starts media downloads at clip 500; clips 1–499 are never downloaded. The first/last metadata reads contain no media bytes. Global time seeking uses a bounded binary search over clip timestamps, including variable-duration clips, rather than reading the whole sequence. Explicit seek immediately cancels the previous stream; rapid selections ignore stale responses. The metadata cache holds at most 128 clips.

The player shows a full-session elapsed/total clock and global seek bar, plus play/pause, mute/volume and fullscreen controls. A separate scrubber addresses time within the current clip. The clip picker shows at most 20 buttons per page; first/previous/next/latest buttons and a one-based clip input support long sessions. Keyboard shortcuts on the video are Space (play/pause), M (mute), N/P (next/previous clip).

**Normal playback keeps one mpegts player and one MediaSource across clip boundaries.** Four-clip metadata windows can roll without replacing the media stream or resetting its clock. An internal loader reads subsequent clips with bounded preload and backward-buffer cleanup. It aligns MPEG-TS PES/PCR clocks to the provider timeline without transcoding encoded audio/video. For eight-second clips, clip 5 at two seconds displays approximately `0:34` elapsed. After an explicit jump, the displayed clock still uses full-session time even though only the selected and following media are fetched.

Length polling runs every eight seconds. Unchanged length does not reread metadata or rebuild media. Appended clips extend the same stream when playback reaches them; manual pause remains paused. The loader waits at the known tail for newly generated clips, so the underlying MSE duration may remain open-ended; the displayed duration comes from provider metadata. Refresh failure leaves already buffered playback available with a warning/retry control. Empty, invalid, unsupported-browser/chain and playback-error states use the supplied fallback.

Autoplay defaults to off; `autoPlay` and `muted` are optional. Browsers may reject autoplay; built-in controls remain available. Unmount, address/chain changes, clearing data and playback failures tear down players/listeners. Late imports and contract responses cannot revive a removed session.

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

Run `yarn test:video-session`, `yarn test:video-session:browser` (Chromium plus public immutable TS clips), `yarn lint` and `yarn typecheck`. Browser regression covers both legacy append restoration and a 1000-clip consumer with a direct jump to clip 500, bounded reads, continuous playback across clip 5, cumulative time, scrubbing, controls and cleanup. Deterministic tests cover empty/invalid sessions, negative indices, growth/shrink, RPC failures, stale responses, cache bounds and millisecond/PTS handling.

The continuous-playback fix follows stable `0.1.32`; runtime contract version 1 and source-package format 6 stay unchanged. Workbench and beta consume the bundled runtime UI and need no separate mpegts installation. Before merge, build a clean committed feature canary with `runtime:pack:canary` and test the same archive in both consumers using `runtime:test:canary`. Canary archives are private and unpublishable. To release a public testing package, merge to official `next`, build/verify from its clean exact head with `FLAP_TEMPLATE_FRESHNESS_REF=upstream/next`, publish only to `next`, then pin/rebuild both consumers. See [versioning.md](versioning.md).
