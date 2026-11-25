# <repo> (가칭 sealbase) — 단계별 Cursor 프롬프트

> 사용법: 각 프롬프트를 Cursor Agent에 **하나씩** 붙여넣기. `.cursor/rules/project.mdc`가 항상 적용된다는 전제.
> 끝날 때마다 "완료 기준"을 직접 확인하고 커밋한 뒤 다음으로. 막히면 30분 안에 범위를 줄인다.
> 시간은 Cursor 사용 기준 추정치(검증 안 됨). 합계 약 8.7시간.
> 11/25 05:30 개정: 6단계 한도 흐름을 `web/lib/pipeline.ts`로 분리(의존성 주입, Phala TEE 이전 대비), 11단계에 README(로드맵·현재 한계) 추가.
> 11/25 05시 개정: 금액 허용오차(`amountToleranceCents`) + 공유 VIN 레지스트리(`CollateralRegistry`, 일괄 등록) 반영 — 0·2·3·4·5·6·7·8·9단계 수정.

| 마일스톤 | 단계 | 내용 | 예상 |
|---|---|---|---|
| 준비 | 0 | 스캐폴딩 | 20분 |
| 준비 | 1 | NEAR AI 스파이크 스크립트 | 30분 |
| **M1** | 2 | CollateralRegistry + LoanPool + MockUSDC 컨트랙트·테스트 | 80분 |
| M1 | 3 | 한도 규칙 엔진(lib/rules, 적격 판정 4종) | 35분 |
| M1 | 4 | TeeProvider(NEAR AI + mock) | 45분 |
| M1 | 5 | Foundry 스크립트로 레지스트리 + 풀 배포 | 20분 |
| M1 | 6 | pipeline.ts(한도 흐름 분리) + 담보 제출 API → VIN 검사 → 한도 게시 + VIN 일괄 등록 | 75분 |
| M1 | 7 | 대출사 화면: 담보 제출 + 대출 성공/revert | 60분 |
| **M1 끝** | — | 한도 게시 → 대출 성공/revert 데모 가능 | (~6h) |
| M2 | 8 | 약정 대조 엔진 + 배포 전 화면(폴백 지점) | 45분 |
| M2 | 9 | PoolFactory + 이중서명 검증 | 45분 |
| M2 | 10 | 약정 서명 흐름 + 풀 배포 버튼 | 60분 |
| 마감 | 11 | 운영자 단독 변경 revert + 영수증 화면 + README + 데모 리허설 | 40분 |

---

## 0. 스캐폴딩 (20분)

```
목표: 모노레포 뼈대를 만든다. 코드 로직은 아직 쓰지 않는다.
- 루트에 contracts/ (forge init --no-git, OpenZeppelin 설치: forge install OpenZeppelin/openzeppelin-contracts --no-git, remappings 설정)
- web/ 에 Next.js App Router + TypeScript + Tailwind (pnpm create next-app web --ts --tailwind --app --src-dir=false)
- web 의존성: wagmi viem @tanstack/react-query openai zod pdf-parse, dev: vitest
- 루트 .gitignore: node_modules, .env*, .private/, contracts/out, contracts/cache, contracts/broadcast
- web/.env.example 만 생성(값은 비움): NEARAI_API_KEY, TEE_PROVIDER=mock, NEARAI_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct, ORACLE_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY, BASE_SEPOLIA_RPC_URL=https://sepolia.base.org, VIN_SALT, REGISTRY_ADDRESS, NEXT_PUBLIC_POOL_ADDRESS, NEXT_PUBLIC_USDC_ADDRESS
  (NEXT_PUBLIC_ 은 주소만. 키와 VIN_SALT 는 절대 NEXT_PUBLIC 금지. VIN_SALT 는 openssl rand -hex 32 로 만들고 커밋 금지)
- .cursor/rules/project.mdc 는 이미 있으니 건드리지 마.
완료 기준: `cd contracts && forge build` 성공, `cd web && pnpm build` 성공.
```

## 1. NEAR AI 스파이크 스크립트 (30분) — 요한 직접 실행

