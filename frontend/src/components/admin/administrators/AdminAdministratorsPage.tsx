import { AdminShell } from '../shell/AdminShell';
import { AdministratorsView } from './AdministratorsView';

export function AdminAdministratorsPage() {
  return (
    <AdminShell requiredRole="owner" active="admins" desktopOnly>
      <AdministratorsView />
    </AdminShell>
  );
}
