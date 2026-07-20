"use client";

import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { ReactNode, useState } from "react";
import { fallback, http, WagmiProvider } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { robinhoodChain, robinhoodTestnet } from "@/src/sdk/robinhoodChain";

const defaultWalletConnectProjectId = "0f5b4547ebf94f1fe8e524147e630fd9";
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || defaultWalletConnectProjectId;
const defaultBscRpcUrls = ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed-public.bnbchain.org"] as const;
const defaultBscTestnetRpcUrls = [
  "https://bsc-testnet-dataseed.bnbchain.org",
  "https://bsc-testnet.bnbchain.org",
  "https://bsc-prebsc-dataseed.bnbchain.org",
] as const;
const defaultRobinhoodRpcUrls = ["https://rpc.mainnet.chain.robinhood.com"] as const;
const defaultRobinhoodTestnetRpcUrls = ["https://rpc.testnet.chain.robinhood.com/rpc"] as const;

function resolveRpcUrls(primary: string | undefined, fallbacks: readonly string[]) {
  const primaryUrls =
    primary
      ?.split(",")
      .map((url) => url.trim())
      .filter(Boolean) ?? [];
  const urls = [...primaryUrls, ...fallbacks].filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

function createWagmiConfig(projectId: string) {
  const bscRpcUrls = resolveRpcUrls(process.env.NEXT_PUBLIC_BSC_RPC_URL, defaultBscRpcUrls);
  const bscTestnetRpcUrls = resolveRpcUrls(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL, defaultBscTestnetRpcUrls);
  const robinhoodRpcUrls = resolveRpcUrls(process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL, defaultRobinhoodRpcUrls);
  const robinhoodTestnetRpcUrls = resolveRpcUrls(process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL, defaultRobinhoodTestnetRpcUrls);
  return getDefaultConfig({
    appName: "Flap",
    appIcon: "/logo.png",
    appDescription: "Instantly Launch and Trade Your Own Token",
    projectId,
    chains: [bsc, robinhoodChain, bscTestnet, robinhoodTestnet],
    transports: {
      // Override wagmi's BSC default transport so local preview does not fall back to thirdweb's shared public RPC.
      [bsc.id]: fallback(bscRpcUrls.map((url) => http(url))),
      [bscTestnet.id]: fallback(bscTestnetRpcUrls.map((url) => http(url))),
      [robinhoodChain.id]: fallback(robinhoodRpcUrls.map((url) => http(url))),
      [robinhoodTestnet.id]: fallback(robinhoodTestnetRpcUrls.map((url) => http(url))),
    },
    ssr: true,
  });
}

export function WalletRuntimeProviders({ children }: { children: ReactNode }) {
  const [wagmiConfig] = useState(() => createWagmiConfig(walletConnectProjectId));

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <RainbowKitProvider theme={darkTheme({ borderRadius: "small" })} modalSize="compact">
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
