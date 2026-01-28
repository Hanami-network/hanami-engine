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
          authority: payer.publicKey,
          tokenAMint: badMintPair[0],
          tokenBMint: badMintPair[1],
          pool: badPool,
          vaultA: badVaultA,
          vaultB: badVaultB,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      assert.fail("should have thrown on fee > 1000 bps");
    } catch (e: any) {
      expect(String(e)).to.match(/FeeTooHigh|0x1770|6000/);
    }
  });

  it("alice creates first bloom (genesis liquidity)", async () => {
    const nonce = new BN(1);
    const amountA = new BN(100_000 * UNIT);
    const amountB = new BN(100_000 * UNIT);
    const durationSlots = new BN(40);

    const bloom = bloomPda(poolPda, alice.publicKey, nonce);

    await program.methods
      .createBloom(nonce, amountA, amountB, durationSlots)
      .accounts({
        user: alice.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: aliceAtaA,
        userTokenB: aliceAtaB,
        bloom,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([alice])
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    const bl = await program.account.bloomPosition.fetch(bloom);

    expect(pool.reserveA.toString()).to.equal(amountA.toString());
    expect(pool.reserveB.toString()).to.equal(amountB.toString());
    expect(pool.totalLiquidity.toString()).to.equal(
      isqrtBN(amountA.mul(amountB)).toString(),
    );
    expect(bl.owner.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(bl.settled).to.equal(false);
    expect(bl.depositedA.toString()).to.equal(amountA.toString());
    expect(bl.depositedB.toString()).to.equal(amountB.toString());
    expect(bl.endSlot.sub(bl.startSlot).toString()).to.equal(durationSlots.toString());
  });

  it("rejects duration below minimum", async () => {
    const nonce = new BN(99);
    const amountA = new BN(10 * UNIT);
    const amountB = new BN(10 * UNIT);
    const badDuration = new BN(5);
    const bloom = bloomPda(poolPda, alice.publicKey, nonce);

    try {
      await program.methods
        .createBloom(nonce, amountA, amountB, badDuration)
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          vaultA,
          vaultB,
          userTokenA: aliceAtaA,
          userTokenB: aliceAtaB,
          bloom,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([alice])
        .rpc();
      assert.fail("should have rejected short duration");
    } catch (e: any) {
      expect(String(e)).to.match(/InvalidDuration|0x1771|6001/);
    }
  });

  it("trader swaps A->B, fees accumulate", async () => {
    const amountIn = new BN(10_000 * UNIT);
    const beforePool = await program.account.pool.fetch(poolPda);

    await program.methods
      .swap(amountIn, new BN(0), true)
      .accounts({
        user: trader.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: traderAtaA,
        userTokenB: traderAtaB,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();

    const afterPool = await program.account.pool.fetch(poolPda);
    expect(afterPool.reserveA.gt(beforePool.reserveA)).to.equal(true);
    expect(afterPool.reserveB.lt(beforePool.reserveB)).to.equal(true);
    expect(afterPool.totalFeesA.gt(beforePool.totalFeesA)).to.equal(true);

    const expectedFee = amountIn.mul(new BN(FEE_BPS)).div(new BN(10_000));
    expect(afterPool.totalFeesA.toString()).to.equal(expectedFee.toString());
  });

  it("trader swaps B->A in opposite direction", async () => {
    const amountIn = new BN(5_000 * UNIT);
    const beforePool = await program.account.pool.fetch(poolPda);

    await program.methods
      .swap(amountIn, new BN(0), false)
      .accounts({
        user: trader.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: traderAtaA,
        userTokenB: traderAtaB,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([trader])
      .rpc();

    const afterPool = await program.account.pool.fetch(poolPda);
    expect(afterPool.reserveB.gt(beforePool.reserveB)).to.equal(true);
    expect(afterPool.reserveA.lt(beforePool.reserveA)).to.equal(true);
    expect(afterPool.totalFeesB.gt(beforePool.totalFeesB)).to.equal(true);
  });

  it("bob creates second bloom alongside alice", async () => {
    const nonce = new BN(1);
    const amountA = new BN(50_000 * UNIT);
    const amountB = new BN(50_000 * UNIT);
    const durationSlots = new BN(30);

    const bloom = bloomPda(poolPda, bob.publicKey, nonce);

    await program.methods
      .createBloom(nonce, amountA, amountB, durationSlots)
      .accounts({
        user: bob.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: bobAtaA,
        userTokenB: bobAtaB,
        bloom,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([bob])
      .rpc();

    const bl = await program.account.bloomPosition.fetch(bloom);
    expect(bl.owner.toBase58()).to.equal(bob.publicKey.toBase58());
  });

  it("rejects settle before maturity", async () => {
    const nonce = new BN(1);
    const bloom = bloomPda(poolPda, alice.publicKey, nonce);

    try {
      await program.methods
        .settleBloom()
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          vaultA,
          vaultB,
          userTokenA: aliceAtaA,
          userTokenB: aliceAtaB,
          bloom,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();
      assert.fail("should have blocked early settle");
    } catch (e: any) {
      expect(String(e)).to.match(/BloomNotMatured|0x1777|6007/);
    }
  });

  it("bob chirigiwa (early unbloom with 5% penalty)", async () => {
    const nonce = new BN(1);
    const bloom = bloomPda(poolPda, bob.publicKey, nonce);

    const blBefore = await program.account.bloomPosition.fetch(bloom);
    const bobABefore = Number((await getAccount(connection, bobAtaA)).amount);
    const bobBBefore = Number((await getAccount(connection, bobAtaB)).amount);

    await program.methods
      .chirigiwa()
      .accounts({
        user: bob.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: bobAtaA,
        userTokenB: bobAtaB,
        bloom,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    const blAfter = await program.account.bloomPosition.fetch(bloom);
    const bobAAfter = Number((await getAccount(connection, bobAtaA)).amount);
    const bobBAfter = Number((await getAccount(connection, bobAtaB)).amount);

    expect(blAfter.settled).to.equal(true);

    const deltaA = bobAAfter - bobABefore;
    const deltaB = bobBAfter - bobBBefore;

    const depositA = blBefore.depositedA.toNumber();
    const depositB = blBefore.depositedB.toNumber();

    expect(deltaA).to.be.gt(0);
    expect(deltaB).to.be.gt(0);
    expect(deltaA + deltaB).to.be.lt(depositA + depositB);
    expect(deltaA + deltaB).to.be.gte((depositA + depositB) * 0.85);

    console.log("    bob withdraw A:", deltaA / UNIT);
    console.log("    bob withdraw B:", deltaB / UNIT);
    console.log("    bob deposit A :", depositA / UNIT);
    console.log("    bob deposit B :", depositB / UNIT);
    console.log("    total penalty %:", (1 - (deltaA + deltaB) / (depositA + depositB)) * 100);
  });

  it("alice settles after maturity, receives principal + fees", async () => {
    const nonce = new BN(1);
    const bloom = bloomPda(poolPda, alice.publicKey, nonce);

    const blBefore = await program.account.bloomPosition.fetch(bloom);
    await waitForSlot(blBefore.endSlot.toNumber() + 1);

    const aliceABefore = Number((await getAccount(connection, aliceAtaA)).amount);
    const aliceBBefore = Number((await getAccount(connection, aliceAtaB)).amount);

    await program.methods
      .settleBloom()
      .accounts({
        user: alice.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: aliceAtaA,
        userTokenB: aliceAtaB,
        bloom,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    const blAfter = await program.account.bloomPosition.fetch(bloom);
    const aliceAAfter = Number((await getAccount(connection, aliceAtaA)).amount);
    const aliceBAfter = Number((await getAccount(connection, aliceAtaB)).amount);

    expect(blAfter.settled).to.equal(true);

    const deltaA = aliceAAfter - aliceABefore;
    const deltaB = aliceBAfter - aliceBBefore;

    expect(deltaA).to.be.gt(0);
    expect(deltaB).to.be.gt(0);

    console.log("    alice withdraw A:", deltaA / UNIT);
    console.log("    alice withdraw B:", deltaB / UNIT);
    console.log("    alice deposited A:", blBefore.depositedA.toNumber() / UNIT);
    console.log("    alice deposited B:", blBefore.depositedB.toNumber() / UNIT);
  });

  it("rejects double settle", async () => {
    const nonce = new BN(1);
    const bloom = bloomPda(poolPda, alice.publicKey, nonce);

    try {
      await program.methods
        .settleBloom()
        .accounts({
          user: alice.publicKey,
          pool: poolPda,
          vaultA,
          vaultB,
          userTokenA: aliceAtaA,
          userTokenB: aliceAtaB,
          bloom,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();
      assert.fail("should have blocked double settle");
    } catch (e: any) {
      expect(String(e)).to.match(/AlreadySettled|AlreadyMatured|0x1779|6008|6009/);
    }
  });

  it("benchmarks IL vs hypothetical permanent LP", async () => {
    const pool = await program.account.pool.fetch(poolPda);
    console.log("    final reserveA:", pool.reserveA.toNumber() / UNIT);
    console.log("    final reserveB:", pool.reserveB.toNumber() / UNIT);
    console.log("    total fees A:", pool.totalFeesA.toNumber() / UNIT);
    console.log("    total fees B:", pool.totalFeesB.toNumber() / UNIT);
    console.log("    active blooms remaining:", pool.activeBlooms.toNumber());
    expect(pool.activeBlooms.toNumber()).to.equal(0);
  });
});

function isqrtBN(n: BN): BN {
  if (n.ltn(2)) return n;
  let x = n;
  let y = n.addn(1).divn(2);
  while (y.lt(x)) {
    x = y;
    y = x.add(n.div(x)).divn(2);
  }
  return x;
}
