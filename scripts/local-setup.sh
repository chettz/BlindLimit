#!/usr/bin/env bash
# 로컬 데모 한 방: anvil(fork) → faucet → DeployM1 → DeployFactory → Otterscan
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${CHAIN_ID:-31337}"
OTTERSCAN_PORT="${OTTERSCAN_PORT:-5100}"
ANVIL_LOG="${ANVIL_LOG:-$ROOT/scripts/.anvil.log}"
ANVIL_PID_FILE="${ANVIL_PID_FILE:-$ROOT/scripts/.anvil.pid}"

set -a
# shellcheck disable=SC1091
source "$ROOT/contracts/.env"
set +a

: "${DEPLOYER_PRIVATE_KEY:?contracts/.env 에 DEPLOYER_PRIVATE_KEY 가 없습니다}"
FORK_URL="${FORK_URL:-${ALCHEMY_BASE_SEPOLIA_URL:-${BASE_SEPOLIA_RPC_URL:-}}}"
: "${FORK_URL:?FORK_URL 또는 ALCHEMY_BASE_SEPOLIA_URL / BASE_SEPOLIA_RPC_URL 이 없습니다}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "$1 이 필요합니다" >&2; exit 1; }; }
need anvil
need cast
need forge
need docker

rpc_up() { cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; }

port_in_use() {
  ss -tlnH "sport = :$1" 2>/dev/null | grep -q . ||
    netstat -tln 2>/dev/null | grep -qE "[.:]$1[[:space:]]"
}

logged_addr() {
  # forge console.log("NAME", addr) → "NAME 0x..." / "NAME: 0x..."
  local name="$1" log="$2" line
  line="$(grep -E "${name}[:[:space:]]+0x[0-9a-fA-F]{40}" "$log" | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  grep -Eo '0x[0-9a-fA-F]{40}' <<<"$line" | tail -1
}

echo "==> 1/5 anvil (fork, chain-id $CHAIN_ID)"
if rpc_up; then
  echo "    이미 $RPC 응답 중 — 재사용"
else
  anvil --fork-url "$FORK_URL" --chain-id "$CHAIN_ID" >"$ANVIL_LOG" 2>&1 &
  echo $! >"$ANVIL_PID_FILE"
  for _ in $(seq 1 60); do
    rpc_up && break
    sleep 0.25
  done
  rpc_up || { echo "anvil 기동 실패 — $ANVIL_LOG 확인" >&2; exit 1; }
  echo "    pid $(cat "$ANVIL_PID_FILE")  log $ANVIL_LOG"
fi
test "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN_ID"

echo "==> 2/5 faucet (fork-fund.sh)"
"$ROOT/scripts/fork-fund.sh"

echo "==> 3/5 DeployM1"
DEPLOY_LOG="$(mktemp)"
(
  cd "$ROOT/contracts"
  forge script script/DeployM1.s.sol --rpc-url "$RPC" --broadcast -vv
) | tee "$DEPLOY_LOG"

REGISTRY="$(logged_addr REGISTRY_ADDRESS "$DEPLOY_LOG")"
USDC="$(logged_addr USDC_ADDRESS "$DEPLOY_LOG")"
POOL_A="$(logged_addr POOL_A_ADDRESS "$DEPLOY_LOG")"
POOL_B="$(logged_addr POOL_B_ADDRESS "$DEPLOY_LOG" || true)"
rm -f "$DEPLOY_LOG"

: "${REGISTRY:?DeployM1 로그에서 REGISTRY_ADDRESS 를 못 읽었습니다}"
: "${USDC:?DeployM1 로그에서 USDC_ADDRESS 를 못 읽었습니다}"
: "${POOL_A:?DeployM1 로그에서 POOL_A_ADDRESS 를 못 읽었습니다}"

echo "==> 4/5 DeployFactory (REGISTRY=$REGISTRY)"
FACTORY_LOG="$(mktemp)"
(
  cd "$ROOT/contracts"
  REGISTRY_ADDRESS="$REGISTRY" forge script script/DeployFactory.s.sol --rpc-url "$RPC" --broadcast -vv
) | tee "$FACTORY_LOG"
FACTORY="$(logged_addr FACTORY_ADDRESS "$FACTORY_LOG")"
rm -f "$FACTORY_LOG"
: "${FACTORY:?DeployFactory 로그에서 FACTORY_ADDRESS 를 못 읽었습니다}"

echo "==> 5/5 Otterscan :$OTTERSCAN_PORT"
if port_in_use "$OTTERSCAN_PORT"; then
  echo "    포트 $OTTERSCAN_PORT 사용 중 — Otterscan 건너뜀"
elif docker ps -a --format '{{.Names}}' | grep -qx blindlimit-otterscan; then
  docker start blindlimit-otterscan >/dev/null
  echo "    기존 컨테이너 blindlimit-otterscan 재시작"
else
  docker run -d --rm --name blindlimit-otterscan -p "${OTTERSCAN_PORT}:80" \
    --env OTTERSCAN_CONFIG="{\"erigonURL\":\"http://localhost:8545\",\"experimental\":false}" \
    otterscan/otterscan:latest >/dev/null
  echo "    http://localhost:${OTTERSCAN_PORT}"
fi

echo
echo "=== local setup OK ==="
echo "RPC              $RPC  (chain $CHAIN_ID)"
echo "REGISTRY_ADDRESS $REGISTRY"
echo "USDC_ADDRESS     $USDC"
echo "POOL_A_ADDRESS   $POOL_A"
[[ -n "${POOL_B:-}" ]] && echo "POOL_B_ADDRESS   $POOL_B"
echo "FACTORY_ADDRESS  $FACTORY"
echo "ORACLE_ADDRESS   ${ORACLE_ADDRESS:-}"
echo
echo "web/.env.local 에 반영할 값:"
echo "  REGISTRY_ADDRESS=$REGISTRY"
echo "  USDC_ADDRESS=$USDC"
echo "  POOL_A_ADDRESS=$POOL_A"
[[ -n "${POOL_B:-}" ]] && echo "  POOL_B_ADDRESS=$POOL_B"
echo "  FACTORY_ADDRESS=$FACTORY"
echo "  NEXT_PUBLIC_POOL_ADDRESS=$POOL_A"
[[ -n "${POOL_B:-}" ]] && echo "  NEXT_PUBLIC_POOL_B_ADDRESS=$POOL_B"
echo "  NEXT_PUBLIC_USDC_ADDRESS=$USDC"
echo "  NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY"
echo "  NEXT_PUBLIC_ORACLE_ADDRESS=${ORACLE_ADDRESS:-}"
echo "  NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=$RPC"
echo "  BASE_SEPOLIA_RPC_URL=$RPC"
echo
echo "anvil 유지: 종료는  kill \$(cat $ANVIL_PID_FILE)  또는 해당 터미널 Ctrl+C"
