# @hanami/sdk

TypeScript client for the HANAMI time-bounded liquidity primitive on Solana.

## Install

```bash
git clone https://github.com/Hanami-network/hanami-engine.git
cd hanami-engine/sdk
yarn install
yarn build
```

## Usage

```ts
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { HanamiClient } from "@hanami/sdk";
import BN from "bn.js";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* ... */);
const client = new HanamiClient({ connection, wallet });

const { signature: initSig, pool } = await client.initializePool({
  tokenAMint: new PublicKey("..."),
  tokenBMint: new PublicKey("..."),
  feeBps: 30,
});

const { bloom } = await client.createBloom({
  pool,
  amountA: new BN(1_000_000),
  amountB: new BN(1_000_000),
  durationSlots: new BN(50),
});

await client.settleBloom({ pool, bloom });
await client.chirigiwa({ pool, bloom });
```

## API surface

| Method            | Description                                   |
|-------------------|-----------------------------------------------|
| initializePool    | Create a new pool PDA + vaults                |
| createBloom       | Open a time-bounded LP position               |
| swap              | Constant-product swap with basis-point fee    |
| settleBloom       | Permissionless settle after end_slot          |
| chirigiwa         | Early exit with 5% principal penalty          |
| getPool           | Fetch pool state                              |
| getBloom          | Fetch bloom state                             |

## License

MIT. See [LICENSE](../LICENSE).
