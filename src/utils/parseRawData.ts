/**
 * Fungsi konsolidasi untuk memparsing data mentah dari TradingView
 * Mengembalikan number jika sukses, atau null jika data tidak valid/kosong
 */
export function parseRawData(raw: string | undefined | null): number | null {
  if (!raw) return null;

  // 1. Bersihkan Unicode control characters dan spasi
  let cleaned = raw
    .replace(/[\u200E\u200F\u202A-\u202E\u00A0\u202F]/g, "")
    .trim();

  // 2. Buang embel-embel currency (seperti IDR atau BIDR agar multiplier terbaca benar)
  // Ini memastikan "147.9BIDR" akan diproses sebagai "147.9B"
  cleaned = cleaned.replace(/IDR/gi, "");

  // 3. Deteksi marker kosong
  if (!cleaned || ["—", "--", "-", ""].includes(cleaned)) {
    return null;
  }

  // 4. Deteksi tanda negatif
  const isNegative = cleaned.startsWith("−") || cleaned.startsWith("-");
  const withoutSign = cleaned.replace(/^[−-]/, "").trim();

  // 5. Regex: Tangkap angka (desimal/koma) dan satuan opsional (K/M/B/T)
  const match = /^([\d.,]+)\s*([KMBT])?$/i.exec(withoutSign);

  if (match) {
    // Parsing angka
    const numPart = parseFloat(match[1]!.replace(/,/g, ""));
    if (isNaN(numPart)) return null;

    // Menentukan multiplier
    const suffix = match[2]?.toUpperCase();
    const multiplier =
      suffix === "K"
        ? 1e3
        : suffix === "M"
          ? 1e6
          : suffix === "B"
            ? 1e9
            : suffix === "T"
              ? 1e12
              : 1;

    const value = numPart * multiplier;

    // Kembalikan hasil dengan presisi 4 desimal
    return parseFloat((isNegative ? -value : value).toFixed(4));
  }

  // 6. Fallback: Jika regex tidak match, coba parse angka biasa
  const plain = parseFloat(withoutSign.replace(/,/g, ""));
  return isNaN(plain) ? null : isNegative ? -plain : plain;
}
