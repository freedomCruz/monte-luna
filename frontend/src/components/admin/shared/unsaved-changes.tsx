import * as React from 'react';

/** A screen with edits that would be lost if the administrator left it. */
export interface UnsavedChangesBlocker {
  /** Name of the record being edited, shown in the "¿Salir sin guardar?" dialog. */
  title: string;
}

/** Registers a blocker with the admin router and returns the function that releases it. */
export type RegisterUnsavedChanges = (blocker: UnsavedChangesBlocker) => () => void;

/** Outside the admin router (tests, isolated screens) nothing is registered. */
export const UnsavedChangesContext = React.createContext<RegisterUnsavedChanges>(() => () => {});

/**
 * Marks the screen as holding unsaved edits while `dirty`. The admin router then asks before it
 * leaves for another section or a browser back/forward, and a real document unload (reload, tab
 * close, a link to an access or storefront page) asks the browser to confirm.
 */
export function useUnsavedChangesGuard(dirty: boolean, title: string): void {
  const register = React.useContext(UnsavedChangesContext);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  React.useEffect(() => {
    if (!dirty) return;
    return register({ title });
  }, [dirty, title, register]);
}
