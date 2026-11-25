/**
 * The scenario list and hash routing, kept apart from the entry point so it
 * can be tested against a DOM.
 */
import { element } from "./dom";
import { FLOW_LABELS, FLOWS, verdictLabel, type Scenario } from "./scenario";
import { renderScenario, type ScenarioView } from "./view";

export type PlaygroundPage = Readonly<{
  stage: HTMLElement;
  picker: HTMLElement;
  skip: HTMLElement;
  scenarios: readonly Scenario[];
  location: Pick<Location, "hash">;
  history: Pick<History, "replaceState">;
  document: Pick<Document, "title">;
  window: Pick<Window, "addEventListener">;
}>;

/** The slug in a hash, or "" when it is empty or not valid URI encoding. */
export function slugOf(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

/** The scenario a slug names, falling back to the first. */
export function scenarioFor(
  scenarios: readonly Scenario[],
  slug: string,
): Scenario | undefined {
  return scenarios.find((each) => each.slug === slug) ?? scenarios[0];
}

/** One picker link for a scenario, with its verdict. */
function scenarioLink(scenario: Scenario): HTMLAnchorElement {
  return element("a", { href: `#${scenario.slug}`, class: "ws-nav-item" }, [
    scenario.title,
    element("span", { class: `ws-nav-state is-${scenario.verdict}` }, [
      verdictLabel(scenario.verdict),
    ]),
  ]);
}

/**
 * Scrolls an overflowing picker sideways so the link is in view. Horizontal
 * only, so a route change never moves the page; a picker that fits is left alone.
 */
export function revealSideways(picker: HTMLElement, link: HTMLElement): void {
  if (picker.scrollWidth <= picker.clientWidth) return;
  const offset = link.getBoundingClientRect().left - picker.getBoundingClientRect().left;
  const gutter = parseFloat(getComputedStyle(picker).paddingLeft || "0");
  picker.scrollLeft += offset - gutter;
}

export function mountPlayground(page: PlaygroundPage): void {
  const links: HTMLAnchorElement[] = [];
  // One labelled group per money flow, in the canonical flow order; empty flows are skipped.
  for (const flow of FLOWS) {
    const flowLinks = page.scenarios
      .filter((scenario) => scenario.flow === flow)
      .map(scenarioLink);
    if (flowLinks.length === 0) continue;
    links.push(...flowLinks);
    const labelId = `flow-${flow}`;
    page.picker.append(
      element("li", { class: "ws-nav-group" }, [
        element("p", { class: "ws-nav-group-label", id: labelId }, [FLOW_LABELS[flow]]),
        element(
          "ul",
          { class: "ws-nav-list", "aria-labelledby": labelId },
          flowLinks.map((link) => element("li", {}, [link])),
        ),
      ]),
    );
  }

  let current: ScenarioView | undefined;

  function show(moveFocus: boolean): void {
    const slug = slugOf(page.location.hash);
    const scenario = scenarioFor(page.scenarios, slug);
    if (!scenario) return;
    // An unknown or empty hash shows the first scenario; make the address match it.
    if (slug !== scenario.slug) page.history.replaceState(null, "", `#${scenario.slug}`);
    current?.dispose();
    current = renderScenario(scenario);
    page.stage.replaceChildren(current.root);
    for (const link of links) {
      const active = link.getAttribute("href") === `#${scenario.slug}`;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
        revealSideways(page.picker, link);
      } else link.removeAttribute("aria-current");
    }
    page.document.title = `${scenario.title} · MandateOps playground`;
    if (moveFocus) current.title.focus();
  }

  page.skip.addEventListener("click", () => current?.title.focus());
  page.window.addEventListener("hashchange", () => show(true));
  show(false);
}
