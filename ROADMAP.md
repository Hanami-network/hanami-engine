# Roadmap

Only items that have shipped are listed here. This is intentional. We do not
publish dated commitments for unfinished work.

## Shipped

- [x] Pool / vault / bloom-position account layouts
- [x] `initialize_pool` instruction
- [x] `create_bloom` instruction with sqrt liquidity and pro-rata follow-ons
- [x] Constant-product `swap` with basis-point fee
- [x] Cumulative-fee-per-share accumulator for late-entrant isolation
- [x] `settle_bloom` permissionless settlement at `end_slot`
- [x] `chirigiwa` early exit with fixed 5% penalty
- [x] Integer square root helper for u128
- [x] Anchor 0.31.1 / Rust 1.95 toolchain alignment
- [x] Boxed account references to fit BPF stack frame limit
- [x] Integration suite covering pool init, swap, fee isolation, settle,

