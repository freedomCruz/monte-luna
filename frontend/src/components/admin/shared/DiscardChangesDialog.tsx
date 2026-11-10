import { AlertDialog } from 'radix-ui';

const OUTLINE_BUTTON = 'h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-4 font-sans text-[15px] font-bold text-foreground disabled:opacity-60';
const RED_BUTTON = 'h-11 cursor-pointer rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60';

interface DiscardChangesDialogProps {
  /** Name of the record whose edits would be lost. */
  title: string;
  /** "Seguir editando": stay where the edits are. Also runs on Escape. */
  onContinue: () => void;
  /** "Salir sin guardar": leave and lose the edits. */
  onDiscard: () => void;
}

/** "¿Salir sin guardar?" (A-Sistema): confirms leaving a screen that holds unsaved edits. */
export function DiscardChangesDialog({ title, onContinue, onDiscard }: DiscardChangesDialogProps) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => { if (!open) onContinue(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-foreground/50" />
        <AlertDialog.Content className="fixed left-1/2 top-[20vh] z-[60] flex w-[calc(100%-32px)] max-w-[500px] -translate-x-1/2 flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <AlertDialog.Title className="m-0 text-xl font-extrabold">¿Salir sin guardar?</AlertDialog.Title>
          <AlertDialog.Description className="m-0 text-[15px] leading-[1.5] text-muted-foreground">Perderás los cambios que hiciste en {title}.</AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <AlertDialog.Cancel asChild><button type="button" className={OUTLINE_BUTTON}>Seguir editando</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button type="button" onClick={onDiscard} className={RED_BUTTON}>Salir sin guardar</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
