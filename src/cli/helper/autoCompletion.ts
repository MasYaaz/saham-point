import { GRAY, RESET } from "../component/TUITheme";
import { readlineHead } from "../component/readlineInterface";
import { matchEmitenCode } from "./emitenCache";

const baseCommands = [
  "sync",
  "detail",
  "show emiten",
  "show mcptools",
  "clear",
  "exit",
];

// 🔒 Private — tidak lagi di-export mentah. Sebelumnya caller luar
// (index.ts) baca & reassign variabel ini langsung, sekarang harus
// lewat fungsi publik di bawah.
let currentSuggestion = "";

function computeMatch(trimmed: string): string {
  const foundBase = baseCommands.find((c) => c.startsWith(trimmed));
  if (foundBase && foundBase !== trimmed) {
    return foundBase;
  }
  if (trimmed.startsWith("detail ")) {
    const parts = trimmed.split(/\s+/);
    const arg = parts[1] ? parts[1].toUpperCase() : "";
    const foundEmiten = matchEmitenCode(arg);
    if (foundEmiten) return `detail ${foundEmiten}`;
  }
  return "";
}

/** Hitung ulang & gambar ghost text sesuai isi readline saat ini. */
export function renderGhostSuggestion(): void {
  const currentInput = readlineHead.line;
  const cursorIdx = readlineHead.cursor;
  const trimmed = currentInput.trimStart();

  if (!trimmed) {
    process.stdout.write("\x1b[K");
    currentSuggestion = "";
    return;
  }

  const match = computeMatch(trimmed);

  if (match && match.startsWith(trimmed) && cursorIdx === currentInput.length) {
    currentSuggestion = match;
    const ghostText = match.slice(trimmed.length);
    process.stdout.write(
      `\x1b[K${GRAY}${ghostText}\x1b[${ghostText.length}D${RESET}`,
    );
  } else {
    process.stdout.write("\x1b[K");
    currentSuggestion = "";
  }
}

/**
 * Terapkan suggestion yang sedang tampil (dipanggil saat Tab/→ ditekan).
 * Return true kalau ada suggestion yang di-apply — caller pakai ini
 * untuk tahu kapan harus early-return dan tidak lanjut proses keypress lain.
 * Sebelumnya logic ini nyasar di keypress handler index.ts.
 */
export function acceptSuggestion(): boolean {
  if (!currentSuggestion) return false;

  const currentInput = readlineHead.line;
  const remainingText = currentSuggestion.slice(currentInput.length);
  if (remainingText.length > 0) {
    readlineHead.write(remainingText);
  }
  currentSuggestion = "";
  return true;
}

/** Reset suggestion tanpa menyentuh isi input (dipanggil setelah Enter/submit). */
export function clearSuggestion(): void {
  currentSuggestion = "";
}
