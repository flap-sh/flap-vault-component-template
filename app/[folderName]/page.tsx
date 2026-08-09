import { notFound } from "next/navigation";
import { VaultPreviewClientNoSsr } from "@/src/shell/VaultPreviewClientNoSsr";
import { getVaultFolderNames } from "@/src/vaults";

interface VaultFolderPageProps {
  params: Promise<{
    folderName: string;
  }>;
}

export default async function VaultFolderPage({ params }: VaultFolderPageProps) {
  const { folderName } = await params;
  if (!getVaultFolderNames().includes(folderName)) notFound();
  return <VaultPreviewClientNoSsr folderName={folderName} />;
}
