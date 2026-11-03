import { AdminShell } from '../shell/AdminShell';
import { InicioView } from './InicioView';

/**
 * Landing of /admin/ (A-Inicio canvas). Mounted with client:load in src/pages/admin/index.astro.
 */
export function AdminHomePage() {
  return (
    <AdminShell active="home">
      <InicioView />
    </AdminShell>
  );
}
