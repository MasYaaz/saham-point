export function parseLimit(
  value: string | undefined,
  defaultVal: number,
  maxVal: number = 100,
): number {
  const parsed = parseInt(value ?? "", 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, maxVal);
}
