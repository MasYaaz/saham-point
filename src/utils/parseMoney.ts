export function parseRawMoney(raw: string, isThousands = false): number {
  const cleanStr = raw.trim().replace(/,/g, "");
  if (cleanStr === "--" || cleanStr === "") return 0;

  if (cleanStr.endsWith("T")) return parseFloat(cleanStr) * 1_000_000_000_000;
  if (cleanStr.endsWith("B")) return parseFloat(cleanStr) * 1_000_000_000;
  if (cleanStr.endsWith("M")) return parseFloat(cleanStr) * 1_000_000;

  const parsed = parseFloat(cleanStr);
  // Menggunakan Math.round agar tidak ada angka desimal keriting (seperti .9995)
  return isThousands ? Math.round(parsed * 1000) : parsed;
}
