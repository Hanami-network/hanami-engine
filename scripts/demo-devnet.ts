/**
 * Manual devnet demo script.
 *
 * Usage (after `anchor deploy --provider.cluster devnet`):
 *   yarn ts-node scripts/demo-devnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Hanami } from "../target/types/hanami";
import {
  PublicKey,
  Keypair,
  Connection,
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
import * as fs from "fs";
import * as os from "os";

const POOL_SEED = Buffer.from("pool");
const VAULT_A_SEED = Buffer.from("vault_a");
const VAULT_B_SEED = Buffer.from("vault_b");
const BLOOM_SEED = Buffer.from("bloom");

const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const WALLET_PATH = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
const DECIMALS = 6;
const UNIT = 10 ** DECIMALS;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8"))),
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSlot(connection: Connection, target: number) {
  while (true) {
    const s = await connection.getSlot("confirmed");
    if (s >= target) return;
    process.stdout.write(`\r  waiting for slot ${target} (current ${s})  `);
    await sleep(1000);
  }
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payerKp = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(payerKp);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const program = anchor.workspace.Hanami as Program<Hanami>;

  console.log("=== HANAMI devnet demo ===");
  console.log("Cluster:   ", RPC_URL);
  console.log("Program ID:", program.programId.toBase58());
  console.log("Payer:     ", payerKp.publicKey.toBase58());
  console.log("Balance:   ", (await connection.getBalance(payerKp.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  let sakuraMint = await createMint(connection, payerKp, payerKp.publicKey, null, DECIMALS);
  let yukiMint = await createMint(connection, payerKp, payerKp.publicKey, null, DECIMALS);
  if (sakuraMint.toBuffer().compare(yukiMint.toBuffer()) > 0) {
    [sakuraMint, yukiMint] = [yukiMint, sakuraMint];
  }

  const payerSakura = await getOrCreateAssociatedTokenAccount(connection, payerKp, sakuraMint, payerKp.publicKey);
  const payerYuki = await getOrCreateAssociatedTokenAccount(connection, payerKp, yukiMint, payerKp.publicKey);
  await mintTo(connection, payerKp, sakuraMint, payerSakura.address, payerKp, 1_000_000n * BigInt(UNIT));
  await mintTo(connection, payerKp, yukiMint, payerYuki.address, payerKp, 1_000_000n * BigInt(UNIT));

  const [poolPda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, sakuraMint.toBuffer(), yukiMint.toBuffer()],
    program.programId,
  );
  const [vaultA] = PublicKey.findProgramAddressSync([VAULT_A_SEED, poolPda.toBuffer()], program.programId);
  const [vaultB] = PublicKey.findProgramAddressSync([VAULT_B_SEED, poolPda.toBuffer()], program.programId);

  const existingPool = await connection.getAccountInfo(poolPda);
  if (existingPool === null) {
    await program.methods
      .initializePool(30)
      .accounts({
        authority: payerKp.publicKey,
        tokenAMint: sakuraMint,
        tokenBMint: yukiMint,
        pool: poolPda,
        vaultA,
        vaultB,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  }

  const nonce = new BN(Date.now() % 1_000_000);
  const [bloomPda] = PublicKey.findProgramAddressSync(
    [BLOOM_SEED, poolPda.toBuffer(), payerKp.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId,
  );
  await program.methods
    .createBloom(nonce, new BN(10_000 * UNIT), new BN(10_000 * UNIT), new BN(30))
    .accounts({
      user: payerKp.publicKey,
      pool: poolPda,
      vaultA,
      vaultB,
      userTokenA: payerSakura.address,
      userTokenB: payerYuki.address,
      bloom: bloomPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  const bl = await program.account.bloomPosition.fetch(bloomPda);
  await waitForSlot(connection, bl.endSlot.toNumber() + 1);

  const sakuraBefore = Number((await getAccount(connection, payerSakura.address)).amount);
  const yukiBefore = Number((await getAccount(connection, payerYuki.address)).amount);
  await program.methods
    .settleBloom()
    .accounts({
      user: payerKp.publicKey,
      pool: poolPda,
      vaultA,
      vaultB,
      userTokenA: payerSakura.address,
      userTokenB: payerYuki.address,
      bloom: bloomPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const sakuraAfter = Number((await getAccount(connection, payerSakura.address)).amount);
  const yukiAfter = Number((await getAccount(connection, payerYuki.address)).amount);
  console.log("Withdraw A:", (sakuraAfter - sakuraBefore) / UNIT);
  console.log("Withdraw B:", (yukiAfter - yukiBefore) / UNIT);
  console.log("Pool:", `https://explorer.solana.com/address/${poolPda.toBase58()}?cluster=devnet`);
}

main().catch((e) => { console.error(e); process.exit(1); });