```
목표: NEAR AI Cloud가 우리 용도로 동작하는지 30분 안에 확인한다.
web/scripts/near-spike.ts 를 만들어(tsx로 실행):
1) openai SDK, baseURL "https://cloud-api.near.ai/v1", apiKey = process.env.NEARAI_API_KEY
2) 인자로 받은 PDF를 pdf-parse로 텍스트 추출 → model "Qwen/Qwen3-VL-30B-A3B-Instruct" 에
   "이 문서에서 선급률(advance rate)을 basis points 정수로 JSON {advanceRateBps:number} 만 출력" 요청.
   원문 텍스트는 콘솔에 찍지 말고 길이(문자 수)만 출력.
3) (선택) --image 플래그면 PNG 1장을 base64 data URL로 content 배열에 {type:"image_url", image_url:{url}} 형태로 보냄.
4) 응답의 id(chat id)로 GET https://cloud-api.near.ai/v1/signature/{id}?model=<model>&signing_algo=ecdsa 호출, 결과 키 목록만 출력.
5) GET https://cloud-api.near.ai/v1/attestation/report?model=<model>&nonce=<랜덤 32바이트 hex> 호출,
   응답 JSON을 .private/spike-attestation.json 에 저장하고 keccak256(응답 바이트)만 출력.
완료 기준: `pnpm tsx scripts/near-spike.ts <아무 PDF>` 가 숫자 JSON, 서명 키 목록, attestation 해시를 출력.
1시간 넘게 막히면 중단하고 TEE_PROVIDER=mock 으로 진행(4단계에서 mock 구현).
```

## 2. CollateralRegistry + LoanPool + MockUSDC 컨트랙트 (80분) — M1

```
목표: 팩토리 없이 단독 배포 가능한 LoanPool 과, 모든 풀이 같이 쓰는 VIN 레지스트리를 만든다(M1). 팩토리는 9단계에서 붙인다.
contracts/src/MockUSDC.sol: ERC20 "Mock USDC"/"mUSDC", decimals 6, 누구나 mint 가능(테스트넷 전용 주석).

contracts/src/CollateralRegistry.sol (공유 VIN 레지스트리, 이중담보 차단):
- 저장: mapping(bytes32 vinHash => address pool) pledgedTo; mapping(address => bool) isPool; address owner; address factory.
  vinHash = keccak256(정규화된 VIN + 서버 비밀 솔트). VIN 원문은 절대 체인에 오지 않는다(해시는 서버가 계산).
- authorizePool(address pool): owner 또는 factory 만. emit PoolAuthorized(pool).
- setFactory(address f): owner 만 (9단계에서 사용).
- registerBatch(bytes32[] calldata vinHashes): isPool[msg.sender] 만 호출 가능(= 풀 컨트랙트가 직접 호출).
  각 해시마다: 비어 있으면 msg.sender 로 등록, 이미 msg.sender 면 건너뜀(멱등), 다른 풀이면 revert AlreadyPledged(vinHash, existingPool) — 배치 전체 롤백.
  emit VinsRegistered(pool, 새로 등록된 개수).
- releaseBatch(bytes32[] calldata vinHashes): 소유 풀만. 각 해시 pledgedTo == msg.sender 아니면 revert NotOwnerPool(vinHash), 맞으면 delete(가스 일부 환급). emit VinsReleased(pool, count).
- view: isPledged(bytes32) → bool, pledgedTo(bytes32) → address, checkBatch(bytes32[]) → address[] (서버가 사전 검사용으로 한 번에 조회).
- custom errors: NotOwner, NotAuthorized, AlreadyPledged(bytes32 vinHash, address existingPool), NotOwnerPool(bytes32 vinHash).
- 설계 선택(문서화): "풀이 직접 registerBatch 호출" 방식. postLimit 한 tx 안에서 VIN 등록 + 한도 갱신이 원자적으로 처리되고,
  오라클이 다른 풀 이름으로 등록하는 경로가 없다. 등록 권한은 owner/factory 가 승인한 풀에만.

contracts/src/LoanPool.sol:
- struct Settings { uint16 advanceRateBps; uint16 delinquencyCutoffDays; uint32 amountToleranceCents; uint16 obligorConcBps; uint16 dealerConcBps; uint256 maxCommitment; }
  (amountToleranceCents: 장부·계약서 원금 차이 허용오차, 100 = 1달러)
- constructor(IERC20 usdc, CollateralRegistry registry, address lender, address operator, address oracle, bytes32 agreementHash, Settings s, bytes lenderSig, bytes operatorSig)
  → 전부 immutable/저장, settingsHash = keccak256(abi.encode(s)) 저장(허용오차 포함), limit = 0. (서명 검증은 9단계 팩토리에서. 여기선 저장만)
- postLimit(bytes32 docBundleHash, bytes32 attestationHash, bytes32 ruleHash, uint256 eligibleCount, uint256 eligibleAmount, uint256 newLimit, bytes32[] calldata vinHashes): onlyOracle.
  먼저 registry.registerBatch(vinHashes) (다른 풀에 잡힌 VIN 이 하나라도 있으면 여기서 전체 revert), 그다음 limit 갱신,
  emit LimitUpdated(agreementHash, docBundleHash, attestationHash, ruleHash, eligibleCount, eligibleAmount, newLimit, uint64(block.timestamp))
- releaseVins(bytes32[] calldata vinHashes): onlyOracle, registry.releaseBatch 호출(상환 완료된 차량 해제, 선택 기능).
- borrow(uint256 amount): onlyLender, cap = min(limit, s.maxCommitment); borrowed+amount > cap 면 revert ExceedsLimit(amount, cap - borrowed 또는 0). 성공 시 USDC transfer → lender, emit Borrowed.
- repay(uint256 amount): lender가 transferFrom으로 상환, borrowed 감소.
- updateSettings(Settings) external: 항상 revert SettingsLocked().  (데모 장면용)
- availableToBorrow() view, settings() view(허용오차 포함 6개 필드 반환).
- custom errors: NotOracle, NotLender, ExceedsLimit, SettingsLocked, ZeroAmount.

contracts/test/CollateralRegistry.t.sol (테스트 데이터는 이 파일 안에 인라인으로만, 예: keccak256("VIN-A") 등):
  일괄 등록 성공 + VinsRegistered 개수 / 다른 풀이 같은 해시 등록 시 AlreadyPledged(hash, poolA) revert + 배치 전체 롤백 확인 /
  같은 풀 재등록은 멱등(revert 없음, 개수 0) / poolA releaseBatch 후 poolB 등록 성공 / 다른 풀의 해시 release 시 NotOwnerPool /
  승인 안 된 주소의 registerBatch → NotAuthorized / owner 아닌 authorizePool → NotOwner.
contracts/test/LoanPool.t.sol: 각 external 함수 성공+revert. 특히:
  limit 0에서 borrow revert / postLimit 후 한도 내 borrow 성공 / 한도 초과 revert / maxCommitment 가 limit 보다 작을 때 maxCommitment 기준 revert /
  oracle 아닌 계정 postLimit revert / updateSettings 항상 revert / LimitUpdated 이벤트 필드 검증(vm.expectEmit) /
  settingsHash 가 amountToleranceCents 를 포함해 계산되는지 / 두 풀 A·B 시나리오: A 가 postLimit 으로 VIN 등록 후 B 의 postLimit 에 같은 VIN → AlreadyPledged revert 이고 B 의 limit 은 그대로.
완료 기준: `forge test -vv` 전부 통과.
```

