import { defineConfig } from "tsup";

const runtimeExternals = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "wagmi",
  "viem",
  "@tanstack/react-query",
  "@rainbow-me/rainbowkit",
];

export default defineConfig({
  entry: {
    sdk: "src/sdk/client.ts",
    host: "src/sdk/hostCore.ts",
    "host-client": "src/sdk/hostClient.ts",
    server: "src/sdk/server.ts",
    ui: "src/ui/public.ts",
  },
  tsconfig: "tsconfig.runtime-package.json",
  format: ["esm"],
  bundle: true,
  dts: true,
  sourcemap: true,
  minify: false,
  // SDK, UI and host-client must share one RuntimeContext instance.
  // Keep the Provider out of the pure host helper entry to preserve RSC boundaries.
  splitting: true,
  clean: true,
  target: "es2020",
  outDir: "dist/vault-runtime",
  external: runtimeExternals,
  // Ship the lazy browser player with the runtime; consumers need no npm/CDN loader.
  noExternal: ["mpegts.js"],
  treeshake: true,
  outExtension() {
    return {
      js: ".js",
    };
  },
});
