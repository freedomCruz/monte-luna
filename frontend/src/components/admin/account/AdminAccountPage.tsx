import { AdminShell } from '../shell/AdminShell';
import { AccountView } from './AccountView';

export function AdminAccountPage() {
  return (
    <AdminShell desktopOnly>
      <AccountView />
    </AdminShell>
  );
}
