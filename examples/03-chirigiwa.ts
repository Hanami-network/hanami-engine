import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { HanamiClient, applyChirigiwaPenalty, formatLamports } from "@hanami/sdk";

async function main() {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899";
  const poolStr = process.env.HANAMI_POOL;
  if (!poolStr) throw new Error("HANAMI_POOL is required");

  const connection = new Connection(url, "confirmed");
  const wallet = (anchor.Wallet.local() as anchor.Wallet).payer;
  const pool = new PublicKey(poolStr);

  const client = new HanamiClient({ connection, wallet });
  await client.ensureUserAtas(pool);

  const principal = new BN(1_000_000);
  const expectedReturn = applyChirigiwaPenalty(principal);
  console.log(
    "depositing",
    formatLamports(principal, 6),
    "of each side; expected return after 5% penalty:",
    formatLamports(expectedReturn, 6),
  );

  const { bloom } = await client.createBloom({
    pool,
    amountA: principal,
    amountB: principal,
    durationSlots: new BN(1_000_000),
  });

  const sig = await client.chirigiwa({ pool, bloom });
  console.log("chirigiwa signature:", sig);

  const finalBloom = await client.getBloom(bloom);
  console.log("settled:", finalBloom.settled);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
