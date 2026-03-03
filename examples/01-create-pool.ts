import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import { HanamiClient, sortMintPair } from "@hanami/sdk";

async function main() {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "http://localhost:8899";
  const walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) throw new Error("ANCHOR_WALLET is required");

  const connection = new Connection(url, "confirmed");
  const wallet = (anchor.Wallet.local() as anchor.Wallet).payer;

  console.log("rpc:", url);
  console.log("payer:", wallet.publicKey.toBase58());

  const decimals = 6;
  const mintA = await createMint(connection, wallet, wallet.publicKey, null, decimals);
  let mintB = await createMint(connection, wallet, wallet.publicKey, null, decimals);
  if (mintA.toBuffer().compare(mintB.toBuffer()) > 0) {
    const tmp = await createMint(connection, wallet, wallet.publicKey, null, decimals);
    mintB = tmp;
  }
  const [a, b] = sortMintPair(mintA, mintB);
  console.log("token A:", a.toBase58());
  console.log("token B:", b.toBase58());

  const client = new HanamiClient({ connection, wallet });
  const { signature, pool } = await client.initializePool({
    tokenAMint: a,
    tokenBMint: b,
    feeBps: 30,
  });
  console.log("init signature:", signature);
  console.log("pool:", pool.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
