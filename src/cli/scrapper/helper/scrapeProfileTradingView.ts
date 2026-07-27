import * as cheerio from "cheerio";
import type { ScrapedProfile } from "../../../types";
import { parseRawData } from "../../../utils/scrapper/parseRawData";

/**
 * Membersihkan karakter Unicode tersembunyi/formatting khusus dari string.
 */
function cleanText(raw: string): string {
  return raw.replace(/[\u200E\u200F\u202A-\u202E\u00A0\u202F]/g, "").trim();
}

/**
 * Memeriksa apakah string merupakan penanda nilai kosong (dash/blank).
 */
function isEmptyMarker(clean: string): boolean {
  return clean === "" || clean === "—" || clean === "--";
}

/**
 * Membedah (parse) HTML halaman overview TradingView menggunakan Cheerio
 * untuk mengekstrak profil perusahaan dan metrik finansial ringkas.
 *
 * @param html - String HTML mentah dari halaman overview TradingView.
 * @returns Objek `ScrapedProfile` berisi metrik fundamental ringkas.
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

  // 2. Ekstrak Metrik Finansial dari Blok Key Stats
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

  // 3. Ekstrak Dividen Terakhir via FAQ Widget
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
 * Mengambil string HTML halaman overview simbol saham via Playwright Context.
 * Dilengkapi dengan fail-fast navigation timeout (20s) dan validasi respons HTTP.
 *
 * @param symbol - Simbol ticker TradingView (misal: "IDX-BBCA").
 * @param context - Instance `BrowserContext` Playwright aktif.
 * @returns String HTML mentah jika berhasil, atau `false` jika navigasi/hidrasi gagal.
 */
export async function fetchTradingViewOverviewHtml(
  symbol: string,
  context: any,
): Promise<string | false> {
  const url = `https://www.tradingview.com/symbols/${symbol}/`;
  const page = await context.newPage();

  try {
    // 1. Navigasi ke URL target dengan batas waktu aman (Fail Fast)
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    // 2. Validasi status respons HTTP (Menagkap 404, 403, 500, atau network dropped)
    if (!response || !response.ok()) {
      console.warn(
        `[Scraper] Ticker [${symbol}] diabaikan (Status: ${response ? response.status() : "No Response"}).`,
      );
      return false;
    }

    // 3. Tunggu hidrasi elemen Key-Stats (Maksimal 10 detik)
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
 * Orchestrator Profil: Mengombinasikan pengambilan HTML (Playwright)
 * dan ekstraksi data profil (Cheerio).
 *
 * @param symbol - Simbol ticker TradingView (misal: "IDX-BBCA").
 * @param context - Instance `BrowserContext` Playwright aktif.
 * @returns Objek `ScrapedProfile` jika berhasil, atau `false` jika gagal/404.
 */
export async function scrapeTradingViewProfile(
  symbol: string,
  context: any,
): Promise<ScrapedProfile | false> {
  const html = await fetchTradingViewOverviewHtml(symbol, context);
  if (html === false) return false;
  return scrapeProfileTradingView(html);
}
