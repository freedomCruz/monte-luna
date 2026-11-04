import * as React from 'react';
import { cn } from '../../lib/shared/utils';
import type { StatusTone } from '../../lib/admin/order-status';

// Admin status badge (admin.md "Status badges"): 8 px radius, a dot and the state
// name. The tone sets the colours; the text always carries the meaning. `md` is the
// 26 px table badge of the A-Pedidos canvas; `sm` is the 24 px card badge.
const TONES: Record<StatusTone, string> = {
  action: 'bg-brand-yellow text-foreground',
  progress: 'bg-brand-green text-background',
  done: 'bg-success text-card',
  neutral: 'bg-secondary text-foreground',
  problem: 'bg-destructive text-card',
};

const SIZES = {
  sm: { badge: 'h-6 gap-[5px] px-2 text-xs', dot: 'size-1.5' },
  md: { badge: 'h-[26px] gap-1.5 px-2.5 text-[13px]', dot: 'size-[7px]' },
} as const;

export function StatusBadge({ tone, size = 'sm', className, children }: { tone: StatusTone; size?: keyof typeof SIZES; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-sm font-bold', SIZES[size].badge, TONES[tone], className)}>
      <span aria-hidden="true" className={cn('rounded-full bg-current', SIZES[size].dot)} />
      {children}
    </span>
  );
}
