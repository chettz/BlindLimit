import { PageMain } from "@/components/ui/page-shell";

const FLOW = [
  { step: "1", title: "약정 서명", detail: "대출사" },
  { step: "2", title: "풀 배포", detail: "운영자" },
  { step: "3", title: "담보 제출", detail: "한도 산정" },
  { step: "4", title: "USDC 차입", detail: "한도 내" },
] as const;

export default function Home() {
  return (
    <PageMain className="justify-center gap-10 py-12 lg:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[36px] font-bold leading-[1.22] tracking-[-0.5px] text-foreground sm:text-[48px] sm:leading-[1.17] sm:tracking-[-1px]">
          할부 채권 담보 한도를
          <br className="hidden sm:block" /> 온체인에 게시합니다
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-[1.38] text-muted sm:text-lg">
          원문은 TEE 안에서만 처리됩니다. 체인과 화면에는 해시와 집계만 나가고, 한도 안에서만 차입할 수
          있습니다.
        </p>
      </div>

      <ol className="mx-auto flex w-full max-w-4xl items-stretch gap-2 overflow-x-auto pb-1 sm:gap-3">
        {FLOW.map((item, index) => (
          <li key={item.step} className="flex min-w-[7.5rem] flex-1 items-center gap-2 sm:min-w-0">
            <div className="flex w-full flex-col rounded-2xl border border-border bg-surface px-4 py-4 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
              <span className="text-xs font-medium text-accent">{item.step}</span>
              <span className="mt-2 text-base font-semibold text-foreground">{item.title}</span>
              <span className="mt-1 text-sm text-muted">{item.detail}</span>
            </div>
            {index < FLOW.length - 1 ? (
              <span aria-hidden className="hidden shrink-0 text-muted-2 sm:inline">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </PageMain>
  );
}
