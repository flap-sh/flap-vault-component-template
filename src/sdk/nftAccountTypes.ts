import type { Address } from "./types";

/** A request for review, never an authorization. No caller-supplied addresses. */
export interface ManifestNftAccountWithdrawal {
  policyId: string;
  profile: "null-bag-withdraw-v1";
}

export interface ReviewedContractPin {
  address: Address;
  codeHash: Address;
}

export interface ReviewedBeaconPin extends ReviewedContractPin {
  beacon: ReviewedContractPin;
  implementation: ReviewedContractPin;
}

/** Host-owned, deployment-specific approval. Never load this from artifact JSON. */
export interface NftAccountWithdrawalPolicy {
  policyId: string;
  profile: "null-bag-withdraw-v1";
  artifactId: string;
  chainId: number;
  factory: ReviewedContractPin;
  vault: ReviewedBeaconPin;
  nft: ReviewedBeaconPin;
  token: ReviewedContractPin;
  registry: ReviewedContractPin;
  accountImplementation: ReviewedContractPin;
  salt: Address;
}

export interface NftAccountWithdrawalRequest {
  policyId: string;
  tokenId: bigint;
  /** Base units of the bag ERC20; this is not native BNB. */
  amount: bigint;
}

export interface NftAccountWithdrawalReceipt {
  hash: Address;
  status: "reverted" | "withdrawn" | "withdrawn-sync-required" | "effect-unconfirmed";
  accountAddress: Address;
  recipient: Address;
  amount: bigint;
  /** Refreshed at the receipt block. Undefined if the RPC read failed. */
  balanceAfter?: bigint;
}
