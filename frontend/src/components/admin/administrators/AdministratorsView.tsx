import * as React from 'react';
import {
  createAdminUser,
  listAdminUsers,
  resetAdminUserTotp,
  updateAdminUser,
  type AdminRole,
  type AdminUser,
  type SecondFactorProof,
} from '../../../lib/admin/client';
import { initialsOf, roleLabel } from '../../../lib/admin/navigation';
import { useAdminSession } from '../shell/AdminShell';

type AdminStatus = AdminUser['status'];

function statusLabel(status: AdminStatus): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'disabled':
      return 'Desactivado';
    default:
      return status;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

// Consistent avatar background palette based on initials/name
const AVATAR_COLORS = [
  '#4B1C52', // Purple (e.g. Laura Ríos)
  '#0F3B2C', // Deep green (e.g. Andrés Peña)
  '#7C3E1D', // Warm brown
  '#2C4A52', // Teal dark
  '#5F554A', // Muted brown
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function AdministratorsView() {
  const { user: currentUser } = useAdminSession();

  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  // Row action menu: ID of administrator whose dropdown menu is currently open
  const [activeMenuUserId, setActiveMenuUserId] = React.useState<string | null>(null);

  // Create sheet (right-side 520px sheet from A-Admins.dc.html)
  const [showCreateSheet, setShowCreateSheet] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createEmail, setCreateEmail] = React.useState('');
  const [createRole, setCreateRole] = React.useState<AdminRole>('staff');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Edit role & status dialog
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editRole, setEditRole] = React.useState<AdminRole>('staff');
  const [editStatus, setEditStatus] = React.useState<AdminStatus>('active');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [updating, setUpdating] = React.useState(false);

  // Sole owner info dialog (from A-Admins.dc.html dialogos['Último propietario'])
  const [showSoleOwnerAlert, setShowSoleOwnerAlert] = React.useState(false);

  // Reset 2FA dialog with acting owner's reauthentication
  const [resetTargetUser, setResetTargetUser] = React.useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = React.useState('');
  const [resetSecondFactor, setResetSecondFactor] = React.useState('');
  const [resetIsRecovery, setResetIsRecovery] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [resetError, setResetError] = React.useState<string | null>(null);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    setListError(null);
    const res = await listAdminUsers({ limit: 100 });
    setLoading(false);
    if (res.ok) {
      setUsers(res.data.items);
      return;
    }

    if (res.code === 'authentication_required' || res.status === 401) {
      window.location.assign('/admin/ingresar/');
      return;
    }
    if (res.code === 'forbidden' || res.status === 403) {
      window.location.assign('/admin/sin-acceso/');
      return;
    }
    setListError('No se pudo cargar la lista de administradores.');
  }, []);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Close open row menu on click outside
  React.useEffect(() => {
    if (!activeMenuUserId) return;
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-row-menu]') || target?.closest('[data-menu-trigger]')) {
        return;
      }
      setActiveMenuUserId(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [activeMenuUserId]);

  const activeOwners = React.useMemo(() => {
    return users.filter((u) => u.role === 'owner' && u.status === 'active');
  }, [users]);

  const isSoleActiveOwner = React.useCallback(
    (user: AdminUser) => {
      return user.role === 'owner' && user.status === 'active' && activeOwners.length <= 1;
    },
    [activeOwners]
  );

  const handleOpenCreate = () => {
    setCreateName('');
    setCreateEmail('');
    setCreateRole('staff');
    setCreateError(null);
    setActiveMenuUserId(null);
    setShowCreateSheet(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    const res = await createAdminUser({
      display_name: createName.trim(),
      email: createEmail.trim(),
      role: createRole,
    });
    setCreating(false);

    if (res.ok) {
      setShowCreateSheet(false);
      setToastMessage(`Invitación enviada a ${res.data.email}.`);
      fetchUsers();
      return;
    }

    if (res.code === 'email_conflict' || res.status === 409) {
      setCreateError('Ya existe una persona registrada con este correo.');
    } else if (res.code === 'authentication_required' || res.status === 401) {
      window.location.assign('/admin/ingresar/');
    } else if (res.code === 'forbidden' || res.status === 403) {
      window.location.assign('/admin/sin-acceso/');
    } else if (res.code === 'validation_failed' || res.status === 422) {
      setCreateError('Revisa el nombre y el correo ingresados.');
    } else if (res.code === 'rate_limited' || res.status === 429) {
      setCreateError('Demasiados intentos. Inténtalo de nuevo más tarde.');
    } else {
      setCreateError('No se pudo crear el administrador. Inténtalo de nuevo.');
    }
  };

  const handleOpenEdit = (user: AdminUser) => {
    setActiveMenuUserId(null);
    setEditingUser(user);
    setEditName(user.display_name);
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditError(null);
  };

  const handleQuickToggleRole = async (user: AdminUser) => {
    setActiveMenuUserId(null);
    const newRole: AdminRole = user.role === 'owner' ? 'staff' : 'owner';

    // Guard if trying to demote sole active owner
    if (user.role === 'owner' && newRole === 'staff' && isSoleActiveOwner(user)) {
      setShowSoleOwnerAlert(true);
      return;
    }

    const etag = `"${user.version}"`;
    const res = await updateAdminUser(user.id, etag, {
      role: newRole,
    });

    if (res.ok) {
      setToastMessage(`Rol actualizado a ${roleLabel(newRole)} para ${user.display_name}.`);
      fetchUsers();
      return;
    }

    if (res.code === 'last_active_owner' || res.status === 409) {
      setShowSoleOwnerAlert(true);
    } else if (res.code === 'version_conflict' || res.status === 412) {
      setToastMessage('El usuario fue modificado por otra persona. Actualizando lista…');
      fetchUsers();
    } else if (res.code === 'authentication_required' || res.status === 401) {
      window.location.assign('/admin/ingresar/');
    } else if (res.code === 'forbidden' || res.status === 403) {
      window.location.assign('/admin/sin-acceso/');
    } else {
      setToastMessage('No se pudo cambiar el rol. Inténtalo de nuevo.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);
    setUpdating(true);

    const etag = `"${editingUser.version}"`;
    const res = await updateAdminUser(editingUser.id, etag, {
      display_name: editName.trim(),
      role: editRole,
      status: editStatus,
    });
    setUpdating(false);

    if (res.ok) {
      setEditingUser(null);
      setToastMessage('Cambios guardados correctamente.');
      fetchUsers();
      return;
    }

    if (res.code === 'last_active_owner' || res.status === 409) {
      setEditError('No se puede degradar o desactivar al único propietario activo.');
    } else if (res.code === 'version_conflict' || res.status === 412) {
      setEditError('El usuario fue modificado por otra persona. Actualizando datos…');
      fetchUsers();
    } else if (res.code === 'authentication_required' || res.status === 401) {
      window.location.assign('/admin/ingresar/');
    } else if (res.code === 'forbidden' || res.status === 403) {
      window.location.assign('/admin/sin-acceso/');
    } else {
      setEditError('No se pudieron guardar los cambios. Inténtalo de nuevo.');
    }
  };

  const handleOpenReset = (user: AdminUser) => {
    setActiveMenuUserId(null);
    setResetTargetUser(user);
    setResetPassword('');
    setResetSecondFactor('');
    setResetIsRecovery(false);
    setResetError(null);
  };

  const closeResetDialog = () => {
    setResetTargetUser(null);
    setResetPassword('');
    setResetSecondFactor('');
    setResetIsRecovery(false);
    setResetError(null);
  };

  const handleResetTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setResetError(null);

    if (!resetPassword || !resetSecondFactor.trim()) {
      setResetError('Confirma tu contraseña y tu código de verificación.');
      return;
    }

    const cleanFactor = resetSecondFactor.trim();
    const secondFactor: SecondFactorProof = resetIsRecovery || !/^\d{6}$/.test(cleanFactor)
      ? { recovery_code: cleanFactor }
      : { totp_code: cleanFactor };

    setResetting(true);
    const etag = `"${resetTargetUser.version}"`;
    const res = await resetAdminUserTotp(resetTargetUser.id, etag, {
      current_password: resetPassword,
      second_factor: secondFactor,
    });
    setResetting(false);

    if (res.ok) {
      const name = resetTargetUser.display_name;
      closeResetDialog();
      setToastMessage(`2FA restablecido para ${name}. En su próximo ingreso configurará su app.`);
      fetchUsers();
      return;
    }

    if (res.code === 'invalid_credentials') {
      setResetError('Tu contraseña actual o tu código de verificación no son válidos.');
    } else if (res.code === 'version_conflict' || res.status === 412) {
      setResetError('El usuario fue modificado por otra persona. Actualizando lista…');
      fetchUsers();
    } else if (res.code === 'authentication_required' || res.status === 401) {
      window.location.assign('/admin/ingresar/');
    } else if (res.code === 'forbidden' || res.status === 403) {
      window.location.assign('/admin/sin-acceso/');
    } else {
      setResetError('No se pudo restablecer la verificación en dos pasos. Inténtalo de nuevo.');
    }
  };

  const isSelf = (user: AdminUser) => user.id === currentUser.id;

  return (
    <main className="flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 py-7 min-[768px]:px-8 min-[768px]:pb-12 min-[1440px]:py-7">
      {/* Header and CTA following A-Admins.dc.html */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">
              Administradores
            </h1>
          </div>
          <p className="m-0 text-[15px] text-[#5F554A]">
            Propietario: todo el panel. Equipo: catálogo, inventario y pedidos.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border-0 bg-[#C1272D] px-4 font-sans text-[15px] font-bold text-white hover:bg-[#A51F26] cursor-pointer"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agregar administrador
        </button>
      </div>

      {/* Owner-safety information banner from A-Admins.dc.html */}
      <div className="flex items-start gap-2.5 rounded-xl bg-[#F3E6C4] p-3.5 text-sm leading-[1.45] text-foreground">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1B1510"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 mt-0.5"
        >
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        </svg>
        <span>
          <span className="font-extrabold">Siempre debe haber al menos una persona propietaria activa.</span>{' '}
          {activeOwners.length === 1 && (
            <span>
              {activeOwners[0].display_name} es la única ahora: no se puede desactivar ni pasar a Equipo hasta que otra persona sea propietaria.
            </span>
          )}
        </span>
      </div>

      {listError && (
        <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm font-bold text-destructive">
          {listError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <p className="text-[#5F554A]">Cargando administradores…</p>
        </div>
      ) : (
        <section aria-label="Lista de administradores" className="overflow-x-auto rounded-xl border border-[#E6D9BC] bg-card">
          <table className="w-full text-left text-[15px] border-collapse">
            <thead>
              <tr className="bg-[#F3E6C4] font-condensed text-sm font-bold uppercase tracking-[0.08em] text-foreground">
                <th className="h-11 px-3 pl-5">Persona</th>
                <th className="px-3">Rol</th>
                <th className="px-3">Estado</th>
                <th className="px-3">Verificación en dos pasos</th>
                <th className="px-3">Último ingreso</th>
                <th className="w-[60px] px-2 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6D9BC]">
              {users.map((item) => {
                const selfUser = isSelf(item);
                const has2Fa = !!item.totp_confirmed_at;
                const menuOpen = activeMenuUserId === item.id;
                const initials = initialsOf(item.display_name);
                const bgAvatar = avatarColor(item.display_name);

                return (
                  <tr key={item.id} className="h-16 hover:bg-muted/20">
                    <td className="px-3 pl-5">
                      <div className="flex items-center gap-3">
                        <span
                          style={{ backgroundColor: bgAvatar }}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-[#FAF3E3]"
                        >
                          {initials}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-extrabold text-foreground">
                            {item.display_name}
                            {selfUser && <span className="font-medium text-[#5F554A]"> (tú)</span>}
                          </span>
                          <span className="text-[13px] text-[#5F554A]">{item.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3">
                      <span className="inline-flex h-[26px] items-center rounded-lg border border-[#1B1510] px-2.5 text-[13px] font-bold">
                        {roleLabel(item.role)}
                      </span>
                    </td>
                    <td className="px-3">
                      <span
                        className={`inline-flex h-[26px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold ${
                          item.status === 'active'
                            ? 'bg-[#1E6B45]/15 text-[#1E6B45]'
                            : 'bg-muted text-[#5F554A]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-[7px] rounded-full ${
                            item.status === 'active' ? 'bg-[#1E6B45]' : 'bg-[#5F554A]'
                          }`}
                        />
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className={`px-3 font-semibold ${has2Fa ? 'text-[#1E6B45]' : 'text-[#5F554A]'}`}>
                      {has2Fa ? 'Activa' : 'Pendiente'}
                    </td>
                    <td className="px-3 text-[#5F554A]">{formatDate(item.last_login_at)}</td>
                    <td className="relative px-2 text-right">
                      <button
                        type="button"
                        data-menu-trigger
                        onClick={() => setActiveMenuUserId(menuOpen ? null : item.id)}
                        aria-label={`Acciones de ${item.display_name}`}
                        className="inline-flex size-11 items-center justify-center rounded-lg border-0 bg-transparent text-foreground hover:bg-muted cursor-pointer"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#1B1510"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <circle cx="5" cy="12" r="1" />
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                        </svg>
                      </button>

                      {/* Dropdown row menu from A-Admins.dc.html */}
                      {menuOpen && (
                        <div
                          data-row-menu
                          role="menu"
                          aria-label={`Acciones de ${item.display_name}`}
                          className="absolute right-2 top-12 z-20 flex w-72 flex-col rounded-xl border border-[#E6D9BC] bg-card p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)] text-left"
                        >
                          <span className="px-2.5 py-2 text-[13px] font-bold text-[#5F554A]">
                            {item.display_name}
                          </span>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleOpenEdit(item)}
                            className="flex min-h-10 items-center rounded-lg border-0 bg-transparent px-2.5 text-[15px] font-semibold text-foreground hover:bg-[#F3E6C4] cursor-pointer text-left"
                          >
                            Editar datos y permisos…
                          </button>
                          {!selfUser && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleQuickToggleRole(item)}
                              className="flex min-h-10 items-center rounded-lg border-0 bg-transparent px-2.5 text-[15px] font-semibold text-foreground hover:bg-[#F3E6C4] cursor-pointer text-left"
                            >
                              {item.role === 'owner' ? 'Cambiar a Equipo' : 'Cambiar a Propietario'}
                            </button>
                          )}
                          {!selfUser && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleOpenReset(item)}
                              className="flex min-h-10 items-center rounded-lg border-0 bg-transparent px-2.5 text-[15px] font-semibold text-foreground hover:bg-[#F3E6C4] cursor-pointer text-left"
                            >
                              Restablecer verificación en dos pasos…
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Create sheet (right-side 520px sheet matching A-Admins.dc.html) */}
      {showCreateSheet && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="h-add"
            className="flex w-full max-w-[520px] flex-col rounded-l-[20px] bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <h2 id="h-add" className="m-0 text-2xl font-extrabold">
                Agregar administrador
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowCreateSheet(false)}
                className="inline-flex size-11 items-center justify-center rounded-lg border-0 bg-[#F3E6C4] text-foreground hover:bg-[#EBDAB0] cursor-pointer"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1B1510"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-1 flex-col justify-between">
              <div className="flex flex-col gap-4 px-6 py-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Nombre</span>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Camila Torres"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Correo</span>
                  <input
                    type="email"
                    required
                    placeholder="camila@monteluna.co"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                </label>

                <div role="radiogroup" aria-label="Rol" className="flex flex-col gap-2">
                  <span className="text-sm font-bold">Rol</span>
                  {/* Propietario card */}
                  <label
                    onClick={() => setCreateRole('owner')}
                    className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      createRole === 'owner'
                        ? 'border-2 border-[#0F3B2C] bg-[#FAF3E3]'
                        : 'border-[#5F554A] bg-card'
                    }`}
                  >
                    <input
                      type="radio"
                      name="create_role"
                      value="owner"
                      checked={createRole === 'owner'}
                      onChange={() => setCreateRole('owner')}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        createRole === 'owner'
                          ? 'border-[#0F3B2C] bg-[#0F3B2C]'
                          : 'border-[#1B1510] bg-transparent'
                      }`}
                    >
                      {createRole === 'owner' && <span className="size-2 rounded-full bg-[#FAF3E3]" />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-extrabold">Propietario</span>
                      <span className="text-[13px] text-[#5F554A]">
                        Todo el panel: pagos, configuración fiscal y administradores.
                      </span>
                    </span>
                  </label>

                  {/* Equipo card */}
                  <label
                    onClick={() => setCreateRole('staff')}
                    className={`flex gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      createRole === 'staff'
                        ? 'border-2 border-[#0F3B2C] bg-[#FAF3E3]'
                        : 'border-[#5F554A] bg-card'
                    }`}
                  >
                    <input
                      type="radio"
                      name="create_role"
                      value="staff"
                      checked={createRole === 'staff'}
                      onChange={() => setCreateRole('staff')}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        createRole === 'staff'
                          ? 'border-[#0F3B2C] bg-[#0F3B2C]'
                          : 'border-[#1B1510] bg-transparent'
                      }`}
                    >
                      {createRole === 'staff' && <span className="size-2 rounded-full bg-[#FAF3E3]" />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-extrabold">Equipo</span>
                      <span className="text-[13px] text-[#5F554A]">
                        Catálogo, inventario y pedidos. No ve pagos ni configuración.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-[#FAF3E3] p-3 text-sm leading-[1.45]">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1B1510"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 mt-0.5"
                  >
                    <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
                  </svg>
                  <span>
                    Le llega un correo para crear su contraseña. En su primer ingreso tendrá que activar la verificación en dos pasos.
                  </span>
                </div>

                {createError && (
                  <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
                    {createError}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-[#E6D9BC] p-4 px-6">
                <button
                  type="button"
                  onClick={() => setShowCreateSheet(false)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-4 text-[15px] font-bold text-foreground cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="h-11 rounded-lg border-0 bg-[#C1272D] px-4 text-[15px] font-bold text-white hover:bg-[#A51F26] disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Enviando…' : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="h-edit"
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-2xl bg-card p-6 shadow-2xl"
          >
            <h2 id="h-edit" className="m-0 text-xl font-extrabold">
              Editar administrador
            </h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Nombre</span>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Rol</span>
                <select
                  disabled={isSelf(editingUser)}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AdminRole)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] disabled:bg-muted disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-foreground"
                >
                  <option value="owner">Propietario (acceso total)</option>
                  <option value="staff">Equipo (catálogo, inventario y pedidos)</option>
                </select>
                {isSelf(editingUser) && (
                  <span className="text-xs text-[#5F554A]">
                    No puedes cambiar tu propio rol. Pídelo a otra persona propietaria.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Estado</span>
                <select
                  disabled={isSelf(editingUser)}
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AdminStatus)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] disabled:bg-muted disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-foreground"
                >
                  <option value="active">Activo</option>
                  <option value="disabled">Desactivado</option>
                </select>
                {isSelf(editingUser) && (
                  <span className="text-xs text-[#5F554A]">
                    No puedes desactivar tu propia cuenta.
                  </span>
                )}
              </label>

              {editError && (
                <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
                  {editError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-4 text-[15px] font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="h-11 rounded-lg border-0 bg-primary px-4 text-[15px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  {updating ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sole owner warning dialog (from A-Admins.dc.html dialogos['Último propietario']) */}
      {showSoleOwnerAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="h-sole-owner"
            className="flex w-full max-w-[500px] flex-col gap-3 rounded-[20px] bg-card p-6 shadow-2xl"
          >
            <h2 id="h-sole-owner" className="m-0 text-xl font-extrabold">
              Es la única persona propietaria activa
            </h2>
            <p className="m-0 text-[15px] leading-[1.5] text-[#5F554A]">
              No puedes pasarla a Equipo ni desactivarla: la tienda se quedaría sin nadie que pueda ver pagos y configuración. Primero da el rol de Propietario a otra persona.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSoleOwnerAlert(false)}
                className="h-11 rounded-lg border-0 bg-[#1B1510] px-4 font-sans text-[15px] font-bold text-[#FAF3E3] hover:opacity-90 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset TOTP confirmation dialog with reauthentication credentials */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="h-reset"
            className="flex w-full max-w-[500px] flex-col gap-4 rounded-[20px] bg-card p-6 shadow-2xl"
          >
            <h2 id="h-reset" className="m-0 text-xl font-extrabold">
              ¿Restablecer la verificación de {resetTargetUser.display_name}?
            </h2>
            <p className="m-0 text-[15px] leading-[1.5] text-[#5F554A]">
              Su app autenticadora y sus códigos de recuperación dejan de funcionar y se cierran sus sesiones abiertas. En su próximo ingreso tendrá que activarla otra vez.
            </p>

            <form onSubmit={handleResetTotpSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-bold">Tu contraseña actual (propietario)</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </label>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="reset-second-factor-input" className="text-sm font-bold">
                    Tu código de verificación
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetIsRecovery((prev) => !prev)}
                    className="border-0 bg-transparent p-0 text-xs font-semibold text-[#C1272D] underline cursor-pointer"
                  >
                    {resetIsRecovery ? 'Usar app autenticadora' : 'Usar código de recuperación'}
                  </button>
                </div>
                <input
                  id="reset-second-factor-input"
                  type="text"
                  name="second_factor"
                  inputMode={resetIsRecovery ? 'text' : 'numeric'}
                  placeholder={resetIsRecovery ? 'Código de recuperación' : '6 dígitos de tu app'}
                  required
                  value={resetSecondFactor}
                  onChange={(e) => setResetSecondFactor(e.target.value)}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-3 font-mono text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>

              {resetError && (
                <div role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
                  {resetError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeResetDialog}
                  className="h-11 rounded-lg border border-[#5F554A] bg-card px-4 text-[15px] font-bold text-foreground cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="h-11 rounded-lg border-0 bg-[#C1272D] px-4 text-[15px] font-bold text-white hover:bg-[#A51F26] disabled:opacity-50 cursor-pointer"
                >
                  {resetting ? 'Restableciendo…' : 'Restablecer verificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-2xl"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#1E6B45]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="text-[15px] font-bold">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Cerrar aviso"
            className="ml-2 border-0 bg-transparent text-primary-foreground/70 hover:text-primary-foreground cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
