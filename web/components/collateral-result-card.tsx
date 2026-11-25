import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { TextLink } from "@/components/ui/page-shell";
import { formatUsdc, txUrl } from "@/lib/chain/display";

export type CollateralResult = {
  eligibleCount: number;
  eligibleAmount: string;
  limit: string;
  excluded: {
    DELINQUENT: number;
    AMOUNT_MISMATCH: number;
    RATE_MISMATCH: number;
    VIN_PLEDGED_ELSEWHERE: number;
    NO_TAPE_MATCH: number;
    INVALID_VIN: number;
  };
  vinsRegistered: number;
  txHash: string;
  mock: boolean;
  /** 없으면 txHash 유무로 판단 */
  published?: boolean;
};

export function CollateralResultCard({
  result,
  borrowHref,
}: {
  result: CollateralResult;
  borrowHref?: string;
}) {
  const published = result.published ?? result.txHash.length > 0;
  const rows = [
    ["연체", result.excluded.DELINQUENT],
    ["금액 불일치", result.excluded.AMOUNT_MISMATCH],
    ["금리 불일치", result.excluded.RATE_MISMATCH],
    ["장부 미매칭", result.excluded.NO_TAPE_MATCH],
    ["VIN 형식 오류", result.excluded.INVALID_VIN],
  ] as const;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>검증 결과</CardTitle>
        {result.mock ? <Badge tone="mock">Mock</Badge> : null}
        {!published ? <Badge>온체인 미게시</Badge> : null}
      </div>
      <p className="text-sm">
        적격 <span className="font-medium text-foreground">{result.eligibleCount}건</span> ·{" "}
        {formatUsdc(BigInt(result.eligibleAmount))} USDC
      </p>
      <p className="text-sm font-medium text-warning">
        다른 풀에 담보 잡힌 차량 {result.excluded.VIN_PLEDGED_ELSEWHERE}건
      </p>
      <ul className="grid gap-1 text-sm text-muted sm:grid-cols-2">
        {rows.map(([label, count]) => (
          <li key={label}>
            {label} <span className="text-foreground">{count}</span>건
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        적격 VIN <span className="text-foreground">{result.vinsRegistered}</span>건 · 산출 한도{" "}
        <span className="font-medium text-accent">{formatUsdc(BigInt(result.limit))} USDC</span>
      </p>
      {published ? (
        <TextLink href={txUrl(result.txHash)}>한도 게시 거래 {shortHash(result.txHash)}</TextLink>
      ) : (
        <p className="text-sm text-muted">온체인 풀에는 게시하지 않았습니다.</p>
      )}
      {published && borrowHref ? (
        <p className="text-sm">
          <TextLink href={borrowHref}>이 풀에서 온체인 대출하기</TextLink>
        </p>
      ) : null}
    </Card>
  );
}

export function collateralErrorText(json: unknown): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") return json.error;
  return "검증에 실패했습니다";
}

export function isCollateralResult(json: unknown): json is CollateralResult {
  if (!json || typeof json !== "object") return false;
  const value = json as Partial<CollateralResult>;
  return (
    typeof value.eligibleCount === "number" &&
    typeof value.eligibleAmount === "string" &&
    typeof value.limit === "string" &&
    typeof value.vinsRegistered === "number" &&
    typeof value.txHash === "string" &&
    typeof value.mock === "boolean" &&
    isExcluded(value.excluded)
  );
}

function isExcluded(value: CollateralResult["excluded"] | undefined): value is CollateralResult["excluded"] {
  if (!value) return false;
  return (
    typeof value.DELINQUENT === "number" &&
    typeof value.AMOUNT_MISMATCH === "number" &&
    typeof value.RATE_MISMATCH === "number" &&
    typeof value.VIN_PLEDGED_ELSEWHERE === "number" &&
    typeof value.NO_TAPE_MATCH === "number" &&
    typeof value.INVALID_VIN === "number"
  );
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}
