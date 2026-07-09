import readline from "readline";
import { BOLD, RESET } from "./TUITheme";

// Inisialisasi Readline Interface Standar
export const readlineHead = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `\x1b[32m${BOLD} saham-point ➜ ${RESET}`,
});
