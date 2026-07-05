import type { YahooProfileData } from "../../types";
import * as cheerio from "cheerio";

/**
 * 6. Scraper Profil & Statistik Tambahan Yahoo
 */
export function scrapeProfileYahoo(html: string): YahooProfileData {
  const $ = cheerio.load(html);
  const data: YahooProfileData = {
    description: null,
    market_cap: 0,
    beta: 1,
    last_dividend: 0,
    per: 0,
    eps: 0,
  };

  const descText = $("section[data-testid='company-overview-card'] p.yf-z5w6qk")
    .first()
    .text()
    .trim();
  if (descText) data.description = descText.replace(/\s+/g, " ");

  function parseYahooNum(text: string): number {
    const cleanStr = text.trim().replace(/,/g, "");
    if (cleanStr === "--" || cleanStr === "") return 0;
    if (cleanStr.endsWith("T")) return parseFloat(cleanStr) * 1_000_000_000_000;
    if (cleanStr.endsWith("B")) return parseFloat(cleanStr) * 1_000_000_000;
    if (cleanStr.endsWith("M")) return parseFloat(cleanStr) * 1_000_000;
    return parseFloat(cleanStr);
  }

  $("section.quote-statistics-container ul li").each((_, el) => {
    const label = $(el).find(".label").text().trim().toLowerCase();
    const valueText = $(el).find(".value").text().trim();

    if (label.includes("market cap"))
      data.market_cap = parseYahooNum(valueText);
    else if (label.includes("beta")) data.beta = parseYahooNum(valueText);
    else if (label.includes("pe ratio")) data.per = parseYahooNum(valueText);
    else if (label.includes("eps")) data.eps = parseYahooNum(valueText);
    else if (label.includes("forward dividend")) {
      const divMatch = /^([\d\.,]+)/.exec(valueText);
      if (divMatch && divMatch[1])
        data.last_dividend = parseYahooNum(divMatch[1]);
    }
  });

  return data;
}
