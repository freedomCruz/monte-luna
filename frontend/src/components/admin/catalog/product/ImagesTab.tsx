import * as React from 'react';
import type { AdminImage } from '../../../../lib/admin/catalog';
import { imageFileError, moveItem } from '../../../../lib/admin/product-form';
import { CARD, FieldError, OUTLINE_BUTTON, RED_BUTTON, SelectBox, fieldClass } from './fields';

export interface VariantChoice {
  id: string;
  label: string;
}

export type UploadOutcome = { ok: true } | { ok: false; status: number; code: string };

interface ImagesTabProps {
  images: AdminImage[];
  onImages: (images: AdminImage[]) => void;
  variants: VariantChoice[];
  /** Uploads one file; the page owns the ETag and refreshes the product on success. */
  onUpload: (file: File, alt: string, variantId: string | null, position: number) => Promise<UploadOutcome>;
  altMissing: boolean;
}

interface Pending {
  key: string;
  file: File;
  previewUrl: string;
  alt: string;
  variantId: string;
  error: string | null;
  uploading: boolean;
}

export const ALT_ERROR = 'Escribe qué muestra la foto para quien no la ve.';

/** Server problem to the message shown on the pending card. */
export function uploadErrorMessage(outcome: { status: number; code: string }): string {
  if (outcome.status === 413 || outcome.code === 'image_too_large') return 'La imagen pesa más de 5 MiB.';
  if (outcome.status === 415 || outcome.code === 'unsupported_image_type') return 'Usa una imagen JPG, PNG o WebP.';
  if (outcome.status === 422) return 'Revisa el texto alternativo y la variante.';
  if (outcome.status === 503 || outcome.code === 'media_unavailable' || outcome.code === 'network_error') return 'No pudimos subir la imagen: el almacenamiento de imágenes no está disponible ahora. Intenta más tarde.';
  if (outcome.status === 412 || outcome.code === 'version_conflict') return 'La imagen no se subió porque el producto cambió. Recarga para ver la versión actual.';
  return 'No pudimos subir la imagen. Intenta de nuevo.';
}

function VariantSelect({ value, variants, onChange }: { value: string; variants: VariantChoice[]; onChange: (value: string) => void }) {
  return (
    <SelectBox value={value} onChange={(event) => onChange(event.target.value)} className="!pl-2.5 !text-sm">
      <option value="">Todas las variantes</option>
      {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
    </SelectBox>
  );
}

function PendingCard({ item, variants, onChange, onRemove, onUpload }: { item: Pending; variants: VariantChoice[]; onChange: (patch: Partial<Pending>) => void; onRemove: () => void; onUpload: () => void }) {
  const altError = item.alt.trim() === '' && item.error === ALT_ERROR;
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-muted-foreground bg-card p-3">
      <div className="relative h-[150px] overflow-hidden rounded-sm bg-secondary"><img src={item.previewUrl} alt="" className="absolute left-1/2 top-2 h-[134px] -translate-x-1/2" /></div>
      <span className="truncate text-[13px] font-bold">{item.file.name}</span>
      {item.error && !altError && <span role="alert" className="text-[13px] font-bold text-destructive">{item.error}</span>}
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-bold">Texto alternativo</span>
          <input type="text" value={item.alt} placeholder="Describe lo que se ve" aria-invalid={altError || undefined} onChange={(event) => onChange({ alt: event.target.value, error: item.error === ALT_ERROR ? null : item.error })} className={`${fieldClass(altError ? ALT_ERROR : undefined)} !text-sm`} />
        </label>
        <FieldError>{altError ? ALT_ERROR : undefined}</FieldError>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-bold">Variante</span>
        <VariantSelect value={item.variantId} variants={variants} onChange={(variantId) => onChange({ variantId })} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onRemove} disabled={item.uploading} className={`${OUTLINE_BUTTON} flex-1`}>Quitar</button>
        <button type="button" onClick={onUpload} disabled={item.uploading} className={`${RED_BUTTON} flex-1`}>{item.uploading ? 'Subiendo…' : 'Subir imagen'}</button>
      </div>
    </div>
  );
}

