/**
 * Membangun query pencarian Google yang dioptimalkan untuk konteks saham/umum.
 */
export function buildSearchQuery(userQuery: string): string {
  const cleanQuery = userQuery.trim();
  if (!cleanQuery) return "";

  // Jika input berupa Ticker 4 huruf murni (misal: "ADRO", "AMRT"), beri konteks emiten/saham
  const isPureTicker = /^[A-Za-z]{4}(\.JK)?$/i.test(cleanQuery);
  if (isPureTicker) {
    const symbol = cleanQuery.toUpperCase().replace(/\.JK$/i, "");
    return `"${symbol}" (saham OR emiten OR PT)`;
  }

  return cleanQuery;
}

/**
 * Memeriksa apakah kata kunci murni berupa ticker 4 huruf.
 */
export function isPureTickerSymbol(query: string): boolean {
  return /^[A-Za-z]{4}(\.JK)?$/i.test(query.trim());
}
