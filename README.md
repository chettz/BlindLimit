# BlindLimit (sealbase)

할부금융사가 **계약서(PDF·이미지)와 대출장부**를 사람이 전수 대사하기 전에, **TEE 안에서 AI 추출 + 결정론 코드**로 자가 검증을 빠르게 돌리는 프라이버시 담보 검증 레이어입니다. 핵심은 대출을 중개하는 풀이 아니라 **원문을 외부에 노출하지 않는 검증**입니다. 이를 온체인으로 확장하면, 같은 검증 결과를 온체인 대출 풀의 담보 한도·집행(`postLimit` / `borrow`)까지 연결할 수 있습니다.

**English:** A privacy **collateral self-check layer** for installment lenders — AI reads PDF/image contracts inside a TEE; deterministic rules join the loan tape. Only hashes and aggregates leave. The core is off-chain (TEE) verification; the same result can extend on-chain to **pool borrowing-base enforcement** (`postLimit` / `borrow`).

## Who / Why

| | |
|--|--|
| **주 사용자** | **할부금융사** (`/verify`) — 계약서↔장부 조인, 연체·금액·금리 불일치, 이중 VIN 등 이상을 **BBC/담보 신고 전에** 빨리 찾음 |
| **왜 쓰나** | 실무상 일상 점검은 내부가 하고, 은행은 샘플·실사로 견제함. 병목은 **원문 계약과 장부를 맞추는 시간**. BlindLimit은 그 셀프 점검 속도를 올림 |
| **2차** | 은행·풀 운영자는 적격 건수·제외 사유 집계만 **실사·한도 판단 참고**로 사용 (맹신·최종 승인 대체 아님) |
| **온체인 확장 가능성** | `/lender` — 검증 결과를 풀 한도에 연결해 `postLimit` / `borrow` **집행까지** 이어질 수 있음 |

## Privacy: 왜 TEE 안에서 AI와 코드가 돌아가야 하나

### 계약서에 무엇이 있나

할부계약 원문에는 외부 유출을 꺼리는 정보가 포함되는 것이 일반적입니다.

- 차주 성명·주민번호(또는 이에 준하는 ID)·주소·전화
- 할부원금·금리·월 납입·보증인
- VIN·차량·딜러, 서명·계좌 등

장부(CSV/엑셀)에도 잔여원금·연체·차주/딜러 키가 있습니다. 원문을 일반 클라우드·운영자·체인에 올리면 **개인정보·금융비밀·포트폴리오 노출** 위험이 큽니다. 그래서 은행에도 원문 전량보다 테이프·BBC·샘플을 넘기는 관행과 맞습니다.

### TEE에서 하는 일 / 밖으로 안 나가는 것

| TEE 안 (민감) | TEE·서버 밖 (공개 가능) |
|---------------|-------------------------|
| PDF·스캔 이미지·텍스트 계약서 **원문** | 문서·영수증·규칙 **해시** |
| **AI(비전/LLM)** 로 계약서에서 VIN·금액·금리 등 **필드 추출만** | 적격 건수·합계·한도, 제외 사유별 **건수** |
| 장부 파싱·VIN 조인·한도 산정 **결정론 코드** (`lib/rules`) | 온체인 이벤트·집계 JSON |

- **AI 역할:** 숫자 판단·한도 결정이 아님. 이미지/PDF 계약서를 인식해 구조화 필드만 뽑음. 한도·적격 여부는 **같은 입력 → 같은 출력**인 규칙 코드가 담당.
- **왜 enclave인가:** 추출·대사 과정에서 원문이 메모리에 잠깐이라도 올라가므로, 운영자·호스트·로그·클라이언트가 원문을 못 읽게 **TEE(NEAR AI Cloud 등) 안에서** 돌리는 것이 프라이버시 전제. Incognito(비-TEE) 모델은 사용하지 않음.
- **제3자가 보는 것:** 해시와 집계뿐. “차주 아무개의 계약”이 아니라 “금액 불일치 N건, 이중 담보 M건” 수준의 참고 자료.

