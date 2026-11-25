import { isAddress, type Address } from "viem";

import { PoolDashboard } from "./dashboard";

export const instant = false;

type Props = { params: Promise<{ address: string }> };

export default async function PoolPage({ params }: Props) {
  const { address } = await params;
  const valid = isAddress(address);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold">풀 상세</h1>
      {!valid ? <p>주소가 올바르지 않습니다</p> : <PoolDashboard address={address as Address} />}
    </main>
  );
}