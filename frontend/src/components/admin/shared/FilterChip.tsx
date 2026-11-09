import * as React from 'react';
import { Popover } from 'radix-ui';

// Filter chip, check list and tokens shared by the admin list toolbars (A-Pedidos, A-Productos).

export const CHEVRON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
export const CROSS = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

export const CHIP = 'inline-flex h-11 items-center rounded-sm border text-sm font-bold';
export const CHIP_OFF = 'border-muted-foreground bg-card text-foreground';
export const CHIP_ON = 'border-brand-green bg-brand-green text-background';
export const CHIP_BUTTON = 'inline-flex h-full cursor-pointer items-center gap-2 border-0 bg-transparent font-sans text-sm font-bold text-inherit';
export const CLEAR_BOX = 'mr-[7px] inline-flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[rgba(250,243,227,0.16)] text-inherit';

/**
 * A filter chip that opens a menu (A-Pedidos canvas). While active it is green and
 * carries a separate control that removes the filter.
 */
export function FilterChip({ label, active, onClear, clearLabel, open, onOpenChange, children }: {
  label: string;
  active: boolean;
  onClear?: () => void;
  clearLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <span className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}>
        <Popover.Trigger asChild>
          <button type="button" className={`${CHIP_BUTTON} pl-3.5 ${active && onClear ? 'pr-2' : 'pr-3.5'}`}>{label}{!(active && onClear) && CHEVRON}</button>
        </Popover.Trigger>
        {active && onClear && <button type="button" aria-label={clearLabel} onClick={onClear} className={CLEAR_BOX}>{CROSS}</button>}
      </span>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 flex w-64 flex-col rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const OPTION = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2.5 text-[15px] hover:bg-secondary';
export const INPUT = 'size-5 shrink-0 cursor-pointer accent-brand-green';

export function CheckList<T extends string>({ values, selected, labelOf, onToggle }: { values: T[]; selected: T[]; labelOf: (value: T) => string; onToggle: (next: T[]) => void }) {
  return (
    <>
      {values.map((value) => (
        <label key={value} className={OPTION}>
          <input
            type="checkbox"
            className={INPUT}
            checked={selected.includes(value)}
            onChange={(event) => onToggle(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
          />
          {labelOf(value)}
        </label>
      ))}
    </>
  );
}

export function summary(prefix: string, labels: string[]): string {
  return labels.length <= 1 ? `${prefix}: ${labels[0]}` : `${prefix}: ${labels[0]} +${labels.length - 1}`;
}

