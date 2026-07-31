import Parser from "rss-parser";

export interface NewsItem {
  symbol: string;
  title: string;
  url: string;
  published: string;
  summary: string;
  source: string;
}

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml; q=0.1",
  },
  timeout: 5000,
});

function cleanHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(normalizeText(title1).split(" "));
  const words2 = new Set(normalizeText(title2).split(" "));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

/**
 * Mengambil, membersihkan, dan memfilter berita RSS emiten terkini.
 *
 * @param symbol Ticker saham (misal: "AMRT")
 * @param companyName Nama perusahaan opsional untuk query presisi (misal: "Alfamart")
 * @param lang Bahasa berita ("id" | "en")
 * @param maxDays Batas maksimal umur berita dalam hari (default: 14 hari)
 */
export async function fetchEmitenNews(
  symbol: string,
  companyName?: string,
  lang: "id" | "en" = "id",
  maxDays: number = 14,
): Promise<NewsItem[]> {
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\.JK$/i, "");

  const searchQuery = companyName
    ? `"${cleanSymbol}" OR "${companyName}"`
    : `"${cleanSymbol}"`;
  const encodedQuery = encodeURIComponent(searchQuery);

  const rssTargets =
    lang === "id"
      ? [
          {
            url: `https://news.google.com/rss/search?q=${encodedQuery}+saham&hl=id&gl=ID&ceid=ID:id`,
            defaultSource: "Google News ID",
          },
          {
            url: `https://finance.yahoo.com/rss/headline?s=${cleanSymbol}.JK`,
            defaultSource: "Yahoo Finance",
          },
        ]
      : [
          {
            url: `https://news.google.com/rss/search?q=${encodedQuery}+stock&hl=en-US&gl=US&ceid=US:en`,
            defaultSource: "Google News US",
          },
          {
            url: `https://finance.yahoo.com/rss/headline?s=${cleanSymbol}`,
            defaultSource: "Yahoo Finance",
          },
        ];

  const feedPromises = rssTargets.map(async (target) => {
    try {
      const feed = await parser.parseURL(target.url);
      return { target, items: feed.items || [] };
    } catch {
      return { target, items: [] };
    }
  });

  const feedResults = await Promise.allSettled(feedPromises);
  const rawNewsList: Array<NewsItem & { timestamp: number }> = [];
  const seenUrls = new Set<string>();
  const processedTitles: string[] = [];

  const now = Date.now();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  for (const result of feedResults) {
    if (result.status !== "fulfilled") continue;

    const { target, items } = result.value;

    for (const item of items) {
      const rawTitle = (item.title || "").trim();
      const rawUrl = (item.link || "").trim();
      if (!rawTitle || !rawUrl) continue;

      if (seenUrls.has(rawUrl)) continue;

      let title = rawTitle;
      let sourceName = target.defaultSource;

      if (
        rawTitle.includes(" - ") &&
        target.defaultSource.startsWith("Google News")
      ) {
        const lastDashIndex = rawTitle.lastIndexOf(" - ");
        title = rawTitle.substring(0, lastDashIndex).trim();
        sourceName = rawTitle.substring(lastDashIndex + 3).trim();
      }

      // Filter Duplikasi Judul Mirip (Threshold >= 75%)
      const isDuplicateTitle = processedTitles.some(
        (existingTitle) => getTitleSimilarity(existingTitle, title) >= 0.75,
      );
      if (isDuplicateTitle) continue;

      const pubDate = item.pubDate || item.isoDate;
      const parsedDate = pubDate ? new Date(pubDate) : new Date();
      const timestamp = isNaN(parsedDate.getTime())
        ? now
        : parsedDate.getTime();

      // Filter Umur Berita
      if (now - timestamp > maxAgeMs) continue;

      const rawSummary =
        item.contentSnippet || item.summary || item.content || "";
      const cleanedSummary = cleanHtml(rawSummary);

      seenUrls.add(rawUrl);
      processedTitles.push(title);

      rawNewsList.push({
        symbol: cleanSymbol,
        title,
        url: rawUrl,
        published: new Date(timestamp).toISOString(),
        summary: cleanedSummary.slice(0, 300),
        source: sourceName,
        timestamp,
      });
    }
  }

  // Urutkan dari yang paling terbaru
  rawNewsList.sort((a, b) => b.timestamp - a.timestamp);
  return rawNewsList.map(({ timestamp, ...news }) => news);
}
