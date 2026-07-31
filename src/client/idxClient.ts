import BaseClient from "./baseClient";

/**
 * Client khusus untuk berinteraksi dengan API Bursa Efek Indonesia (IDX).
 * Mengelola Cookie Session & Header spesifik BEI.
 */
export default class IdxClient extends BaseClient {
  protected readonly idxHeaders: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Referer: "https://www.idx.co.id/",
    "Upgrade-Insecure-Requests": "1",
    "X-Requested-With": "XMLHttpRequest",
  };

  private cookies: Map<string, string> = new Map();
  private sessionPromise: Promise<void> | null = null;

  protected get cookieString(): string {
    return Array.from(this.cookies.entries())
      .map(([key, val]) => `${key}=${val}`)
      .join("; ");
  }

  /**
   * Parse & update cookie dari response BEI
   */
  protected override onResponse(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    for (const header of setCookieHeaders) {
      const cookiePair = header.split(";")[0]?.trim();
      if (!cookiePair) continue;

      const equalIdx = cookiePair.indexOf("=");
      if (equalIdx !== -1) {
        const key = cookiePair.substring(0, equalIdx).trim();
        const value = cookiePair.substring(equalIdx + 1).trim();
        if (key) this.cookies.set(key, value);
      }
    }
  }

  /**
   * Memastikan session cookie BEI aktif sebelum melakukan request data.
   */
  async ensureSession(): Promise<void> {
    if (this.cookies.size > 0) return;
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = (async () => {
      try {
        const response = await this.fetcherUrl("https://www.idx.co.id/id");
        await response.body?.cancel();

        await this.wait(500);

        const validationResponse = await this.fetcherUrl(
          "https://www.idx.co.id/primary/home/GetIndexList",
        );
        await validationResponse.body?.cancel();
      } catch (error) {
        this.cookies.clear();
        throw error;
      } finally {
        this.sessionPromise = null;
      }
    })();

    return this.sessionPromise;
  }

  override async fetcherUrl(
    url: string,
    options: RequestInit = {},
    maxAttempts = 5,
  ): Promise<Response> {
    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...this.idxHeaders,
        ...(this.cookies.size > 0 ? { Cookie: this.cookieString } : {}),
        ...(options.headers as Record<string, string>),
      },
    };

    return super.fetcherUrl(url, mergedOptions, maxAttempts);
  }

  override async fetchJson<T = any>(
    url: string,
    options: RequestInit = {},
    maxAttempts = 5,
  ): Promise<T | null> {
    await this.ensureSession();
    return super.fetchJson<T>(url, options, maxAttempts);
  }
}
