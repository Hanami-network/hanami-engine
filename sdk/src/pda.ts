import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  POOL_SEED,
  VAULT_A_SEED,
  VAULT_B_SEED,
  BLOOM_SEED,
  PROGRAM_ID_STR,
} from "./constants";

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

export function sortMintPair(a: PublicKey, b: PublicKey): [PublicKey, PublicKey] {
  return a.toBuffer().compare(b.toBuffer()) <= 0 ? [a, b] : [b, a];
}

export function derivePoolPda(
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const [a, b] = sortMintPair(tokenAMint, tokenBMint);
  return PublicKey.findProgramAddressSync([POOL_SEED, a.toBuffer(), b.toBuffer()], programId);
}

export function deriveVaultAPda(
  pool: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_A_SEED, pool.toBuffer()], programId);
}

export function deriveVaultBPda(
  pool: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_B_SEED, pool.toBuffer()], programId);
}

export function deriveBloomPda(
  pool: PublicKey,
  owner: PublicKey,
  nonce: BN,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const nonceBytes = nonce.toArrayLike(Buffer, "le", 8);
  return PublicKey.findProgramAddressSync(
    [BLOOM_SEED, pool.toBuffer(), owner.toBuffer(), nonceBytes],
    programId,
  );
}
