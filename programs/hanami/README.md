# hanami (program)

The on-chain Anchor program for HANAMI.

## Layout

```
src/
└── lib.rs       single-file program (5 instructions, 2 account types,
                 14 error codes, 4 emitted events)
```

## Instructions

| Name             | Purpose                                                  |
|------------------|----------------------------------------------------------|
| `initialize_pool`| Create a pool PDA + two vault PDAs                       |
| `create_bloom`   | Open a time-bounded LP position                          |
| `swap`           | Constant-product swap with basis-point fee               |
| `settle_bloom`   | Permissionless settle after `end_slot`                   |
| `chirigiwa`      | Early exit at fixed 5% principal penalty                 |

## Build

The repo root drives the BPF build; from this directory:

```bash
cd ../..
anchor build
anchor test --skip-build
```

## Program id

Pre-deployment. The on-chain program is not yet published; the canonical address is declared in `src/lib.rs` via `declare_id!()` and surfaces in the IDL at build time.
