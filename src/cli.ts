#!/usr/bin/env bun
import { handleCommand } from "./cli/command";
import { readlineHead } from "./cli/component/readlineInterface";
import {
  acceptSuggestion,
  clearSuggestion,
  renderGhostSuggestion,
} from "./cli/helper/autoCompletion";
import { TUIHead } from "./cli/component/TUIHead";

// Render TUI Awal
TUIHead();
readlineHead.prompt();

// Interaksi Keyboard
process.stdin.on("keypress", (str, key) => {
  if (key.name === "right" || key.name === "tab") {
    if (acceptSuggestion()) return;
  }
  renderGhostSuggestion();
});

// Listener Input Command
readlineHead.on("line", async (line) => {
  clearSuggestion();
  await handleCommand(line, TUIHead);
});

readlineHead.on("SIGINT", () => {
  console.log("\n👋 Mematikan TUI Terminal...");
  process.exit(0);
});
