import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { HanamiClient, slotsToDuration, formatLamports } from "@hanami/sdk";

async function waitForSlot(connection: Connection, target: number) {
  while (true) {
    const s = await connection.getSlot("confirmed");
    if (s >= target) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899";
  const poolStr = process.env.HANAMI_POOL;
  if (!poolStr) throw new Error("HANAMI_POOL is required");

  const connection = new Connection(url, "confirmed");
  const wallet = (anchor.Wallet.local() as anchor.Wallet).payer;
  const pool = new PublicKey(poolStr);

  const client = new HanamiClient({ connection, wallet });
  await client.ensureUserAtas(pool);

  const amount = new BN(1_000_000);
  const duration = new BN(40);

  const { bloom } = await client.createBloom({
    pool,
    amountA: amount,
    amountB: amount,
    durationSlots: duration,
  });
  console.log("bloom:", bloom.toBase58());

  const blState = await client.getBloom(bloom);
  console.log(
    "matures in ~",
    slotsToDuration(blState.endSlot.sub(blState.startSlot)).seconds.toFixed(1),
    "seconds",
  );

  await waitForSlot(connection, blState.endSlot.toNumber() + 1);

  const sig = await client.settleBloom({ pool, bloom });
  console.log("settle signature:", sig);

  const finalBloom = await client.getBloom(bloom);
  console.log("settled:", finalBloom.settled);
  console.log("deposited A:", formatLamports(finalBloom.depositedA, 6));
  console.log("deposited B:", formatLamports(finalBloom.depositedB, 6));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
