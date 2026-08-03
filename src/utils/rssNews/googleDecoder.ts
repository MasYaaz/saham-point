export interface DecodeResult {
  status: boolean;
  decoded_url?: string;
  source_url?: string;
  message?: string;
  signature?: string;
  timestamp?: string;
  base64_str?: string;
}

export class GoogleDecoder {
  private proxy: string | null;

  constructor(proxy: string | null = null) {
    this.proxy = proxy;
  }

  /**
   * Mengambil token base64 dari URL Google News
   */
  public getBase64Str(sourceUrl: string): {
    status: boolean;
    base64_str?: string;
    message?: string;
  } {
    try {
      const url = new URL(sourceUrl);
      const pathParts = url.pathname
        .split("/")
        .filter((part) => part.length > 0);

      const targetPart = pathParts[pathParts.length - 1];
      const categoryPart = pathParts[pathParts.length - 2];

      if (
        url.hostname === "news.google.com" &&
        pathParts.length >= 2 &&
        categoryPart &&
        ["articles", "read"].includes(categoryPart) &&
        targetPart
      ) {
        return { status: true, base64_str: targetPart };
      }
      return { status: false, message: "Invalid Google News URL format." };
    } catch (e: any) {
      return { status: false, message: `Error in getBase64Str: ${e.message}` };
    }
  }

