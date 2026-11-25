/**
 * Entry point: the scenario list and hash routing. Each scenario has its own
 * shareable address, for example `#lost-reply`.
 */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./style.css";
import { mountPlayground } from "./playground";
import { scenarios } from "./scenarios";
import { startInertialScroll } from "./scroll";

const stage = document.querySelector<HTMLElement>("#stage");
const picker = document.querySelector<HTMLElement>("#picker");
const skip = document.querySelector<HTMLElement>("#skip");
if (!stage || !picker || !skip)
  throw new Error("page is missing #stage, #picker or #skip");

mountPlayground({ stage, picker, skip, scenarios, location, history, document, window });
startInertialScroll();
