import * as cheerio from "cheerio";
import type { ScrapedProfile } from "../../../types";
import { parseRawData } from "../../../utils/scrapper/parseRawData";

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

  // 1. Ekstrak Deskripsi Perusahaan
  const companyInfoBox = $("div[data-container-name='company-info-id']");
  const descText =
    companyInfoBox.find("div[class*='content-'] span span").first().text() ||
    $("div[class*='content-oqCCtNt1']").text();
  if (descText) data.description = cleanText(descText).replace(/\s+/g, " ");

  // 2. Ekstrak Metrik Finansial
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

  // 3. Trik Cerdas Last Dividend
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
 * Mengembalikan string HTML jika sukses, atau false jika 404 / gagal / timeout
 */
export async function fetchTradingViewOverviewHtml(
  symbol: string,
  context: any,
): Promise<string | false> {
  const url = `https://www.tradingview.com/symbols/${symbol}/`;
  const page = await context.newPage();

  try {
    // 🛡️ FIX 1: Potong timeout navigasi dari 60 detik menjadi 15-20 detik saja (Fail Fast)
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    // 🛡️ FIX 2: Cek validitas response secara menyeluruh (!response.ok())
    // Menangkap status 404, 403, 500, atau jika network mendadak putus (null)
    if (!response || !response.ok()) {
      console.warn(
        `[Scraper] Ticker [${symbol}] diabaikan (Status: ${response ? response.status() : "No Response"}).`,
      );
      return false; // Langsung keluar! Menghindari gantung 30 detik di bawah.
    }

    // 🛡️ FIX 3: Potong timeout tunggu hidrasi dari 30 detik menjadi maksimal 10 detik
    // Gunakan Array.from() standar agar kodenya lebih clean dibanding prototype slice
    await page
      .waitForFunction(
        () => {
          const doc = (globalThis as any).document;
          const keyStatsContainer = doc.querySelector(
            "[data-container-name='key-stats-id']",
          );
          if (!keyStatsContainer) return false;

          const valueElements = Array.from(
            keyStatsContainer.querySelectorAll("[class*='value-']"),
          );
          return valueElements.some((el: any) =>
            /\d/.test((el.textContent ?? "").trim()),
          );
        },
        { timeout: 10_000 },
      )
      .catch(() => {
        console.log(
          `⚠️ Peringatan: Hidrasi key-stats emiten [${symbol}] mengalami timeout.`,
        );
      });

    const currentContent = await page.content();
    return currentContent;
  } catch (error: any) {
    console.error(
      `[Scraper] Gagal mengambil HTML untuk [${symbol}]:`,
      error?.message || error,
    );
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Fungsi utama: Fetch + Parse dengan proteksi short-circuit 404
 */
export async function scrapeTradingViewProfile(
  symbol: string,
  context: any,
): Promise<ScrapedProfile | false> {
  const html = await fetchTradingViewOverviewHtml(symbol, context);
  if (html === false) return false;
  return scrapeProfileTradingView(html);
}
