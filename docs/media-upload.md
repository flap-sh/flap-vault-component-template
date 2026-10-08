# Image and text uploads

Both ordinary Vault UI and Mini App can upload user-selected content through the shared SDK. Trigger uploads from a visible user action and keep progress, failure, and retry copy in `i18n.json`. Do not upload automatically on mount.

```tsx
const image = await sdk.uploadImage(file);
// image.cid is the image file CID, not token metadata.
// image.uri: ipfs://<cid>
// image.gatewayUrl: https://flap.mypinata.cloud/ipfs/<cid> on mainnet

const text = await sdk.uploadText(description);
// text.cid is the UTF-8 text file CID.

// Optional cancellation:
await sdk.uploadImage(file, { signal: controller.signal });
```

`uploadImage` accepts a browser `File` or `Blob` of type `image/png`, `image/jpeg`, `image/gif`, or `image/webp`, up to 3 MiB. The server independently checks the size and image signature. SVG, URLs, audio, and directories are not accepted. `uploadText` accepts a string of at most 256 KiB **after UTF-8 encoding** and stores it as `text/plain;charset=utf-8`. Empty content is rejected. Each call pins one file; no token metadata is created and no blockchain transaction is sent.

Both methods return `Promise<IpfsUploadResult>` containing `cid`, `uri`, and `gatewayUrl`. The gateway follows the existing active-chain configuration: `flap.mypinata.cloud` for 56/4663/46630 and the configured Flap testnet gateway for 97. Persist `cid` or `uri` when storing an IPFS reference; gateway URLs are derived presentation values. A successful response confirms pinning, rather than guaranteeing every gateway cache is already warm.

SDK uploads are the controlled exception to the ban on component-owned upload flows. Components must not call Pinata, construct their own upload endpoints, pass credentials, use raw upload `fetch`/XHR, or select a gateway. Existing rendering rules still apply: `IpfsImage` / `IpfsBackground` require static immutable CIDs; `NftMetadataImage` resolves contract-selected NFT metadata. This API does not grant arbitrary dynamic `<img src>` or dynamic `IpfsImage cid` permission.

## Host integration

Mount this server-only adapter at `/api/runtime/upload` in each runtime host:

```ts
import { createRuntimeUploadHandler } from "@flapsdk/vault-runtime/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createRuntimeUploadHandler({ pinataJwt: process.env.PINATA_JWT });
```

The production Flap host sets `PINATA_JWT` to the server credential for the Flap Pinata account associated with the approved gateways. Never expose it via `NEXT_PUBLIC_*`, manifest, component props, or source packages. Missing configuration returns HTTP 503, with no fallback to a developer's gateway.

Template and Workbench preview hosts can instead pass `upstreamOrigin: process.env.FLAP_RUNTIME_HOST_ORIGIN || "https://flap.sh"` to the handler. Their checked-in routes do this by default, so partners do not need Flap's Pinata credential. The relay validates and bounds uploads locally, forwards only the normalized file to the configured HTTPS Flap host, and validates the returned CID. It forwards no browser cookies or credentials and follows no redirects. The central `/api/runtime/upload` route must be deployed before this relay is usable. Workbench additionally enforces its existing operator-session/API-key mutation access before uploading.

The handler accepts multipart fields `kind` (`image` or `text`), `chainId`, and exactly one `file`; it returns `{ data: { cid, uri, gatewayUrl } }`. It bounds the request stream before parsing, checks content independently of the browser, pins through the fixed Pinata endpoint with CID v1, validates the returned CID, and times out upstream pinning after 30 seconds. Cross-origin browser uploads are rejected. The handler keeps a bounded, per-instance limit of 10 requests per client IP per minute and returns HTTP 429 with `Retry-After`; a deployment with multiple instances should also enforce its upload quota at ingress. Forwarding headers must be overwritten by the trusted host proxy. Reuse one handler instance per route so its limiter persists between requests.

Alternative hosts can inject a `mediaUploader` into `VaultRuntimeProvider`; the override receives `{ kind, file, chainId, signal }` and returns the same `IpfsUploadResult`. This is a host integration point, not a component-selected upload destination.

`MediaUploadError` exposes stable `code` and optional HTTP `status` for localized caller feedback. Common codes are `UPLOAD_EMPTY`, `UPLOAD_TOO_LARGE`, `UPLOAD_UNSUPPORTED_TYPE`, `UPLOAD_INVALID_IMAGE`, `UPLOAD_INVALID_TEXT`, `UPLOAD_NOT_CONFIGURED`, `UPLOAD_RATE_LIMITED`, `UPLOAD_PIN_FAILED`, `UPLOAD_TIMEOUT`, `UPLOAD_NETWORK_ERROR`, and `UPLOAD_INVALID_RESPONSE`. Catch errors at the action boundary; retry only through a visible user action. Aborting a request does not unpin content that the upstream service already stored.

## Development and rollout

Run `yarn test:media-upload`, `yarn typecheck`, and `yarn lint`. Tests replace only the Pinata boundary; they exercise the client, multipart handler, file CID response, image/text limits, malformed content, errors, cancellation, and rate limiting without creating public IPFS uploads.

For a shared-runtime change, commit the SDK changes, run `yarn runtime:pack:canary`, and test that exact tarball in both consumers with `runtime:test:canary`. The host routes require the new runtime export. Keep their route changes and the eventual published runtime dependency upgrade in the same deployment. A local canary verifies the integration and must not be published or recorded as a release dependency.
