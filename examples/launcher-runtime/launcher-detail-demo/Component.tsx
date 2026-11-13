import { useState } from "react";

type LauncherProps = {
  context: Readonly<{
    identity: { chainId: number };
    launcherAddress: string | null;
    snapshot: Readonly<{
      launched?: boolean | null;
      raisedWei?: string | null;
      tokenAddress?: string | null;
    }> | null;
  }>;
  messages: Record<string, string>;
  host: Readonly<{ redirect?(path: string): boolean }>;
};

function formatNativeAmount(wei: string, chainId: number) {
  const digits = wei.padStart(19, "0");
  const fraction = digits.slice(-18).replace(/0+$/, "");
  const amount = digits.slice(0, -18) + (fraction ? `.${fraction}` : "");
  return `${amount} ${chainId === 97 ? "tBNB" : "BNB"}`;
}

export function Launcher({ context, messages, host }: LauncherProps) {
  const [redirectFailed, setRedirectFailed] = useState(false);
  const { launcherAddress, snapshot } = context;
  const issuance = snapshot?.launched === true ? messages.launched
    : snapshot?.launched === false ? messages.pending : messages.unknown;
  const raised = typeof snapshot?.raisedWei === "string"
    ? formatNativeAmount(snapshot.raisedWei, context.identity.chainId) : messages.unknown;

  return (
    <section style={{ padding: 20, border: "1px solid #484B51", borderRadius: 8, overflowWrap: "anywhere" }}>
      <h2 style={{ margin: 0 }}>{messages.title}</h2>
      {launcherAddress ? (
        <dl style={{ display: "grid", gap: 8, margin: "16px 0" }}>
          <dt>{messages.launcherAddress}</dt>
          <dd style={{ margin: 0 }}><code>{launcherAddress}</code></dd>
          <dt>{messages.issuance}</dt>
          <dd style={{ margin: 0 }}>{issuance}</dd>
          <dt>{messages.raised}</dt>
          <dd style={{ margin: 0 }}>{raised}</dd>
          {snapshot?.tokenAddress && <>
            <dt>{messages.tokenAddress}</dt>
            <dd style={{ margin: 0 }}><code>{snapshot.tokenAddress}</code></dd>
          </>}
        </dl>
      ) : <p role="status">{messages.noInstance}</p>}
      {launcherAddress && host.redirect && (
        <button type="button" style={{ minHeight: 44, padding: "0 14px" }}
          onClick={() => setRedirectFailed(host.redirect?.("/apps") !== true)}>
          {messages.openApps}
        </button>
      )}
      {redirectFailed && <p role="status">{messages.redirectUnavailable}</p>}
    </section>
  );
}
