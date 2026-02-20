import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  PROGRAM_ID,
  derivePoolPda,
  deriveVaultAPda,
  deriveVaultBPda,
  deriveBloomPda,
  sortMintPair,
} from "../pda";

describe("pda derivations", () => {
  const mintA = new PublicKey("11111111111111111111111111111111");
  const mintB = new PublicKey("So11111111111111111111111111111111111111112");

  test("sortMintPair returns ascending pubkey order", () => {
    const [a, b] = sortMintPair(mintB, mintA);
    expect(a.toBase58()).toBe(mintA.toBase58());
    expect(b.toBase58()).toBe(mintB.toBase58());
  });

  test("derivePoolPda is deterministic and order-independent", () => {
    const [pool1] = derivePoolPda(mintA, mintB);
    const [pool2] = derivePoolPda(mintB, mintA);
    expect(pool1.toBase58()).toBe(pool2.toBase58());
  });

  test("derivePoolPda is unique per program id", () => {
    const otherProgram = new PublicKey("11111111111111111111111111111112");
    const [poolDefault] = derivePoolPda(mintA, mintB);
    const [poolOther] = derivePoolPda(mintA, mintB, otherProgram);
    expect(poolDefault.toBase58()).not.toBe(poolOther.toBase58());
  });

  test("vault PDAs are stable for the same pool", () => {
    const [pool] = derivePoolPda(mintA, mintB);
    const [vA1] = deriveVaultAPda(pool);
    const [vA2] = deriveVaultAPda(pool);
    const [vB] = deriveVaultBPda(pool);
    expect(vA1.toBase58()).toBe(vA2.toBase58());
    expect(vA1.toBase58()).not.toBe(vB.toBase58());
  });

  test("deriveBloomPda is unique per nonce per owner", () => {
    const [pool] = derivePoolPda(mintA, mintB);
    const owner = Keypair.generate().publicKey;
    const [b1] = deriveBloomPda(pool, owner, new BN(1));
    const [b2] = deriveBloomPda(pool, owner, new BN(2));
    expect(b1.toBase58()).not.toBe(b2.toBase58());
  });

  test("PROGRAM_ID is exported and base58-decodable", () => {
    expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(PROGRAM_ID.toBytes()).toHaveLength(32);
  });
});
