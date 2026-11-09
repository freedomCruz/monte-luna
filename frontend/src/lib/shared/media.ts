/**
 * Public URL of a media object key such as `images/packaging-finca-el-mirador.webp`.
 * Uses PUBLIC_MEDIA_BASE_URL (the public R2 base) and falls back to same-origin
 * paths only when it is not configured.
 */
export function mediaUrl(key: string): string {
  const path = key.replace(/^\/+/, '');
  const base = import.meta.env.PUBLIC_MEDIA_BASE_URL?.trim();
  if (!base) return `/${path}`;
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}
