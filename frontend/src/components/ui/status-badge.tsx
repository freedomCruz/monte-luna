import * as React from 'react';
import { cn } from '../../lib/shared/utils';
import type { StatusTone } from '../../lib/admin/order-status';

// Admin status badge (admin.md "Status badges"): 24 px high, 8 px radius, a dot and the
// state name. The tone sets the colours; the text always carries the meaning.
const TONES: Record<StatusTone, string> = {
  action: 'bg-brand-yellow text-foreground',
  progress: 'bg-brand-green text-background',
  done: 'bg-success text-card',
  neutral: 'bg-secondary text-foreground',
  problem: 'bg-destructive text-card',
};

export function StatusBadge({ tone, className, children }: { tone: StatusTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-[5px] whitespace-nowrap rounded-sm px-2 text-xs font-bold', TONES[tone], className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
