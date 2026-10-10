import { isAddress, isHex, decodeFunctionData, encodeFunctionData, type TransactionReceipt } from "viem";
import { createAppWalletContracts } from "./appWalletContracts";
import type { ResolvedContractHandle } from "./resolvedContractTypes";
import { resolveSafeContractWriteFeeOverrides } from "./contractWriteFees";
import { readContractEventsInBlockRanges } from "./contractEvents";
import type { Address, ContractReadRequest, ContractWriteRequest, ContractEventRequest, FlapI18n, FlapNotify, FlapWallet, MediaUploader, MediaUploadOptions, SimulateResult, VaultManifest } from "./types";

export const FLAP_WALLET_RUNTIME_VERSION = 1;
export interface FlapSendTransactionRequest { to: Address; value?: bigint; data?: `0x${string}`; gas?: bigint; gasPrice?: bigint }
export interface FlapTransactionReceipt { hash: Address; status: "success" | "reverted"; blockNumber: bigint; logs: TransactionReceipt["logs"] }
export interface FlapChainSdk {
  context: { chainId: number; manifest: VaultManifest };
  i18n: FlapI18n;
  notify: FlapNotify;
  wallet: Omit<FlapWallet, "balance">;
  resolveContract(id: string, args: readonly unknown[]): Promise<ResolvedContractHandle>;
  readContract<T = unknown>(request: ContractReadRequest): Promise<T>;
  simulateContract(request: ContractWriteRequest): Promise<SimulateResult>;
  writeContract(request: ContractWriteRequest): Promise<Address>;
  sendTransaction(request: FlapSendTransactionRequest): Promise<Address>;
  waitForTx(hash: Address): Promise<FlapTransactionReceipt>;
  getGasPrice(): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
  getBalance(address?: Address): Promise<bigint>;
  getContractEvents<T = unknown>(request: ContractEventRequest): Promise<T[]>;
  uploadImage(file: Blob, options?: MediaUploadOptions): ReturnType<MediaUploader>;
  uploadText(text: string, options?: MediaUploadOptions): ReturnType<MediaUploader>;
  openExplorerTx(hash: Address): void;
}
export interface FlapWalletAccount { address?: Address; chainId?: number; isConnected: boolean }
/** Host-only transport: never supplied by uploaded components. */
export interface FlapWalletRuntime {
  chains: readonly { id: number; name: string; explorerBaseUrl?: string }[];
  readOnly?: boolean;
  generation?: string;
  assertActive?(): void;
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
}): FlapChainSdk {
  const { chainId, i18n, notify } = input;
  const manifest = structuredClone(input.manifest);
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
    const fees = await resolveSafeContractWriteFeeOverrides(snapshot, () => runtime.getGasPrice(chainId));
    const call = appPolicy && prepared ? await appPolicy.validate(prepared, true) : contractRequest(snapshot);
    writeAccount(account);
    return { call: { ...call, ...fees, account, value: snapshot.value }, prepared };
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
      const call = appPolicy ? await appPolicy.validate(appPolicy.snapshot(request), false) : contractRequest(request);
      return runtime.readContract(chainId, call) as Promise<T>;
    },
    simulateContract: async (request) => {
      const { call } = await prepareWrite(request);
      const result = await runtime.simulateContract(chainId, call); writeAccount(call.account);
      return { request: { ...call, ...(typeof request.contract === "object" ? { contract: request.contract, address: undefined } : {}) }, result };
    },
    writeContract: async (request) => {
      let { call, prepared } = await prepareWrite(request);
      if (appPolicy && prepared?.record) {
        await runtime.simulateContract(chainId, call);
        call = { ...call, ...await appPolicy.validate(prepared, true), account: call.account };
      }
      writeAccount(call.account);
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
    uploadImage: (file, options) => runtime.upload({ kind: "image", file, chainId, ...options }),
    uploadText: (text, options) => runtime.upload({ kind: "text", file: new Blob([text], { type: "text/plain;charset=utf-8" }), chainId, ...options }),
    openExplorerTx: (hash) => { if (chain.explorerBaseUrl && /^0x[0-9a-f]{64}$/i.test(hash)) runtime.openUrl(`${chain.explorerBaseUrl.replace(/\/$/, "")}/tx/${hash}`); },
  };
}