  /**
   * Mengambil signature & timestamp dari HTML Google News
   */
  public async getDecodingParams(base64Str: string): Promise<DecodeResult> {
    let response: Response | undefined;
    try {
      const url = `https://news.google.com/rss/articles/${base64Str}`;
      response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "max-age=0",
          "Sec-Ch-Ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      const sgMatch = html.match(/data-n-a-sg=["']([^"']+)["']/i);
      const tsMatch = html.match(/data-n-a-ts=["']([^"']+)["']/i);

      const signature = sgMatch?.[1];
      const timestamp = tsMatch?.[1];

      if (!signature || !timestamp) {
        return {
          status: false,
          message: "Failed to fetch data attributes from Google News.",
        };
      }

      return {
        status: true,
        signature,
        timestamp,
        base64_str: base64Str,
      };
    } catch (e: any) {
      if (response && !response.bodyUsed) {
        try {
          await response.body?.cancel();
        } catch {}
      }
      return {
        status: false,
        message: `Error in getDecodingParams: ${e.message}`,
      };
    }
  }

  /**
   * Memanggil RPC DotsSplashUi batchexecute untuk dekode URL
   */
  public async decodeUrl(
    signature: string,
    timestamp: string,
    base64Str: string,
  ): Promise<DecodeResult> {
    let response: Response | undefined;
    try {
      const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
      const payload = [
        "Fbv4je",
        `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${base64Str}",${timestamp},"${signature}"]`,
      ];

      const reqData = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;

      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept: "*/*",
          Origin: "https://news.google.com",
          Referer: "https://news.google.com/",
          "Sec-Ch-Ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        },
        body: reqData,
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const splitParts = text.split("\n\n");
      const jsonStr = splitParts[1];

      if (!jsonStr) {
        throw new Error("Unexpected response format from batchexecute");
      }

      const parsedData = JSON.parse(jsonStr);

      const batchResponses = parsedData.filter(
        (d: any) =>
          Array.isArray(d) &&
          (d[0] === "wrb.fr" || d[0] === "w779db") &&
          d[1] === "Fbv4je",
      );

      if (batchResponses.length === 0) {
        try {
          const innerDataStr = parsedData[0][2];
          const innerData = JSON.parse(innerDataStr);
          const decodedUrl = innerData[1];
          return { status: true, decoded_url: decodedUrl };
        } catch {
          throw new Error("No valid response found in batchexecute data");
        }
      }

      const firstBatch = batchResponses[0];
      const innerDataStr = firstBatch?.[2];
      if (!innerDataStr) {
        throw new Error("Batch response row data is missing");
      }

      const innerData = JSON.parse(innerDataStr);
      const decodedUrl = innerData[1];

      return { status: true, decoded_url: decodedUrl };
    } catch (e: any) {
      if (response && !response.bodyUsed) {
        try {
          await response.body?.cancel();
        } catch {}
      }
      return {
        status: false,
        message: `Error in decodeUrl: ${e.message}`,
      };
    }
  }

  /**
   * Mengolah banyak URL sekaligus (Batch)
   */
  public async decodeBatch(sourceUrls: string[]): Promise<DecodeResult[]> {
    let response: Response | undefined;
    try {
      const results: Array<DecodeResult & { source_url?: string }> = [];

      for (const sourceUrl of sourceUrls) {
        const base64Response = this.getBase64Str(sourceUrl);
        if (!base64Response.status || !base64Response.base64_str) {
          results.push({
            status: false,
            source_url: sourceUrl,
            message: base64Response.message,
          });
          continue;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, Math.floor(Math.random() * 300) + 100),
        );

        const paramsResponse = await this.getDecodingParams(
          base64Response.base64_str,
        );
        if (!paramsResponse.status) {
          results.push({
            status: false,
            source_url: sourceUrl,
            message: paramsResponse.message,
          });
          continue;
        }

        results.push({
          status: true,
          source_url: sourceUrl,
          signature: paramsResponse.signature,
          timestamp: paramsResponse.timestamp,
          base64_str: paramsResponse.base64_str,
        });
      }

      const successfulRequests = results.filter((r) => r.status);
      if (successfulRequests.length === 0) {
        return results;
      }

      const url = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
      const payloads = successfulRequests.map((req) => [
        "Fbv4je",
        `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${req.base64_str}",${req.timestamp},"${req.signature}"]`,
      ]);

      const reqData = `f.req=${encodeURIComponent(JSON.stringify([payloads]))}`;

      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept: "*/*",
          Origin: "https://news.google.com",
          Referer: "https://news.google.com/",
          "Sec-Ch-Ua":
            '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        },
        body: reqData,
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const splitParts = text.split("\n\n");
      const jsonStr = splitParts[1];

      if (!jsonStr) {
        throw new Error("Unexpected response format from batchexecute");
      }

      const parsedData = JSON.parse(jsonStr);

      const batchResponses = parsedData.filter(
        (d: any) =>
          Array.isArray(d) &&
          (d[0] === "wrb.fr" || d[0] === "w779db") &&
          d[1] === "Fbv4je",
      );

      let successIdx = 0;
      return results.map((res) => {
        if (!res.status) return res;

        try {
          const row = batchResponses[successIdx++];
          const innerDataStr = row?.[2];
          if (!innerDataStr) throw new Error("Row data missing");

          const innerData = JSON.parse(innerDataStr);
          const decodedUrl = innerData[1];
          return {
            status: true,
            source_url: res.source_url,
            decoded_url: decodedUrl,
          };
        } catch (e: any) {
          return {
            status: false,
            source_url: res.source_url,
            message: `Parsing error: ${e.message}`,
          };
        }
      });
    } catch (e: any) {
      if (response && !response.bodyUsed) {
        try {
          await response.body?.cancel();
        } catch {}
      }
      return [
        {
          status: false,
          message: `Error in decodeBatch: ${e.message}`,
        },
      ];
    }
  }

  /**
   * Main method untuk dekode satu URL
   */
  public async decode(sourceUrl: string): Promise<DecodeResult> {
    try {
      const base64Response = this.getBase64Str(sourceUrl);
      if (!base64Response.status || !base64Response.base64_str) {
        return base64Response;
      }

      const paramsResponse = await this.getDecodingParams(
        base64Response.base64_str,
      );
      if (
        !paramsResponse.status ||
        !paramsResponse.signature ||
        !paramsResponse.timestamp ||
        !paramsResponse.base64_str
      ) {
        return paramsResponse;
      }

      return await this.decodeUrl(
        paramsResponse.signature,
        paramsResponse.timestamp,
        paramsResponse.base64_str,
      );
    } catch (e: any) {
      return {
        status: false,
        message: `Error in decode: ${e.message}`,
      };
    }
  }
}
