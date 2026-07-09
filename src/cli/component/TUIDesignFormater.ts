import { RESET, GRAY, BOLD, CYAN } from "./TUITheme";
import { padColumn, padLine } from "./TUITextFormat";

export const TUI = {
  // Membuat baris dengan pembatas vertikal
  row: (left: string, right: string, wL: number, wR: number) => {
    return ` ${GRAY}│${RESET}${padLine(left, wL)}${GRAY}│${RESET}${padLine(right, wR)}${GRAY}│${RESET}`;
  },
  // Membuat baris penuh (tanpa pembatas tengah)
  fullRow: (content: string, width: number) => {
    return ` ${GRAY}│${RESET}${padLine(content, width)}${GRAY}│${RESET}`;
  },

  emptyRow: (wL: number, wR: number) => {
    return ` ${GRAY}│${RESET}${" ".repeat(wL)}${GRAY}│${RESET}${" ".repeat(wR)}${GRAY}│${RESET}`;
  },

  // Helper untuk membungkus komponen
  divider: (type: "top" | "middle" | "bottom") => {
    const d = {
      top: ` ${GRAY}╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮${RESET}`,
      middle: ` ${GRAY}├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤${RESET}`,
      bottom: ` ${GRAY}╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯${RESET}`,
    };
    return d[type];
  },

  spacer: () => {
    return "";
  },
  // Border Helper
  border: (type: "top" | "mid" | "bot", widths: number[]) => {
    const chars =
      type === "top"
        ? ["┌", "┬", "┐"]
        : type === "mid"
          ? ["├", "┼", "┤"]
          : ["└", "┴", "┘"];
    return ` ${GRAY}${chars[0]}${widths.map((w) => "─".repeat(w)).join(chars[1])}${chars[2]}${RESET}`;
  },

  // Render Tabel Baris
  tableRow: (data: string[], widths: number[]) => {
    let row = ` ${GRAY}│${RESET}`;
    data.forEach((text, i) => {
      const width = widths[i] ?? 10;
      row += padColumn(text, width) + `${GRAY}│${RESET}`;
    });
    return row;
  },

  header: (title: string) => ` ${BOLD}${title}${RESET}`,

  statusItem: (label: string, value: string, width: number) =>
    padLine(` ➜ ${label} : ${value}`, width),

  linkItem: (label: string, url: string, width: number) =>
    padLine(` ➜ ${label} : ${CYAN}${url}${RESET}`, width),
};
