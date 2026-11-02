# taxed.fun subdomain queries

Vault UI and Mini App source may use direct `fetch` with a fixed HTTPS URL on
any `taxed.fun` subdomain, including multi-level subdomains such as
`api.gc.taxed.fun`. The root domain `taxed.fun` is not a subdomain. This query
exception does not extend to lookalike hosts or other domains.

Declare each concrete HTTPS origin/path in `manifest.endpoints` for human review.
Dynamic queries require a matching declaration without a fixed query string.
Declarations retain their existing exact-origin and path-or-child matching; a
declaration for `gc.taxed.fun` does not cover another subdomain, and wildcard
declarations such as `https://*.taxed.fun` do not authorize requests.

The hostname, path, and query parameter names must be static. Only query values
may vary, each wrapped in the global, unshadowed `encodeURIComponent(value)`.
Artifact source must not reassign this global encoder, including in imported
modules; local bindings cannot stand in for the global encoder.
Both static and templated requests require a literal options object containing
`method: "GET"`, `credentials: "omit"`, `redirect: "error"`, and
`referrerPolicy: "no-referrer"`. Optional `cache: "no-store"` is allowed.
Variables, spreads, duplicate/computed keys, headers, bodies, and option
overrides are blocked.

The following example illustrates syntax only; use the actual API's path and
parameters. It does not establish that the example URL serves an API.

```json
{ "endpoints": "https://gc.taxed.fun" }
```

```tsx
const response = await fetch(
  `https://gc.taxed.fun/?cursor=${encodeURIComponent(cursor)}`,
  {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  },
);
```

Credentials in URLs, alternate ports, fragments, invalid DNS labels, raw or
encoded dot segments, encoded path separators, backslashes, and control
characters are rejected. Dynamic hosts, paths, parameter names, and whole-query
interpolation remain blocked.

This is a source-checker exception, not an SDK routing change. `sdk.readFsi`
retains its existing fixed endpoints and path policy; the existing FSI fetch
policy takes precedence for FSI URLs. Other origins keep the ordinary static
fetch policy. Media, navigation, frames, uploads, and wallet capabilities do not
gain permission from this exception.

The checker retains `manual-review/external-endpoint` warnings and the concrete
URL, dynamic-query flag, and target expression. Passing the checker does not
approve an endpoint or prove API availability, browser CORS, or response shape.
Deploy matching template and Workbench checker policies before submitting source
that uses this exception; no SDK/runtime release is required for these native
fetch calls.
