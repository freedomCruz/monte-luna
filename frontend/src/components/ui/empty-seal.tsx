// Yellow brand seal of the admin empty states (admin.md: the seal appears only on the
// sign-in screen and empty states). Three short lines: kicker, headline word, kicker.
export function EmptySeal({ top, middle, bottom }: { top: string; middle: string; bottom: string }) {
  return (
    <span aria-hidden="true" className="flex size-[136px] -rotate-[8deg] flex-col items-center justify-center rounded-full bg-brand-yellow text-foreground outline-2 -outline-offset-[10px] outline-dashed outline-foreground">
      <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.12em]">{top}</span>
      <span className="text-[30px] font-extrabold leading-[0.95]">{middle}</span>
      <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.12em]">{bottom}</span>
    </span>
  );
}
