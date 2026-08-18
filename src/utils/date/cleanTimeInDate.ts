/**
 * Helper untuk membersihkan tanggal agar hanya menyisakan 'YYYY-MM-DD'.
 * Memotong format jam/detik ('00:00:00') atau format ISO ISO timestamp.
 */
export function cleanTimeInDate(rawDate?: string | null): string {
  if (!rawDate) return "";
  const match = rawDate.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}
