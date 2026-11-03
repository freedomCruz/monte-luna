import * as React from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  getCurrentAdmin,
  logout,
  type AdminResult,
  type AdminRole,
  type AdminUser,
} from '../../../lib/admin/client';
import { listAdminOrders } from '../../../lib/admin/orders';
import {
  ADMIN_ROUTES,
  initialsOf,
  navigationFor,
  roleLabel,
  type AdminNavKey,
} from '../../../lib/admin/navigation';

interface AdminSession {
  user: AdminUser;
  etag: string | null;
}

const AdminSessionContext = React.createContext<AdminSession | null>(null);
const PendingDispatchContext = React.createContext<(count: number) => void>(() => {});

/** Mobile header of a detail screen (A-Pedido-390): a back link and the record title. */
export interface MobileDetailHeader {
  title: string;
  backHref: string;
  backLabel: string;
}
const MobileDetailContext = React.createContext<(detail: MobileDetailHeader | null) => void>(() => {});

/**
 * At 390 px a detail screen replaces the shell header with a back link and its title
 * and hides the section bar, which its own sticky action bar takes over.
 */
export function useMobileDetailHeader(detail: MobileDetailHeader | null): void {
  const set = React.useContext(MobileDetailContext);
  const title = detail?.title;
  const backHref = detail?.backHref;
  const backLabel = detail?.backLabel;
  React.useEffect(() => {
    set(title && backHref && backLabel ? { title, backHref, backLabel } : null);
    return () => set(null);
  }, [set, title, backHref, backLabel]);
}

export function useAdminSession(): AdminSession {
  const session = React.useContext(AdminSessionContext);
  if (!session) throw new Error('useAdminSession must be used inside an authenticated AdminShell');
  return session;
}

/**
 * Lets a screen that already loaded `pending_dispatch_count` (Pedidos, Pedido, Inicio)
 * refresh the sidebar and mobile badges without another request.
 */
export function useReportPendingDispatchCount(): (count: number) => void {
  return React.useContext(PendingDispatchContext);
}

export function sessionDestination(result: AdminResult<AdminUser>): string | null {
  if (result.ok) return null;
  if (result.status === 401) return ADMIN_ROUTES.signIn;
  if (result.status === 403) return '/admin/sin-acceso/';
  return null;
}

interface AdminShellProps {
  children: React.ReactNode;
  active?: AdminNavKey;
  requiredRole?: AdminRole;
  /** Settings are read-only at 390 px per the approved admin responsive rules. */
  desktopOnly?: boolean;
}

function AdminIcon({ kind }: { kind: AdminNavKey | 'account' }) {
  if (kind === 'home') return <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
  if (kind === 'orders') return <path d="M6 7h12l-1 14H7zM9 7a3 3 0 0 1 6 0" />;
  if (kind === 'admins') {
    return <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a6 6 0 0 0-4-5.7" />;
  }
  return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
}

function IconFrame({ kind }: { kind: AdminNavKey | 'account' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <AdminIcon kind={kind} />
    </svg>
  );
}

export function NoAccessScreen({ section = 'esta sección' }: { section?: string }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-16 min-[768px]:px-8 min-[768px]:py-24">
      <div className="flex w-full max-w-[520px] flex-col items-center gap-3.5 rounded-xl border border-border bg-card px-8 py-10 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-secondary">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <h1 className="m-0 text-[28px] font-extrabold leading-[1.1]">No tienes acceso a esta sección</h1>
        <p className="m-0 text-base leading-6 text-muted-foreground">El enlace lleva a {section}, que solo puede ver la persona propietaria de la tienda. Si necesitas algo de aquí, pídeselo.</p>
        <a href={ADMIN_ROUTES.account} className="mt-1.5 inline-flex min-h-11 items-center rounded-sm bg-primary px-[18px] font-bold text-primary-foreground no-underline">Ir a mi cuenta</a>
      </div>
    </main>
  );
}

