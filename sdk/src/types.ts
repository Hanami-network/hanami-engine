import type { Connection, PublicKey, Signer } from "@solana/web3.js";
import type BN from "bn.js";

export interface ClientConfig {
  connection: Connection;
  wallet: Signer;
  programId?: PublicKey;
  commitment?: "processed" | "confirmed" | "finalized";
}

export interface PoolState {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  reserveA: BN;
  reserveB: BN;
  totalLiquidity: BN;
  cumulativeFeePerShareA: BN;
  cumulativeFeePerShareB: BN;
  totalFeesA: BN;
  totalFeesB: BN;
  activeBlooms: BN;
  feeBps: number;
  bump: number;
}

export interface BloomPositionState {
  owner: PublicKey;
  pool: PublicKey;
  liquidity: BN;
  startSlot: BN;
  endSlot: BN;
  entryCumulativeFeeA: BN;
  entryCumulativeFeeB: BN;
  depositedA: BN;
  depositedB: BN;
  entryPrice: BN;
  nonce: BN;
  settled: boolean;
  bump: number;
}

export type BloomLifecycle = "pending" | "active" | "matured" | "settled";

export interface InitializePoolArgs {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  feeBps: number;
}

export interface CreateBloomArgs {
  pool: PublicKey;
  amountA: BN;
  amountB: BN;
  durationSlots: BN;
  nonce?: BN;
}

export interface SwapArgs {
  pool: PublicKey;
  amountIn: BN;
  minOut: BN;
  aToB: boolean;
}

export interface SettleArgs {
  pool: PublicKey;
  bloom: PublicKey;
}