## 3. 한도 규칙 엔진 (35분) — M1

```
목표: 적격 판정과 한도 계산을 하는 결정적 순수 함수. AI 없음, 체인 호출 없음(레지스트리 조회 결과는 입력으로 받음).
web/lib/rules/borrowingBase.ts:
- type Receivable = {
    idHash: string;                 // keccak256(계약번호) — 원문 금지
    vinHash: `0x${string}`;          // keccak256(정규화 VIN + VIN_SALT) — 6단계에서 계산
    contractPrincipalCents: bigint;  // 계약서(AI 추출) 원금, 센트
    tapePrincipalCents: bigint;      // 장부(코드 파싱) 원금, 센트
    daysPastDue: number;
    obligorKey: string; dealerKey: string;  // 이미 해시된 값. 이름 원문 금지
    rateMismatch: boolean;
    pledgedElsewhere: boolean;       // 6단계에서 registry.checkBatch 결과(다른 풀 주소면 true)
  }
- type Settings = { advanceRateBps, delinquencyCutoffDays, amountToleranceCents, obligorConcBps, dealerConcBps, maxCommitment } (컨트랙트와 같은 6개 필드)
- 적격 판정(한 건씩, 걸린 사유를 전부 기록): 
  DELINQUENT: daysPastDue > delinquencyCutoffDays
  AMOUNT_MISMATCH: |contractPrincipalCents - tapePrincipalCents| > amountToleranceCents
  RATE_MISMATCH: rateMismatch
  VIN_PLEDGED_ELSEWHERE: pledgedElsewhere
  (장부 매칭 실패 NO_TAPE_MATCH 는 6단계에서 집계)
- computeBorrowingBase(rows, settings) → { eligibleCount, eligibleAmount, concentrationExcess, limit, eligibleVinHashes, excluded: { DELINQUENT, AMOUNT_MISMATCH, RATE_MISMATCH, VIN_PLEDGED_ELSEWHERE } 건수 }
  적격 원금 = tapePrincipalCents × 10^4 (USDC 6 decimals 로 변환). 
  obligor/dealer 별 합계가 eligibleAmount * concBps / 10000 를 넘는 초과분을 concentrationExcess 로 합산(concBps = 0 이면 미적용).
  limit = (eligibleAmount - concentrationExcess) * advanceRateBps / 10000 (bigint, 내림)
  eligibleVinHashes: 적격 건의 vinHash 목록(중복 제거, 정렬) — 6단계에서 postLimit 에 그대로 넘김.
- RULE_VERSION 상수(v2) + ruleHash = keccak256(이 함수 규칙 설명 문자열+버전) (viem keccak256/toHex)
web/lib/rules/borrowingBase.test.ts: vitest 인라인 케이스 — 연체 제외 / 금액 차이 1달러(100센트) 이내는 적격, 101센트는 AMOUNT_MISMATCH /
  금리 불일치 제외 / VIN_PLEDGED_ELSEWHERE 제외 / 한 건이 여러 사유면 사유별로 모두 집계 / 차주 집중도 초과 / 딜러 집중도 초과 / concBps 0 은 미적용 / 빈 배열 → 0.
  픽스처 파일 만들지 말 것.
완료 기준: `pnpm vitest run` 통과.
```

