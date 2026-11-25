export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">BlindLimit</h1>
      <p>할부 채권 담보 한도를 풀에 게시하고, 그 한도 안에서 대출합니다.</p>
      <div className="flex flex-wrap gap-3">
        <a className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-white" href="/lender">
          대출사 화면
        </a>
        <a className="w-fit rounded-full border border-zinc-900 px-4 py-2" href="/lender/agreement">
          대출사 약정 서명
        </a>
        <a className="w-fit rounded-full border border-zinc-900 px-4 py-2" href="/lender/agreement">
          대출사 약정 서명
        </a>
        <a className="w-fit rounded-full border border-zinc-900 px-4 py-2" href="/operator">
          운영자 화면
        </a>
      </div>
    </main>
  );
}
