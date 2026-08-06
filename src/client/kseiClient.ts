import { getWeekdaysInRange } from "../utils/date/getWeeksDay";
import { log } from "../utils/log";
import BaseClient from "./baseClient";

/**
 * Model data item aksi korporasi dari API KSEI.
 */
export interface KseiCorporateActionItem {
  type_of_ca: string;
  security_code: string;
  security_name: string;
  cum_date: string | null;
  record_date: string | null;
  effective_date: string | null;
  start_date: string | null;
  end_date: string | null;
  distribution_date: string | null;
  display_name: string;
  description: string;
}

/**
 * Model respons *envelope* dari API KSEI.
 */
export interface KseiCorporateActionResponse {
  data: KseiCorporateActionItem[];
  metadata?: {
    total: number;
    effDate: number;
    recDate: number;
    cumDate: number;
  };
}

/**
 * Client HTTP khusus untuk mengambil data aksi korporasi dari API KSEI (Kustodian Sentral Efek Indonesia).
 */
export class KseiClient extends BaseClient {
  private readonly baseUrl = "https://www.ksei.co.id/api/corporate_actions";

  /**
   * Mengunduh data JSON dari URL target dengan penanganan error respons HTTP.
   *
   * @param url URL endpoint target
   * @param options Opsi HTTP request
   * @param maxAttempts Jumlah maksimum percobaan ulang (retry)
   * @returns Data terurai bertipe T, atau null jika gagal
   */
  override async fetchJson<T = any>(
    url: string,
    options: RequestInit = {},
    maxAttempts = 5,
  ): Promise<T | null> {
    try {
      // 1. Eksekusi request via HTTP fetcher bawaan BaseClient
      const res = await this.fetcherUrl(url, options, maxAttempts);

      // 2. Tangani respons HTTP bermasalah (status code non-2xx)
      if (!res.ok) {
        let errorBody = "";
        try {
          const errorJson = await res.json();
          errorBody = JSON.stringify(errorJson);
        } catch {
          errorBody = await res.text();
        }

        log(
          "error",
          `[KseiClient Error] HTTP ${res.status} ${res.statusText} dari ${url}. Response Body: ${errorBody}`,
        );
        return null;
      }

      // 3. Parse dan kembalikan data JSON
      return (await res.json()) as T;
    } catch (error) {
      log(
        "error",
        `[KseiClient Error] Failure parsing JSON dari ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Mengambil daftar aksi korporasi KSEI untuk 1 tanggal spesifik.
   *
   * @param date Tanggal target dengan format ISO 'YYYY-MM-DD'
   * @returns Array daftar aksi korporasi KSEI
   */
  async fetchByDate(date: string): Promise<KseiCorporateActionItem[]> {
    const url = `${this.baseUrl}?locale=id&filter[ca_date]=${date}`;

    const res = await this.fetchJson<KseiCorporateActionResponse>(url, {
      headers: {
        "Content-Type": "application/json",
        Referer: "https://www.ksei.co.id/corporate-actions/services",
      },
    });

    return Array.isArray(res?.data) ? res.data : [];
  }

  /**
   * Mengambil seluruh data aksi korporasi KSEI dalam rentang tanggal menggunakan teknik *batch processing*.
   *
   * @param startDate Tanggal awal rentang ('YYYY-MM-DD')
   * @param endDate Tanggal akhir rentang ('YYYY-MM-DD')
   * @param batchSize Jumlah request paralel per batch (default: 5)
   * @returns Array gabungan seluruh aksi korporasi yang berhasil ditarik
   */
  async fetchByDateRange(
    startDate: string,
    endDate: string,
    batchSize = 5,
  ): Promise<KseiCorporateActionItem[]> {
    let isShuttingDown = false;

    // 1. Inisialisasi listener graceful shutdown untuk menangani interupsi proses
    process.once("SIGINT", () => {
      isShuttingDown = true;
    });
    process.once("SIGTERM", () => {
      isShuttingDown = true;
    });

    // 2. Dapatkan daftar hari kerja (senin - jumat) dalam rentang tanggal
    const dates = getWeekdaysInRange(startDate, endDate);

    log(
      "info",
      `[KseiClient] Memproses ${dates.length} hari kerja (${startDate} s/d ${endDate})...`,
    );

    if (dates.length === 0) {
      log(
        "warn",
        `[KseiClient] Rentang tanggal menghasilkan 0 hari kerja! Cek format date.`,
      );
      return [];
    }

    const allData: KseiCorporateActionItem[] = [];

    // 3. Eksekusi pengunduhan data per batch
    for (let i = 0; i < dates.length; i += batchSize) {
      if (isShuttingDown) {
        log(
          "warn",
          "[KseiClient] Process shutdown terdeteksi, menghentikan loop fetch.",
        );
        break;
      }

      const chunk = dates.slice(i, i + batchSize);

      log(
        "info",
        `[KseiClient] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(dates.length / batchSize)} (${chunk[0]} s/d ${chunk[chunk.length - 1]})...`,
      );

      // Eksekusi request HTTP paralel untuk batch saat ini
      const promises = chunk.map((date) => this.fetchByDate(date));
      const results = await Promise.all(promises);

      for (const items of results) {
        if (items.length > 0) {
          allData.push(...items);
        }
      }

      // 4. Berikan jeda antar-batch untuk menghindari pembatasan rate limit KSEI
      if (i + batchSize < dates.length) {
        await this.wait(200);
      }
    }

    return allData;
  }
}

export default new KseiClient();
