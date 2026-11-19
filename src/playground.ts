/**
 * The replay list and hash routing, kept apart from the entry point so it
 * can be tested against a DOM.
 */
import { element } from "./dom";
import { verdictLabel, type Scenario } from "./scenario";
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

export function mountPlayground(page: PlaygroundPage): void {
  const links = page.scenarios.map((scenario) =>
    element("a", { href: `#${scenario.slug}`, class: "ws-nav-item" }, [
      scenario.title,
      element("span", { class: `ws-nav-state is-${scenario.verdict}` }, [
        verdictLabel(scenario.verdict),
      ]),
    ]),
  );
  page.picker.append(...links.map((link) => element("li", {}, [link])));

  let current: ScenarioView | undefined;

  function show(moveFocus: boolean): void {
    const slug = slugOf(page.location.hash);
    const scenario = scenarioFor(page.scenarios, slug);
    if (!scenario) return;
    // An unknown or empty hash shows the first replay; make the address match it.
    if (slug !== scenario.slug) page.history.replaceState(null, "", `#${scenario.slug}`);
    current?.dispose();
    current = renderScenario(scenario);
    page.stage.replaceChildren(current.root);
    for (const link of links) {
      const active = link.getAttribute("href") === `#${scenario.slug}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    page.document.title = `${scenario.title} · MandateOps playground`;
    if (moveFocus) current.title.focus();
  }

  page.skip.addEventListener("click", () => current?.title.focus());
  page.window.addEventListener("hashchange", () => show(true));
  show(false);
}