## 4. TeeProvider: NEAR AI + mock (45분) — M1

```
목표: AI 추출을 인터페이스 뒤로 숨긴다. (1단계 스파이크 통과: 추론·응답 서명·attestation 모두 동작 확인됨)
web/lib/tee/types.ts:
  interface TeeProvider {
    extractInstallmentContract(doc: {text?: string; imagePngBase64?: string}): Promise<TeeResult<ContractTerms>>;
    extractAgreementTerms(doc: {text?: string; imagePngBase64?: string}): Promise<TeeResult<AgreementTerms>>;
    getAttestation(nonce: string): Promise<{ raw: unknown; mock: boolean }>;
  }
  TeeResult<T> = { data: T; chatId?: string; signature?: { text: string; signature: string; signingAddress: string; signingAlgo: "ecdsa" }; mock: boolean }
  ContractTerms(zod): contractNo, vin(17자 문자열), obligorName, dealerName, principalCents(센트 정수 문자열), annualRateBps, daysPastDue
  AgreementTerms(zod): advanceRateBps, delinquencyCutoffDays, amountToleranceCents, obligorConcBps, dealerConcBps, maxCommitment
  (11/25 05시 개정: vin, principalCents, amountToleranceCents 추가 — 3·6·8단계와 맞춤)
web/lib/tee/nearai.ts: openai SDK(baseURL https://cloud-api.near.ai/v1), 모델 env NEARAI_MODEL(기본 Qwen/Qwen3-VL-30B-A3B-Instruct),
  temperature 0, "JSON만 출력" 시스템 프롬프트.
  JSON 파싱(중요, 스파이크에서 모델이 json 코드블록(백틱 3개)으로 감싸서 응답함):
    1) 요청에 response_format: { type: "json_object" } 를 넣는다. 400 등으로 거부되면 이 옵션 없이 재시도.
    2) 응답 문자열에서 앞뒤 코드블록 펜스(백틱 3개 + json, 백틱 3개)를 제거하고, 그래도 실패하면 첫 '{' ~ 마지막 '}' 구간만 잘라 JSON.parse.
    3) zod 로 검증, 실패 시 throw(원문은 에러 메시지에 넣지 말 것).
  응답 서명: 추론 직후 GET /v1/signature/{chatId}?model=<model>&signing_algo=ecdsa (Bearer 키)
    → { text, signature, signing_address, signing_algo } 를 TeeResult.signature 로 반환. ed25519 도 되지만 이더리움과 같은 ecdsa 로 통일.
  getAttestation: GET /v1/attestation/report?model=...&nonce=...&signing_algo=ecdsa (fetch, Bearer 키).
    응답 키: gateway_attestation, model_attestations, ohttp_key_config, ohttp_attestation.
  문서가 길어 16K 컨텍스트를 넘으면 env NEARAI_LONG_MODEL=z-ai/glm-5.3-flash 로 전환.
web/lib/tee/receipt.ts: buildReceipt({attestationRaw, signatures[]}) → 오프체인 영수증 JSON(attestation 원본 + 각 응답의 signing_address·signature)
  을 .private/receipts/<hash>.json 에 저장하고 attestationHash = keccak256(그 JSON 바이트) 반환. 이 해시를 postLimit 의 attestationHash 로 사용.
web/lib/tee/mock.ts: 텍스트에서 정규식으로 같은 필드를 뽑는 결정적 mock, signature 없음, mock:true.
web/lib/tee/index.ts: TEE_PROVIDER 로 선택. 서버 전용(import 'server-only').
완료 기준: 스파이크 PDF로 nearai provider 호출 → zod 통과한 객체 + signature.signingAddress(0x...) 출력(또는 mock 로 통과).
  코드블록 감싼 응답 문자열 3종(펜스 있음/없음/앞뒤 설명문 포함)에 대한 파서 단위 테스트 통과. 원문은 출력하지 말 것.
```

