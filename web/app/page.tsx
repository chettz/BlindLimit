import { PageMain } from "@/components/ui/page-shell";

const FLOW = [
  { step: "1", title: "약정 대조", detail: "불일치 시 배포 차단" },
  { step: "2", title: "자가 장부 검증", detail: "계약서↔장부 · TEE" },
  { step: "3", title: "온체인 집행", detail: "한도 내 차입 / revert" },
  { step: "4", title: "설정 불변", detail: "단독 변경 불가" },
] as const;

export default function Home() {
  return (
    <PageMain className="justify-center gap-10 py-12 lg:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[36px] font-bold leading-[1.22] tracking-[-0.5px] text-foreground sm:text-[48px] sm:leading-[1.17] sm:tracking-[-1px]">
          민감정보·개인정보 유출 없이
          <br className="hidden sm:block" /> AI로 계약서와 장부를 검증합니다
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-[1.38] text-muted sm:text-lg">
          차주 신원·VIN·원금 같은 원문은 TEE 안의 AI만 읽고 외부로 유출되지 않습니다. 화면과 체인에는 문서·영수증 해시와 함께
          적격 채권 건수·적격 잔여원금 합계·담보 한도만 남기고, 개별 계약 내용은 남기지 않습니다. 
          담보 적격 판정은 TEE 안의 결정론 코드가 내립니다.
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
