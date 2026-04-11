import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Hanami } from "../target/types/hanami";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const BLOOM_SEED = Buffer.from("bloom");

describe("hanami", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Hanami as Program<Hanami>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  let tokenAMint: PublicKey;
  let tokenBMint: PublicKey;
  let poolPda: PublicKey;
  let vaultA: PublicKey;
  let vaultB: PublicKey;

  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const trader = Keypair.generate();

  let aliceAtaA: PublicKey;
  let aliceAtaB: PublicKey;
  let bobAtaA: PublicKey;
  let bobAtaB: PublicKey;
  let traderAtaA: PublicKey;
  let traderAtaB: PublicKey;

  const FEE_BPS = 30;
  const DECIMALS = 6;
  const UNIT = 10 ** DECIMALS;

  function bloomPda(pool: PublicKey, owner: PublicKey, nonce: BN): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [BLOOM_SEED, pool.toBuffer(), owner.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    return pda;
  }

  async function airdrop(to: PublicKey, sol: number) {
    const sig = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function waitForSlot(target: number, timeoutMs = 60_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await connection.getSlot("confirmed");
      if (s >= target) return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timed out waiting for slot ${target}`);
  }

  before(async () => {
    await airdrop(alice.publicKey, 10);
    await airdrop(bob.publicKey, 10);
    await airdrop(trader.publicKey, 10);

    tokenAMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
    tokenBMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);

    if (tokenAMint.toBuffer().compare(tokenBMint.toBuffer()) > 0) {
      [tokenAMint, tokenBMint] = [tokenBMint, tokenAMint];
    }

    const createAta = async (owner: Keypair, mint: PublicKey) =>
      (await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner.publicKey)).address;

    aliceAtaA = await createAta(alice, tokenAMint);
    aliceAtaB = await createAta(alice, tokenBMint);
    bobAtaA = await createAta(bob, tokenAMint);
    bobAtaB = await createAta(bob, tokenBMint);
    traderAtaA = await createAta(trader, tokenAMint);
    traderAtaB = await createAta(trader, tokenBMint);

    const mintAmt = 1_000_000n * BigInt(UNIT);
    await mintTo(connection, payer, tokenAMint, aliceAtaA, payer, mintAmt);
    await mintTo(connection, payer, tokenBMint, aliceAtaB, payer, mintAmt);
    await mintTo(connection, payer, tokenAMint, bobAtaA, payer, mintAmt);
    await mintTo(connection, payer, tokenBMint, bobAtaB, payer, mintAmt);
    await mintTo(connection, payer, tokenAMint, traderAtaA, payer, mintAmt);
    await mintTo(connection, payer, tokenBMint, traderAtaB, payer, mintAmt);

    [poolPda] = PublicKey.findProgramAddressSync(
      [POOL_SEED, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
      program.programId,
    );
    [vaultA] = PublicKey.findProgramAddressSync(
      [VAULT_A_SEED, poolPda.toBuffer()],
      program.programId,
    );
    [vaultB] = PublicKey.findProgramAddressSync(
      [VAULT_B_SEED, poolPda.toBuffer()],
      program.programId,
    );
  });

  it("initializes pool", async () => {
    await program.methods
      .initializePool(FEE_BPS)
      .accounts({
        authority: payer.publicKey,
        tokenAMint,
        tokenBMint,
        pool: poolPda,
        vaultA,
        vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    expect(pool.feeBps).to.equal(FEE_BPS);
    expect(pool.reserveA.toNumber()).to.equal(0);
    expect(pool.reserveB.toNumber()).to.equal(0);
    expect(pool.totalLiquidity.toString()).to.equal("0");
    expect(pool.tokenAMint.toBase58()).to.equal(tokenAMint.toBase58());
    expect(pool.tokenBMint.toBase58()).to.equal(tokenBMint.toBase58());
  });

  it("rejects invalid fee on a second pool", async () => {
    try {
      const bad = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
      const badMintPair = [tokenAMint, bad].sort((a, b) => a.toBuffer().compare(b.toBuffer()));
      const [badPool] = PublicKey.findProgramAddressSync(
        [POOL_SEED, badMintPair[0].toBuffer(), badMintPair[1].toBuffer()],
        program.programId,
      );
      const [badVaultA] = PublicKey.findProgramAddressSync(
        [VAULT_A_SEED, badPool.toBuffer()],
        program.programId,
      );
      const [badVaultB] = PublicKey.findProgramAddressSync(
        [VAULT_B_SEED, badPool.toBuffer()],
        program.programId,
      );
      await program.methods
        .initializePool(5000)
        .accounts({
});
