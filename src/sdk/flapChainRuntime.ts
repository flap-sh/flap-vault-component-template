import { isAddress, isHex, decodeFunctionData, encodeFunctionData, parseAbi, type TransactionReceipt } from "viem";
import { createAppWalletContracts } from "./appWalletContracts";
import { erc20Abi } from "./erc20";
import { createIpfsTextReader } from "./ipfsText";
import { readFsiJson } from "./fsi";
import { createBinanceTokenMarketSdk, type BinanceTokenMarketSdk } from "./binanceTokenMarketData";
import type { ResolvedContractHandle } from "./resolvedContractTypes";
import { resolveSafeContractWriteFeeOverrides } from "./contractWriteFees";
import { readContractEventsInBlockRanges } from "./contractEvents";
import type { Address, ContractReadRequest, ContractWriteRequest, ContractEventRequest, FlapI18n, FlapNotify, FlapWallet, MediaUploader, MediaUploadOptions, SimulateResult, VaultManifest } from "./types";

const erc20ApprovalAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export const FLAP_WALLET_RUNTIME_VERSION = 1;
export const PRESALE_APPROVAL_VERSION = 1;
export const APP_ERC20_READ_VERSION = 1;
export interface FlapSendTransactionRequest { to: Address; value?: bigint; data?: `0x${string}`; gas?: bigint; gasPrice?: bigint }
export interface FlapTransactionReceipt { hash: Address; status: "success" | "reverted"; blockNumber: bigint; logs: TransactionReceipt["logs"] }
export interface PresaleQuoteApprovalRequest { pool: ResolvedContractHandle; amount: bigint }
export interface FlapErc20Metadata { name: string | null; symbol: string | null; decimals: number }
export interface FlapErc20ApprovalTarget { contractId: string; token: Address }
export interface FlapErc20ApprovalRequest extends FlapErc20ApprovalTarget { amount: bigint; account?: Address }
export interface FlapChainSdk extends BinanceTokenMarketSdk {
  context: { chainId: number; manifest: VaultManifest };
  i18n: FlapI18n;
  notify: FlapNotify;
  wallet: Omit<FlapWallet, "balance">;
  resolveContract(id: string, args: readonly unknown[]): Promise<ResolvedContractHandle>;
  readContract<T = unknown>(request: ContractReadRequest): Promise<T>;
  /** Opt-in display snapshot only. Never use its results as transaction authorization. */
  withDisplayReadBatch?<T>(read: (sdk: Pick<FlapChainSdk, "context" | "readContract" | "resolveContract">) => Promise<T>): Promise<T>;
  simulateContract(request: ContractWriteRequest): Promise<SimulateResult>;
  writeContract(request: ContractWriteRequest): Promise<Address>;
  approveQuote(request: PresaleQuoteApprovalRequest): Promise<Address>;
  readErc20Metadata(token: Address, options?: { decimalsOnly?: false }): Promise<FlapErc20Metadata>;
  readErc20Metadata(token: Address, options: { decimalsOnly: true }): Promise<Pick<FlapErc20Metadata, "decimals">>;
  readErc20Balance(token: Address): Promise<bigint>;
  readErc20Approval(target: FlapErc20ApprovalTarget): Promise<{ allowance: bigint; decimals: number }>;
  approveErc20(request: FlapErc20ApprovalRequest): Promise<Address>;
  sendTransaction(request: FlapSendTransactionRequest): Promise<Address>;
  waitForTx(hash: Address): Promise<FlapTransactionReceipt>;
  getGasPrice(): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
  getBalance(address?: Address): Promise<bigint>;
  getContractEvents<T = unknown>(request: ContractEventRequest): Promise<T[]>;
  readIpfsText(cid: string, path?: string): Promise<string>;
  readFsi<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  uploadImage(file: Blob, options?: MediaUploadOptions): ReturnType<MediaUploader>;
  uploadText(text: string, options?: MediaUploadOptions): ReturnType<MediaUploader>;
  openExplorerTx(hash: Address): void;
}
export interface FlapWalletAccount { address?: Address; chainId?: number; isConnected: boolean }
/** Host-created reads pinned to one block; no wallet or transaction capabilities. */
export interface FlapDisplayReadSnapshot {
  getCode(address: Address): Promise<`0x${string}` | undefined>;
  readContract(request: ContractReadRequest): Promise<unknown>;
}
/** Host-only transport: never supplied by uploaded components. */
export interface FlapWalletRuntime {
  chains: readonly { id: number; name: string; explorerBaseUrl?: string }[];
  readOnly?: boolean;
  generation?: string;
  assertActive?(): void;
  /** Authorize the reviewed Launcher for this host context and resolve its ERC20 quote token and cap. */
  resolvePresaleApproval?(input: { chainId: number; policyId: string; factory: Address; launcher: Address }): Promise<{ quoteToken: Address; maxApprovalWei: bigint }>;
  getAccount(): FlapWalletAccount;
  connect(): void;
  disconnect(): void;
  switchChain(chainId: number): Promise<void>;
  readContract(chainId: number, request: ContractReadRequest): Promise<unknown>;
  simulateContract(chainId: number, request: ContractWriteRequest & { account: Address }): Promise<unknown>;
  writeContract(chainId: number, request: ContractWriteRequest & { account: Address }): Promise<Address>;
  sendTransaction(chainId: number, request: FlapSendTransactionRequest & { account: Address }): Promise<Address>;
  waitForTx(chainId: number, hash: Address): Promise<FlapTransactionReceipt>;
  getCode(chainId: number, address: Address): Promise<`0x${string}` | undefined>;
  createDisplayReadSnapshot?(chainId: number): Promise<FlapDisplayReadSnapshot>;
  getGasPrice(chainId: number): Promise<bigint>;
  getBlockNumber(chainId: number): Promise<bigint>;
  getBalance(chainId: number, address: Address): Promise<bigint>;
  getContractEvents(chainId: number, request: ContractEventRequest): Promise<unknown[]>;
  upload: MediaUploader;
  openUrl(url: string): void;
}
function assertAddress(address: unknown): asserts address is Address {
  if (typeof address !== "string" || !isAddress(address, { strict: false }) || /^0x0{40}$/i.test(address)) throw new Error("A valid nonzero target address is required.");
}
function contractRequest(request: ContractReadRequest): ContractReadRequest {
  assertAddress(request.address);
  if (!Array.isArray(request.abi) || !request.abi.length || !request.functionName?.trim()) throw new Error("Contract calls require an explicit ABI and function name.");
  return { address: request.address, abi: request.abi, functionName: request.functionName, args: request.args, account: request.account, gasPrice: request.gasPrice };
}
function assertValue(value?: bigint) {
  if (value !== undefined && (typeof value !== "bigint" || value < 0n)) throw new Error("Transaction value must be a nonnegative bigint.");
}
export function createFlapChainSdk(runtime: FlapWalletRuntime, input: {
  chainId: number; manifest: VaultManifest; writableChains: readonly number[]; i18n: FlapI18n; notify: FlapNotify;
  readIpfsText?: (cid: string, path?: string) => Promise<string>;
  binanceTokenMarket?: BinanceTokenMarketSdk;
}): FlapChainSdk {
  const { chainId, i18n, notify } = input;
  const manifest = structuredClone(input.manifest);
  const binanceEndpoints = structuredClone(manifest.endpoints);
  const binanceTokenMarket = input.binanceTokenMarket ?? createBinanceTokenMarketSdk(() => binanceEndpoints);
  const writableChains = [...input.writableChains];
  const chain = runtime.chains.find((item) => item.id === chainId);
  if (!Number.isSafeInteger(chainId) || !chain) throw new Error(`Unsupported host chain ${chainId}.`);
  const chainName = chain.name;
  const appPolicy = manifest.appModel === "standalone" ? createAppWalletContracts(runtime, chainId, manifest) : undefined;
  function writeAccount(expected?: Address) {
    runtime.assertActive?.();
    if (runtime.readOnly) throw new Error("Preview fixtures cannot authorize transactions.");
    if (!writableChains.includes(chainId)) throw new Error(`Declare walletChains containing ${chainId} before using wallet actions.`);
    const account = runtime.getAccount();
    if (!account.isConnected || !account.address) throw new Error("Connect the host wallet before using wallet actions.");
    if (account.chainId !== chainId) throw new Error(`Switch the host wallet to ${chainName} before using wallet actions.`);
    if (expected && expected.toLowerCase() !== account.address.toLowerCase()) throw new Error("The host wallet account changed. Review the transaction again.");
    return account.address;
  }
  async function prepareWrite(request: ContractWriteRequest) {
    const account = writeAccount(request.account);
    const prepared = appPolicy?.snapshot(request);
    const snapshot = prepared?.request ?? structuredClone(request);
    assertValue(snapshot.value);
    const fees = await resolveSafeContractWriteFeeOverrides(snapshot, () => runtime.getGasPrice(chainId), chainId);
    const { call, presaleQuoteToken } = appPolicy && prepared
      ? await appPolicy.validate(prepared, true, account)
      : { call: contractRequest(snapshot), presaleQuoteToken: undefined };
    writeAccount(account);
    return { call: { ...call, ...fees, account, value: snapshot.value }, prepared, presaleQuoteToken };
  }
  function assertErc20ReadTarget(token: unknown): asserts token is Address {
    runtime.assertActive?.();
    if (!appPolicy) throw new Error("ERC-20 reads by address are available to standalone Mini Apps.");
    assertAddress(token);
  }

  async function readErc20Text(token: Address, functionName: "name" | "symbol") {
    try {
      const text = await runtime.readContract(chainId, { address: token, abi: erc20Abi, functionName });
      return typeof text === "string" ? text.trim() || null : null;
    } catch {
      return null;
    }
  }

  async function readTokenDecimals(token: Address) {
    const decimals = await runtime.readContract(chainId, { address: token, abi: erc20Abi, functionName: "decimals" });
    if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error("Invalid ERC-20 decimals.");
    }
    return decimals;
  }

  function readErc20Metadata(token: Address, options?: { decimalsOnly?: false }): Promise<FlapErc20Metadata>;
  function readErc20Metadata(token: Address, options: { decimalsOnly: true }): Promise<Pick<FlapErc20Metadata, "decimals">>;
  async function readErc20Metadata(token: Address, options?: { decimalsOnly?: boolean }) {
    assertErc20ReadTarget(token);
    if (options?.decimalsOnly === true) {
      const decimals = await readTokenDecimals(token);
      runtime.assertActive?.();
      return { decimals };
    }
    const [name, symbol, decimals] = await Promise.all([
      readErc20Text(token, "name"),
      readErc20Text(token, "symbol"),
      readTokenDecimals(token),
    ]);
    runtime.assertActive?.();
    return { name, symbol, decimals };
  }

  function erc20Approval(contractId: string, token: Address) {
    if (!appPolicy) throw new Error("app-wallet/undeclared-erc20-approval");
    assertAddress(token);
    return appPolicy.erc20Approval(contractId, token);
  }
  let switchingChain = false;
  const wallet: Omit<FlapWallet, "balance"> = {
    get address() { return runtime.getAccount().isConnected ? runtime.getAccount().address : undefined; },
    get chainId() { return runtime.getAccount().chainId; },
    get chainLabel() { return runtime.chains.find((item) => item.id === runtime.getAccount().chainId)?.name; },
    requiredChainId: chainId, requiredChainLabel: chain.name,
    get isConnected() { return runtime.getAccount().isConnected; },
    get isWrongNetwork() { const account = runtime.getAccount(); return account.isConnected && account.chainId !== chainId; },
    canSwitchChain: !runtime.readOnly, get isSwitchingChain() { return switchingChain; },
    connect: () => runtime.connect(), disconnect: () => runtime.disconnect(),
    switchChain: async () => { if (runtime.readOnly) throw new Error("Preview fixtures cannot switch a wallet."); switchingChain = true; try { await runtime.switchChain(chainId); } finally { switchingChain = false; } },
  };
  return {
    context: { chainId, manifest }, i18n, notify, wallet,
    resolveContract: async (id, args) => { if (!appPolicy) throw new Error("Use the Vault SDK's resolveContract for bound targets."); return appPolicy.resolveContract(id, args); },
    readContract: async <T,>(request: ContractReadRequest) => {
      const call = appPolicy ? (await appPolicy.validate(appPolicy.snapshot(request), false)).call : contractRequest(request);
      return runtime.readContract(chainId, call) as Promise<T>;
    },
    withDisplayReadBatch: async <T,>(read: (sdk: Pick<FlapChainSdk, "context" | "readContract" | "resolveContract">) => Promise<T>) => {
      let active = true;
      const assertActive = () => { if (!active) throw new Error("app-wallet/display-batch-closed"); runtime.assertActive?.(); };
      let pendingSnapshot: Promise<FlapDisplayReadSnapshot> | undefined;
      // Resolve the block lazily: invalid quantities/targets need no extra RPC.
      const snapshot = () => {
        assertActive();
        if (!pendingSnapshot) {
          const pending = Promise.resolve().then(() => runtime.createDisplayReadSnapshot!(chainId));
          pendingSnapshot = pending;
          void pending.catch(() => { if (pendingSnapshot === pending) pendingSnapshot = undefined; });
        }
        return pendingSnapshot;
      };
      const pinned: FlapDisplayReadSnapshot = {
        getCode: async address => { const reads = await snapshot(); assertActive(); return reads.getCode(address); },
        readContract: async request => { const reads = await snapshot(); assertActive(); return reads.readContract(request); },
      };
      // Older hosts keep the exact fresh-read path, without claiming a snapshot
      // or caching latest reads across potentially different blocks.
      const scopedPolicy = runtime.createDisplayReadSnapshot ? appPolicy?.withDisplayReadSnapshot(pinned) : undefined;
      const facade = Object.freeze({
        context: { chainId, manifest },
        resolveContract: async (id: string, args: readonly unknown[]) => {
          assertActive();
          if (!appPolicy) throw new Error("Use the Vault SDK's resolveContract for bound targets.");
          const handle = await (scopedPolicy ? scopedPolicy.resolveContract(id, args) : appPolicy.resolveContract(id, args));
          assertActive(); return handle;
        },
        readContract: async <R,>(request: ContractReadRequest): Promise<R> => {
          assertActive();
          const call = appPolicy ? (scopedPolicy ? await scopedPolicy.validate(appPolicy.snapshot(request)) : await appPolicy.validate(appPolicy.snapshot(request), false)).call : contractRequest(request);
          assertActive();
          const value = runtime.createDisplayReadSnapshot ? await pinned.readContract(call) : await runtime.readContract(chainId, call);
          assertActive(); return value as R;
        },
      });
      try { return await read(facade); }
      finally { active = false; scopedPolicy?.close(); pendingSnapshot = undefined; }
    },
    simulateContract: async (request) => {
      const { call } = await prepareWrite(request);
      const result = await runtime.simulateContract(chainId, call); writeAccount(call.account);
      return { request: { ...call, ...(typeof request.contract === "object" ? { contract: request.contract, address: undefined } : {}) }, result };
    },
    writeContract: async (request) => {
      const { call, prepared, presaleQuoteToken } = await prepareWrite(request);
      if (appPolicy && prepared?.record) {
        await runtime.simulateContract(chainId, call);
        const rechecked = await appPolicy.validate(prepared, true, call.account);
        if (rechecked.presaleQuoteToken?.toLowerCase() !== presaleQuoteToken?.toLowerCase()) throw new Error("app-wallet/presale-quote-changed");
      }
      writeAccount(call.account);
      return runtime.writeContract(chainId, call);
    },
    approveQuote: async (request) => {
      const account = writeAccount();
      if (!appPolicy) throw new Error("app-wallet/presale-approval-unavailable");
      const prepared = appPolicy.snapshotQuoteApproval(request);
      const call = await appPolicy.validateQuoteApproval(prepared);
      writeAccount(account);
      const accepted = await runtime.simulateContract(chainId, { ...call, account });
      if (accepted !== true) throw new Error("app-wallet/presale-approval-simulation-failed");
      const rechecked = await appPolicy.validateQuoteApproval(prepared);
      if (rechecked.address.toLowerCase() !== call.address.toLowerCase()) throw new Error("app-wallet/presale-quote-changed");
      writeAccount(account);
      return runtime.writeContract(chainId, { ...call, account });
    },
    readErc20Metadata,
    readErc20Balance: async token => {
      assertErc20ReadTarget(token);
      const { address: owner, isConnected } = runtime.getAccount();
      if (!isConnected || !owner) throw new Error("Connect the host wallet before reading its ERC-20 balance.");
      const balance = await runtime.readContract(chainId, { address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
      runtime.assertActive?.();
      const current = runtime.getAccount();
      if (!current.isConnected || current.address?.toLowerCase() !== owner.toLowerCase()) {
        throw new Error("The host wallet account changed. Read the balance again.");
      }
      if (typeof balance !== "bigint" || balance < 0n) throw new Error("Invalid ERC-20 balance.");
      return balance;
    },
    readErc20Approval: async ({ contractId, token }) => {
      runtime.assertActive?.();
      const { spender, checkContracts } = erc20Approval(contractId, token);
      const account = runtime.getAccount();
      if (!account.isConnected || !account.address) throw new Error("Connect the host wallet before reading its allowance.");
      await checkContracts();
      const [allowance, decimals] = await Promise.all([
        runtime.readContract(chainId, { address: token, abi: erc20ApprovalAbi, functionName: "allowance", args: [account.address, spender] }),
        runtime.readContract(chainId, { address: token, abi: erc20ApprovalAbi, functionName: "decimals" }),
      ]);
      runtime.assertActive?.();
      const current = runtime.getAccount();
      if (!current.isConnected || current.address?.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error("The host wallet account changed. Review the transaction again.");
      }
      if (typeof allowance !== "bigint" || typeof decimals !== "number") throw new Error("Invalid ERC-20 approval state.");
      return { allowance, decimals };
    },
    approveErc20: async ({ contractId, token, amount, account: expected }) => {
      const account = writeAccount(expected);
      const { spender, maxAmount, checkContracts } = erc20Approval(contractId, token);
      if (typeof amount !== "bigint" || amount < 0n || amount > maxAmount) throw new Error("app-wallet/approval-cap-exceeded");
      const call = { address: token, abi: erc20ApprovalAbi, functionName: "approve", args: [spender, amount], account };
      await checkContracts();
      writeAccount(account);
      if (await runtime.simulateContract(chainId, { ...call, args: [...call.args] }) !== true) throw new Error("app-wallet/erc20-approval-simulation-failed");
      await checkContracts();
      writeAccount(account);
      return runtime.writeContract(chainId, call);
    },
    sendTransaction: async (request) => {
      request = structuredClone(request);
      const account = writeAccount(); assertAddress(request.to); assertValue(request.value);
      if (!appPolicy || !request.data || !isHex(request.data, { strict: true }) || request.data.length % 2 !== 0) throw new Error("Raw transactions require declared App contract calldata.");
      const root = appPolicy.roots.find((p) => p.definition.address.toLowerCase() === request.to.toLowerCase());
      if (!root) throw new Error("app-wallet/undeclared-target");
      const decoded = decodeFunctionData({ abi: root.writes, data: request.data });
      const { call } = await prepareWrite({ address: request.to, abi: root.writes, functionName: decoded.functionName!, args: decoded.args ? [...decoded.args] : [], value: request.value, gas: request.gas, gasPrice: request.gasPrice });
      writeAccount(account);
      return runtime.sendTransaction(chainId, { to: call.address!, data: encodeFunctionData(call as never), value: call.value, gas: call.gas, gasPrice: call.gasPrice, account });
    },
    waitForTx: (hash) => { if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Invalid transaction hash."); return runtime.waitForTx(chainId, hash); },
    getGasPrice: () => runtime.getGasPrice(chainId), getBlockNumber: () => runtime.getBlockNumber(chainId),
    getBalance: async (address = runtime.getAccount().address) => { assertAddress(address); return runtime.getBalance(chainId, address); },
    getContractEvents: async <T,>(request: ContractEventRequest) => {
      assertAddress(request.address);
      if (!request.abi?.length || !request.eventName?.trim()) throw new Error("Event lookup requires an ABI and event name.");
      return readContractEventsInBlockRanges<T>({ fromBlock: request.fromBlock, toBlock: typeof request.toBlock === "bigint" ? request.toBlock : await runtime.getBlockNumber(chainId), readRange: async (range) => runtime.getContractEvents(chainId, { ...request, ...range }) as Promise<T[]> });
    },
    readIpfsText: input.readIpfsText ?? createIpfsTextReader(),
    readFsi: <T,>(path: string, params?: Record<string, string>) => readFsiJson<T>(manifest.endpoints ?? [], path, params),
    ...binanceTokenMarket,
    uploadImage: (file, options) => runtime.upload({ kind: "image", file, chainId, ...options }),
    uploadText: (text, options) => runtime.upload({ kind: "text", file: new Blob([text], { type: "text/plain;charset=utf-8" }), chainId, ...options }),
    openExplorerTx: (hash) => { if (chain.explorerBaseUrl && /^0x[0-9a-f]{64}$/i.test(hash)) runtime.openUrl(`${chain.explorerBaseUrl.replace(/\/$/, "")}/tx/${hash}`); },
  };
}