## 5. Foundry 스크립트로 레지스트리 + 풀 배포 (20분) — M1

```
목표: 팩토리 없이 Base Sepolia 에 CollateralRegistry + MockUSDC + LoanPool 배포.
contracts/script/DeployM1.s.sol:
- env: DEPLOYER_PRIVATE_KEY, LENDER_ADDRESS, OPERATOR_ADDRESS, ORACLE_ADDRESS, AGREEMENT_HASH(없으면 bytes32(0)), DEPLOY_POOL_B(선택, true 면 풀 B 도 배포)
- 순서: ① CollateralRegistry 배포(owner = deployer) ② MockUSDC 배포 ③ LoanPool A 배포(registry 주소 전달)
  ④ registry.authorizePool(poolA) ⑤ 풀에 유동성 1,000,000e6 mint
  ⑥ (선택) DEPLOY_POOL_B=true 면 같은 레지스트리를 쓰는 LoanPool B 도 배포 + authorizePool — "다른 풀에 잡힌 VIN" 데모 장면용
- Settings 는 스크립트 상수(advance 8500, cutoff 30일, amountToleranceCents 100, obligor 1000, dealer 3000, maxCommitment 500_000e6) — 숫자는 요한이 약정서에 맞게 수정
- 서명은 빈 bytes. 주소를 console.log
실행: forge script script/DeployM1.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
web/lib/chain/: abi(LoanPool, CollateralRegistry, MockUSDC — forge out 에서 복사하는 스크립트 or 직접 export), viem publicClient/walletClient(oracle, 서버 전용), baseSepolia 체인 설정.
완료 기준: Base Sepolia 탐색기에서 컨트랙트 확인, cast call 로 registry.isPool(poolA) == true, web/.env.local 에 REGISTRY_ADDRESS·풀·USDC 주소 기록.
```

## 6. 담보 제출 API → VIN 검사 → 한도 게시 + VIN 일괄 등록 (75분) — M1 핵심

