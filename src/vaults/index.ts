import type { ComponentType } from "react";
import type { VaultComponentProps, VaultManifest } from "@/src/sdk";

export interface VaultModule {
  folderName: string;
  loadComponent: () => Promise<{ default: ComponentType<VaultComponentProps> }>;
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
  "worldcup-vault": {
    folderName: "worldcup-vault",
    loadComponent: () => import("./worldcup-vault/Component"),
    loadManifest: () => import("./worldcup-vault/manifest.json") as Promise<{ default: VaultManifest }>,
    loadI18n: () => import("./worldcup-vault/i18n.json") as Promise<{ default: Record<string, Record<string, string>> }>,
  },
};

export function getVaultFolderNames() {
  return Object.keys(vaultModules);
}
