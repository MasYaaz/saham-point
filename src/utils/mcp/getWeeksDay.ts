/**
 * Menghasilkan array tanggal YYYYMMDD untuk hari kerja (Senin - Jumat)
 * di antara dua tanggal tertentu dengan fallback otomatis jika akhir pekan.
 *
 * @param startDateStr Format "YYYY-MM-DD"
 * @param endDateStr   Format "YYYY-MM-DD" (Opsional, default disamakan dengan startDateStr)
 */
export function getWeekdaysInRange(
  startDateStr: string,
  endDateStr?: string,
): string[] {
  const effectiveEndDateStr = endDateStr || startDateStr;
  const dates: string[] = [];

  // 💡 Berikan default value (0 / 1) agar TypeScript menjamin tipenya strictly 'number'
  const [startY = 0, startM = 1, startD = 1] = startDateStr
    .split("-")
    .map(Number);

  const [endY = startY, endM = startM, endD = startD] = effectiveEndDateStr
    .split("-")
    .map(Number);

  // Validation sederhana jika string tanggal tidak valid
  if (!startY || !startM || !startD) return [];

  const currentDate = new Date(startY, startM - 1, startD, 12, 0, 0);
  const endDate = new Date(endY, endM - 1, endD, 12, 0, 0);

  // Loop rentang tanggal
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Minggu, 6 = Sabtu
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
      const dd = String(currentDate.getDate()).padStart(2, "0");
      dates.push(`${yyyy}${mm}${dd}`);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // FALLBACK: Jika input 1 hari & jatuh di Sabtu/Minggu, mundur ke hari kerja terakhir (Jumat)
  if (dates.length === 0) {
    const fallbackDate = new Date(startY, startM - 1, startD, 12, 0, 0);

    while (fallbackDate.getDay() === 0 || fallbackDate.getDay() === 6) {
      fallbackDate.setDate(fallbackDate.getDate() - 1);
    }

    const yyyy = fallbackDate.getFullYear();
    const mm = String(fallbackDate.getMonth() + 1).padStart(2, "0");
    const dd = String(fallbackDate.getDate()).padStart(2, "0");
    dates.push(`${yyyy}${mm}${dd}`);
  }

  return dates;
}
