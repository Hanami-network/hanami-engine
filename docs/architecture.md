# Architecture

HANAMI is a Solana program written with Anchor 0.31 that implements a single
opinionated liquidity primitive: time-bounded constant-product LPs that
auto-settle at a known slot.

## Account model

```
Pool PDA            seeds = ["pool", token_a_mint, token_b_mint]
  vault_a (PDA)     seeds = ["vault_a", pool]
  vault_b (PDA)     seeds = ["vault_b", pool]

BloomPosition PDA   seeds = ["bloom", pool, owner, nonce_le_bytes]
```

The pool PDA holds the canonical reserves and the cumulative-fee-per-share
accumulators. The two vault PDAs are SPL token accounts owned by the pool.
Each `BloomPosition` is owned by its depositor and snapshots the fee
accumulators at the moment of entry.

## Pool state

| Field                       | Type | Notes                                           |
|-----------------------------|------|-------------------------------------------------|
| `token_a_mint`              | Pubkey | Token A SPL mint (lex-min of pair)            |
| `token_b_mint`              | Pubkey | Token B SPL mint (lex-max of pair)            |
| `vault_a`                   | Pubkey | Token A vault PDA                              |
| `vault_b`                   | Pubkey | Token B vault PDA                              |
| `reserve_a`                 | u64    | Reserve of A excluding accrued fees           |
| `reserve_b`                 | u64    | Reserve of B excluding accrued fees           |
| `total_liquidity`           | u128   | Sum of all bloom liquidity shares             |
| `cumulative_fee_per_share_a`| u128   | Q64.64 accumulator for A-side fees            |
| `cumulative_fee_per_share_b`| u128   | Q64.64 accumulator for B-side fees            |
| `total_fees_a`              | u64    | Lifetime A-side fees collected (debug aid)    |
| `total_fees_b`              | u64    | Lifetime B-side fees collected (debug aid)    |
| `active_blooms`             | u64    | Count of unsettled blooms                     |
| `fee_bps`                   | u16    | Swap fee in basis points (max 10%)            |
| `bump`                      | u8     | PDA bump                                      |

## Bloom lifecycle

```
deposit -> active -> matured -> settled
                  \-> chirigiwa (early exit)
```

1. `create_bloom` mints LP shares and snapshots the cumulative-fee-per-share
   accumulators at entry.
2. While the bloom lives, swaps update the accumulators based on
   `total_liquidity` at that moment.
3. After `end_slot`, anyone can call `settle_bloom` and the position's owner
   receives `share_of_reserves + (cumulative_fee_delta * shares >> 64)`.
4. Before `end_slot`, the owner can call `chirigiwa` and receives
   `0.95 * share_of_reserves + fees`. The 5% penalty stays in the pool and
   accrues to remaining liquidity.

## Why time-bounded

Standard constant-product LPs have unbounded impermanent loss because the
position has no horizon. By forcing every bloom to declare an `end_slot` at
deposit time, the IL is bounded by `f(price_at_deposit, price_at_end_slot)`
where `end_slot` is finite and known.

## Why per-bloom snapshots

A naive AMM credits all fees to all current LPs, which means a late entrant
receives a share of fees that were earned before they were even at risk. By
snapshotting `cumulative_fee_per_share_*` at deposit time and only paying out
the delta at exit, late entrants only earn fees from swaps that happened
during their bloom window.
