import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsavedChangesContext, useUnsavedChangesGuard } from './unsaved-changes';

function Screen({ dirty, title = 'Café de origen' }: { dirty: boolean; title?: string }) {
  useUnsavedChangesGuard(dirty, title);
  return <p>Pantalla</p>;
}

afterEach(cleanup);

describe('useUnsavedChangesGuard (admin-navigation-v1 T3: S2/L4)', () => {
  it('registers a blocker with the screen title while the screen has unsaved changes and releases it when clean', () => {
    const release = vi.fn();
    const register = vi.fn(() => release);
    const { rerender } = render(<UnsavedChangesContext.Provider value={register}><Screen dirty={false} /></UnsavedChangesContext.Provider>);
    expect(register).not.toHaveBeenCalled();

    rerender(<UnsavedChangesContext.Provider value={register}><Screen dirty /></UnsavedChangesContext.Provider>);
    expect(register).toHaveBeenCalledWith({ title: 'Café de origen' });
    expect(release).not.toHaveBeenCalled();

    rerender(<UnsavedChangesContext.Provider value={register}><Screen dirty={false} /></UnsavedChangesContext.Provider>);
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the blocker when the screen unmounts', () => {
    const release = vi.fn();
    const { unmount } = render(<UnsavedChangesContext.Provider value={() => release}><Screen dirty /></UnsavedChangesContext.Provider>);
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it('asks the browser to confirm a real document unload only while dirty', () => {
    const { rerender } = render(<Screen dirty />);
    const dirtyUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    rerender(<Screen dirty={false} />);
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it('works without a router: no provider means no blocker, only the unload warning', () => {
    expect(() => render(<Screen dirty />)).not.toThrow();
  });
});
