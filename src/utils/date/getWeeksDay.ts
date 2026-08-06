/**
 * Helper internal untuk memproses iterasi dan fallback hari kerja
 */
function getWeekdayDates(startDateStr: string, endDateStr?: string): Date[] {
  const effectiveEndDateStr = endDateStr || startDateStr;
  const dates: Date[] = [];

  const [startY = 0, startM = 1, startD = 1] = startDateStr
    .split("-")
    .map(Number);

  const [endY = startY, endM = startM, endD = startD] = effectiveEndDateStr
    .split("-")
    .map(Number);

  if (!startY || !startM || !startD) return [];

  const currentDate = new Date(startY, startM - 1, startD, 12, 0, 0);
  const endDate = new Date(endY, endM - 1, endD, 12, 0, 0);

  // Loop rentang tanggal
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Minggu, 6 = Sabtu
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // FALLBACK: Jika input 1 hari & jatuh di Sabtu/Minggu, mundur ke Jumat
  if (dates.length === 0) {
    const fallbackDate = new Date(startY, startM - 1, startD, 12, 0, 0);
    while (fallbackDate.getDay() === 0 || fallbackDate.getDay() === 6) {
      fallbackDate.setDate(fallbackDate.getDate() - 1);
    }
    dates.push(fallbackDate);
  }

  return dates;
}

/**
 * 1. Menghasilkan array tanggal format "YYYY-MM-DD" (Standard ISO / API KSEI)
 * Contoh: ["2026-08-03", "2026-08-04"]
 */
export function getWeekdaysInRange(
  startDateStr: string,
  endDateStr?: string,
): string[] {
  return getWeekdayDates(startDateStr, endDateStr).map((d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
}

/**
 * 2. Menghasilkan array tanggal format "YYYYMMDD" (Compact)
 * Contoh: ["20260803", "20260804"]
 */
export function getWeekdaysInRangeCompact(
  startDateStr: string,
  endDateStr?: string,
): string[] {
  return getWeekdayDates(startDateStr, endDateStr).map((d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  });
}
