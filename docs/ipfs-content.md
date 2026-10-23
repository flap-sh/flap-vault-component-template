# Dynamic IPFS text and images

Stable Vault UI first supports this in `0.1.37`. Mini App v2 requires the coordinated `0.1.39-next.0` preview release, which merges main and adapts the shared reader/component to the independent App provider. `0.1.38-next.0` does not contain this capability.
See [preview release and upgrade notes](releases/0.1.39-next.0.md) for publication order and host
requirements; a source version bump alone does not mean npm has been published.

Use `sdk.readIpfsText(cid, path?)` to read an immutable UTF-8 text or JSON file.
It returns a string: parse JSON only when the application's content format is JSON.
CID and safe relative path values may come from FSI, contract state, or SDK uploads.
The example field names below are illustrative; map actual FSI fields in the UI.

```tsx
import { useFlapSdk } from "@/src/sdk";
import { IpfsImage, IpfsText } from "@/src/ui";

// Inside a component using its existing SDK/context:
const sdk = useFlapSdk(); // Vault UI
// Mini App v2: const sdk = useFlapSdk({ chainId: 56 });
const textCid = (await sdk.uploadText("A test post")).cid;
const body = await sdk.readIpfsText(textCid);
// For JSON content: const post = JSON.parse(await sdk.readIpfsText(jsonCid));

// In the component's render, after the required host risk status:
<IpfsText cid={item.textCid} fallback={sdk.i18n.t("contentLoading")} />;
<IpfsImage cid={item.imageCid} alt={sdk.i18n.t("postImageAlt")} />;
```

Put loading/error/alt copy in every manifest locale. `IpfsText` renders escaped
plain text with preserved line breaks, never HTML or automatically interpreted
Markdown. It exposes `data-flap-ipfs-text-state` (`loading`, `ready`, `error`),
supports `fallback`, and ignores outdated responses when the CID changes.
Use `sdk.readIpfsText` for custom loading/error UI or application-specific JSON.

The runtime accepts bare CIDs and optional safe relative paths, never a gateway
URL, `ipfs://` URI, query, fragment, encoded escape or traversal. Gateways are
platform-owned. Text requests omit cookies and referrers, reject redirects, and
have an 8-second network/body deadline after a read acquires an active slot and
a 256 KiB UTF-8 limit. Time waiting for a slot is separate. Text/plain, application/json
and application/octet-stream responses are accepted; HTML, unsupported charsets,
binary control bytes and malformed UTF-8 are rejected. Each provider permits six
active reads and at most 128 pending reads, deduplicates requests and retains at
most 64 immutable text results. Paginate large feeds and galleries.

Dynamic image CIDs and all text sources produce `manual-review/ipfs-content`
warnings with their source expressions. No new manifest field or gateway endpoint
declaration is required. FSI access still needs its separately reviewed endpoint.
Raw media URLs, caller gateways, `src`/`srcSet`, spreads and HTML injection props
remain blocked. A dynamic path below a **static** image CID still requires a static
`validationPath`; a dynamic CID/path pair is validated by the runtime.
`IpfsBackground` remains static CID-only; NFT tokenURI images continue to use
`NftMetadataImage`.

Upgrade both Workbench and Flap hosts to the published `0.1.39-next.0` runtime for Mini App v2 before
rollout. Workbench also needs the matching static IPFS policy; updating its npm
dependency alone does not update its checker. Runtime feature detection is
`IPFS_CONTENT_VERSION === 1` / `runtime-contract.sdkFeatures.ipfsContent === 1`.
The guarded Workbench checker reports `runtime-policy/ipfs-content-unavailable`
when a new text/dynamic-image source is used with an older runtime.

Text reads happen in the browser through the fixed platform gateways; no new
host route or Pinata credential is needed for reads. The gateway must serve the
pinned content and allow browser text requests. Uploads still use the existing
host-owned `/api/runtime/upload` service and its server-side configuration.
Use SDK uploads to create test CIDs when that service is configured. Automated
browser tests use a mock content-addressed upload service, not live Pinata proof.
Pre-merge package verification uses only the private, unpublishable
`runtime:pack:canary` package.
