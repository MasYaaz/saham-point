import * as cheerio from "cheerio";
import type { ScrapedProfile } from "../../types";
import { parseRawData } from "../../utils/parseRawData";

function cleanText(raw: string): string {
  return raw.replace(/[\u200E\u200F\u202A-\u202E\u00A0\u202F]/g, "").trim();
}

function isEmptyMarker(clean: string): boolean {
  return clean === "" || clean === "—" || clean === "--";
}

/**
 * Membedah HTML halaman utama Ticker TradingView
 */
export function scrapeProfileTradingView(html: string): ScrapedProfile {
  const $ = cheerio.load(html);
  const data: ScrapedProfile = {
    description: null,
    market_cap: 0,
    beta: 0,
    last_dividend: 0,
    per: 0,
    eps: 0,
  };

  // 1. Ekstrak Deskripsi Perusahaan (dari blok company-info-id)
  const companyInfoBox = $("div[data-container-name='company-info-id']");
  const descText =
    companyInfoBox.find("div[class*='content-'] span span").first().text() ||
    $("div[class*='content-oqCCtNt1']").text();
  if (descText) data.description = cleanText(descText).replace(/\s+/g, " ");

  // 2. Ekstrak Metrik Finansial (dari blok key-stats-id)
  $("div[data-container-name='key-stats-id'] div[class*='block-']").each(
    (_, el) => {
      const $el = $(el);
      const label = cleanText(
        $el.find("[class*='label-']").text(),
      ).toLowerCase();
      const valueText = cleanText($el.find("[class*='value-']").text());

      if (!label || isEmptyMarker(valueText)) return;

      const val = parseRawData(valueText);

      if (label.includes("market capitalization")) {
        data.market_cap = val;
      } else if (label.includes("price to earnings")) {
        data.per = val;
      } else if (label.includes("basic eps")) {
        data.eps = val;
      } else if (label.includes("beta")) {
        data.beta = val;
      }
    },
  );

  // 3. Trik Cerdas Last Dividend: Ekstrak dari teks FAQ Accordion menggunakan Regex
  const faqText = $("div[data-container-name='symbol-faq-widget-id']").text();
  if (faqText) {
    const dividendMatch = /last dividend per share was\s*([\d.,]+)/i.exec(
      faqText,
    );
    if (dividendMatch && dividendMatch[1]) {
      data.last_dividend = parseRawData(dividendMatch[1]);
    }
  }

  return data;
}

/**
 * Membuka halaman utama symbol saham via Playwright Context
 * Mengembalikan string HTML jika sukses, atau false jika 404 / gagal
 */
export async function fetchTradingViewOverviewHtml(
  symbol: string,
  context: any, // 1. Terima context eksternal dari utils di sini
): Promise<string | false> {
  const url = `https://www.tradingview.com/symbols/${symbol}/`;

  // 2. Buka halaman baru langsung dari context global terbagi
  const page = await context.newPage();

  try {
    // ⚡ Dipercepat menggunakan 'domcontentloaded' (tidak menunggu tracker/ws/charts)
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // Cek jika halaman tidak ditemukan (404)
    if (response && response.status() === 404) {
      console.warn(
        `[Scraper] Ticker [${symbol}] tidak ditemukan (Error 404) di TradingView.`,
      );
      return false;
    }

    // Tunggu hidrasi data angka selesai diproses di dalam kontainer Key Stats
    await page
      .waitForFunction(
        () => {
          const doc = (globalThis as any).document;
          const keyStatsContainer = doc.querySelector(
            "[data-container-name='key-stats-id']",
          );
          if (!keyStatsContainer) return false;

          const valueElements: any[] = Array.prototype.slice.call(
            keyStatsContainer.querySelectorAll("[class*='value-']"),
          );
          return valueElements.some((el) => {
            const txt = (el.textContent ?? "").trim();
            return /\d/.test(txt); // Mengunci hingga angka render sempurna
          });
        },
        { timeout: 30_000 },
      )
      .catch(() => {
        console.log(
          "⚠️ Peringatan: Hidrasi komponen key-stats mengalami timeout.",
        );
      });

    const currentContent = await page.content();

    if (process.env.NODE_ENV === "development") {
      const fs = await import("fs");
      fs.writeFileSync("debug_tradingview.html", currentContent);
    }

    return currentContent;
  } catch (error) {
    console.error(`[Scraper] Gagal mengambil HTML untuk [${symbol}]:`, error);
    return false;
  } finally {
    // 3. Tab wajib ditutup agar RAM tetap lega selama proses antrean
    await page.close();
  }
}

/**
 * Fungsi utama: Fetch + Parse dengan proteksi short-circuit 404
 */
export async function scrapeTradingViewProfile(
  symbol: string,
  context: any, // 4. Teruskan parameter context ke tingkat fungsi utama
): Promise<ScrapedProfile | false> {
  const html = await fetchTradingViewOverviewHtml(symbol, context);

  if (html === false) return false;

  return scrapeProfileTradingView(html);
}
