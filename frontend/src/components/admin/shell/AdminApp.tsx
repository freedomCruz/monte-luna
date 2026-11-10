import * as React from 'react';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { focusRouteHeading } from '../../../lib/admin/route-focus';
import { adminDocumentTitle, resolveAdminRoute } from '../../../lib/admin/routes';
import { DiscardChangesDialog } from '../shared/DiscardChangesDialog';
import { UnsavedChangesContext } from '../shared/unsaved-changes';
import { ADMIN_VIEWS, preloadAdminView, preloadAdminViews } from './admin-views';
import { AdminNavigationContext, useAdminRouter } from './admin-router';
import { AdminShell } from './AdminShell';
import { AdminContentSkeleton } from './AdminSessionSkeleton';

/** Shown inside the shell while a section's code is fetched; the section then draws its own loading state. */
function SectionFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando sección" className="flex flex-1 flex-col">
      <span className="sr-only">Cargando…</span>
      <AdminContentSkeleton />
    </div>
  );
}

/**
 * Fetches the code of every section once the browser is idle. It renders inside the shell, so it
 * only mounts after the backend confirmed the session; `done` keeps it to one run per app mount
 * when the shell swaps its content for a message and back.
 */
function PrefetchSections({ done }: { done: React.MutableRefObject<boolean> }) {
  React.useEffect(() => {
    if (done.current) return;
    const run = () => {
      done.current = true;
      preloadAdminViews();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(run, 200);
    return () => window.clearTimeout(handle);
  }, [done]);
  return null;
}

/**
 * The protected admin app: every private page mounts it with `client:load`. It reads the address
 * on a document load, owns the one AdminShell and renders the section the address names inside
 * it. Links between admin sections then navigate on the History API: the shell, its session and
 * its badge counts stay mounted and only the section swaps. Nothing private is prerendered: the
 * shell shows the session skeleton until the backend confirms the session.
 */
export function AdminApp() {
  const router = useAdminRouter();
  const { location } = router;
  const route = resolveAdminRoute(location.path);
  const [announcement, setAnnouncement] = React.useState('');
  const sectionsPrefetched = React.useRef(false);

  React.useEffect(() => {
    if (route) preloadAdminView(route.view);
    else if (location.path !== '') window.location.replace(ADMIN_ROUTES.home);
  }, [route, location.path]);

  // A client navigation has to do by hand what a document load does: title, announcement, focus.
  React.useEffect(() => {
    if (location.via === 'load' || !route) return;
    const title = adminDocumentTitle(route);
    document.title = title;
    setAnnouncement(title);
    return focusRouteHeading();
  }, [location, route]);

  const View = route ? ADMIN_VIEWS[route.view] : null;
  return (
    <AdminNavigationContext.Provider value={router.navigate}>
      <UnsavedChangesContext.Provider value={router.registerBlocker}>
        <AdminShell active={route?.active} requiredRole={route?.requiredRole} desktopOnly={route?.desktopOnly} revalidateKey={location.key}>
          <PrefetchSections done={sectionsPrefetched} />
          {View && <React.Suspense fallback={<SectionFallback />}><View key={location.key} /></React.Suspense>}
        </AdminShell>
        {router.confirmation && <DiscardChangesDialog title={router.confirmation.title} onContinue={router.confirmation.stay} onDiscard={router.confirmation.leave} />}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      </UnsavedChangesContext.Provider>
    </AdminNavigationContext.Provider>
  );
}
