import * as React from 'react';
import {
  createAdminProduct,
  createAdminVariant,
  getAdminProduct,
  listAdminCatalogBrands,
  listAdminCatalogCategories,
  listAdminCatalogOrigins,
  listAdminCatalogProductTypes,
  updateAdminProduct,
  updateAdminVariant,
  uploadAdminProductImage,
  type AdminImage,
  type AdminProduct,
} from '../../../../lib/admin/catalog';
import { ADMIN_ROUTES, productDetailHref } from '../../../../lib/admin/navigation';
import { isVersionConflict } from '../../../../lib/admin/orders';
import {
  buildCreateProduct,
  diffImages,
  diffProduct,
  diffVariant,
  emptyProductForm,
  productToForm,
  slugify,
  validateCreate,
  validateVariant,
  variantToCreate,
  variantToForm,
  type CreateErrors,
  type ProductForm,
  type VariantErrors,
  type VariantForm,
} from '../../../../lib/admin/product-form';
import { productStatusPresentation } from '../../../../lib/admin/product-format';
import { activeVariants, storefrontHref, variantPresentation } from '../../../../lib/admin/product-sheet';
import { StatusBadge } from '../../../ui/status-badge';
import { useUnsavedChangesGuard } from '../../shared/unsaved-changes';
import { useAdminNavigate } from '../../shell/admin-router';
import { AttributesTab } from './AttributesTab';
import { GeneralTab, type Taxonomy } from './GeneralTab';
import { ImagesTab, type UploadOutcome } from './ImagesTab';
import { OUTLINE_BUTTON, RED_BUTTON } from './fields';
import { VariantsTab } from './VariantsTab';

type Tab = 'general' | 'attributes' | 'images' | 'variants';
type Load = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready' };
type Notice = 'saved' | 'conflict' | 'failed' | null;

const EMPTY_TAXONOMY: Taxonomy = { types: [], brands: [], origins: [], categories: [] };
const CONFLICT_LINE = 'Alguien más cambió este producto. Recarga para ver la versión actual.';

function productIdFromAddress(): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id');
}

function Toast({ notice, onReload, onDismiss }: { notice: Notice; onReload: () => void; onDismiss: () => void }) {
  if (notice === null) return null;
  if (notice === 'conflict') {
    return (
      <div role="alert" className="fixed bottom-24 right-6 z-30 flex max-w-[420px] items-start gap-3 rounded-md border-2 border-foreground bg-card px-4 py-3.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
        <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-brand-yellow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 16.5v.2" /></svg></span>
        <span className="flex flex-1 flex-col gap-2">
          <span className="text-[15px] font-bold">{CONFLICT_LINE}</span>
          <span className="text-[13px] text-muted-foreground">Tus cambios no se guardaron. Anótalos antes de recargar.</span>
          <button type="button" onClick={onReload} className="h-9 cursor-pointer self-start rounded-sm border-0 bg-primary px-3 font-sans text-sm font-bold text-primary-foreground">Recargar</button>
        </span>
      </div>
    );
  }
  if (notice === 'failed') {
    return <div role="alert" className="fixed bottom-24 right-6 z-30 flex max-w-[420px] items-center gap-3 rounded-md border-2 border-foreground bg-card px-4 py-3.5 text-[15px] font-bold shadow-[0_10px_28px_rgba(27,21,16,0.16)]">No pudimos guardar los cambios. Intenta de nuevo.<button type="button" onClick={onDismiss} aria-label="Cerrar aviso" className="size-8 cursor-pointer rounded-sm border-0 bg-secondary">×</button></div>;
  }
  return (
    <div role="status" className="fixed bottom-24 right-6 z-30 flex items-center gap-3 rounded-md bg-primary px-4 py-3.5 text-primary-foreground shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-success"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
      <span className="text-[15px] font-bold">Producto guardado</span>
    </div>
  );
}

