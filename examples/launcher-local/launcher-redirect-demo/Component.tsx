import React, { useEffect, useRef, useState } from "react";

type Messages = Record<string, string>;
type LauncherProps = {
  context?: {
    identity: { chainId: number; factoryAddress: string };
    launcherAddress: string | null;
    snapshot: { expectedToken: string | null } | null;
  };
  messages: Messages;
  host?: { redirect?: (path: string) => boolean };
};

// Keep these values aligned with the factory binding in manifest.json.
const demoChainId = 97;
const demoFactory = "0xc574f30e2ee26fe638eece6d9876217015cd0a38";
const addressPattern = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const panel: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 20,
  border: "1px solid #34383c",
  borderRadius: 12,
  background: "#111415",
  color: "#fff",
};

export function LauncherConfig({ messages, onChange }: {
  messages: Messages;
  onChange: (result: { status: "invalid" }) => void;
}) {
  // The read-only redirect demo has no creation draft.
  useEffect(() => { onChange({ status: "invalid" }); }, [onChange]);
  return <section style={panel} data-launcher-local-surface="launcher-config">
    <h2 style={{ margin: 0 }}>{messages.title}</h2>
    <p style={{ margin: 0 }}>{messages.configuration}</p>
  </section>;
}

export function Launcher({ context, messages, host }: LauncherProps) {
  const factory = context?.identity?.factoryAddress?.toLowerCase();
  const launcher = context?.launcherAddress?.toLowerCase();
  const token = context?.snapshot?.expectedToken?.toLowerCase();
  // The Apps directory exists on the host. Use your deployed Mini App subroute
  // here when it can resolve the supplied launcher and token.
  const destination = context?.identity?.chainId === demoChainId && factory === demoFactory
    && launcher && addressPattern.test(launcher) && token && addressPattern.test(token)
    ? `/apps?token=${token}&mint=${launcher}&factory=${factory}`
    : null;
  const redirect = host?.redirect;
  const attempted = useRef(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (!destination || !redirect || attempted.current) return;
    attempted.current = true;
    if (!redirect(destination)) setRejected(true);
  }, [destination, redirect]);

  const status = !destination ? messages.unavailable
    : !redirect || rejected ? messages.staying
    : messages.opening;

  return <section style={panel} data-launcher-local-surface="launcher-ui">
    <h2 style={{ margin: 0 }}>{messages.title}</h2>
    <p role="status" style={{ margin: 0 }}>{status}</p>
    {destination && <dl style={{ margin: 0, overflowWrap: "anywhere" }}>
      <dt>{messages.launcher}</dt>
      <dd style={{ margin: 0 }}>{launcher}</dd>
      <dt>{messages.token}</dt>
      <dd style={{ margin: 0 }}>{token}</dd>
    </dl>}
  </section>;
}
