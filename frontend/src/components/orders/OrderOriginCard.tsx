import React from 'react';

export interface OrderOriginCardProps {
  title: string;
  originSlug: string;
  department?: string | null;
  farmerStory?: string | null;
}

export function OrderOriginCard({
  title,
  originSlug,
  department,
  farmerStory,
}: OrderOriginCardProps) {
  const departmentLabel = department ? `Origen · ${department}` : 'Origen';
  const storyText =
    farmerStory && !farmerStory.startsWith('[')
      ? farmerStory
      : 'María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m.';

  return (
    <section
      aria-labelledby="h-origen"
      className="relative flex flex-wrap items-center justify-between gap-6 md:gap-12 p-8 md:p-11 bg-brand-green text-primary-foreground rounded-2xl"
    >
      <div className="flex-1 min-w-[280px] flex flex-col items-start gap-3.5">
        <span className="font-condensed text-base md:text-lg font-bold tracking-wider uppercase text-brand-yellow">
          {departmentLabel}
        </span>
        <h2
          id="h-origen"
          className="m-0 font-sans text-3xl md:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight"
        >
          {title}
        </h2>
        <p className="m-0 max-w-[520px] text-base md:text-lg leading-relaxed text-primary-foreground/90">
          {storyText}
        </p>
      </div>

      <a
        href={`/origenes/${originSlug}`}
        className="inline-flex items-center justify-center min-h-[52px] md:min-h-[56px] px-6 md:px-7 rounded-xl bg-card text-foreground font-sans text-sm md:text-base font-bold uppercase tracking-wide hover:bg-card/90 transition-colors"
      >
        Conocer el origen
      </a>
    </section>
  );
}