/** Producto (A-Producto): create or edit one product with its variants, prices and images. */
export function ProductView() {
  const productId = React.useMemo(productIdFromAddress, []);
  const creating = productId === null;

  const [load, setLoad] = React.useState<Load>({ status: creating ? 'ready' : 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [product, setProduct] = React.useState<AdminProduct | null>(null);
  const [etag, setEtag] = React.useState<string | null>(null);
  const [taxonomy, setTaxonomy] = React.useState<Taxonomy>(EMPTY_TAXONOMY);
  const [tab, setTab] = React.useState<Tab>('general');
  const [form, setForm] = React.useState<ProductForm>(emptyProductForm);
  const [typeId, setTypeId] = React.useState('');
  const [drafts, setDrafts] = React.useState<Record<string, VariantForm>>({});
  const [imageDraft, setImageDraft] = React.useState<AdminImage[]>([]);
  const [createErrors, setCreateErrors] = React.useState<CreateErrors & { slugConflict?: string }>({});
  const [variantErrors, setVariantErrors] = React.useState<Record<string, VariantErrors>>({});
  const [altMissing, setAltMissing] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [saving, setSaving] = React.useState(false);
  const slugTouched = React.useRef(false);
  const navigate = useAdminNavigate();

  const adopt = React.useCallback((next: AdminProduct, nextEtag: string | null) => {
    setProduct(next);
    setEtag(nextEtag);
    setForm(productToForm(next));
    setDrafts(Object.fromEntries(next.variants.map((variant) => [variant.id, variantToForm(variant)])));
    setImageDraft([...next.images].sort((a, b) => a.position - b.position));
  }, []);

  React.useEffect(() => {
    if (productId === null) return;
    let live = true;
    setLoad({ status: 'loading' });
    void getAdminProduct(productId).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setLoad({ status: result.status === 404 ? 'missing' : 'error' });
        return;
      }
      adopt(result.data, result.etag);
      setVariantErrors({});
      setNotice(null);
      setLoad({ status: 'ready' });
    });
    return () => { live = false; };
  }, [productId, attempt, adopt]);

  React.useEffect(() => {
    let live = true;
    void Promise.all([
      listAdminCatalogProductTypes({ limit: 100 }),
      listAdminCatalogBrands({ limit: 100 }),
      listAdminCatalogOrigins({ limit: 100 }),
      listAdminCatalogCategories({ limit: 100 }),
    ]).then(([types, brands, origins, categories]) => {
      if (!live) return;
      setTaxonomy({
        types: types.ok ? types.data.items : [],
        brands: brands.ok ? brands.data.items : [],
        origins: origins.ok ? origins.data.items : [],
        categories: categories.ok ? categories.data.items : [],
      });
    });
    return () => { live = false; };
  }, []);

  const productType = creating ? (taxonomy.types.find((type) => type.id === typeId) ?? null) : (product?.product_type ?? null);
  const definitions = React.useMemo(() => productType?.attribute_definitions ?? [], [productType]);

  // --- Dirty state ---------------------------------------------------------------
  const productPatch = React.useMemo(() => {
    if (!product) return {};
    const patch = diffProduct(product, form, definitions);
    const images = diffImages(product.images, imageDraft);
    return images ? { ...patch, images } : patch;
  }, [product, form, definitions, imageDraft]);
  const productDirty = Object.keys(productPatch).length > 0;
  const dirtyVariantIds = React.useMemo(() => (product ? product.variants.filter((variant) => Object.keys(diffVariant(variant, drafts[variant.id] ?? variantToForm(variant))).length > 0).map((variant) => variant.id) : []), [product, drafts]);
  const dirty = productDirty || dirtyVariantIds.length > 0;
  // A new product has no original to diff against: it is dirty once anything was typed or chosen.
  const createDirty = creating && (typeId !== '' || JSON.stringify(form) !== JSON.stringify(emptyProductForm()));
  const title = product?.title ?? (form.title.trim() || 'Nuevo producto');

  // Leaving with unsaved edits asks first: the admin router in-app, the browser on a real unload.
  useUnsavedChangesGuard(dirty || createDirty, title);

  React.useEffect(() => {
    if (notice !== 'saved') return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // --- Handlers ------------------------------------------------------------------
  const changeForm = (patch: Partial<ProductForm>) => {
    if ('slug' in patch) slugTouched.current = true;
    setForm((current) => ({ ...current, ...patch }));
    setCreateErrors((current) => ({ ...current, ...('title' in patch ? { title: undefined } : {}), ...('slug' in patch ? { slug: undefined, slugConflict: undefined } : {}) }));
  };
  const typeTitle = (title: string) => { if (creating && !slugTouched.current) setForm((current) => ({ ...current, slug: slugify(title) })); };
  const changeType = (id: string) => { setTypeId(id); setForm((current) => ({ ...current, attributes: {} })); setCreateErrors((current) => ({ ...current, productTypeId: undefined })); };
  const changeAttribute = (key: string, value: string | string[]) => {
    setForm((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
    setCreateErrors((current) => (current.attributes?.[key] ? { ...current, attributes: { ...current.attributes, [key]: '' } } : current));
  };
  const draftVariant = (id: string, patch: Partial<VariantForm>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setVariantErrors((current) => (current[id] ? { ...current, [id]: {} } : current));
  };

  const reload = () => setAttempt((value) => value + 1);
  const failureNotice = (result: { ok: false; status: number; code: string } & Record<string, unknown>): Notice => (isVersionConflict(result) ? 'conflict' : 'failed');

  const discard = () => {
    if (!product) return;
    adopt(product, etag);
    setVariantErrors({});
    setAltMissing(false);
    setNotice(null);
  };

  const create = async () => {
    const errors = validateCreate(form, typeId, definitions);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      setTab(errors.attributes && !errors.title && !errors.slug && !errors.productTypeId ? 'attributes' : 'general');
      return;
    }
    setSaving(true);
    const result = await createAdminProduct(buildCreateProduct(form, typeId, definitions));
    setSaving(false);
    if (result.ok) {
      // The saved form is still on screen: leaving to the new product must not ask about it.
      navigate(productDetailHref(result.data.id), { discardChanges: true });
      return;
    }
    if (result.status === 409 || result.code === 'slug_conflict') {
      setCreateErrors({ slugConflict: 'Ya existe un producto con este enlace.' });
      setTab('general');
      return;
    }
    setNotice('failed');
  };

  const save = async () => {
    if (!product || etag === null || saving) return;
    const blankAlt = imageDraft.some((image) => image.alt_text.trim() === '');
    setAltMissing(blankAlt);
    const errors: Record<string, VariantErrors> = {};
    for (const id of dirtyVariantIds) {
      const found = validateVariant(drafts[id]);
      if (Object.keys(found).length > 0) errors[id] = found;
    }
    setVariantErrors(errors);
    if (blankAlt) { setTab('images'); return; }
    if (Object.keys(errors).length > 0) { setTab('variants'); return; }

    setSaving(true);
    setNotice(null);
    let currentProduct = product;
    let currentEtag: string = etag;
    if (productDirty) {
      const result = await updateAdminProduct(product.id, currentEtag, productPatch);
      if (!result.ok) {
        setSaving(false);
        if (result.status === 409) setCreateErrors({ slugConflict: 'Ya existe un producto con este enlace.' });
        setNotice(failureNotice(result));
        return;
      }
      if (result.etag === null) { setSaving(false); reload(); return; }
      currentProduct = { ...result.data, variants: currentProduct.variants };
      currentEtag = result.etag;
      setProduct(currentProduct);
      setEtag(currentEtag);
      setForm(productToForm(currentProduct));
      setImageDraft([...result.data.images].sort((a, b) => a.position - b.position));
      setCreateErrors({});
    }
    for (const id of dirtyVariantIds) {
      const result = await updateAdminVariant(product.id, id, currentEtag, diffVariant(currentProduct.variants.find((variant) => variant.id === id)!, drafts[id]));
      if (!result.ok) {
        setSaving(false);
        if (result.status === 409) setVariantErrors({ [id]: result.code === 'sku_conflict' ? { sku: 'Ya existe una variante con este SKU.' } : { sku: 'Ya existe una variante con estas opciones.' } });
        setNotice(failureNotice(result));
        setTab('variants');
        return;
      }
      if (result.etag === null) { setSaving(false); reload(); return; }
      currentEtag = result.etag;
      currentProduct = { ...currentProduct, variants: currentProduct.variants.map((variant) => (variant.id === id ? result.data : variant)) };
      setProduct(currentProduct);
      setEtag(currentEtag);
      setDrafts((current) => ({ ...current, [id]: variantToForm(result.data) }));
    }
    setSaving(false);
    setNotice('saved');
  };

  const upload = async (file: File, alt: string, variantId: string | null, position: number): Promise<UploadOutcome> => {
    if (!product || etag === null) return { ok: false, status: 0, code: 'network_error' };
    const result = await uploadAdminProductImage(product.id, etag, { file, alt_text: alt, ...(variantId ? { variant_id: variantId } : {}), position });
    if (!result.ok) {
      if (isVersionConflict(result)) setNotice('conflict');
      return { ok: false, status: result.status, code: result.code };
    }
    if (result.etag === null) { reload(); return { ok: true }; }
    setEtag(result.etag);
    setProduct((current) => (current ? { ...current, images: [...current.images, result.data] } : current));
    setImageDraft((current) => [...current, result.data]);
    return { ok: true };
  };

  const createVariant = async (variantForm: VariantForm): Promise<string | null> => {
    if (!product || etag === null) return 'No pudimos crear la variante. Intenta de nuevo.';
    const result = await createAdminVariant(product.id, etag, variantToCreate(variantForm));
    if (!result.ok) {
      if (isVersionConflict(result)) { setNotice('conflict'); return 'El producto cambió. Recarga para ver la versión actual.'; }
      if (result.code === 'sku_conflict') return 'Ya existe una variante con este SKU.';
      if (result.code === 'variant_options_conflict') return 'Ya existe una variante con estas opciones.';
      if (result.status === 422) return 'Revisa los datos e intenta de nuevo.';
      return 'No pudimos crear la variante. Intenta de nuevo.';
    }
    if (result.etag === null) { reload(); return null; }
    setEtag(result.etag);
    setProduct((current) => (current ? { ...current, variants: [...current.variants, result.data] } : current));
    setDrafts((current) => ({ ...current, [result.data.id]: variantToForm(result.data) }));
    return null;
  };

  // --- Render --------------------------------------------------------------------
  if (load.status === 'loading') return <main className="flex flex-1 items-start px-5 py-[22px] min-[1024px]:px-6 min-[1440px]:px-8"><p role="status" className="font-bold text-muted-foreground">Cargando producto…</p></main>;
  if (load.status === 'missing') {
    return (
      <main className="flex flex-1 flex-col items-start gap-3 px-5 py-[22px] min-[1024px]:px-6 min-[1440px]:px-8">
        <h1 className="m-0 text-[28px] font-extrabold">Este producto no existe</h1>
        <a href={ADMIN_ROUTES.products} className={OUTLINE_BUTTON}>Volver a Productos</a>
      </main>
    );
  }
  if (load.status === 'error') {
    return (
      <main role="alert" className="flex flex-1 flex-col items-start gap-3 px-5 py-[22px] min-[1024px]:px-6 min-[1440px]:px-8">
        <h1 className="m-0 text-[28px] font-extrabold">No pudimos cargar el producto</h1>
        <p className="m-0 text-[15px] text-muted-foreground">Puede ser la conexión. No se perdió nada de tu catálogo.</p>
        <button type="button" onClick={reload} className={RED_BUTTON}>Reintentar</button>
      </main>
    );
  }

  const variantChoices = product ? activeVariants(product.variants).map((variant) => ({ id: variant.id, label: variantPresentation(variant, product.product_type.attribute_definitions) })) : [];
  const altProblems = imageDraft.filter((image) => image.alt_text.trim() === '').length;
  const variantProblems = Object.keys(variantErrors).filter((id) => Object.keys(variantErrors[id]).length > 0).length;
  const tabs: { key: Tab; label: string; count?: string; alert?: boolean }[] = [
    { key: 'general', label: 'General' },
    { key: 'attributes', label: 'Atributos' },
    ...(product ? [
      { key: 'images' as const, label: 'Imágenes', count: altMissing && altProblems > 0 ? `${altProblems} por revisar` : String(imageDraft.length), alert: altMissing && altProblems > 0 },
      { key: 'variants' as const, label: 'Variantes', count: variantProblems > 0 ? `${variantProblems} con error` : String(product.variants.length), alert: variantProblems > 0 },
    ] : []),
  ];
  const status = productStatusPresentation(product?.status ?? form.status);
  const cover = product ? [...product.images].sort((a, b) => a.position - b.position)[0] : undefined;
  const dirtyParts = [productDirty ? 'el producto' : null, dirtyVariantIds.length > 0 ? `${dirtyVariantIds.length} ${dirtyVariantIds.length === 1 ? 'variante' : 'variantes'}` : null].filter(Boolean).join(' y ');

  return (
    <>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-[120px] pt-[22px] min-[1024px]:px-6 min-[1440px]:px-8">
        <nav aria-label="Ruta" className="flex items-center gap-2 text-sm font-semibold">
          <a href={ADMIN_ROUTES.products} className="inline-flex min-h-8 items-center underline">Productos</a>
          <span aria-hidden="true">/</span>
          <span className="text-muted-foreground">{title}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="relative size-14 flex-none overflow-hidden rounded-md bg-secondary">{cover && <img src={cover.url} alt="" className="absolute left-1/2 top-[3px] h-[66px] -translate-x-1/2" />}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.01em]">{title}</h1>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {productType?.name}{product ? ` · ${activeVariants(product.variants).length} ${activeVariants(product.variants).length === 1 ? 'variante' : 'variantes'}` : ''}
              </span>
            </div>
          </div>
          {product?.status === 'published' && <a href={storefrontHref(product.slug)} className={OUTLINE_BUTTON}>Ver en la tienda <span aria-hidden="true">↗</span></a>}
        </div>

        <div role="tablist" aria-label="Secciones del producto" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`inline-flex h-12 cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 border-b-[3px] border-solid bg-transparent px-4 font-sans text-[15px] ${tab === item.key ? 'border-foreground font-extrabold text-foreground' : 'border-transparent font-semibold text-muted-foreground'}`}>
              {item.label}
              {item.count && <span className={`rounded-sm px-[7px] py-px text-xs font-extrabold ${item.alert ? 'bg-destructive text-card' : 'bg-secondary text-foreground'}`}>{item.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'general' && <GeneralTab creating={creating} form={form} onChange={changeForm} taxonomy={taxonomy} productType={productType} onProductType={changeType} errors={createErrors} onTitleTyped={typeTitle} />}
        {tab === 'attributes' && (
          creating && !productType
            ? <section role="tabpanel" aria-label="Atributos" className="rounded-md border border-border bg-card p-6 text-[15px] text-muted-foreground">Elige el tipo de producto en General para ver sus atributos.</section>
            : <AttributesTab typeName={productType?.name ?? ''} definitions={definitions} form={form} errors={Object.fromEntries(Object.entries(createErrors.attributes ?? {}).filter(([, message]) => message))} onChange={changeAttribute} />
        )}
        {tab === 'images' && product && <ImagesTab images={imageDraft} onImages={setImageDraft} variants={variantChoices} onUpload={upload} altMissing={altMissing} />}
        {tab === 'variants' && product && <VariantsTab product={product} drafts={drafts} errors={variantErrors} onDraft={draftVariant} onCreate={createVariant} />}
      </main>

      {(creating || dirty) && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2.5 border-t-2 border-foreground bg-card px-5 py-3 min-[1024px]:px-6 min-[1440px]:px-8">
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-brand-yellow outline outline-1 outline-foreground" />
            {creating ? 'Producto nuevo sin guardar' : `Cambios sin guardar en ${dirtyParts}`}
          </span>
          <span className="flex gap-2">
            {!creating && <button type="button" onClick={discard} disabled={saving} className={OUTLINE_BUTTON}>Descartar</button>}
            <button type="button" onClick={() => void (creating ? create() : save())} disabled={saving} className={RED_BUTTON}>{creating ? 'Crear producto' : 'Guardar cambios'}</button>
          </span>
        </div>
      )}
      <Toast notice={notice} onReload={reload} onDismiss={() => setNotice(null)} />
    </>
  );
}