*(현재: NEAR AI 추론은 TEE 경로, pipeline·오라클 키 일부는 아직 서버 — [현재 한계](#현재-한계). 로드맵은 pipeline 전체를 Phala CVM 등으로 이전.)*

## What is BBC?

**BBC (Borrowing Base Certificate):** 할부금융사가 은행·에이전트에 제출하는 담보 한도 신고(또는 테이프+요약). **1차는 할부금융사가 작성**, 은행은 샘플링·필드 실사로 견제. BlindLimit은 그 **작성·사전 자가 점검**을 가속합니다.

## Architecture

1. `/verify` — lender uploads contracts (`.pdf` / `.txt`) + loan tape (`.csv`). 기본은 **검증만**; 선택 시 온체인 `postLimit`.
2. **TEE AI** extracts fields from contract images/PDFs; **`lib/rules`** joins on normalized VIN, registry check, borrowing base + exclusion codes.
3. UI: aggregates only — no raw PII / row-level tape in logs or events.
4. `/lender` — (on-chain extension) borrow within `availableToBorrow()` after a published limit.

On-chain: `CollateralRegistry`, `LoanPool`, `PoolFactory` (Foundry, Base Sepolia or local Anvil).

Off-chain: Next.js App Router, `web/lib/pipeline.ts`.

## Run locally

### One-shot (anvil fork → fund → deploy → Otterscan)

```bash
# contracts/.env 에 DEPLOYER_PRIVATE_KEY, LENDER/OPERATOR/ORACLE, fork URL 필요
./scripts/local-setup.sh
# 출력 주소를 web/.env.local 에 반영
```

### Contracts (manual)

```bash
cd contracts
cp .env.example .env
# DEPLOYER_PRIVATE_KEY, LENDER_ADDRESS, OPERATOR_ADDRESS, ORACLE_ADDRESS — set in .env only (never commit)
forge test
anvil --chain-id 31337
# another terminal:
./scripts/fork-fund.sh
forge script script/DeployM1.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/DeployFactory.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Web

```bash
cd web
cp .env.example .env.local
# ORACLE_PRIVATE_KEY, VIN_SALT, NEARAI_API_KEY, REGISTRY/USDC/POOL/FACTORY addresses — see .env.example
env -u BASE_SEPOLIA_RPC_URL pnpm dev
```

MetaMask: **Localhost 8545**, chain ID **31337**.

Optional: `TEE_PROVIDER=mock` for offline demos (UI shows MOCK badge).

## Deployed addresses (fill after broadcast)

| Item | Address |
|------|---------|
| Registry | _(from deploy logs)_ |
| USDC | _(from deploy logs)_ |
| Pool A | _(from deploy logs)_ |
| Factory | _(from deploy logs)_ |

## Demo script (4 scenes)

스토리: **할부금융사 자가 검증** → **온체인 풀 집행 연결**.

1. **약정 불일치 차단:** `/operator` — agreement vs settings (e.g. 90% vs 85%).
2. **자가 장부 검증:** `/verify` — PDF/txt 계약 + CSV → 적격/제외 집계 (핵심).
3. **온체인 집행 — 대출 성공 / revert:** `/lender` — 한도 안/밖 borrow → `ExceedsLimit`.
4. **설정 불변:** `/pool/[address]` — `SettingsLocked`.

## 현재 한계

- 오라클 키(`ORACLE_PRIVATE_KEY`)와 `VIN_SALT` 는 아직 TEE 밖(Next.js 서버). TEE 경로의 중심은 NEAR AI **계약서 추출**; 한도 계산·장부 파싱·영수증 게시는 서버 쪽도 있음.
- 원문 업로드가 브라우저→서버 평문으로 남을 수 있음(로드맵: 암호 업로드 후 CVM 메모리만 복호화).
- **최종 한도 승인·신용 결정 대체 아님** — 내부 점검 가속 + (선택) 제3자 참고.

## 로드맵 / Roadmap

① `pipeline` + 오라클 키 + `VIN_SALT` → Phala CVM (원문·AI·규칙이 한 enclave) ② attestation 온체인 검증 ③ 수정 약정 흐름 ④ Nesa provider ⑤ 기존 풀에 검증 모듈 연동

## Tests

```bash
cd contracts && forge test
cd web && pnpm vitest run && pnpm build
```
