# hanami-cli

Command-line client for the HANAMI on-chain liquidity primitive.

## Build

```bash
git clone https://github.com/Hanami-network/hanami-engine.git
cd hanami-engine
cargo build --release -p hanami-cli
./target/release/hanami-cli --help
```

## Commands

| Command       | Description                                              |
|---------------|----------------------------------------------------------|
| `init-pool`   | Initialise a new pool for a token-A / token-B pair       |
| `bloom`       | Open a time-bounded LP position                          |
| `swap`        | Constant-product swap with basis-point fee               |
| `settle`      | Permissionless settle after `end_slot`                   |
| `chirigiwa`   | Early exit with 5% principal penalty                     |
| `info`        | Inspect pool / bloom state                               |

## Global flags

```
--rpc <URL>           RPC endpoint (default: $HANAMI_RPC_URL or devnet)
--keypair <PATH>      Wallet keypair (default: $HANAMI_KEYPAIR_PATH)
--program-id <PUBKEY> Override the program id (default: BeGzo6...)
--commitment <LEVEL>  processed | confirmed | finalized
```

## Examples

```bash
hanami-cli init-pool \
  --token-a So11111111111111111111111111111111111111112 \
  --token-b EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --fee-bps 30

hanami-cli bloom \
  --pool <POOL_PUBKEY> \
  --amount-a 1000000 \
  --amount-b 1000000 \
  --duration-slots 100

hanami-cli settle --pool <POOL_PUBKEY> --bloom <BLOOM_PUBKEY>
```
