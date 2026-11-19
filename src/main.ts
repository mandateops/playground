/**
 * Entry point: the replay list and hash routing. Each replay has its own
 * shareable address, for example `#balance-race`.
 */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./style.css";
import { mountPlayground } from "./playground";
import { scenarios } from "./scenarios";

const stage = document.querySelector<HTMLElement>("#stage");
const picker = document.querySelector<HTMLElement>("#picker");
const skip = document.querySelector<HTMLElement>("#skip");
if (!stage || !picker || !skip)
  throw new Error("page is missing #stage, #picker or #skip");

mountPlayground({ stage, picker, skip, scenarios, location, history, document, window });
