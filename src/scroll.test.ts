import { afterEach, describe, expect, test } from "bun:test";
import { startInertialScroll } from "./scroll";

const originalMatchMedia = window.matchMedia.bind(window);

/** A media query answer that matches only reduced-motion queries. */
function reducedMotion(query: string): MediaQueryList {
  return { matches: query.includes("reduce"), media: query } as MediaQueryList;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("startInertialScroll", () => {
  test("does nothing when the reader asks for reduced motion", () => {
    window.matchMedia = reducedMotion;
    expect(startInertialScroll()).toBeUndefined();
  });
});
