import * as React from 'react';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { focusRouteHeading } from '../../../lib/admin/route-focus';
import { adminDocumentTitle, resolveAdminRoute } from '../../../lib/admin/routes';
import { DiscardChangesDialog } from '../shared/DiscardChangesDialog';
import { UnsavedChangesContext } from '../shared/unsaved-changes';
import { ADMIN_VIEWS, preloadAdminView } from './admin-views';
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
          {View && <React.Suspense fallback={<SectionFallback />}><View key={location.key} /></React.Suspense>}
        </AdminShell>
        {router.confirmation && <DiscardChangesDialog title={router.confirmation.title} onContinue={router.confirmation.stay} onDiscard={router.confirmation.leave} />}
        <div aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
      </UnsavedChangesContext.Provider>
    </AdminNavigationContext.Provider>
  );
}
