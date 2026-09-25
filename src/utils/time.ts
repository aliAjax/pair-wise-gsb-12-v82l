// 时间格式工具
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 时间 → datetime-local 输入框用的本地时间字符串 */
export function toLocalInput(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** 列表展示用 yyyy-MM-dd HH:mm */
export function fmtDateTime(isoStr?: string): string {
  if (!isoStr) return "—";
  return isoStr.slice(0, 16).replace("T", " ");
}
