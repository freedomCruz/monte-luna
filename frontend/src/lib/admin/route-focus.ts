// Helpers for what a client-side navigation must do by hand because the browser does not:
// move focus to the new view and put the page back where the person was. Both wait for a
// section that renders after its data arrives, and both stop as soon as the person acts.

const FOCUS_TIMEOUT_MS = 10_000;
const SCROLL_TIMEOUT_MS = 3_000;

/** Inputs that mean the person took over: focus and scroll must not move under their hands. */
const TAKEOVER_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;

/** Watches the document until `attempt` succeeds, the timeout passes or the person acts. */
function watchUntil(attempt: () => boolean, timeoutMs: number): () => void {
  if (attempt()) return () => {};
  let stopped = false;
  const observer = new MutationObserver(() => { if (attempt()) stop(); });
  const timer = window.setTimeout(() => stop(), timeoutMs);
  function stop() {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of TAKEOVER_EVENTS) {
      document.removeEventListener(type, stop, true);
      window.removeEventListener(type, stop, true);
    }
  }
  observer.observe(document.body, { childList: true, subtree: true });
  for (const type of TAKEOVER_EVENTS) {
    document.addEventListener(type, stop, true);
    window.addEventListener(type, stop, true);
  }
  return stop;
}

/** A rendered heading: the phone and desktop variants of one title are both in the DOM, one hidden by CSS. */
function isRendered(element: Element): boolean {
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

/**
 * Moves focus to the first rendered `h1`, the new view's title, so a screen reader announces the
 * navigation. Returns a function that cancels the wait.
 */
export function focusRouteHeading(): () => void {
  return watchUntil(() => {
    const heading = Array.from(document.querySelectorAll('h1')).find(isRendered);
    if (!heading) return false;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.style.outline = 'none';
    heading.focus({ preventScroll: true });
    return true;
  }, FOCUS_TIMEOUT_MS);
}

/** Scrolls to `top` once the page is tall enough for it (the section may still be loading). */
export function restoreScrollPosition(top: number): () => void {
  return watchUntil(() => {
    if (document.documentElement.scrollHeight - window.innerHeight < top) return false;
    window.scrollTo(0, top);
    return true;
  }, SCROLL_TIMEOUT_MS);
}
