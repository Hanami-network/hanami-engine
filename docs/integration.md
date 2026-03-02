# Integration

## TypeScript SDK

```ts
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { HanamiClient, derivePoolPda, slotsToDuration } from "@hanami/sdk";
import BN from "bn.js";

const connection = new Connection(process.env.HANAMI_RPC_URL!);
const wallet = Keypair.fromSecretKey(/* ... */);
const client = new HanamiClient({ connection, wallet });

const tokenA = new PublicKey("...");
const tokenB = new PublicKey("...");
const [pool] = derivePoolPda(tokenA, tokenB);

const { bloom } = await client.createBloom({
  pool,
  amountA: new BN(1_000_000),
  amountB: new BN(1_000_000),
  durationSlots: new BN(2_400),
});
```

## Rust CLI

```bash
hanami-cli init-pool --token-a <MINT_A> --token-b <MINT_B> --fee-bps 30
hanami-cli bloom --pool <POOL> --amount-a 1000000 --amount-b 1000000 --duration-slots 100
hanami-cli swap --pool <POOL> --amount-in 50000 --min-out 0 --a-to-b
hanami-cli settle --pool <POOL> --bloom <BLOOM>
hanami-cli chirigiwa --pool <POOL> --bloom <BLOOM>
hanami-cli info --pool <POOL>
```
