import { AdminShell } from '../shell/AdminShell';

// Landing of /admin/. F4 replaces this body with the A-Inicio dashboard; the shell,
// session guard and navigation are already final.
export function AdminHomePage() {
  return (
    <AdminShell active="home">
      <main className="flex flex-1 flex-col gap-4 px-4 py-[18px] min-[768px]:px-6 min-[1440px]:px-8">
        <h1 className="m-0 text-[26px] font-extrabold leading-[1.1] min-[768px]:text-[28px]">Inicio</h1>
      </main>
    </AdminShell>
  );
}
