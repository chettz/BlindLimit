import { isAddress, type Address } from "viem";

import { Alert, PageHeader, PageMain } from "@/components/ui/page-shell";

import { PoolDashboard } from "./dashboard";

export const instant = false;

type Props = { params: Promise<{ address: string }> };

export default async function PoolPage({ params }: Props) {
  const { address } = await params;
  const valid = isAddress(address);

  return (
    <PageMain>
      <PageHeader title="풀 상세" description="설정 해시, 한도 영수증, 운영자 데모 동작을 확인합니다." />
      {!valid ? <Alert tone="danger">주소가 올바르지 않습니다</Alert> : <PoolDashboard address={address as Address} />}
    </PageMain>
  );
}