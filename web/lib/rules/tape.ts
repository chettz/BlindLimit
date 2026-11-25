import { normalizeVin } from "./vin";

export type TapeRow = {
  vin: string;
  borrowerId: string;
  dealer: string;
  aprBps: number;
  amountFinancedCents: bigint;
  balanceCents: bigint;
  daysPastDue: number;
};

const REQUIRED = [
  "vin",
  "borrower_id",
  "dealer",
  "apr_pct",
  "amount_financed_usd",
  "current_balance_usd",
  "days_past_due",
] as const;

/** 장부 CSV. 금액은 문자열로 센트 변환하고, 연체·차주·딜러·잔여원금은 장부 값이다. */
export function parseTapeCsv(csv: string): TapeRow[] {
  const table = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (table.length < 2) throw new Error("장부가 비어 있습니다");

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const column = (name: (typeof REQUIRED)[number]) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error("장부 형식이 아닙니다");
    return index;
  };
  const vinCol = column("vin");
  const borrowerCol = column("borrower_id");
  const dealerCol = column("dealer");
  const aprCol = column("apr_pct");
  const financedCol = column("amount_financed_usd");
  const balanceCol = column("current_balance_usd");
  const daysCol = column("days_past_due");

  const seen = new Set<string>();
  const rows: TapeRow[] = [];
  for (const cells of table.slice(1)) {
    const vin = normalizeVin(cell(cells, vinCol));
    if (!vin) throw new Error("장부 VIN 형식 오류");
    if (seen.has(vin)) throw new Error("장부에 같은 VIN 이 두 번 있습니다");
    seen.add(vin);
    const days = cell(cells, daysCol).trim();
    if (!/^\d+$/.test(days)) throw new Error("장부 연체일수 형식 오류");
    rows.push({
      vin,
      borrowerId: cell(cells, borrowerCol).trim(),
      dealer: cell(cells, dealerCol).trim(),
      aprBps: percentToBps(cell(cells, aprCol)),
      amountFinancedCents: usdToCents(cell(cells, financedCol)),
      balanceCents: usdToCents(cell(cells, balanceCol)),
      daysPastDue: Number(days),
    });
  }
  return rows;
}

export function usdToCents(raw: string): bigint {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("장부 금액 형식 오류");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

export function percentToBps(raw: string): number {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("장부 금리 형식 오류");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function cell(row: string[], index: number): string {
  return row[index] ?? "";
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
