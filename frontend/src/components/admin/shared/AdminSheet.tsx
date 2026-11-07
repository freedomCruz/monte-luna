import * as React from 'react';
import { Dialog } from 'radix-ui';

interface AdminSheetProps {
  /** Small caps line above the title (A-Pedido: order and destination; A-Productos: "Vista rápida"). */
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** Gap of the scrolling body; the orders sheet uses 16 px, the products quick view 18 px. */
  bodyGap?: string;
}

/** Admin Sheet: 520 px over the page from 1024 px, full screen below (admin.md layout rules). */
export function AdminSheet({ kicker, title, onClose, children, footer, bodyGap = 'gap-4' }: AdminSheetProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card min-[1024px]:w-[520px] min-[1024px]:rounded-l-xl">
          <div className="flex items-start justify-between gap-3 px-6 py-5">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-condensed text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-muted-foreground">{kicker}</span>
              <Dialog.Title className="m-0 text-2xl font-extrabold leading-[1.1]">{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Cerrar" className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-secondary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </Dialog.Close>
          </div>
          <div className={`flex flex-1 flex-col overflow-y-auto px-6 pb-5 ${bodyGap}`}>{children}</div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3.5">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
