import fs from "node:fs";
import path from "node:path";

export const MINI_APP_CAPABILITY_CONFIG_PATH = "config/mini-app-capability-profiles.json";
export const THREE_R3F_PROFILE_ID = "three-r3f-v1";

export function loadMiniAppCapabilityConfig(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, MINI_APP_CAPABILITY_CONFIG_PATH), "utf8"));
}

export function manifestCapabilityIds(manifest) {
  return Array.isArray(manifest?.capabilities) ? manifest.capabilities.filter((value) => typeof value === "string") : [];
}

export function capabilityProfilesForManifest(manifest, root = process.cwd()) {
  if (!isThreeR3FArtifact(manifest)) return [];
  const config = loadMiniAppCapabilityConfig(root);
  return manifestCapabilityIds(manifest)
    .map((id) => ({ id, profile: config.profiles?.[id] }))
    .filter((entry) => entry.profile);
}

export function hasThreeR3FCapability(manifest) {
  return manifestCapabilityIds(manifest).includes(THREE_R3F_PROFILE_ID);
}

export function isThreeR3FMiniApp(manifest) {
  return manifest?.mode === "mini-app" && hasThreeR3FCapability(manifest);
}

export function isThreeR3FVaultUI(manifest) {
  return manifest?.mode === undefined && hasThreeR3FCapability(manifest);
}

export function isThreeR3FArtifact(manifest) {
  return isThreeR3FMiniApp(manifest) || isThreeR3FVaultUI(manifest);
}

export function matchesCapabilityImport(spec, allowedImport) {
  if (allowedImport.endsWith("/*")) return spec.startsWith(allowedImport.slice(0, -1));
  return spec === allowedImport;
}

export function isCapabilityImportAllowed(spec, manifest, root = process.cwd()) {
  return capabilityProfilesForManifest(manifest, root).some(({ profile }) =>
    profile.allowedImports.some((allowedImport) => matchesCapabilityImport(spec, allowedImport)),
  );
}

export function capabilityFileExtensions(manifest, root = process.cwd()) {
  const extensions = new Set();
  for (const { profile } of capabilityProfilesForManifest(manifest, root)) {
    for (const key of ["sourceExtensions", "shaderExtensions", "assetExtensions"]) {
      for (const extension of profile[key] || []) extensions.add(extension);
    }
  }
  return extensions;
}

export function threeR3FProfile(root = process.cwd()) {
  return loadMiniAppCapabilityConfig(root).profiles[THREE_R3F_PROFILE_ID];
}
