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
  timeout: 8000,
});

function cleanHtml(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(/<[^>]+>/g, "");
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&#39;": "'",
    "&quot;": '"',
  };
  for (const [entity, char] of Object.entries(entities)) {
    cleaned = cleaned.replaceAll(entity, char);
  }
  return cleaned.trim();
}

export async function fetchEmitenNews(
  symbol: string,
  companyName?: string,
  limit: number = 10,
  lang: "id" | "en" = "id",
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

  const results: NewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const target of rssTargets) {
    if (results.length >= limit) break;
    try {
      const feed = await parser.parseURL(target.url);
      for (const item of feed.items || []) {
        if (results.length >= limit) break;
        const rawTitle = (item.title || "").trim();
        if (!rawTitle) continue;

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

        const normalizedTitle = title.toLowerCase();
        if (seenTitles.has(normalizedTitle)) continue;

        const rawSummary =
          item.contentSnippet || item.content || item.summary || "";

        seenTitles.add(normalizedTitle);
        results.push({
          symbol: cleanSymbol,
          title,
          url: item.link || "",
          published: item.pubDate || item.isoDate || "",
          summary: cleanHtml(rawSummary).slice(0, 300),
          source: sourceName,
        });
      }
    } catch {
      continue;
    }
  }

  return results.slice(0, limit);
}