function UserMenu({ user, onSignOut }: { user: AdminUser; onSignOut: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={`Menú de ${user.display_name}`} className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm border-0 bg-transparent py-0 pl-1 pr-1.5 font-sans text-foreground hover:bg-secondary">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-purple text-sm font-extrabold text-primary-foreground">{initialsOf(user.display_name)}</span>
          <span className="hidden flex-col items-start leading-[1.15] min-[768px]:flex"><span className="text-sm font-bold">{user.display_name}</span><span className="text-xs text-muted-foreground">{roleLabel(user.role)}</span></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-60 rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
          <div className="flex flex-col border-b border-border px-2.5 pb-2.5 pt-2"><span className="text-[15px] font-extrabold">{user.display_name}</span><span className="text-[13px] text-muted-foreground">{user.email} · {roleLabel(user.role)}</span></div>
          <DropdownMenu.Item asChild><a href={ADMIN_ROUTES.account} className="mt-1 flex min-h-10 items-center rounded-sm px-2.5 text-[15px] outline-none data-[highlighted]:bg-secondary">Mi cuenta</a></DropdownMenu.Item>
          <DropdownMenu.Item onSelect={onSignOut} className="flex min-h-10 cursor-pointer items-center rounded-sm px-2.5 text-[15px] font-bold outline-none data-[highlighted]:bg-secondary">Cerrar sesión</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileLink({ href, current, icon, children }: { href: string; current: boolean; icon: AdminNavKey | 'account'; children: React.ReactNode }) {
  return <a href={href} aria-current={current ? 'page' : undefined} className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-sm text-xs no-underline ${current ? 'bg-brand-yellow font-extrabold text-foreground' : 'font-bold text-primary-foreground'}`}><IconFrame kind={icon} />{children}</a>;
}

function ShellFrame({ session, active, children, forbidden, desktopOnly, pendingDispatchCount, mobileDetail }: { session: AdminSession; active?: AdminNavKey; children: React.ReactNode; forbidden: boolean; desktopOnly: boolean; pendingDispatchCount: number | null; mobileDetail: MobileDetailHeader | null }) {
  const [expanded, setExpanded] = React.useState(() => typeof window !== 'undefined' && window.innerWidth >= 1440);
  const [mobile, setMobile] = React.useState(() => typeof window !== 'undefined' && window.innerWidth <= 390);
  React.useEffect(() => {
    const update = () => setMobile(window.innerWidth <= 390);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const groups = navigationFor(session.user.role, { pendingDispatchCount });
  const items = groups.flatMap((group) => group.items);
  const sectionItems = items.filter((item) => item.key !== 'admins');
  const adminsItem = items.find((item) => item.key === 'admins');
  const signOut = React.useCallback(async () => {
    await logout();
    window.location.assign(ADMIN_ROUTES.signIn);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground min-[391px]:flex">
      <nav aria-label="Secciones del panel" className={`surface-dark hidden shrink-0 flex-col gap-0.5 bg-primary px-3 py-4 text-primary-foreground min-[391px]:flex ${expanded ? 'w-[248px]' : 'w-[72px] px-3.5'}`}>
        <a href={ADMIN_ROUTES.home} aria-label="Monteluna Admin, inicio" className={`flex min-h-11 items-center gap-2 px-1.5 pb-2.5 text-primary-foreground no-underline ${expanded ? 'justify-start' : 'justify-center'}`}>
          <span className="font-condensed text-[26px] font-extrabold uppercase leading-none text-brand-yellow">{expanded ? 'Monteluna' : 'M'}</span>
          {expanded && <span className="rounded-[6px] bg-brand-yellow px-1.5 py-0.5 font-condensed text-xs font-bold uppercase tracking-[0.08em] text-foreground">Admin</span>}
        </a>
        {groups.map((group) => <React.Fragment key={group.label}>
          {group.label === '' ? null : expanded ? <span className="px-2.5 pb-1 pt-3 font-condensed text-xs font-bold uppercase tracking-[0.1em] text-[#A8997C]">{group.label}</span> : <span aria-hidden="true" className="mx-auto my-2 h-px w-7 bg-[rgba(250,243,227,0.2)]" />}
          {group.items.map((item) => {
            const current = item.key === active;
            return <a key={item.key} href={item.href} aria-current={current ? 'page' : undefined} aria-label={item.count ? `${item.title}, ${item.count} pendientes` : item.title} title={item.title} className={`relative flex min-h-10 items-center gap-3 rounded-sm px-2.5 text-[15px] font-semibold no-underline ${expanded ? 'justify-start' : 'justify-center'} ${current ? 'bg-brand-yellow font-extrabold text-foreground' : 'text-primary-foreground'}`}><IconFrame kind={item.key} />{expanded && <span className="flex-1">{item.title}</span>}{item.count ? expanded ? <span aria-hidden="true" className="box-border min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-extrabold leading-5 text-white">{item.count}</span> : <span aria-hidden="true" className="absolute right-2.5 top-1.5 size-2 rounded-full bg-accent outline outline-2 outline-primary" /> : null}</a>;
          })}
        </React.Fragment>)}
        <span className="flex-1" />
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Colapsar menú' : 'Expandir menú'} className={`mt-3 flex min-h-11 items-center gap-3 border-0 border-t border-solid border-[rgba(250,243,227,0.16)] bg-transparent px-2.5 font-sans text-sm font-semibold text-[#E9DDC3] ${expanded ? 'justify-start' : 'justify-center'}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={expanded ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>{expanded && <span>Colapsar menú</span>}
        </button>
      </nav>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="surface-dark sticky top-0 z-40 flex min-h-[60px] items-center justify-between gap-2 bg-primary px-4 text-primary-foreground min-[391px]:static min-[391px]:min-h-16 min-[391px]:justify-end min-[391px]:border-b min-[391px]:border-border min-[391px]:bg-card min-[391px]:px-5 min-[391px]:text-foreground min-[1024px]:px-6 min-[1440px]:px-8">
          {mobileDetail && <span className="flex items-center gap-2 min-[391px]:hidden">
            <a href={mobileDetail.backHref} aria-label={mobileDetail.backLabel} className="inline-flex size-11 items-center justify-center rounded-sm text-primary-foreground"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></a>
            <span className="font-condensed text-[22px] font-extrabold tracking-[0.02em]">{mobileDetail.title}</span>
          </span>}
          <a href={ADMIN_ROUTES.home} className={`flex items-center gap-2 text-primary-foreground no-underline min-[391px]:hidden ${mobileDetail ? 'hidden' : ''}`}><span className="font-condensed text-2xl font-extrabold uppercase leading-none text-brand-yellow">Monteluna</span><span className="rounded-[6px] bg-brand-yellow px-1.5 py-0.5 font-condensed text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">Admin</span></a>
          <span className={mobileDetail ? 'hidden min-[391px]:inline' : ''}><UserMenu user={session.user} onSignOut={signOut} /></span>
        </header>
        {forbidden ? <NoAccessScreen section="Administradores" /> : desktopOnly && mobile ? (
          <main className="flex flex-1 items-start justify-center px-4 py-12">
            <div className="flex max-w-md flex-col items-center gap-3 rounded-xl bg-secondary p-6 text-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
              <h1 className="m-0 text-xl font-extrabold">Revísalo desde un computador o una tablet</h1>
              <p className="m-0 text-sm leading-5 text-muted-foreground">En el celular el panel es de consulta. La cuenta y la configuración se administran en una pantalla más grande.</p>
            </div>
          </main>
        ) : <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>}
        {!mobileDetail && <nav aria-label="Secciones" className="surface-dark sticky bottom-0 z-40 grid bg-primary px-2 pb-2.5 pt-1.5 min-[391px]:hidden" style={{ gridTemplateColumns: `repeat(${sectionItems.length + 1 + (adminsItem ? 1 : 0)}, minmax(0, 1fr))` }}>
          {sectionItems.map((item) => <MobileLink key={item.key} href={item.href} current={active === item.key} icon={item.key}>{item.count ? `${item.title} · ${item.count}` : item.title}</MobileLink>)}
          <MobileLink href={ADMIN_ROUTES.account} current={false} icon="account">Cuenta</MobileLink>
          {adminsItem && <MobileLink href={adminsItem.href} current={active === 'admins'} icon="admins">{adminsItem.title}</MobileLink>}
        </nav>}
      </div>
    </div>
  );
}

export function AdminShell({ children, active, requiredRole, desktopOnly = false }: AdminShellProps) {
  const [session, setSession] = React.useState<AdminSession | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [pendingDispatchCount, setPendingDispatchCount] = React.useState<number | null>(null);
  const loaded = Boolean(session);
  const [mobileDetail, setMobileDetail] = React.useState<MobileDetailHeader | null>(null);

  React.useEffect(() => {
    let live = true;
    setFailed(false);
    void getCurrentAdmin().then((result) => {
      if (!live) return;
      if (result.ok) {
        setSession({ user: result.data, etag: result.etag });
        return;
      }
      const destination = sessionDestination(result);
      if (destination) window.location.assign(destination);
      else setFailed(true);
    });
    return () => { live = false; };
  }, [attempt]);

  // The sidebar badge comes from the list endpoint's global count; a screen that has
  // already read it reports it through useReportPendingDispatchCount instead.
  React.useEffect(() => {
    if (!loaded) return;
    let live = true;
    void listAdminOrders({ pending_dispatch: true, date_filter: 'all', limit: 25 }).then((result) => {
      if (live && result.ok) setPendingDispatchCount((current) => current ?? result.data.pending_dispatch_count);
    });
    return () => { live = false; };
  }, [loaded]);

  if (failed) return <div className="flex min-h-screen items-center justify-center bg-background p-4"><div role="alert" className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center"><p className="m-0 text-lg font-bold">No pudimos comprobar tu sesión.</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 rounded-sm border-0 bg-primary px-4 font-sans font-bold text-primary-foreground">Reintentar</button></div></div>;
  if (!session) return <div className="flex min-h-screen items-center justify-center bg-background"><p role="status" className="font-bold text-muted-foreground">Comprobando tu sesión…</p></div>;

  return <PendingDispatchContext.Provider value={setPendingDispatchCount}><MobileDetailContext.Provider value={setMobileDetail}><ShellFrame session={session} active={active} forbidden={requiredRole !== undefined && session.user.role !== requiredRole} desktopOnly={desktopOnly} pendingDispatchCount={pendingDispatchCount} mobileDetail={mobileDetail}>{children}</ShellFrame></MobileDetailContext.Provider></PendingDispatchContext.Provider>;
}
