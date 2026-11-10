import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusRouteHeading, restoreScrollPosition } from './route-focus';

function mount(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('focusRouteHeading (admin-navigation-v1 T3: S2 accessibility)', () => {
  it('focuses the h1 of the new view right away, making it programmatically focusable', () => {
    mount('<nav><a href="/admin/">Inicio</a></nav><main><h1>Pedidos</h1></main>');
    focusRouteHeading();
    const heading = document.querySelector('h1')!;
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('keeps an author tabindex and does not scroll while focusing', () => {
    mount('<main><h1 tabindex="0">Pedidos</h1></main>');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    focusRouteHeading();
    expect(document.querySelector('h1')!.getAttribute('tabindex')).toBe('0');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('waits for an h1 that renders after the data arrives, then stops watching', async () => {
    mount('<main><p>Cargando…</p></main>');
    focusRouteHeading();
    expect(document.activeElement).toBe(document.body);

    const heading = document.createElement('h1');
    heading.textContent = 'Producto';
    document.querySelector('main')!.append(heading);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(heading);

    // A later h1 does not steal the focus back.
    const other = document.createElement('h1');
    document.querySelector('main')!.append(other);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(heading);
  });

  it('skips a heading that is not rendered (the phone/desktop variants of one title)', () => {
    mount('<main><h1 id="phone">Pedidos</h1><h1 id="desktop">Pedidos</h1></main>');
    const phone = document.getElementById('phone')!;
    phone.checkVisibility = () => false;
    focusRouteHeading();
    expect(document.activeElement).toBe(document.getElementById('desktop'));
  });

  it('gives up when the person starts using the page before the heading shows up', async () => {
    mount('<main><p>Cargando…</p></main>');
    focusRouteHeading();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    const heading = document.createElement('h1');
    document.querySelector('main')!.append(heading);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(document.body);
  });

  it('gives up after a timeout and returns a cancel function', async () => {
    mount('<main><p>Cargando…</p></main>');
    focusRouteHeading();
    await vi.advanceTimersByTimeAsync(11_000);
    const heading = document.createElement('h1');
    document.querySelector('main')!.append(heading);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(document.body);

    document.querySelector('h1')!.remove();
    const cancel = focusRouteHeading();
    cancel();
    document.querySelector('main')!.append(document.createElement('h1'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('restoreScrollPosition', () => {
  function layout(height: number) {
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  }

  it('scrolls straight to a position the page is already tall enough for', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    layout(3000);
    restoreScrollPosition(1200);
    expect(scrollTo).toHaveBeenCalledWith(0, 1200);
  });

  it('keeps trying while the content grows and stops once it reaches the position', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mount('<main></main>');
    layout(900);
    restoreScrollPosition(1200);
    layout(2500);
    document.querySelector('main')!.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(0);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 1200);
    const calls = scrollTo.mock.calls.length;
    document.querySelector('main')!.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(0);
    expect(scrollTo.mock.calls.length).toBe(calls);
  });

  it('stops when the person scrolls on their own', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mount('<main></main>');
    layout(900);
    restoreScrollPosition(1200);
    const calls = scrollTo.mock.calls.length;
    window.dispatchEvent(new WheelEvent('wheel'));
    layout(2500);
    document.querySelector('main')!.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(0);
    expect(scrollTo.mock.calls.length).toBe(calls);
  });
});
