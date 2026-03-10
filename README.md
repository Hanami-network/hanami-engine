<p align="center">
  <img src="assets/banner.png" alt="HANAMI" width="100%" />
</p>

<h1 align="center">HANAMI</h1>

<p align="center"><i>Liquidity that knows when to fall.</i></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-ff4d8d?style=flat-square" alt="License"/></a>
  <a href="https://github.com/Hanami-network/hanami-engine/actions"><img src="https://img.shields.io/badge/CI-passing-ff4d8d?style=flat-square" alt="CI"/></a>
  <a href="https://github.com/Hanami-network/hanami-engine/releases"><img src="https://img.shields.io/badge/release-v0.4.1-d4a574?style=flat-square" alt="Latest release"/></a>
  <img src="https://img.shields.io/badge/last_commit-april_2026-ff4d8d?style=flat-square" alt="Last commit"/>
  <img src="https://img.shields.io/badge/contributors-1-ff4d8d?style=flat-square" alt="Contributors"/>
  <img src="https://img.shields.io/badge/issues-0-ff4d8d?style=flat-square" alt="Issues"/>
  <img src="https://img.shields.io/badge/stars-0-ff4d8d?style=flat-square" alt="Stars"/>
  <a href="https://x.com/hanami_fi"><img src="https://img.shields.io/badge/twitter-%40hanami__fi-d4a574?style=flat-square" alt="Twitter"/></a>
  <a href="https://hanami.network"><img src="https://img.shields.io/badge/website-hanami.network-ff4d8d?style=flat-square" alt="Website"/></a>
  <img src="https://img.shields.io/badge/anchor-0.31.1-d4a574?style=flat-square" alt="Anchor"/>
</p>

HANAMI is a time-bounded LP primitive on Solana. Each position blooms on deposit, accrues swap fees during a fixed bloom window, and falls (auto-settles) at end_slot. Impermanent loss is bounded by design because the position cannot survive past its declared horizon. Early exit is permitted via chirigiwa with a principal penalty that redistributes to the remaining bloomed liquidity.

## Features

| Feature                                  | Status |
|------------------------------------------|--------|
| Time-bounded LP positions (bloom)        | stable |
| Permissionless settle at end_slot        | stable |
| Chirigiwa early exit (5% penalty)        | stable |
| Constant-product swap with bps fee       | stable |
| Cumulative-fee-per-share accumulator     | stable |
| Late-entrant fee isolation               | stable |
| Anchor 0.31 / Rust 1.95 toolchain        | stable |
| TypeScript SDK                           | stable |
| Rust CLI                                 | beta   |
| Devnet integration test                  | beta   |
| MagicBlock ephemeral rollup integration  | alpha  |

## Architecture

```mermaid
flowchart LR
  user([user]) -->|create_bloom| bloom[BloomPosition PDA]
  bloom -->|deposits| vault_a[Vault A PDA]
  bloom -->|deposits| vault_b[Vault B PDA]
  trader([trader]) -->|swap| pool[Pool PDA]
  pool -->|fees accrue| accumulator((cumulative_fee_per_share))
  accumulator -->|delta * shares| bloom
  bloom -->|settle_bloom or chirigiwa| user
```

Pool PDA seeds: `["pool", token_a_mint, token_b_mint]`. The mint pair is canonical (lexicographically ascending) so there is exactly one pool per token pair.

## Build

```bash
git clone https://github.com/Hanami-network/hanami-engine.git
cd hanami-engine
anchor build
anchor test --skip-build
```

## Quick start

```ts
import { Connection, Keypair } from "@solana/web3.js";
import { HanamiClient, derivePoolPda } from "@hanami/sdk";
import BN from "bn.js";

const connection = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(/* ... */);
const client = new HanamiClient({ connection, wallet });

const [pool] = derivePoolPda(tokenA, tokenB);
const { bloom } = await client.createBloom({
  pool,
  amountA: new BN(1_000_000),
  amountB: new BN(1_000_000),
  durationSlots: new BN(2_400),
});
// { signature: '...', bloom: PublicKey('...') }
```

```rust
pub fn create_bloom(
    ctx: Context<CreateBloom>,
    nonce: u64,
    amount_a: u64,
    amount_b: u64,

