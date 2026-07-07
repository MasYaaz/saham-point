function stripANSI(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function padLine(leftText: string, targetWidth: number): string {
  const visibleLength = stripANSI(leftText).length;
  const paddingNeeded = Math.max(0, targetWidth - visibleLength);
  return leftText + " ".repeat(paddingNeeded);
}

// Fungsi pembuat kolom presisi
export function padColumn(
  text: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const visibleLength = stripANSI(text).length;
  const padding = Math.max(0, width - visibleLength);
  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  return text + " ".repeat(padding);
}
