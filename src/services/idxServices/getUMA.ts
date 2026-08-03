import IdxClient from "../../client/idxClient";

interface UmaRawItem {
  UMAID: string;
  UMADate: string;
  AnnouncementNo: string;
  CompanyID: string;
  CompanyName: string;
  Attachment: string;
  Status: string;
  Judul: string;
}

interface IdxUmaApiResponse {
  SearchCriteria: {
    DateFrom: string | null;
    DateTo: string | null;
    Keyword: string | null;
    indexfrom: number;
    pagesize: number;
  };
  ResultCount: number;
  Results: UmaRawItem[];
}

interface FetchUmaParams {
  keyword?: string;
  indexFrom?: number;
  pageSize?: number;
}

interface FormattedUmaStock {
  code: string;
  name: string;
  announcementNo: string;
  announcementDate: string;
  title: string;
  attachmentUrl: string | null;
}

/**
 * Service khusus untuk mengelola data Unusual Market Activity (UMA) dari BEI.
 * Menginduk ke IdxClient untuk menjamin otentikasi sesi dan cookie.
 */
export class UmaService extends IdxClient {
  /**
   * Mengambil data mentah pengumuman UMA langsung dari API BEI menggunakan URL absolut.
   */
  async fetchRawUmaList(
    params: FetchUmaParams = {},
  ): Promise<IdxUmaApiResponse | null> {
    const { keyword = null, indexFrom = 1, pageSize = 9999 } = params;

    const queryParams = new URLSearchParams({
      indexFrom: indexFrom.toString(),
      pageSize: pageSize.toString(),
    });

    if (keyword) queryParams.append("keyword", keyword);

    // 💡 GUNAKAN URL ABSOLUT AGAR FETCH TIDAK FAIL / RETRY
    const url = `https://www.idx.co.id/primary/NewsAnnouncement/GetUma?${queryParams.toString()}`;

    return await this.fetchJson<IdxUmaApiResponse>(url);
  }

  /**
   * Mengambil daftar emiten unik yang terdaftar dalam UMA dalam rentang hari tertentu.
   * Hasil diurutkan berdasarkan tanggal pengumuman terbaru (descending).
   */
  async getActiveUmaStocks(
    daysBack: number = 90,
  ): Promise<FormattedUmaStock[]> {
    const response = await this.fetchRawUmaList({ pageSize: 9999 });

    const rawResults = response?.Results || [];
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return [];
    }

    // Batas waktu filter hari yang lalu
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Filter in-memory berdasarkan rentang hari (daysBack)
    const filteredResults = rawResults.filter((item) => {
      if (!item.UMADate) return false;
      const itemDate = new Date(item.UMADate);
      return !isNaN(itemDate.getTime()) && itemDate >= cutoffDate;
    });

    // Urutkan data berdasarkan UMADate terbaru secara descending
    const sortedResults = filteredResults.sort((a, b) => {
      const timeA = new Date(a.UMADate).getTime();
      const timeB = new Date(b.UMADate).getTime();
      return timeB - timeA;
    });

    // Deduplikasi emiten berdasarkan CompanyID (menyimpan catatan UMA yang paling baru)
    const uniqueUmaMap = new Map<string, FormattedUmaStock>();

    for (const item of sortedResults) {
      if (!item.CompanyID) continue;

      const code = item.CompanyID.trim().toUpperCase();
      if (!uniqueUmaMap.has(code)) {
        uniqueUmaMap.set(code, {
          code,
          name: item.CompanyName,
          announcementNo: item.AnnouncementNo,
          announcementDate: item.UMADate?.split("T")[0] ?? "",
          title: item.Judul,
          attachmentUrl: item.Attachment
            ? `https://www.idx.co.id${item.Attachment}`
            : null,
        });
      }
    }

    return Array.from(uniqueUmaMap.values());
  }
}

// Instance singleton terpusat
const umaService = new UmaService();

// Export fungsi helper terbungkus
export async function fetchRawUmaList(
  params?: FetchUmaParams,
): Promise<IdxUmaApiResponse | null> {
  return umaService.fetchRawUmaList(params);
}

export async function getActiveUmaStocks(
  daysBack?: number,
): Promise<FormattedUmaStock[]> {
  return umaService.getActiveUmaStocks(daysBack);
}
