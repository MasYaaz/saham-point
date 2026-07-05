export function formatAbbr(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";

  // Konversi ke number murni jika inputnya string
  const num = typeof value === "string" ? parseFloat(value.trim()) : value;

  if (isNaN(num) || num === 0) return "0";

  const absNum = Math.abs(num);
  let formatted = "";

  if (absNum >= 1_000_000_000_000) {
    // Triliun (T)
    formatted = (num / 1_000_000_000_000).toFixed(2) + " T";
  } else if (absNum >= 1_000_000_000) {
    // Miliar (M)
    formatted = (num / 1_000_000_000).toFixed(2) + " M";
  } else if (absNum >= 1_000_000) {
    // Juta (Jt)
    formatted = (num / 1_000_000).toFixed(2) + " Jt";
  } else {
    // Di bawah 1 juta tampilkan angka normal ber-koma
    formatted = num.toLocaleString("id-ID");
  }

  // Hilangkan ".00" yang tidak perlu agar tampilan lebih ringkas (opsional)
  return formatted.replace(/\.00(?=\s)/, "");
}
