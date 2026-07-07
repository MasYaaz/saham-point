import { BOLD, CYAN, RESET } from "../theme";
import { padLine } from "./text-utils";

export const Components = {
  header: (title: string) => ` ${BOLD}${title}${RESET}`,

  statusItem: (label: string, value: string, width: number) =>
    padLine(` ➜ ${label} : ${value}`, width),

  linkItem: (label: string, url: string, width: number) =>
    padLine(` ➜ ${label} : ${CYAN}${url}${RESET}`, width),
};
