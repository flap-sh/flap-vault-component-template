import { ExternalLink } from "lucide-react";
import { shortenAddress } from "@/src/sdk/format";

interface AddressLinkProps {
  address?: string;
  explorerBaseUrl?: string;
  label?: string;
}

export function AddressLink({ address, explorerBaseUrl, label }: AddressLinkProps) {
  if (!address) return <span>-</span>;
  const href = explorerBaseUrl ? `${explorerBaseUrl.replace(/\/$/, "")}/address/${address}` : undefined;
  const content = (
    <span className="inline-flex min-w-0 items-center gap-1 text-primary">
      <span className="truncate">{label || shortenAddress(address)}</span>
      {href ? <ExternalLink className="h-3.5 w-3.5 shrink-0" /> : null}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    content
  );
}
