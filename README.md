# BlindLimit (sealbase)

**한국어:** 할부채권(자동차 할부) 묶음을 담보로 온체인 대출 풀의 **담보 한도(borrowing base)** 를 자동 산정·게시하는 프라이버시 레이어입니다. 원문 문서는 TEE 안 AI 추출만 접근하고, 체인·클라이언트에는 해시와 집계값만 나갑니다.

**English:** A privacy-oriented **borrowing-base** layer for auto-loan receivables — AI extraction in TEE, deterministic limits on-chain, only hashes and aggregates published.

## Architecture

1. **Lender** signs an agreement hash and uploads collateral (contracts + tape CSV).
2. **TEE (NEAR AI)** extracts structured fields; **`lib/rules`** joins, checks VIN registry, computes limit.
3. **Oracle** posts limit + eligible VIN hashes in one transaction.
4. **Lender** borrows USDC within `availableToBorrow()`.

On-chain: `CollateralRegistry`, `LoanPool`, `PoolFactory` (Foundry, Base Sepolia or local Anvil).

Off-chain: Next.js App Router, `web/lib/pipeline.ts`.

## Run locally

### Contracts

```bash
cd contracts
cp .env.example .env
# DEPLOYER_PRIVATE_KEY, LENDER_ADDRESS, OPERATOR_ADDRESS, ORACLE_ADDRESS — set in .env only (never commit)
forge test
anvil --chain-id 31337
# another terminal:
forge script script/DeployM1.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/DeployFactory.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

From repo root: `./scripts/fork-fund.sh` (Anvil ETH for deployer/lender/operator/oracle).

### Web

```bash
cd web
cp .env.example .env.local
# ORACLE_PRIVATE_KEY, VIN_SALT, NEARAI_API_KEY, REGISTRY/USDC/POOL/FACTORY addresses — see .env.example
env -u BASE_SEPOLIA_RPC_URL pnpm dev
```

MetaMask: **Localhost 8545**, chain ID **31337**.

Optional: `TEE_PROVIDER=mock` for offline demos.

## Deployed addresses (fill after broadcast)

| Item | Address |
|------|---------|
| Registry | _(from deploy logs)_ |
| USDC | _(from deploy logs)_ |
| Pool A | _(from deploy logs)_ |
| Factory | _(from deploy logs)_ |

Example txs: add Base Sepolia or local Otterscan links after your runs.

## Demo script (4 scenes)

1. **배포 차단:** `/operator` — agreement terms vs settings mismatch (e.g. 90% vs 85%).
2. **한도 산정:** `/lender` (or `/lender?pool=0x…`) — collateral POST → limit on pool page.
3. **대출 성공 / revert:** borrow within limit; then request over limit → `ExceedsLimit` message.
4. **단독 변경 revert:** `/pool/[address]` as operator — “설정 변경 시도” → `SettingsLocked` message.

## 현재 한계

오라클 키(ORACLE_PRIVATE_KEY)와 VIN_SALT 는 현재 TEE 밖(Next.js 서버)에 있다. TEE 안에서 도는 것은 NEAR AI 모델 추론(추출)뿐이며, 한도 계산·영수증 게시는 서버가 한다. 대출 장부(CSV) 파싱도 서버에서 한다.

## 로드맵 / Roadmap

① web/lib/pipeline.ts + 오라클 키 + VIN_SALT 를 Phala Cloud TEE(dstack) 컨테이너로 이전 — pipeline 은 의존성 주입 구조라 코드 수정 없이 이동 가능 ② TEE attestation·응답 서명(signing_address)의 온체인 검증 ③ 수정 약정(양측 서명) 흐름 ④ Nesa 암호화 추론 provider 추가 ⑤ 기존 풀(Goldfinch/Centrifuge)에 한도 모듈로 연동

## Tests

```bash
cd contracts && forge test
cd web && pnpm vitest run && pnpm build
```