/** Imágenes tab (A-Producto): upload zone, pending uploads and the ordered image grid. */
export function ImagesTab({ images, onImages, variants, onUpload, altMissing }: ImagesTabProps) {
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dropActive, setDropActive] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => pending.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | File[]) => {
    const added: Pending[] = Array.from(files).map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      alt: '',
      variantId: '',
      error: imageFileError(file),
      uploading: false,
    }));
    setPending((current) => [...current, ...added]);
  };

  const patchPending = (key: string, patch: Partial<Pending>) => setPending((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const removePending = (key: string) => setPending((current) => {
    const gone = current.find((item) => item.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    return current.filter((item) => item.key !== key);
  });

  const upload = async (item: Pending) => {
    const fileError = imageFileError(item.file);
    if (fileError) return patchPending(item.key, { error: fileError });
    if (item.alt.trim() === '') return patchPending(item.key, { error: ALT_ERROR });
    patchPending(item.key, { uploading: true, error: null });
    const outcome = await onUpload(item.file, item.alt.trim(), item.variantId || null, images.length);
    if (outcome.ok) removePending(item.key);
    else patchPending(item.key, { uploading: false, error: uploadErrorMessage(outcome) });
  };

  const editImage = (id: string, patch: Partial<AdminImage>) => onImages(images.map((image) => (image.id === id ? { ...image, ...patch } : image)));
  const move = (from: number, to: number) => onImages(moveItem(images, from, to));

  return (
    <section role="tabpanel" aria-label="Imágenes" className={`${CARD} gap-4 p-6`}>
      <div
        onDragOver={(event) => { if (dragFrom === null) { event.preventDefault(); setDropActive(true); } }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => { if (dragFrom !== null) return; event.preventDefault(); setDropActive(false); addFiles(event.dataTransfer.files); }}
        className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-[color:var(--dashed)] p-[26px] text-center ${dropActive ? 'bg-secondary' : 'bg-background'}`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
        <span className="text-base font-extrabold">Arrastra fotos aquí</span>
        <span className="text-sm text-muted-foreground">JPG, PNG o WebP, de hasta 5 MiB. Producto recortado sobre fondo transparente, como en la tienda.</span>
        <button type="button" onClick={() => input.current?.click()} className={`${OUTLINE_BUTTON} mt-1`}>Elegir archivos</button>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Elegir archivos" className="sr-only" tabIndex={-1} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
      </div>

      {pending.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 min-[768px]:grid-cols-2 min-[1440px]:grid-cols-3">
          {pending.map((item) => <PendingCard key={item.key} item={item} variants={variants} onChange={(patch) => patchPending(item.key, patch)} onRemove={() => removePending(item.key)} onUpload={() => void upload(item)} />)}
        </div>
      )}

      {images.length > 0 && <p className="m-0 text-sm text-muted-foreground">Arrastra para cambiar el orden; la primera es la principal. Con el teclado: enfoca la manija y usa las flechas.</p>}
      <div className="grid grid-cols-2 gap-3.5 min-[1440px]:grid-cols-3">
        {images.map((image, index) => {
          const blank = image.alt_text.trim() === '';
          return (
            <div
              key={image.id}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(event) => { if (dragFrom !== null) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); if (dragFrom !== null && dragFrom !== index) move(dragFrom, index); setDragFrom(null); }}
              onDragEnd={() => setDragFrom(null)}
              className={`flex flex-col gap-2.5 rounded-md bg-card p-3 ${blank && altMissing ? 'border-2 border-destructive' : 'border border-border'}`}
            >
              <div className="relative h-[150px] overflow-hidden rounded-sm bg-secondary">
                <img src={image.url} alt="" className="absolute left-1/2 top-2 h-[142px] -translate-x-1/2" />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Mover imagen ${index + 1}`}
                    onKeyDown={(event) => {
                      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
                      if (step === undefined) return;
                      event.preventDefault();
                      move(index, index + step);
                    }}
                    className="inline-flex size-8 cursor-grab items-center justify-center rounded-[6px] border-0 bg-card"
                  ><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg></button>
                  <span className="rounded-[6px] bg-primary px-2 py-0.5 text-xs font-extrabold text-primary-foreground">{index === 0 ? 'Principal' : index + 1}</span>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold">Texto alternativo</span>
                  <input type="text" value={image.alt_text} placeholder="Describe lo que se ve" aria-invalid={(blank && altMissing) || undefined} onChange={(event) => editImage(image.id, { alt_text: event.target.value })} className={`${fieldClass(blank && altMissing ? ALT_ERROR : undefined)} !text-sm`} />
                </label>
                <FieldError>{blank && altMissing ? ALT_ERROR : undefined}</FieldError>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-bold">Variante</span>
                <VariantSelect value={image.variant_id ?? ''} variants={variants} onChange={(value) => editImage(image.id, { variant_id: value || null })} />
              </label>
            </div>
          );
        })}
      </div>
      {images.length === 0 && pending.length === 0 && <p className="m-0 text-[15px] text-muted-foreground">Este producto todavía no tiene imágenes.</p>}
    </section>
  );
}
