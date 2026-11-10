import { describe, expect, it } from 'vitest';
import { ADMIN_APP_ROUTES, adminDocumentTitle, adminLinkTarget, normalizeAdminPath, resolveAdminRoute } from './routes';

describe('Admin route table (admin-navigation-v1 T3: S2/L6)', () => {
  it('resolves every protected admin path to its view and shell props', () => {
    expect(resolveAdminRoute('/admin/')).toMatchObject({ view: 'home', active: 'home' });
    expect(resolveAdminRoute('/admin/productos/')).toMatchObject({ view: 'products', active: 'products', desktopOnly: 'catalog' });
    expect(resolveAdminRoute('/admin/inventario/')).toMatchObject({ view: 'inventory', active: 'inventory', desktopOnly: 'catalog' });
    expect(resolveAdminRoute('/admin/pedidos/')).toMatchObject({ view: 'orders', active: 'orders' });
    expect(resolveAdminRoute('/admin/cuenta/')).toMatchObject({ view: 'account', desktopOnly: true });
    expect(resolveAdminRoute('/admin/sin-acceso/')).toMatchObject({ view: 'noAccess' });
  });

  it('keeps the detail screens under their section in the sidebar', () => {
    expect(resolveAdminRoute('/admin/producto/')).toMatchObject({ view: 'product', active: 'products', desktopOnly: 'catalog' });
    expect(resolveAdminRoute('/admin/pedido/')).toMatchObject({ view: 'order', active: 'orders' });
  });

  it('keeps Administradores owner-only', () => {
    expect(resolveAdminRoute('/admin/administradores/')).toMatchObject({ view: 'admins', active: 'admins', requiredRole: 'owner', desktopOnly: true });
    for (const route of ADMIN_APP_ROUTES.filter((item) => item.view !== 'admins')) expect(route.requiredRole).toBeUndefined();
  });

  it('accepts the path with or without the trailing slash', () => {
    expect(normalizeAdminPath('/admin/productos')).toBe('/admin/productos/');
    expect(resolveAdminRoute('/admin/productos')?.view).toBe('products');
    expect(resolveAdminRoute('/admin')?.view).toBe('home');
  });

  it('does not resolve access pages, other paths or lookalikes, which keep full document loads', () => {
    for (const path of ['/admin/ingresar/', '/admin/verificacion/', '/admin/activar-verificacion/', '/admin/recuperar-contrasena/', '/admin/restablecer-contrasena/', '/admin/invitacion/', '/admin/desconocida/', '/', '/productos/', '/admin/productos/extra/', '/administrador/']) {
      expect(resolveAdminRoute(path), path).toBeNull();
    }
  });

  it('titles every route like its Astro page, so a client navigation matches a document load', () => {
    expect(ADMIN_APP_ROUTES.map((route) => adminDocumentTitle(route))).toEqual([
      'Inicio · Admin Monteluna',
      'Productos · Admin Monteluna',
      'Producto · Admin Monteluna',
      'Inventario · Admin Monteluna',
      'Pedidos · Admin Monteluna',
      'Pedido · Admin Monteluna',
      'Mi cuenta · Admin Monteluna',
      'Administradores · Admin Monteluna',
      'Sin acceso · Admin Monteluna',
    ]);
  });
});

describe('Admin link interception rules (admin-navigation-v1 T3: S2)', () => {
  const current = new URL('http://127.0.0.1:4321/admin/pedidos/');

  function click(href: string | null, init: MouseEventInit = {}, attributes: Record<string, string> = {}): MouseEvent {
    const anchor = document.createElement('a');
    if (href !== null) anchor.setAttribute('href', href);
    for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
    const child = document.createElement('span');
    anchor.append(child);
    document.body.append(anchor);
    let captured!: MouseEvent;
    anchor.addEventListener('click', (event) => { captured = event; }, { once: true });
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    anchor.remove();
    return captured;
  }

  it('takes a plain left click on a link to a protected admin route, keeping the query string', () => {
    expect(adminLinkTarget(click('/admin/productos/?estado=draft'), current)?.href).toBe('http://127.0.0.1:4321/admin/productos/?estado=draft');
    expect(adminLinkTarget(click('/admin/pedido/?id=abc'), current)?.search).toBe('?id=abc');
    expect(adminLinkTarget(click('../productos/'), current)?.pathname).toBe('/admin/productos/');
    expect(adminLinkTarget(click('/admin/'), current)?.pathname).toBe('/admin/');
  });

  it('leaves modifier clicks, other mouse buttons and prevented clicks to the browser', () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(adminLinkTarget(click('/admin/productos/', init), current), JSON.stringify(init)).toBeNull();
    }
    const prevented = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    const anchor = document.createElement('a');
    anchor.setAttribute('href', '/admin/productos/');
    anchor.addEventListener('click', (event) => event.preventDefault());
    document.body.append(anchor);
    anchor.dispatchEvent(prevented);
    anchor.remove();
    expect(adminLinkTarget(prevented, current)).toBeNull();
  });

  it('leaves new-tab, download and external-rel links to the browser', () => {
    expect(adminLinkTarget(click('/admin/productos/', {}, { target: '_blank' }), current)).toBeNull();
    expect(adminLinkTarget(click('/admin/productos/', {}, { download: '' }), current)).toBeNull();
    expect(adminLinkTarget(click('/admin/productos/', {}, { rel: 'external' }), current)).toBeNull();
    expect(adminLinkTarget(click('/admin/productos/', {}, { target: '_self' }), current)?.pathname).toBe('/admin/productos/');
  });

  it('leaves other origins, the storefront, access pages and unknown admin paths to full document loads', () => {
    for (const href of ['https://monteluna.co/admin/productos/', '/productos/finca/', '/admin/ingresar/', '/admin/desconocida/', 'mailto:hola@monteluna.co', 'tel:+573000000000']) {
      expect(adminLinkTarget(click(href), current), href).toBeNull();
    }
  });

  it('ignores clicks that are not on a link or a link without href', () => {
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    document.body.dispatchEvent(plain);
    expect(adminLinkTarget(plain, current)).toBeNull();
    expect(adminLinkTarget(click(null), current)).toBeNull();
  });

  it('leaves an in-page hash jump on the current address to the browser', () => {
    expect(adminLinkTarget(click('#contenido'), current)).toBeNull();
    expect(adminLinkTarget(click('/admin/pedidos/#contenido'), current)).toBeNull();
    expect(adminLinkTarget(click('/admin/productos/#contenido'), current)?.pathname).toBe('/admin/productos/');
  });
});

describe('Astro page titles (admin-navigation-v1 T3)', () => {
  it('reads each page title from the route table', async () => {
    const { adminPageTitle } = await import('./routes');
    expect(adminPageTitle('orders')).toBe('Pedidos · Admin Monteluna');
    expect(adminPageTitle('account')).toBe('Mi cuenta · Admin Monteluna');
  });
});
