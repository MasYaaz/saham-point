/**
 * Mengembalikan string tanggal hari bursa aktif terbaru (YYYY-MM-DD)
 * berdasarkan Waktu Indonesia Barat (WIB / Asia/Jakarta).
 * Jika hari ini adalah akhir pekan (Sabtu/Minggu), otomatis mundur ke hari Jumat.
 */
export function getTodayWibString(): string {
  const now = new Date();

  // Konversi ke Waktu Indonesia Barat (UTC+7)
  const wibDate = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );

  // Jika akhir pekan (Sabtu=6, Minggu=0), mundur ke hari Jumat
  while (wibDate.getDay() === 0 || wibDate.getDay() === 6) {
    wibDate.setDate(wibDate.getDate() - 1);
  }

  const year = wibDate.getFullYear();
  const month = String(wibDate.getMonth() + 1).padStart(2, "0");
  const day = String(wibDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