```
목표: 할부계약서 PDF 여러 개 + 대출장부 CSV 를 받아 적격 판정·한도 계산 후, 한도 게시와 적격 VIN 등록을 한 트랜잭션으로 처리.
핵심 설계: 전체 흐름을 web/lib/pipeline.ts 의 함수 하나로 분리한다. 나중에 Phala(dstack) TEE 컨테이너로 코드 수정 없이 옮기기 위해서다.
  pipeline.ts 와 lib/rules/* 는 Next.js(next/*)를 import 하지 않고 process.env 를 직접 읽지 않는다. 필요한 것은 전부 deps 로 주입받는다.

web/lib/rules/vin.ts: normalizeVin(v) = 대문자·공백/하이픈 제거·17자 검증(실패 시 해당 건 부적격 INVALID_VIN),
  vinHash(v, salt) = keccak256(toBytes(normalizeVin(v) + salt)). salt 는 인자로 받는다(env 직접 읽기 금지). VIN 원문은 로그·반환값 금지.

web/lib/pipeline.ts:
  export async function runBorrowingBase(input, deps): Promise<PipelineResult>
  - input = { pool: Address; contracts: { name: string; bytes: Uint8Array }[]; tapeCsv: string }
  - deps = {
      tee: TeeProvider;                      // 4단계 nearai 또는 mock
      chain: {                               // viem 래퍼 인터페이스(테스트에서 가짜로 교체)
        readSettings(pool): Promise<Settings>;
        checkBatch(vinHashes): Promise<Address[]>;
        postLimit(pool, args): Promise<{ txHash: string; status: "success" | "reverted"; revertName?: string }>;
      };
      signer: { address: Address };          // 오라클 계정(실제 서명은 chain.postLimit 구현이 수행)
      salt: string;                          // VIN_SALT
      saveReceipt(json: string): Promise<void>;  // .private/receipts 저장(나중에 TEE 안 저장소로 교체 가능)
      now(): number;
    }
  - 처리 순서:
    1) 각 파일 keccak256 → docBundleHash = keccak256(정렬된 해시 연결)
    2) 장부 CSV 를 코드로 파싱(계약번호, 원금(센트), 연체일수, 금리)
    3) 각 계약서 PDF → pdf-parse 텍스트 → deps.tee.extractInstallmentContract (vin, principalCents 포함)
    4) 대사: 계약번호로 장부 행 매칭 → contractPrincipalCents/tapePrincipalCents 둘 다 Receivable 에(허용오차 판정은 규칙 엔진), 금리 불일치면 rateMismatch=true, 매칭 실패는 NO_TAPE_MATCH
    5) obligorName/dealerName → keccak256, VIN → vinHash(v, deps.salt). 원문 변수는 즉시 버림
    6) deps.chain.checkBatch(모든 vinHash) 한 번 조회 → 0 주소도 아니고 현재 풀도 아니면 pledgedElsewhere=true
    7) deps.chain.readSettings(pool) (허용오차 포함) → computeBorrowingBase(rows, settings)
    8) 4단계 receipt 로직으로 영수증 JSON → deps.saveReceipt → attestationHash
    9) deps.chain.postLimit(pool, { docBundleHash, attestationHash, ruleHash, eligibleCount, eligibleAmount, limit, eligibleVinHashes }) 1회
       → 한도 갱신과 적격 VIN 일괄 등록이 같은 tx 에서 원자적으로 처리.
       (6)과 (9) 사이에 다른 풀이 같은 VIN 을 등록해 AlreadyPledged 로 revert 되면 code "VIN_RACE" 로 반환("다른 풀에 이미 담보로 잡힌 차량 포함 — 다시 제출")
  - PipelineResult = { eligibleCount, eligibleAmount, concentrationExcess, limit, excluded(DELINQUENT·AMOUNT_MISMATCH·RATE_MISMATCH·VIN_PLEDGED_ELSEWHERE·NO_TAPE_MATCH·INVALID_VIN 건수), vinsRegistered, txHash, attestationHash, mock }
    — 행 단위 데이터·이름·VIN 원문·vinHash 목록 금지(건수만)

web/lib/chain/poolClient.ts: deps.chain 의 실제 구현(viem publicClient/walletClient + LoanPool·CollateralRegistry ABI). 오라클 키는 생성 인자로 받는다.

web/app/api/collateral/route.ts (POST, multipart, runtime nodejs, ?pool=주소 선택 — 없으면 NEXT_PUBLIC_POOL_ADDRESS):
  역할은 입력 검증(파일 개수·크기·확장자, pool 주소 형식)과 deps 조립(여기서만 process.env 의 ORACLE_PRIVATE_KEY·VIN_SALT·REGISTRY_ADDRESS 를 읽음),
  runBorrowingBase 호출, 결과 JSON 반환뿐. 비즈니스 로직 금지. VIN_SALT 없으면 500 + "서버 설정 누락".
  파일은 메모리에서 처리(디스크 저장 안 함).

web/lib/pipeline.test.ts (vitest, 가짜 deps 인라인 — 픽스처 파일 금지, 계약서 PDF 대신 텍스트를 주는 가짜 tee 사용):
  정상 흐름: postLimit 이 1회 호출되고 eligibleVinHashes 가 적격 건만 담김 / checkBatch 가 다른 풀 주소를 돌려준 VIN → VIN_PLEDGED_ELSEWHERE 로 제외되고 등록 목록에서 빠짐 /
  금액 차이 101센트 → AMOUNT_MISMATCH / 장부에 없는 계약 → NO_TAPE_MATCH / postLimit 이 AlreadyPledged 로 revert → VIN_RACE /
  반환값 어디에도 VIN 원문·차주 이름이 없음(JSON.stringify 결과에 입력 문자열 미포함 검사).
완료 기준: `pnpm vitest run` 통과 + 실제 문서(팀원 준비 자료)로 API 호출 → 탐색기에서 LimitUpdated + VinsRegistered 이벤트 확인, 서버 로그에 원문/이름/VIN 없음(grep).
  `grep -rE "from ['\"]next|process\.env" web/lib/pipeline.ts web/lib/rules` 결과가 비어 있어야 함.
  (풀 B 를 배포했다면) 같은 문서를 ?pool=풀B 로 제출 → 해당 건들이 VIN_PLEDGED_ELSEWHERE 로 제외되고 풀 B 한도가 그만큼 줄어드는지 확인.
```

