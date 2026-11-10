/** Title-line widths of the A-Sistema "Cargando" skeleton rows (A-Sistema.dc.html, `esqueleto`). */
const ROW_WIDTHS = ['70%', '55%', '82%', '62%', '48%'];
const SIDEBAR_ITEMS = 5;
const PHONE_BAR_ITEMS = 3;

const ON_DARK = 'bg-primary-foreground/15';
// The rail is the darkest surface, so its placeholders need more weight than the phone header and bar to read.
const ON_DARK_SIDEBAR = 'bg-primary-foreground/25';

/** Content rows of the A-Sistema "Cargando" skeleton, also shown while a section's code loads. */
export function AdminContentSkeleton() {
  return (
    <div data-skeleton="content" aria-hidden="true" className="flex flex-1 flex-col gap-3 px-4 pb-[104px] pt-[18px] min-[391px]:gap-4 min-[391px]:px-5 min-[391px]:pb-12 min-[391px]:pt-7 min-[1024px]:px-6 min-[1440px]:px-8">
      <span className="h-[30px] w-48 rounded-sm bg-border motion-safe:animate-pulse min-[391px]:h-9" />
      <div className="flex flex-col rounded-md border border-border bg-card p-[18px]">
        <div className="h-11 rounded-sm bg-secondary motion-safe:animate-pulse" />
        {ROW_WIDTHS.map((width, index) => (
          <div key={index} className="flex h-[60px] items-center gap-2.5 border-t border-border motion-safe:animate-pulse">
            <span className="size-9 shrink-0 rounded-sm bg-secondary" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-2.5 rounded-[4px] bg-border" style={{ width }} />
              <span className="h-2 w-[40%] rounded-[4px] bg-secondary" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Shows the admin's shape while the session check runs: sidebar, top bar and content rows in the
 * ShellFrame proportions (248 px sidebar from 1440, 72 px rail from 391, the phone header and
 * bottom bar at 390 and below). The menu depends on the role and nothing is confirmed yet, so it
 * draws no section names, labels or data and renders no links, landmarks or children.
 */
export function AdminSessionSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Comprobando tu sesión" className="min-h-screen bg-background text-foreground min-[391px]:flex">
      <span className="sr-only">Comprobando tu sesión…</span>

      <div data-skeleton="sidebar" aria-hidden="true" className="surface-dark hidden w-[72px] shrink-0 flex-col bg-primary px-3.5 py-4 min-[391px]:flex min-[1440px]:w-[248px] min-[1440px]:px-3">
        <div className="flex flex-col gap-0.5 motion-safe:animate-pulse">
          <div className="flex min-h-11 items-center justify-center px-1.5 pb-2.5 min-[1440px]:justify-start">
            <span className={`h-[26px] w-7 rounded-[4px] min-[1440px]:w-[132px] ${ON_DARK_SIDEBAR}`} />
          </div>
          {Array.from({ length: SIDEBAR_ITEMS }, (_, index) => (
            <div key={index} className="flex min-h-10 items-center justify-center gap-3 px-2.5 min-[1440px]:justify-start">
              <span className={`size-5 shrink-0 rounded-[4px] ${ON_DARK_SIDEBAR}`} />
              <span className={`hidden h-[11px] flex-1 rounded-[4px] min-[1440px]:block ${ON_DARK_SIDEBAR}`} style={{ maxWidth: ROW_WIDTHS[index % ROW_WIDTHS.length] }} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div data-skeleton="topbar" aria-hidden="true" className="surface-dark sticky top-0 z-40 flex min-h-[60px] items-center justify-between gap-2 bg-primary px-4 min-[391px]:static min-[391px]:min-h-16 min-[391px]:justify-end min-[391px]:border-b min-[391px]:border-border min-[391px]:bg-card min-[391px]:px-5 min-[1024px]:px-6 min-[1440px]:px-8">
          <span className={`h-6 w-[120px] rounded-[4px] motion-safe:animate-pulse min-[391px]:hidden ${ON_DARK}`} />
          <span className="flex items-center gap-2.5 py-1 pl-1 pr-1.5 motion-safe:animate-pulse">
            <span className={`size-9 rounded-full min-[391px]:bg-secondary ${ON_DARK}`} />
            <span className="hidden flex-col gap-1.5 min-[768px]:flex">
              <span className="h-[11px] w-24 rounded-[4px] bg-border" />
              <span className="h-[9px] w-14 rounded-[4px] bg-secondary" />
            </span>
          </span>
        </div>

        <AdminContentSkeleton />

        <div data-skeleton="phone-bar" aria-hidden="true" className="surface-dark sticky bottom-0 z-40 grid grid-cols-3 gap-1 bg-primary px-2 pb-2.5 pt-1.5 min-[391px]:hidden">
          {Array.from({ length: PHONE_BAR_ITEMS }, (_, index) => (
            <span key={index} className="flex min-h-[52px] flex-col items-center justify-center gap-1.5 motion-safe:animate-pulse">
              <span className={`size-5 rounded-[4px] ${ON_DARK}`} />
              <span className={`h-2 w-10 rounded-[4px] ${ON_DARK}`} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
