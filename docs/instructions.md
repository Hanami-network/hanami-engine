# Instructions

| Instruction        | Args                                                         | Notes                                  |
|--------------------|--------------------------------------------------------------|----------------------------------------|
| `initialize_pool`  | `fee_bps: u16`                                               | Creates pool + two vault PDAs          |
| `create_bloom`     | `nonce: u64, amount_a: u64, amount_b: u64, duration_slots: u64` | Mints LP shares                    |
| `swap`             | `amount_in: u64, min_out: u64, a_to_b: bool`                 | Constant-product, basis-point fee      |
| `settle_bloom`     | none                                                         | Permissionless after `end_slot`        |
| `chirigiwa`        | none                                                         | Early exit, fixed 5% penalty           |

## Errors

See `programs/hanami/src/lib.rs` `HanamiError` enum and the SDK
`HanamiErrorCode` mirror for the canonical list.
