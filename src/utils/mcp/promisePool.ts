/**
 * Helper generik untuk memecah array tugas asinkronus menjadi beberapa batch.
 * Berfungsi mencegah batasan rate-limit pada API eksternal.
 */
export async function promisePool<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return results;
}
