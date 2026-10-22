"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useReadContract } from "wagmi";
import { useSearchParams } from "next/navigation";
import {
  isVaultLaunchConfigResultForSchema, parseVaultLaunchSchema, VAULT_LAUNCH_SCHEMA_ABI,
  type VaultLaunchConfigComponentProps, type VaultLaunchConfigResult,
  type VaultLaunchSchema, type VaultManifest,
} from "@/src/sdk";
import { useLang } from "@/src/i18n/useLang";
import { Alert, Button } from "@/src/ui";
import { selectLaunchConfigPreviewBinding } from "./launchConfigPreview";

const EXAMPLE_SCHEMA: VaultLaunchSchema = {
  isArray: false,
  description: "Example minimum burn threshold",
  fields: [{ name: "minBurnAmount", fieldType: "uint256", description: "Example base-unit amount", decimals: 18 }],
};
const INVALID: VaultLaunchConfigResult = { status: "invalid" };

interface LaunchConfigPreviewShellProps {
  folderName: string;
  manifest: VaultManifest;
  i18n: Record<string, Record<string, string>>;
  Component: ComponentType<VaultLaunchConfigComponentProps>;
}

export function LaunchConfigPreviewShell({ folderName, manifest, i18n, Component }: LaunchConfigPreviewShellProps) {
  const { lang, languageCode } = useLang();
  const copy = lang.home.surfaces;
  const messages = i18n[languageCode] ?? i18n.en ?? {};
  const params = useSearchParams();
  const binding = selectLaunchConfigPreviewBinding(manifest, params);
  const fixture = folderName === "example";
  const schemaRead = useReadContract({
    chainId: binding?.chainId,
    address: binding?.factoryAddress,
    abi: VAULT_LAUNCH_SCHEMA_ABI,
    functionName: "vaultDataSchema",
    query: { enabled: !fixture && Boolean(binding?.factoryAddress), retry: 1, staleTime: 60_000 },
  });
  const schema = useMemo(() => {
    if (!binding) return null;
    if (fixture) return EXAMPLE_SCHEMA;
    if (!schemaRead.data) return null;
    try { return parseVaultLaunchSchema(schemaRead.data); } catch { return null; }
  }, [binding, fixture, schemaRead.data]);
  const scope = [binding?.chainId, binding?.factoryAddress, JSON.stringify(schema)].join(":");
  const [returned, setReturned] = useState<{ scope: string; value: unknown } | null>(null);
  const onChange = useCallback((value: VaultLaunchConfigResult) => { setReturned({ scope, value }); }, [scope]);
  const result = returned?.scope === scope && schema && isVaultLaunchConfigResultForSchema(returned.value, schema)
    ? returned.value : INVALID;
  const malformed = returned?.scope === scope && schema && !isVaultLaunchConfigResultForSchema(returned.value, schema);

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-[#303236] bg-[#070808] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4">
          <span className="text-sm font-semibold text-[#D0FF00]">FLAP</span>
          <span className="truncate text-xs text-[#84888C]">{manifest.name}</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-5 space-y-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{copy.launchTitle}</h1>
          <p className="text-sm leading-6 text-[#84888C]">{copy.hostBoundary}</p>
          <Alert tone={fixture ? "warning" : "info"}>{fixture ? copy.fixtureNotice : copy.liveSchemaNotice}</Alert>
        </div>
        <div data-vault-e2e-scope="vault-preview" data-launch-config-preview="true"
          data-launch-config-schema={schema ? JSON.stringify(schema) : undefined}
          data-launch-config-chain-id={binding?.chainId}
          data-launch-config-factory-address={binding?.factoryAddress}
          className="rounded-lg border border-[#303236] bg-[#070808] p-3 sm:p-5">
          {!binding ? <Alert tone="danger">{copy.missingFactory}</Alert>
            : !schema ? <Alert tone={schemaRead.isError || (!schemaRead.isPending && schemaRead.data) ? "danger" : "info"}>
              {schemaRead.isPending ? copy.schemaLoading : copy.schemaFailed}
            </Alert>
              : <Component key={scope} context={{ chainId: binding.chainId, factoryAddress: binding.factoryAddress!, locale: languageCode, schema }} messages={messages} onChange={onChange} />}
          {malformed ? <Alert tone="danger">{copy.invalidResult}</Alert> : null}
          <div className="mt-4 border-t border-[#303236] pt-4">
            {result.status === "valid" ? <Alert tone="info"><pre data-launch-config-values className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result.values, null, 2)}</pre></Alert> : null}
            <Button className="mt-3 w-full" disabled={result.status !== "valid"} data-launch-config-confirm="true">{copy.previewConfirm}</Button>
            <p className="mt-2 text-xs leading-5 text-[#84888C]">{copy.noTransactionNotice}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
