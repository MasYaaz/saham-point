import { extractFromHtml } from "@extractus/article-extractor";
import { GoogleDecoder } from "../../utils/rssNews/googleDecoder";
import { cleanHtml } from "../../utils/rssNews/textHelpers";
import { log } from "../../utils/log";

const decoder = new GoogleDecoder();

// Header HTTP & Browser Fingerprint untuk curl
const CURL_HEADERS = [
  "-A",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "-H",
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "-H",
  "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "-H",
  "Cache-Control: max-age=0",
  "-H",
  'Sec-Ch-Ua: "Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "-H",
  "Sec-Ch-Ua-Mobile: ?0",
  "-H",
  'Sec-Ch-Ua-Platform: "Windows"',
  "-H",
  "Sec-Fetch-Dest: document",
  "-H",
  "Sec-Fetch-Mode: navigate",
  "-H",
  "Sec-Fetch-Site: none",
  "-H",
  "Sec-Fetch-User: ?1",
  "-H",
  "Upgrade-Insecure-Requests: 1",
];

/**
 * Panggil native `curl` dari OS via Bun.spawn dengan timeout 6 detik.
 */
async function fetchWithCurl(url: string): Promise<string> {
  const proc = Bun.spawn([
    "curl",
    "-sSL",
    "--max-time",
    "6",
    ...CURL_HEADERS,
    url,
  ]);

  const html = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`curl exit code ${exitCode}`);
  }

  return html;
}

/**
 * Mengubah URL redirect Google News menjadi URL asli penerbit berita.
 */
export async function resolveRealUrl(googleUrl: string): Promise<string> {
  if (!googleUrl.includes("news.google.com")) return googleUrl;

  try {
    const result = await decoder.decode(googleUrl);
    if (result?.status && result?.decoded_url) {
      return result.decoded_url;
    }
  } catch (err: any) {
    log(
      "warn",
      `[NewsDecoder] Gagal dekode Google URL [${googleUrl}]: ${err?.message || err}`,
    );
  }

  return googleUrl;
}

export async function generateArticleContent(
  rawUrl: string,
): Promise<{ realUrl: string; textContent: string }> {
  let targetUrl = rawUrl;

  try {
    targetUrl = await resolveRealUrl(rawUrl);

    if (
      !targetUrl ||
      targetUrl.includes("googleusercontent.com") ||
      targetUrl.includes("news.google.com")
    ) {
      log(
        "warn",
        `[ArticleScraper] URL tidak valid atau gagal didekode: ${targetUrl}`,
      );
      return { realUrl: targetUrl || rawUrl, textContent: "" };
    }

    const html = await fetchWithCurl(targetUrl);

    // Deteksi Cloudflare WAF Challenge
    if (html.includes("Just a moment...") || html.includes("_cf_chl_opt")) {
      log(
        "warn",
        `[ArticleScraper] Terdeteksi Cloudflare WAF Challenge pada ${targetUrl}`,
      );
      return { realUrl: targetUrl, textContent: "" };
    }

    let extractedText = "";

    // Ekstraksi via article-extractor
    try {
      const article = await extractFromHtml(html, targetUrl);
      if (article?.content) {
        extractedText = cleanHtml(article.content).trim();
      }
    } catch (extractErr: any) {
      log(
        "warn",
        `[ArticleScraper] article-extractor error pada ${targetUrl}: ${extractErr?.message || extractErr}`,
      );
    }

    if (!extractedText) {
      return { realUrl: targetUrl, textContent: "" };
    }

    return {
      realUrl: targetUrl,
      textContent: extractedText,
    };
  } catch (error: any) {
    log(
      "error",
      `[ArticleScraper] Gagal fetch curl pada [${targetUrl}]: ${error?.message || error}`,
    );
    return { realUrl: targetUrl || rawUrl, textContent: "" };
  }
}
