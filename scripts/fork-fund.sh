#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="http://127.0.0.1:8545"
TEN_ETH="0x8AC7230489E80000"

set -a
# shellcheck disable=SC1091
source "$ROOT/contracts/.env"
set +a

: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY 가 없습니다}"
: "${LENDER_ADDRESS:?LENDER_ADDRESS 가 없습니다}"
: "${OPERATOR_ADDRESS:?OPERATOR_ADDRESS 가 없습니다}"
: "${ORACLE_ADDRESS:?ORACLE_ADDRESS 가 없습니다}"

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Anvil 이 떠 있지 않습니다" >&2
  exit 1
fi

deployer="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
for address in "$deployer" "$LENDER_ADDRESS" "$OPERATOR_ADDRESS" "$ORACLE_ADDRESS"; do
  cast rpc anvil_setBalance "$address" "$TEN_ETH" --rpc-url "$RPC" >/dev/null
done