## 7. 대출사 화면: 담보 제출 + 대출 성공/revert (60분) — M1 끝

```
목표: M1 데모를 처음부터 끝까지 화면에서.
web/app/providers.tsx: wagmi(baseSepolia, injected connector) + react-query.
web/app/lender/page.tsx:
- 지갑 연결 버튼, 현재 limit / borrowed / available / maxCommitment 표시(useReadContract, 10초 폴링)
- 담보 제출 폼(PDF 여러 개 + CSV) → /api/collateral → 결과 카드(적격 건수·금액, 제외 사유별 건수 — '다른 풀에 담보 잡힌 차량 N건' 강조, 등록된 VIN 수, 한도, tx 링크, MOCK 배지)
- 대출 요청 입력 + "대출 실행" 버튼 → writeContract(borrow). 실패 시 viem 에러에서 custom error 이름을 decode 해 한국어로:
  ExceedsLimit → "한도 초과 — 가능액 X USDC, 요청 Y USDC (거래 거부됨)"
- 성공 시 tx 링크 + USDC 잔액 갱신
완료 기준: (a) 담보 제출 → 한도 표시 (b) 한도 내 대출 성공 (c) 한도 초과 요청 → revert 메시지. 3개를 실제 Base Sepolia 에서 확인. 여기까지 되면 커밋+태그 m1.
```

## 8. 약정 대조 엔진 + 배포 전 화면 (45분) — M2, 폴백 지점

```
목표: 약정서 숫자 조건 vs 운영자 설정을 항목별 비교해 불일치면 차단. (시간 부족하면 여기까지만 하고 데모)
web/lib/rules/agreementCheck.ts: compareTerms(extracted: AgreementTerms, settings) (amountToleranceCents 포함 6개 필드) → { ok, fields: [{name, labelKo, agreement, setting, match}] } 순수 함수 + vitest(90% vs 85% 케이스 포함, 인라인).
web/app/api/agreement/check/route.ts: PDF 받아 agreementHash=keccak256(bytes) 계산 → tee.extractAgreementTerms → compareTerms → { agreementHash, fields, ok, mock } (원문 금지)
web/app/operator/page.tsx (1차): 약정서 업로드 + 설정 입력 폼(연체 기준일, 선급률, 금액 허용오차(달러), 차주/딜러 집중도, 최대 약정액) + "풀 배포" 버튼.
  버튼 누르면 check 호출 → 불일치 항목 빨간 행 "약정서 90% ≠ 설정 85% — 배포 차단", 일치 시 "배포 가능" 표시(실제 배포는 10단계).
완료 기준: 선급률만 다르게 입력 → 차단 표시, 맞게 입력 → 배포 가능 표시.
```

## 9. PoolFactory + 이중서명 검증 (45분) — M2

```
목표: 양측이 같은 약정서 해시에 서명했을 때만 풀이 배포되게.
contracts/src/PoolFactory.sol:
- constructor(CollateralRegistry registry). 배포 후 owner 가 registry.setFactory(factory) 실행(스크립트에 포함).
- createPool(IERC20 usdc, address lender, address oracle, bytes32 agreementHash, Settings s, bytes lenderSig, bytes operatorSig)
  msg.sender = operator. ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(agreementHash), lenderSig) == lender, operatorSig 도 operator 와 일치해야 함
  불일치면 revert BadLenderSig / BadOperatorSig. 성공 시 new LoanPool(usdc, registry, ...) → registry.authorizePool(pool) → emit PoolCreated(pool, agreementHash, settingsHash).
- test/PoolFactory.t.sol: vm.sign 으로 정상 배포 / 다른 해시에 서명한 경우 revert / 서명자 바뀐 경우 revert / 팩토리로 만든 풀이 registry.isPool == true.
- script/DeployFactory.s.sol 로 Base Sepolia 배포.
완료 기준: forge test 통과 + 팩토리 주소 .env.local 기록.
```

