import Parser from "rss-parser";
import type { NewsItem } from "./types";
import { buildSearchQuery, isPureTickerSymbol } from "./queryBuilder";
import { getTitleSimilarity } from "../../utils/rssNews/textHelpers";
import { generateArticleContent } from "./generateArticleContent";

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml; q=0.1",
  },
  timeout: 5000,
});

/**
 * Mengambil berita utama beserta ringkasan konten artikel secara paralel.
 */
export async function searchNews(
  query: string,
  time: number = 14,
  limit: number = 10,
  lang: "id" | "en" = "id",
): Promise<NewsItem[]> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return [];

  const searchQuery = buildSearchQuery(cleanQuery);
  const encodedQuery = encodeURIComponent(searchQuery);

  const rssUrl =
    lang === "id"
      ? `https://news.google.com/rss/search?q=${encodedQuery}&hl=id&gl=ID&ceid=ID:id`
      : `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const feed = await parser.parseURL(rssUrl);
    const items = feed.items || [];

    const rawNewsList: Array<NewsItem & { timestamp: number }> = [];
    const seenUrls = new Set<string>();
    const processedTitles: string[] = [];

    const now = Date.now();
    const maxAgeMs = time * 24 * 60 * 60 * 1000;

    const isTicker = isPureTickerSymbol(cleanQuery);
    const tickerKeyword = isTicker
      ? cleanQuery.toUpperCase().replace(/\.JK$/i, "")
      : "";

    for (const item of items) {
      const rawTitle = (item.title || "").trim();
      const rawUrl = (item.link || "").trim();
      if (!rawTitle || !rawUrl || seenUrls.has(rawUrl)) continue;

      let title = rawTitle;
      let sourceName = "Google News";

      if (rawTitle.includes(" - ")) {
        const lastDashIndex = rawTitle.lastIndexOf(" - ");
        title = rawTitle.substring(0, lastDashIndex).trim();
        sourceName = rawTitle.substring(lastDashIndex + 3).trim();
      }

      if (isTicker && tickerKeyword) {
        const hasTickerInTitle = new RegExp(`\\b${tickerKeyword}\\b`, "i").test(
          title,
        );
        if (!hasTickerInTitle) continue;
      }

      const isDuplicateTitle = processedTitles.some(
        (existingTitle) => getTitleSimilarity(existingTitle, title) >= 0.75,
      );
      if (isDuplicateTitle) continue;

      const pubDate = item.pubDate || item.isoDate;
      const parsedDate = pubDate ? new Date(pubDate) : new Date();
      const timestamp = isNaN(parsedDate.getTime())
        ? now
        : parsedDate.getTime();

      if (now - timestamp > maxAgeMs) continue;

      seenUrls.add(rawUrl);
      processedTitles.push(title);

      const d = new Date(timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const formattedDate = `${year}-${month}-${day}`;

      rawNewsList.push({
        title,
        url: rawUrl,
        published: formattedDate,
        source: sourceName,
        content: "",
        timestamp,
      });
    }

    rawNewsList.sort((a, b) => b.timestamp - a.timestamp);
    const selectedNews = rawNewsList.slice(0, limit);

    // Ambil konten penuh secara paralel untuk semua berita terpilih
    const fullContentPromises = selectedNews.map(async (news) => {
      const { realUrl, textContent } = await generateArticleContent(news.url);
      if (realUrl) news.url = realUrl;
      if (textContent) news.content = textContent;
    });

    await Promise.allSettled(fullContentPromises);

    return selectedNews.map(({ timestamp, ...news }) => news);
  } catch {
    return [];
  }
}
