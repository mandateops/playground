import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Gives wheel and trackpad scrolling momentum, with the same settings as the
 * MandateOps app. Touch scrolling stays native, so phones keep their own
 * elastic overscroll. Skipped when the reader asks for reduced motion.
 */
export function startInertialScroll(): Lenis | undefined {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return undefined;
  }
  return new Lenis({ autoRaf: true, lerp: 0.1, smoothWheel: true });
}
