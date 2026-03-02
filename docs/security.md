# Security

## Invariants

The integration suite (`tests/`) is the executable specification of the
following invariants:

1. **Single-author math** — every reserve update, every fee accumulator
   update, every share calculation uses `checked_*` arithmetic on `u128`
   intermediates.
2. **Fee isolation** — a bloom that enters at slot `S` cannot collect any
   fees from swaps that completed at slot `< S`.
3. **Permissionless settle** — `settle_bloom` after `end_slot` succeeds for
   any caller, but the funds always go to the bloom's `owner`.
4. **Owner-only chirigiwa** — `chirigiwa` requires `bloom.owner ==
   ctx.accounts.user.key()`.
5. **No double settle** — `bloom.settled` is set on first settle; second
   call returns `AlreadySettled`.
6. **Penalty stays in pool** — `chirigiwa` reduces `pool.reserve_*` by
   `share_* - penalty_*`, leaving the penalty in the vault for remaining LPs.

## Disclosure

See [SECURITY.md](../SECURITY.md) at the repo root for how to report
security issues.
