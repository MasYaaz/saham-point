import BaseClient from "./baseClient";
import { log } from "../utils/log";
import { refreshStockbitToken } from "../auth/stockbitTokenRefresher";

export interface StockbitRawResponse<T = any> {
  message?: string;
  data?: T;
}

export class StockbitClient extends BaseClient {
  private baseUrl: string;
  private refreshPromise: Promise<string> | null = null;

  constructor(baseUrl = "https://exodus.stockbit.com") {
    super();
    this.baseUrl = baseUrl;
  }

  /**
   * Mengambil header Stockbit secara dinamis dari process.env
   */
  private getStockbitHeaders(): Record<string, string> {
    const token = process.env.STOCKBIT_BEARER_TOKEN || "";

    if (!token) {
      throw new Error(
        "STOCKBIT_BEARER_TOKEN belum diatur di .env. Silakan jalankan atau isi file .env.",
      );
    }

    return {
      Authorization: `Bearer ${token}`,
      Origin: "https://stockbit.com",
      Referer: "https://stockbit.com/",
      Accept: "application/json, text/plain, */*",
    };
  }

  /**
   * Generic GET Request ke API Stockbit dengan Auto-Recovery saat Token Expired (401)
   */
  async get<T = any>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options: RequestInit = {},
    isRetry = false, // Flag internal agar tidak terjadi infinite loop retry
  ): Promise<StockbitRawResponse<T>> {
    let url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    if (params) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          query.append(key, String(value));
        }
      }
      const queryString = query.toString();
      if (queryString) {
        url += `${url.includes("?") ? "&" : "?"}${queryString}`;
      }
    }

    const headers = {
      ...this.getStockbitHeaders(),
      ...(options.headers as Record<string, string>),
    };

    const response = await this.fetcherUrl(url, { ...options, headers });

    // AUTO-REFRESH RECOVERY SAAT HTTP 401 (UNAUTHORIZED)
    if (response.status === 401) {
      if (isRetry) {
        log(
          "error",
          `[StockbitClient] Token tetap kadaluwarsa setelah refresh saat mengakses: ${url}`,
        );
        throw new Error(
          "Bearer Token Stockbit kadaluwarsa (HTTP 401). Refresh Token (eipoRefreshToken) mungkin sudah expired. Silakan login ulang di browser.",
        );
      }

      log(
        "warn",
        `[StockbitClient] Token expired (401) saat mengakses ${url}. Memulai auto-refresh...`,
      );

      // Mutex/Locking Mechanism untuk mencegah race-condition jika banyak request 401 bersamaan
      if (!this.refreshPromise) {
        this.refreshPromise = refreshStockbitToken().finally(() => {
          this.refreshPromise = null;
        });
      }

      try {
        await this.refreshPromise;
      } catch (error: any) {
        throw new Error(`Auto-refresh token gagal: ${error.message}`);
      }

      // Retry request awal 1 kali menggunakan token baru yang sudah diperbarui
      return this.get<T>(endpoint, params, options, true);
    }

    if (response.status === 429) {
      log("warn", `[StockbitClient] Hit rate limit (HTTP 429) pada: ${url}`);
      throw new Error(
        "Rate Limit Terlampaui (HTTP 429). Terlalu banyak request ke Stockbit.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `Stockbit Client Error: HTTP ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as StockbitRawResponse<T>;
  }
}

// Export Singleton Instance
export const stockbitClient = new StockbitClient();
