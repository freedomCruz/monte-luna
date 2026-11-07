import { AdminShell } from '../shell/AdminShell';

// Placeholder until F3 delivers the screen; the shell, session check and tablet-and-up gate already apply.
export function AdminProductPage() {
  return (
    <AdminShell active="products" desktopOnly="catalog">
      <main className="flex-1 px-5 py-6 min-[1024px]:px-6 min-[1440px]:px-8">
        <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">Producto</h1>
      </main>
    </AdminShell>
  );
}
