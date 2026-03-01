# Economics

## Impermanent loss bounds

For a constant-product LP, IL given a price ratio change `r = p_end / p_start`
is `IL(r) = 2 * sqrt(r) / (1 + r) - 1`. For an unbounded position, `r` can
drift arbitrarily, so the IL is unbounded.

For a bloom of duration `D` slots, the realised IL is
`IL_bloom = IL(p_end_slot / p_start_slot)` where `p_end_slot` is the price at
the bloom's settle slot. Because `D` is finite and known at deposit, the IL
distribution has finite tails.

## Chirigiwa penalty redistribution

```
withdraw_a = (share_a - 0.05 * share_a) + fees_earned_a
withdraw_b = (share_b - 0.05 * share_b) + fees_earned_b
```

The 5% penalty on each side stays in the vault but is removed from
`pool.reserve_a` / `pool.reserve_b` accounting in proportion. The per-share
value of remaining liquidity goes up by the penalty amount divided by
remaining shares.

## Fee accounting

```
cumulative_fee_per_share_a += (fee_amount << 64) / total_liquidity
fees_earned = (cumulative_fee_per_share_a_now - bloom.entry_cumulative_fee_a) * bloom.liquidity >> 64
```