## 10. 약정 서명 흐름 + 풀 배포 버튼 (60분) — M2

```
목표: 대출사 서명 → 운영자는 서명된 약정만 선택 → 공동서명 → 대조 통과 시 팩토리 배포.
- web/app/lender/agreement/page.tsx: 약정서 PDF 선택 → 브라우저에서 keccak256(bytes) → signMessage({message:{raw: agreementHash}}) →
  POST /api/agreements {agreementHash, lender, lenderSig} + PDF. 서버는 PDF 를 .private/agreements/<hash>.pdf 에, 메타를 .private/agreements.json 에 저장. 서명 검증(viem verifyMessage) 실패 시 거부.
- GET /api/agreements: 대출사 서명된 목록(해시, 대출사 주소, 시각)만 반환.
- operator 페이지: 목록에서 선택(직접 업로드 제거) → 운영자 signMessage → 8단계 check(서버의 저장된 PDF 사용) → ok 면 writeContract(factory.createPool) → 새 풀 주소로 /pool/[address] 이동.
- 대조 후 .private 의 원본 PDF 는 삭제 옵션(데모에선 유지 가능, README 에 한계 명시).
완료 기준: 두 지갑으로 서명 → 불일치면 배포 버튼 비활성, 일치면 새 풀 배포 tx 확인. 새 풀에서 7단계 흐름이 그대로 동작(풀 주소를 파라미터로).
```

## 11. 단독 변경 revert + 영수증 화면 + README + 리허설 (40분)

```
목표: 남은 데모 장면과 마무리.
- /pool/[address] 페이지: 설정값·settingsHash·agreementHash 표시, LimitUpdated 이벤트 목록(getLogs) → 영수증 카드(해시들, 건수, 금액, 시각, 탐색기 링크).
- 운영자 전용 "설정 변경 시도" 버튼 → updateSettings 호출 → SettingsLocked 를 "배포 후 설정은 단독 변경 불가 (양측 서명 수정 약정 필요 — 로드맵)" 로 표시.
- 루트 README.md 작성(한국어 + 영어 한 줄 요약): 한 줄 소개, 아키텍처(원문은 TEE 안 AI만 읽고 체인에는 해시·집계값만), 실행 방법(.env.example 기준, 키 값은 쓰지 말 것), 배포 주소·tx 링크, 데모 장면 4개.
  '현재 한계' 섹션(그대로 포함): "오라클 키(ORACLE_PRIVATE_KEY)와 VIN_SALT 는 현재 TEE 밖(Next.js 서버)에 있다. TEE 안에서 도는 것은 NEAR AI 모델 추론(추출)뿐이며, 한도 계산·영수증 게시는 서버가 한다. 대출 장부(CSV) 파싱도 서버에서 한다."
  '로드맵 / Roadmap' 섹션(그대로 포함): "① web/lib/pipeline.ts + 오라클 키 + VIN_SALT 를 Phala Cloud TEE(dstack) 컨테이너로 이전 — pipeline 은 의존성 주입 구조라 코드 수정 없이 이동 가능 ② TEE attestation·응답 서명(signing_address)의 온체인 검증 ③ 수정 약정(양측 서명) 흐름 ④ Nesa 암호화 추론 provider 추가 ⑤ 기존 풀(Goldfinch/Centrifuge)에 한도 모듈로 연동"
- 전체 흐름 3회 리허설: TEE_PROVIDER=nearai 1회 이상, mock 백업 1회. 실패 지점 메모.
완료 기준: 데모 장면 4개(배포 차단 / 한도 산정 / 대출 성공·revert / 단독 변경 revert)가 끊김 없이 재현. README 에 '현재 한계'와 '로드맵 / Roadmap' 섹션이 있음.
```

---

### 공통 주의
- 모든 단계 끝에: "변경 파일 목록, 테스트 결과, 원문·개인정보가 로그/응답에 남지 않았는지 확인 결과를 보고해줘" 를 덧붙이면 좋다.
- ❓ 미검증: data URL(base64) 이미지 입력은 아직 스파이크에서 안 돌려봄(`--image` 옵션으로 확인 가능). 안 되면 텍스트 추출만 사용.
- ✅ 스파이크 확인(11/25 04:43 KST): 추론 OK(~1초), `/v1/signature` ecdsa·ed25519 둘 다 OK, attestation OK. 모델 응답이 json 코드블록 펜스로 감싸져 옴 → 4단계 파서로 처리.
