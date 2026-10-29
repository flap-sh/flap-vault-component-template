#!/usr/bin/env node
import { templateReleasePolicy } from "./template-release-channel.mjs";

export function routingRuntimeEnvironment(env = process.env, args = []) {
  if (args.length) throw new Error("runtime:package:routing accepts no arguments, folders or freshness-skip flags.");
  const selected = { ...env, FLAP_TEMPLATE_CHANNEL: "routing", FLAP_TEMPLATE_WORKFLOW: "runtime",
    FLAP_TEMPLATE_FRESHNESS_REF: env.FLAP_TEMPLATE_FRESHNESS_REF || "origin/feat/mini-app-routing" };
  templateReleasePolicy(selected);
  return selected;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Object.assign(process.env, routingRuntimeEnvironment(process.env, process.argv.slice(2)));
  await import("./build-runtime-package.mjs");
}
