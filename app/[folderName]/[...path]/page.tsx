import { notFound } from "next/navigation";
import { isStandaloneMiniApp } from "@/src/sdk/miniApp";
import { vaultModules } from "@/src/vaults";

/** Vault UI and token-scoped Mini Apps retain their single-page preview. */
export default async function StandaloneAppPathPage({ params }: { params: Promise<{ folderName: string }> }) {
  const { folderName } = await params;
  const vaultModule = vaultModules[folderName];
  if (!vaultModule || !isStandaloneMiniApp((await vaultModule.loadManifest()).default)) notFound();
  return null;
}
