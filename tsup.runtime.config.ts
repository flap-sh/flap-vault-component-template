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
    host: "src/sdk/host.ts",
    server: "src/sdk/server.ts",
    ui: "src/ui/public.ts",
  },
  tsconfig: "tsconfig.runtime-package.json",
  format: ["esm"],
  bundle: true,
  dts: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  clean: true,
  target: "es2020",
  outDir: "dist/vault-runtime",
  external: runtimeExternals,
  treeshake: true,
  outExtension() {
    return {
      js: ".js",
    };
  },
});
