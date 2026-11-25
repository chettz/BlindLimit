export const AGREEMENT_EXTS = [".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

export const AGREEMENT_ACCEPT =
  ".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,text/plain,image/png,image/jpeg,image/webp,image/gif";

export function isAgreementFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return AGREEMENT_EXTS.some((ext) => lower.endsWith(ext));
}

export function isAgreementImageName(name: string): boolean {
  const lower = name.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) => lower.endsWith(ext));
}

export function agreementImageMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}