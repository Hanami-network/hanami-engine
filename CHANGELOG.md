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

