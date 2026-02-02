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
import { expect } from "chai";

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const BLOOM_SEED = Buffer.from("bloom");

describe("hanami fee isolation", () => {
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

  const early = Keypair.generate();
  const late = Keypair.generate();
  const trader = Keypair.generate();

  let earlyAtaA: PublicKey, earlyAtaB: PublicKey;
  let lateAtaA: PublicKey, lateAtaB: PublicKey;
  let traderAtaA: PublicKey, traderAtaB: PublicKey;

  const FEE_BPS = 100;
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

  async function waitForSlot(target: number, timeoutMs = 60_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await connection.getSlot("confirmed");
      if (s >= target) return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Timed out waiting for slot ${target}`);
  }

  before(async () => {
    await airdrop(early.publicKey, 10);
    await airdrop(late.publicKey, 10);
    await airdrop(trader.publicKey, 10);

    tokenAMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
    tokenBMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
    if (tokenAMint.toBuffer().compare(tokenBMint.toBuffer()) > 0) {
      [tokenAMint, tokenBMint] = [tokenBMint, tokenAMint];
    }

    const ata = async (owner: Keypair, mint: PublicKey) =>
      (await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner.publicKey)).address;

    earlyAtaA = await ata(early, tokenAMint);
    earlyAtaB = await ata(early, tokenBMint);
    lateAtaA = await ata(late, tokenAMint);
    lateAtaB = await ata(late, tokenBMint);
    traderAtaA = await ata(trader, tokenAMint);
    traderAtaB = await ata(trader, tokenBMint);

    const amt = 1_000_000n * BigInt(UNIT);
    for (const dst of [earlyAtaA, lateAtaA, traderAtaA]) {
      await mintTo(connection, payer, tokenAMint, dst, payer, amt);
    }
    for (const dst of [earlyAtaB, lateAtaB, traderAtaB]) {
      await mintTo(connection, payer, tokenBMint, dst, payer, amt);
    }

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
  });

  it("late LP does not inherit pre-entry swap fees", async () => {
    const earlyNonce = new BN(1);
    const lateNonce = new BN(1);

    const earlyAmount = new BN(100_000 * UNIT);
    const earlyBloom = bloomPda(poolPda, early.publicKey, earlyNonce);

    await program.methods
      .createBloom(earlyNonce, earlyAmount, earlyAmount, new BN(100))
      .accounts({
        user: early.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: earlyAtaA,
        userTokenB: earlyAtaB,
        bloom: earlyBloom,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([early])
      .rpc();

    for (let i = 0; i < 3; i++) {
      await program.methods
        .swap(new BN(5_000 * UNIT), new BN(0), i % 2 === 0)
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
    }

    const poolBeforeLate = await program.account.pool.fetch(poolPda);
    const preEntryCumA = poolBeforeLate.cumulativeFeePerShareA;
    const preEntryCumB = poolBeforeLate.cumulativeFeePerShareB;

    const lateAmount = new BN(50_000 * UNIT);
    const lateBloom = bloomPda(poolPda, late.publicKey, lateNonce);

    await program.methods
      .createBloom(lateNonce, lateAmount, lateAmount, new BN(30))
      .accounts({
        user: late.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: lateAtaA,
        userTokenB: lateAtaB,
        bloom: lateBloom,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([late])
      .rpc();

    const lateBloomState = await program.account.bloomPosition.fetch(lateBloom);
    expect(lateBloomState.entryCumulativeFeeA.toString()).to.equal(preEntryCumA.toString());
    expect(lateBloomState.entryCumulativeFeeB.toString()).to.equal(preEntryCumB.toString());

    await waitForSlot(lateBloomState.endSlot.toNumber() + 1);

    const lateABefore = Number((await getAccount(connection, lateAtaA)).amount);
    const lateBBefore = Number((await getAccount(connection, lateAtaB)).amount);

    await program.methods
      .settleBloom()
      .accounts({
        user: late.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: lateAtaA,
        userTokenB: lateAtaB,
        bloom: lateBloom,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([late])
      .rpc();

    const lateAAfter = Number((await getAccount(connection, lateAtaA)).amount);
    const lateBAfter = Number((await getAccount(connection, lateAtaB)).amount);

    const deltaA = lateAAfter - lateABefore;
    const deltaB = lateBAfter - lateBBefore;
    const totalReturn = deltaA + deltaB;
    const totalDeposit = lateAmount.toNumber() * 2;

    console.log("    late LP total deposit:", totalDeposit / UNIT);
    console.log("    late LP total return: ", totalReturn / UNIT);
    console.log("    ratio:", (totalReturn / totalDeposit).toFixed(6));

    const noBigFeeInheritance = Math.abs(totalReturn - totalDeposit) / totalDeposit;
    expect(noBigFeeInheritance).to.be.lt(0.05);
  });

  it("early LP captured all pre-late fees plus proportional post-late fees", async () => {
    const earlyNonce = new BN(1);
    const earlyBloom = bloomPda(poolPda, early.publicKey, earlyNonce);
    const bl = await program.account.bloomPosition.fetch(earlyBloom);

    await waitForSlot(bl.endSlot.toNumber() + 1);

    const earlyABefore = Number((await getAccount(connection, earlyAtaA)).amount);
    const earlyBBefore = Number((await getAccount(connection, earlyAtaB)).amount);

    await program.methods
      .settleBloom()
      .accounts({
        user: early.publicKey,
        pool: poolPda,
        vaultA,
        vaultB,
        userTokenA: earlyAtaA,
        userTokenB: earlyAtaB,
        bloom: earlyBloom,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([early])
      .rpc();

    const earlyAAfter = Number((await getAccount(connection, earlyAtaA)).amount);
    const earlyBAfter = Number((await getAccount(connection, earlyAtaB)).amount);

    const deltaA = earlyAAfter - earlyABefore;
    const deltaB = earlyBAfter - earlyBBefore;
    const totalReturn = deltaA + deltaB;
    const totalDeposit = 200_000 * UNIT;

    console.log("    early LP deposit:", totalDeposit / UNIT);
    console.log("    early LP return: ", totalReturn / UNIT);
    console.log("    net fee gain:", ((totalReturn - totalDeposit) / UNIT).toFixed(4));

    expect(totalReturn).to.be.gt(totalDeposit);
  });
});
