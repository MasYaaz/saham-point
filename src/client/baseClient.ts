import { log } from "../utils/log";

/**
 * Generik Base HTTP Client dengan retry mechanism & safe logging.
 */
export default abstract class BaseClient {
  /** Standard User-Agent header */
  protected readonly defaultHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  };

  /**
   * Hook opsional untuk subclass jika perlu memproses response (misal: parsing cookie).
   */
  protected onResponse(_response: Response): void {}

  /**
   * Universal fetcher dengan exponential backoff retry.
   */
  async fetcherUrl(
    url: string,
    options: RequestInit = {},
    maxAttempts = 5,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options.headers as Record<string, string>),
    };

    const attemptFetch = async (attempt: number): Promise<Response> => {
      try {
        const response = await fetch(url, { ...options, headers });

        // Panggil hook subclass jika ada
        this.onResponse(response);

        if (!response.ok && response.status >= 500) {
          await response.body?.cancel();
          throw new Error(
            `Server returned ${response.status}: ${response.statusText}`,
          );
        }

        return response;
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 15000);

        log(
          "warn",
          `[BaseClient] Fetch failed for ${url}. Retrying in ${
            delay / 1000
          }s (Attempt ${attempt}/${maxAttempts}). Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await this.wait(delay);
        return attemptFetch(attempt + 1);
      }
    };

    return await attemptFetch(1);
  }

  /**
   * Helper untuk fetch JSON langsung dengan penanganan error aman.
   */
  async fetchJson<T = any>(
    url: string,
    options: RequestInit = {},
    maxAttempts = 5,
  ): Promise<T | null> {
    try {
      const res = await this.fetcherUrl(url, options, maxAttempts);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (error) {
      log(
        "error",
        `[BaseClient] Error parsing JSON from ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Helper untuk delay eksekusi
   */
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
