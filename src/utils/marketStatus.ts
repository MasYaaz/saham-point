import { BG_GREEN, BG_RED, BOLD, RESET } from "../theme";

export function getMarketStatus() {
  // Gunakan zona waktu Indonesia (WIB)
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(now);

  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");

  const isWeekend = day === "Saturday" || day === "Sunday";
  const currentTime = hour * 100 + minute; // Contoh: 14:30 menjadi 1430

  // Jam bursa: 09:00 - 16:15
  const isOpen = !isWeekend && currentTime >= 900 && currentTime <= 1615;
  const labelText = isOpen ? "OPEN " : "CLOSED"; // Spasi agar total panjangnya sama (5 karakter)

  return {
    label: isOpen
      ? `${BG_GREEN}${BOLD} 🕘 ${labelText}  ${RESET}`
      : `${BG_RED}${BOLD}  🕟 ${labelText}  ${RESET}`,
  };
}
