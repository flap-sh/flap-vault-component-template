# Mini App routing

The `0.1.40-beta.routing.0` testing release supports generic
subroutes within an existing standalone Mini App v2. **Published on npm `routing`
and verified 2026-10-29.** Consumer hosts have not been deployed by this release.
The independent npm `routing` tag preserves `latest=0.1.39` and the sensor/map
`next=0.1.40-next.4` channel. Stable `0.1.40` remains pending. Keep exact-ref
release, private-canary and main/latest source-ZIP provenance gates. See
[the testing release guide](releases/0.1.40-beta.routing.0.md).

## Application API

```tsx
import { useMiniAppRouter } from "@/src/sdk";

const { pathname, segments, search, push, replace, back } = useMiniAppRouter();
// /apps/my-app/bnb/0x... -> pathname=/bnb/0x..., segments=[bnb, 0x...]
// /apps/my-app/orders/42?tab=history -> search=?tab=history
const openOrder = () => push("/orders/42?tab=history");
```

`pathname` is canonical and encoded; `segments` is immutable and decoded exactly
once. `search` preserves repeated query values and starts with `?`, or is empty.
Apps match their own routes and validate business parameters such as chain/CA.
Unknown routes should render an app-specific unavailable page. No route DSL,
manifest schema or source-package format change is required.

Navigation targets start with `/` relative to the App root. External URLs,
protocol-relative URLs, traversal, encoded separators, repeated slashes,
backslashes, control characters, malformed path escapes and hashes are rejected.
`replace` replaces the current entry. `back` stays within adapter-owned App
history and otherwise returns to the App root; it is a no-op at the root.
Routing does not authorize wallet access, arbitrary CA reads or contract writes.
The existing declared contract/resolver and wallet-chain policies still apply.

## Host integration

The SDK exports `MINI_APP_ROUTING_VERSION = 1` and `useMiniAppRouter()`. Its
Runtime contract advertises `sdkFeatures.miniAppRouting = 1`. Hosts pass the
optional `router` prop to `MiniAppRuntimeProvider`. Existing Apps that do not use
routing remain compatible; the new hook throws an explicit unsupported-host
error if no adapter is provided.

Host-only helpers from `@flapsdk/vault-runtime/host`:

- `parseMiniAppPath(path)` validates and creates a route snapshot.
- `createMiniAppMemoryRouter(initialPath = "/")` creates isolated preview history.
- `createMiniAppBrowserRouter({ basePath, window })` creates browser history under
  the current App root, listens to `popstate`, and offers `sync()` and `dispose()`.

Browser writes preserve existing history state, excluding Next's private write
markers so Next can synchronize its path and restore its own markers. The adapter
re-reads the resulting URL after host wrappers add query parameters. Call `sync()`
after other host-driven path/search changes. Dispose the adapter on unmount;
stale callbacks cannot navigate after the browser has left its App base path.
The initial history marker preserves Next's existing state without requiring its
wrappers to be installed. Hosts may set `preserveSearchParams` to retain their own
query controls; the template preserves `lang` and `appSession` across navigation
and refresh, keeping preview locale/session independent of App business queries.

Keep the artifact loader, provider and App component in a persistent layout
above the changing route segment. Do not key the component by pathname or reload
its bundle on route changes. The local `/{folderName}` preview now does this and
allows standalone subpaths. Existing Vault UI and token-scoped Mini App previews
retain their single-page routes. Workbench embedded previews should use memory
history, so App navigation never changes the management page URL.

## Validation and rollout

`routing-example` demonstrates home, detail, unknown route, query updates and a
local counter retained during navigation. Its copy is aligned in EN/ZH/KO.
Run `yarn test:mini-app-routing` for parser, memory history, feature detection and
browser push/replace/back/forward, direct entry, refresh, state preservation,
Next write-marker behavior, query wrappers and stale-scope rejection.
With `yarn dev --port 3047` running, also run
`node scripts/test-mini-app-routing-preview.mjs` for the real Next preview,
including Chinese locale and connected-session preservation. Next can stream an
HTTP 200 before a nested `notFound()`; legacy deep paths render the unavailable
page and no Vault artifact, so check that rendered outcome as well as status.

The source detector identifies routing use from live SDK imports, including
aliases, and ignores erased type-only or unused imports. Workbench checks that
its installed Runtime supports those imports. At runtime, invoking
`useMiniAppRouter()` checks the SDK routing version/export through the
compatibility shim, and the hook requires a host-provided adapter. Deploy both
compatible receiving hosts before accepting new route-dependent packages.
Release and pin the matching published Runtime before normal source ZIP
packaging; a private canary is consumer-test input only.


For a source ZIP accepted by the matching routing test Workbench, use the explicit [routing App source-package workflow](mini-app-routing-source-packages.md). Default main/latest and production acceptance are unchanged.
