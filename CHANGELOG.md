# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to
Semantic Versioning.

## [0.4.1] - 2026-04-22

### Fixed

- Boxed all Anchor `Account<T>` references inside `CreateBloom`, `SwapCtx`,
  and `SettleBloomCtx` to keep stack frame usage below the BPF limit
- Separated swap fees from pool reserve accounting so chirigiwa exits no
  longer double-credit fees that were already counted in the cumulative
  per-share accumulator

### Changed

- Bumped Anchor toolchain from 0.30.1 to 0.31.1 to restore IDL builds on
  rustc 1.78+
- Tightened the integration test for fee isolation to compare cumulative
  fee snapshots at the byte level

## [0.4.0] - 2026-04-12

### Added

- `chirigiwa()` instruction for early bloom exit at a fixed 5% principal
  penalty, with the penalty redistributed to remaining LPs
- Per-bloom entry snapshot of the cumulative fee accumulator so late
  entrants do not inherit pre-entry fees
- Permissionless `settle_bloom` after `end_slot`

### Changed

- Pool PDA seeds now derive from the canonical token A / token B mint pair
  ordering to avoid double-pool ambiguity
- `BloomPosition` now carries a `nonce` so the same owner can hold multiple
  blooms in the same pool

## [0.3.0] - 2026-03-30

### Added

- `swap` instruction with constant-product math and basis-point fee
- Pool reserve tracking decoupled from cumulative fee tracking
- Initial integration test suite (pool init, deposit, swap, settle)

## [0.2.0] - 2026-03-12

### Added

- `create_bloom` instruction with sqrt-based liquidity minting and
  pro-rata follow-on deposits
- Integer square root helper for u128 inputs

## [0.1.0] - 2026-02-24

### Added

- Initial Anchor scaffold for the HANAMI program
- `Pool` and `BloomPosition` account layouts
- `initialize_pool` instruction
