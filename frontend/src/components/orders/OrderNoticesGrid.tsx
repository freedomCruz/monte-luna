import React from 'react';

export interface OrderNoticeItem {
  marca: string;
  titulo: string;
  texto: string;
}

export interface OrderNoticesGridProps {
  notices: OrderNoticeItem[];
}

export function OrderNoticesGrid({ notices }: OrderNoticesGridProps) {
  if (notices.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {notices.map((a) => (
        <div
          key={a.titulo}
          className="flex items-start gap-3.5 p-5 bg-hero/15 rounded-2xl border border-hero/30 text-foreground"
        >
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-brand-yellow font-condensed text-xl font-extrabold"
          >
            {a.marca}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-base md:text-lg font-extrabold leading-tight">
              {a.titulo}
            </span>
            <span className="text-sm md:text-base leading-relaxed text-muted-foreground">
              {a.texto}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
