# Examples

Runnable scripts that exercise the SDK against a Solana validator.

| Script                     | Description                                          |
|----------------------------|------------------------------------------------------|
| `01-create-pool.ts`        | Create mock SPL mints and initialise a pool          |
| `02-bloom-lifecycle.ts`    | Full path: deposit, swap, mature, settle             |
| `03-chirigiwa.ts`          | Open a bloom and exit early via chirigiwa            |

## Run

```bash
yarn install
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=~/.config/solana/id.json \
yarn ts-node examples/01-create-pool.ts
```
