import type { ComponentType } from "react";
import type { VaultComponentProps, VaultManifest } from "@/src/sdk";

export interface VaultModule {
  folderName: string;
  loadComponent: () => Promise<{
    default: ComponentType<VaultComponentProps>;
    LaunchConfig?: ComponentType<import("@/src/sdk").VaultLaunchConfigComponentProps>;
  }>;
  loadManifest: () => Promise<{ default: VaultManifest }>;
  loadI18n: () => Promise<{ default: Record<string, Record<string, string>> }>;
}

export const vaultModules: Record<string, VaultModule> = {
  example: {
    folderName: "example",
    loadComponent: () => import("./example/Component"),
    loadManifest: () => import("./example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "dex-listed-example": {
    folderName: "dex-listed-example",
    loadComponent: () => import("./dex-listed-example/Component"),
    loadManifest: () => import("./dex-listed-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./dex-listed-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "action-gallery-example": {
    folderName: "action-gallery-example",
    loadComponent: () => import("./action-gallery-example/Component"),
    loadManifest: () => import("./action-gallery-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./action-gallery-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "community-buyback-example": {
    folderName: "community-buyback-example",
    loadComponent: () => import("./community-buyback-example/Component"),
    loadManifest: () => import("./community-buyback-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./community-buyback-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "flapixel-example": {
    folderName: "flapixel-example",
    loadComponent: () => import("./flapixel-example/Component"),
    loadManifest: () => import("./flapixel-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./flapixel-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "three-r3f-example": {
    folderName: "three-r3f-example",
    loadComponent: () => import("./three-r3f-example/Component"),
    loadManifest: () => import("./three-r3f-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./three-r3f-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "flap-skies-showcase": {
    folderName: "flap-skies-showcase",
    loadComponent: () => import("./flap-skies-showcase/Component"),
    loadManifest: () => import("./flap-skies-showcase/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./flap-skies-showcase/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "flap-gamefi-arena": {
    folderName: "flap-gamefi-arena",
    loadComponent: () => import("./flap-gamefi-arena/Component"),
    loadManifest: () => import("./flap-gamefi-arena/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./flap-gamefi-arena/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "flap-streets": {
    folderName: "flap-streets",
    loadComponent: () => import("./flap-streets/Component"),
    loadManifest: () => import("./flap-streets/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./flap-streets/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "audio-example": {
    folderName: "audio-example",
    loadComponent: () => import("./audio-example/Component"),
    loadManifest: () => import("./audio-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./audio-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
  "standalone-example": {
    folderName: "standalone-example",
    loadComponent: () => import("./standalone-example/Component"),
    loadManifest: () => import("./standalone-example/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./standalone-example/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
};

export function getVaultFolderNames() {
  return Object.keys(vaultModules);
}
