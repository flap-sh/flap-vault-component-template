import { notFound } from "next/navigation";
import { VaultPreviewClientNoSsr } from "@/src/shell/VaultPreviewClientNoSsr";
import { getVaultFolderNames } from "@/src/vaults";

interface VaultFolderPageProps {
  params: {
    folderName: string;
  };
}

export default function VaultFolderPage({ params }: VaultFolderPageProps) {
  if (!getVaultFolderNames().includes(params.folderName)) notFound();
  return <VaultPreviewClientNoSsr folderName={params.folderName} />;
}
