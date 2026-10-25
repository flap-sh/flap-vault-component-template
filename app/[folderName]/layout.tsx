import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { VaultPreviewClientNoSsr } from "@/src/shell/VaultPreviewClientNoSsr";
import { getVaultFolderNames } from "@/src/vaults";

/** Keep the artifact mounted while the standalone App's child path changes. */
export default async function VaultFolderLayout({ params, children }: { params: Promise<{ folderName: string }>; children: ReactNode }) {
  const { folderName } = await params;
  if (!getVaultFolderNames().includes(folderName)) notFound();
  return <><VaultPreviewClientNoSsr folderName={folderName} />{children}</>;
}
