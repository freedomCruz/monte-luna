import * as React from 'react';
import { resolveAdminRoute } from '../../../lib/admin/routes';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { ADMIN_VIEWS, preloadAdminView } from './admin-views';
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
 * once, owns the one AdminShell and renders the section the address names inside it. Nothing
 * private is prerendered: the shell shows the session skeleton until the backend confirms the
 * session.
 */
export function AdminApp() {
  const [path] = React.useState(() => (typeof window === 'undefined' ? null : window.location.pathname));
  const route = path === null ? null : resolveAdminRoute(path);

  React.useEffect(() => {
    if (route) preloadAdminView(route.view);
    else if (path !== null) window.location.replace(ADMIN_ROUTES.home);
  }, [route, path]);

  const View = route ? ADMIN_VIEWS[route.view] : null;
  return (
    <AdminShell active={route?.active} requiredRole={route?.requiredRole} desktopOnly={route?.desktopOnly}>
      {View && <React.Suspense fallback={<SectionFallback />}><View /></React.Suspense>}
    </AdminShell>
  );
}
