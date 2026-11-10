import * as React from 'react';
import { adminLinkTarget, resolveAdminRoute } from '../../../lib/admin/routes';
import { restoreScrollPosition } from '../../../lib/admin/route-focus';
import type { RegisterUnsavedChanges, UnsavedChangesBlocker } from '../shared/unsaved-changes';

export interface NavigateOptions {
  /** Leave without asking about unsaved edits, e.g. right after the screen saved them. */
  discardChanges?: boolean;
}

/** What a screen calls to move inside the admin app; outside the app it is a plain document load. */
export const AdminNavigationContext = React.createContext<(href: string, options?: NavigateOptions) => void>(
  (href) => window.location.assign(href),
);

export function useAdminNavigate(): (href: string, options?: NavigateOptions) => void {
  return React.useContext(AdminNavigationContext);
}

/** Where the app is. `key` changes on every navigation (even to the same section) and remounts the section. */
export interface AdminLocation {
  path: string;
  key: number;
  /** `load` is the document the page was opened with; the others are client-side navigations. */
  via: 'load' | 'push' | 'pop';
}

type Transition =
  | { kind: 'push'; url: URL }
  | { kind: 'pop'; url: URL; position: number | null };

/**
 * Each history entry the app creates carries its position in the stack, so a popstate says how
 * far it moved and a refused one can be undone with `history.go`. Sections that rewrite their
 * query string must keep this state (see `replaceAddressSearch`).
 */
const POSITION_KEY = 'adminNav';

function positionOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const position = (state as Record<string, unknown>)[POSITION_KEY];
  return typeof position === 'number' ? position : null;
}

function withPosition(position: number): Record<string, unknown> {
  const state = window.history.state;
  return { ...(typeof state === 'object' && state !== null ? state : {}), [POSITION_KEY]: position };
}

function addressOf(url: URL): string {
  return `${url.pathname}${url.search}`;
}

export interface AdminRouter {
  location: AdminLocation;
  navigate: (href: string, options?: NavigateOptions) => void;
  registerBlocker: RegisterUnsavedChanges;
  /** Set while a navigation waits for the "¿Salir sin guardar?" answer. */
  confirmation: { title: string; stay: () => void; leave: () => void } | null;
}

/**
 * Client-side navigation for the admin app on the History API: intercepted link clicks push,
 * popstate follows back and forward, and a screen with unsaved edits can refuse either one.
 * Document loads (access pages, the storefront, other origins, modified clicks) are left to the browser.
 */
export function useAdminRouter(): AdminRouter {
  const [location, setLocation] = React.useState<AdminLocation>(() => ({
    path: typeof window === 'undefined' ? '' : window.location.pathname,
    key: 0,
    via: 'load',
  }));
  const [confirmationTitle, setConfirmationTitle] = React.useState<string | null>(null);

  const blocker = React.useRef<UnsavedChangesBlocker | null>(null);
  const position = React.useRef(0);
  const scrolls = React.useRef(new Map<number, number>());
  const waiting = React.useRef<Transition | null>(null);
  // `history.go` fires a popstate of its own; the ones we caused are not navigations.
  const ignoredPops = React.useRef(0);
  const restoreScroll = React.useRef<(() => void) | null>(null);
  // Address of the screen being shown, to put back when a back/forward that cannot be undone by position is refused.
  const shownAddress = React.useRef(typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`);

  const registerBlocker = React.useCallback<RegisterUnsavedChanges>((next) => {
    blocker.current = next;
    return () => { if (blocker.current === next) blocker.current = null; };
  }, []);

  const commit = React.useCallback((transition: Transition) => {
    scrolls.current.set(position.current, window.scrollY);
    restoreScroll.current?.();
    restoreScroll.current = null;

    if (transition.kind === 'push') {
      const unchanged = addressOf(transition.url) === `${window.location.pathname}${window.location.search}`;
      if (!unchanged) {
        position.current += 1;
        scrolls.current.delete(position.current);
        window.history.pushState(withPosition(position.current), '', `${addressOf(transition.url)}${transition.url.hash}`);
      }
      window.scrollTo(0, 0);
    } else {
      const saved = transition.position === null ? undefined : scrolls.current.get(transition.position);
      if (transition.position !== null) position.current = transition.position;
      if (saved) restoreScroll.current = restoreScrollPosition(saved);
      else window.scrollTo(0, 0);
    }
    shownAddress.current = addressOf(transition.url);
    setLocation((current) => ({ path: transition.url.pathname, key: current.key + 1, via: transition.kind }));
  }, []);

  const request = React.useCallback((transition: Transition, options: NavigateOptions = {}) => {
    if (blocker.current && !options.discardChanges) {
      waiting.current = transition;
      setConfirmationTitle(blocker.current.title);
      return;
    }
    commit(transition);
  }, [commit]);

  const navigate = React.useCallback((href: string, options?: NavigateOptions) => {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || resolveAdminRoute(url.pathname) === null) {
      window.location.assign(href);
      return;
    }
    request({ kind: 'push', url }, options);
  }, [request]);

  const stay = React.useCallback(() => {
    const transition = waiting.current;
    waiting.current = null;
    setConfirmationTitle(null);
    if (transition?.kind !== 'pop') return;
    // The browser already moved: undo it so the address matches the screen again.
    if (transition.position !== null && transition.position !== position.current) {
      ignoredPops.current += 1;
      window.history.go(position.current - transition.position);
    } else {
      window.history.pushState(withPosition(position.current), '', shownAddress.current);
    }
  }, []);

  const leave = React.useCallback(() => {
    const transition = waiting.current;
    waiting.current = null;
    blocker.current = null;
    setConfirmationTitle(null);
    if (transition) commit(transition);
  }, [commit]);

  React.useEffect(() => {
    // Stamp the entry the page was opened with and take over scroll restoration, which
    // the browser cannot do for content that is not there yet.
    const stamped = positionOf(window.history.state);
    position.current = stamped ?? 0;
    if (stamped === null) window.history.replaceState(withPosition(0), '');
    const scrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const onClick = (event: MouseEvent) => {
      const url = adminLinkTarget(event, new URL(window.location.href));
      if (!url) return;
      event.preventDefault();
      request({ kind: 'push', url });
    };
    const onPopState = (event: PopStateEvent) => {
      if (ignoredPops.current > 0) {
        ignoredPops.current -= 1;
        return;
      }
      const url = new URL(window.location.href);
      if (resolveAdminRoute(url.pathname) === null) {
        window.location.reload();
        return;
      }
      request({ kind: 'pop', url, position: positionOf(event.state) });
    };

    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
      window.history.scrollRestoration = scrollRestoration;
    };
  }, [request]);

  return {
    location,
    navigate,
    registerBlocker,
    confirmation: confirmationTitle === null ? null : { title: confirmationTitle, stay, leave },
  };
}
