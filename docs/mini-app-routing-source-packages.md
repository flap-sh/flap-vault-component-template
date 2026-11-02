# Mini App source packages for the routing test host

[简体中文](mini-app-routing-source-packages.zh-CN.md) · [Routing API](mini-app-routing.md)

Use this workflow only for a standalone Mini App v2 uploaded to a Workbench
that explicitly pins the published npm `routing` runtime. The normal `app:*`
workflow continues to use official `main` and npm `latest`. Vault UI and legacy
Mini Apps cannot use this test source-package channel.

The runtime remains `0.1.40-beta.routing.0`, published from
`33d22c9475c3935f8066d4ed213f25e082ece167`. Adding the authoring workflow does not
publish or relabel a Runtime. Its SDK/UI, dependencies, build inputs and protected
ZIP/E2E protocol inputs must remain identical to that published source. Only
reviewed authoring tools and documentation may be later official descendants.

## Generate a matching source ZIP

Use Node.js 24, Yarn 1.22, and the official
`flap-sh/flap-vault-component-template` `feat/mini-app-routing` branch. Keep your
App's four files and registration under `src/vaults`; retain its slug and
artifactId. Do not carry local SDK or tool edits into the authoring checkout.

```bash
git checkout feat/mini-app-routing
git pull --ff-only
yarn install --frozen-lockfile
FLAP_TEMPLATE_CHANNEL=routing yarn app:check <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:e2e <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:package <slug>
FLAP_TEMPLATE_CHANNEL=routing yarn app:verify-package dist/<slug>.zip
```

The default official ref is `origin/feat/mini-app-routing`. If `origin` is your
fork, use the official `upstream` remote explicitly for every command:

```bash
FLAP_TEMPLATE_CHANNEL=routing FLAP_TEMPLATE_FRESHNESS_REF=upstream/feat/mini-app-routing yarn app:package <slug>
```

Use the same environment for check, E2E and verification. The scripts require a
fresh fetch from the official remote, the exact official branch head, a genuine
published npm routing tag and immutable version record with the same version
and gitHead, published-source ancestry, unchanged protected inputs, current
source hashes, and passing PC/iPad/H5 guest/connected E2E. They do not accept
missing-tag bootstrap rules, private canaries, a different npm channel, or a
forged version-only change. The Runtime release command retains its separate
clean exact-source gates.

Submit only the script-generated format-7 ZIP. The four App sources, embedded
schema, E2E schema-3 report, marker and metadata must come from that same build.
Do not edit `flap-vault-package.json`, `package-metadata.json`,
`schemas/manifest.schema.json` or `qa/e2e-report.json` inside the ZIP.

A stable `0.1.39` source ZIP does not match a Workbench locked to the routing
beta. Regenerate from this workflow rather than changing its labels. Conversely,
a routing beta source ZIP does not satisfy a production Workbench locked to
main/latest. Upload/build success is not approval to publish an App or deploy a
host. This workflow does not publish npm packages or upgrade consumers.
