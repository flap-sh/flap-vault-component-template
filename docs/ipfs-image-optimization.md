# IPFS image optimization rollout

The host supplies `imageOptimizer` to VaultRuntimeProvider. The runtime keeps its
CID/path validation, native img layout and gateway fallback; the host adapter uses
Next.js getImageProps to generate /_next/image URLs and responsive srcset only.
Unknown legacy dimensions use a single optimized URL without srcset, preserving
intrinsic-density behavior. Numeric width or explicit sizes enables responsive srcset.
No synthetic HTML width/height or positioning is added. Existing CSS is preserved.
Optimization errors retry the same gateway directly, then the next gateway. CID or
path changes reset the chain. Without a host adapter, direct rendering is unchanged.

## Compatibility and rollout

Existing Workbench artifacts that resolve IpfsImage/IpfsBackground through the
host runtime inherit the change without rebuilding their immutable component.mjs.
Keep the runtime contract version and existing required props unchanged. Test an
actual unchanged artifact in both hosts before final acceptance. Inline img, CSS
URLs, bundled image implementations and NftMetadataImage data URLs are not covered.

The consumers currently pin published @flapsdk/vault-runtime 0.1.37. Their additive
provider prop is safely ignored by that old runtime, so host wiring alone does NOT
activate optimization. After a separately authorized official runtime release,
update both consumer package.json/yarn.lock pins to its verified published version
and gitHead. Do not invent a version, publish from this task, or bypass provenance.
No npm dependency update or release is represented as complete by this change.

For pre-release package verification use the repository's private canary workflow
from a clean committed worktree; the bot owns commits. Do not use an uncommitted
package as verified provenance. Full yarn ci is run by the bot.

Measure a real slow CID at cold and warm cache, including bytes, TTFB, cache hits,
failure fallback and an unchanged old artifact. Cold requests still fetch Pinata.
Existing Next.js cache policy is preserved; actual edge caching depends on
deployment. GIF/SVG handling follows Next.js; no unsafe SVG
optimization or arbitrary remote-image allowlist is added by this feature.
