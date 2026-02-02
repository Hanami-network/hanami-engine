#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== HANAMI devnet deployment ==="

if [[ ! -f ~/.config/solana/id.json ]]; then
  echo "[!] No default solana keypair at ~/.config/solana/id.json"
  echo "    run: solana-keygen new -o ~/.config/solana/id.json"
  exit 1
fi

solana config set --url https://api.devnet.solana.com > /dev/null
echo "[*] Cluster: devnet"
echo "[*] Wallet: $(solana address)"
BALANCE=$(solana balance | awk '{print $1}')
echo "[*] Balance: ${BALANCE} SOL"

if (( $(echo "$BALANCE < 3" | bc -l) )); then
  echo "[*] Low balance. Requesting airdrop..."
  solana airdrop 2 || true
  sleep 2
fi

echo "[*] Building program via cargo build-sbf..."
anchor build

PROGRAM_ID=$(solana-keygen pubkey target/deploy/hanami-keypair.json)
echo "[*] Program ID: ${PROGRAM_ID}"

echo "[*] Deploying..."
anchor deploy --provider.cluster devnet

echo ""
echo "=== Deployment complete ==="
echo "Program:  https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet"
