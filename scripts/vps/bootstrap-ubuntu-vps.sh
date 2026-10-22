#!/usr/bin/env bash
# ==============================================================================
# scripts/vps/bootstrap-ubuntu-vps.sh
# Guided, safe, and re-runnable bootstrap script for fresh Ubuntu 24.04 VPS.
# Follows specs S1-S4 and Design from odd/tasks/vps-bootstrap-script.md.
#
# Language rules (AGENTS.md / S4):
# - Code, comments, tests, and documentation are in English.
# - User-facing prompts, messages, and terminal output are in Spanish ("tú").
# ==============================================================================

set -eu

# Global agent tracking
SSH_AGENT_STARTED=0

cleanup_agent() {
  if [ "${SSH_AGENT_STARTED}" -eq 1 ] && [ -n "${SSH_AGENT_PID:-}" ]; then
    kill "${SSH_AGENT_PID}" 2>/dev/null || true
  fi
}

trap cleanup_agent EXIT INT TERM HUP

# ==============================================================================
# Validation Functions (Pure, tested)
# ==============================================================================

validate_server_address() {
  local addr="${1:-}"
  if [ -z "$addr" ]; then return 1; fi
  if [[ "$addr" =~ [[:space:]] ]]; then return 1; fi
  if [[ "$addr" == -* ]]; then return 1; fi
  if [[ "$addr" == *@* ]]; then return 1; fi
  if [[ "$addr" == *://* ]]; then return 1; fi

  # 1. Check IPv4
  if [[ "$addr" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]]; then
    local o1="${BASH_REMATCH[1]}"
    local o2="${BASH_REMATCH[2]}"
    local o3="${BASH_REMATCH[3]}"
    local o4="${BASH_REMATCH[4]}"
    if [ "$o1" -le 255 ] && [ "$o2" -le 255 ] && [ "$o3" -le 255 ] && [ "$o4" -le 255 ]; then
      return 0
    fi
    return 1
  fi

  # If address consists strictly of digits and dots but failed IPv4, it is invalid
  if [[ "$addr" =~ ^[0-9.]+$ ]]; then
    return 1
  fi

  # 2. Check IPv6
  if [[ "$addr" == *:* ]]; then
    if [[ "$addr" =~ ^[0-9a-fA-F:]+$ ]] && [[ ! "$addr" =~ ::: ]]; then
      return 0
    fi
    return 1
  fi

  # 3. Check Hostname (RFC 1123)
  if [ "${#addr}" -gt 253 ]; then return 1; fi
  if [[ "$addr" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
    if [[ "$addr" == *..* ]]; then return 1; fi
    local IFS='.'
    local label
    for label in $addr; do
      if [ -z "$label" ] || [ "${#label}" -gt 63 ]; then return 1; fi
      if [[ "$label" == -* ]] || [[ "$label" == *- ]]; then return 1; fi
    done
    return 0
  fi

  return 1
}

validate_username() {
  local user="${1:-}"
  if [ -z "$user" ]; then return 1; fi
  if [ "$user" = "root" ]; then return 1; fi
  if [[ "$user" =~ ^[a-z][a-z0-9_-]{0,31}$ ]]; then
    return 0
  fi
  return 1
}

validate_alias() {
  local alias="${1:-}"
  if [ -z "$alias" ]; then return 1; fi
  if [ "$alias" = "root" ]; then return 1; fi
  if [[ "$alias" =~ ^[a-z][a-z0-9_-]{0,31}$ ]]; then
    return 0
  fi
  return 1
}

validate_swap_size() {
  local size="${1:-}"
  if [ -z "$size" ]; then return 1; fi
  if [[ "$size" =~ ^[0-8]$ ]]; then
    return 0
  fi
  return 1
}

# ==============================================================================
# Remote Script Generators (Pure, tested)
# ==============================================================================

generate_phase2_script() {
  local admin_user="$1"
  local pubkey="$2"
  local q_admin_user
  local q_pubkey
  q_admin_user="$(printf '%q' "$admin_user")"
  q_pubkey="$(printf '%q' "$pubkey")"

  cat <<EOF
#!/usr/bin/env bash
set -eu

ADMIN_USER=${q_admin_user}
PUBKEY=${q_pubkey}

echo "=== Fase 2: Comprobando sistema operativo ==="
if [ ! -f /etc/os-release ]; then
  echo "ERROR: /etc/os-release no encontrado." >&2
  exit 1
fi

. /etc/os-release
if [ "\${ID:-}" != "ubuntu" ] || [ "\${VERSION_ID:-}" != "24.04" ]; then
  echo "ERROR: Este script requiere Ubuntu 24.04 LTS. Detectado: ID=\${ID:-desconocido}, VERSION_ID=\${VERSION_ID:-desconocido}" >&2
  exit 1
fi
echo "Sistema verificado: Ubuntu 24.04 LTS."

echo "=== Fase 2: Configurando usuario administrador ==="
if ! id "\$ADMIN_USER" >/dev/null 2>&1; then
  echo "Creando usuario \$ADMIN_USER en grupo sudo..."
  useradd -m -s /bin/bash -G sudo "\$ADMIN_USER"
  echo "Por favor establece la contraseña para el nuevo usuario \$ADMIN_USER:"
  passwd "\$ADMIN_USER"
else
  echo "El usuario \$ADMIN_USER ya existe. Asegurando pertenencia al grupo sudo..."
  usermod -aG sudo "\$ADMIN_USER"
fi

USER_HOME=\$(eval echo "~\$ADMIN_USER")
SSH_DIR="\${USER_HOME}/.ssh"
AUTH_KEYS="\${SSH_DIR}/authorized_keys"

mkdir -p "\$SSH_DIR"
chmod 700 "\$SSH_DIR"
chown "\$ADMIN_USER:\$ADMIN_USER" "\$SSH_DIR"

touch "\$AUTH_KEYS"
chmod 600 "\$AUTH_KEYS"
chown "\$ADMIN_USER:\$ADMIN_USER" "\$AUTH_KEYS"

if ! grep -F -q "\$PUBKEY" "\$AUTH_KEYS"; then
  printf '%s\n' "\$PUBKEY" >> "\$AUTH_KEYS"
  echo "Clave pública agregada a \$AUTH_KEYS."
else
  echo "La clave pública ya estaba presente en \$AUTH_KEYS."
fi

echo "Huella de la clave instalada en \$AUTH_KEYS:"
ssh-keygen -lf "\$AUTH_KEYS"
EOF
}

generate_phase3_script() {
  cat <<'EOF'
#!/usr/bin/env bash
set -eu

echo "=== Fase 3: Actualizaciones del sistema ==="
echo "Actualizando listas de paquetes (apt-get update)..."
apt-get update

echo "Simulando actualización de paquetes..."
apt-get --simulate upgrade

echo "Aplicando actualizaciones de paquetes (respetando actualizaciones escalonadas)..."
DEBIAN_FRONTEND=noninteractive apt-get -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  upgrade

if [ -f /var/run/reboot-required ]; then
  echo "REBOOT_REQUIRED_DETECTED"
else
  echo "NO_REBOOT_REQUIRED"
fi
EOF
}

generate_phase4_script() {
  cat <<'EOF'
#!/usr/bin/env bash
set -eu

echo "=== Fase 4: Configuración del Firewall (UFW) ==="

if ! command -v ufw >/dev/null 2>&1; then
  echo "Instalando UFW desde los repositorios oficiales..."
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ufw
fi

# Ensure IPv6 is enabled in UFW configuration
if [ -f /etc/default/ufw ]; then
  sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
fi

# Allow OpenSSH before setting default deny incoming so active firewalls are not locked out on re-run
echo "Permitiendo OpenSSH en UFW..."
ufw allow OpenSSH

echo "Configurando directivas por defecto..."
ufw default deny incoming
ufw default allow outgoing

echo "Limpiando posibles unidades previas de rollback..."
systemctl stop ufw-bootstrap-rollback.timer ufw-bootstrap-rollback.service 2>/dev/null || true
systemctl reset-failed ufw-bootstrap-rollback.timer ufw-bootstrap-rollback.service 2>/dev/null || true

echo "Programando rollback automático de 5 minutos mediante systemd-run..."
systemd-run --unit=ufw-bootstrap-rollback --on-active=5m /usr/sbin/ufw disable

echo "Habilitando UFW..."
ufw --force enable

echo "Estado actual de UFW:"
ufw status verbose
EOF
}

generate_phase5_script() {
  cat <<'EOF'
#!/usr/bin/env bash
set -eu

echo "=== Fase 5: Endurecimiento de SSH ==="
DROPIN="/etc/ssh/sshd_config.d/00-bootstrap-hardening.conf"

mkdir -p /etc/ssh/sshd_config.d

echo "Escribiendo drop-in de configuración en $DROPIN..."
cat > "$DROPIN" <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF

chown root:root "$DROPIN"
chmod 644 "$DROPIN"

echo "Validando sintaxis de configuración con sshd -t..."
if ! sshd -t; then
  echo "ERROR: Falló sshd -t. Revertiendo drop-in..." >&2
  rm -f "$DROPIN"
  exit 1
fi

echo "Limpiando posibles unidades previas de rollback..."
systemctl stop sshd-bootstrap-rollback.timer sshd-bootstrap-rollback.service 2>/dev/null || true
systemctl reset-failed sshd-bootstrap-rollback.timer sshd-bootstrap-rollback.service 2>/dev/null || true

echo "Programando rollback automático de SSH de 5 minutos mediante systemd-run..."
systemd-run --unit=sshd-bootstrap-rollback --on-active=5m /bin/sh -c 'rm -f /etc/ssh/sshd_config.d/00-bootstrap-hardening.conf && systemctl reload ssh'

echo "Comprobando configuración efectiva con sshd -T..."
SSH_OPTS=$(sshd -T)
P_ROOT=$(printf "%s\n" "$SSH_OPTS" | awk '/^permitrootlogin /{print $2}')
P_PASS=$(printf "%s\n" "$SSH_OPTS" | awk '/^passwordauthentication /{print $2}')
P_KBD=$(printf "%s\n" "$SSH_OPTS" | awk '/^kbdinteractiveauthentication /{print $2}')
P_PUB=$(printf "%s\n" "$SSH_OPTS" | awk '/^pubkeyauthentication /{print $2}')

if [ "$P_ROOT" != "no" ] || [ "$P_PASS" != "no" ] || [ "$P_KBD" != "no" ] || [ "$P_PUB" != "yes" ]; then
  echo "ERROR: Las directivas efectivas de sshd -T no coinciden con los valores requeridos." >&2
  echo "permitrootlogin: $P_ROOT (esperado: no)" >&2
  echo "passwordauthentication: $P_PASS (esperado: no)" >&2
  echo "kbdinteractiveauthentication: $P_KBD (esperado: no)" >&2
  echo "pubkeyauthentication: $P_PUB (esperado: yes)" >&2
  rm -f "$DROPIN"
  exit 1
fi

echo "Recargando el servicio SSH..."
systemctl reload ssh
echo "Servicio SSH recargado."
EOF
}

generate_phase6_script() {
  local swap_gb="$1"
  local q_swap_gb
  q_swap_gb="$(printf '%q' "$swap_gb")"

  cat <<EOF
#!/usr/bin/env bash
set -eu

SWAP_GB=${q_swap_gb}

echo "=== Fase 6: Configuración de Swap ==="

if [ "\$SWAP_GB" -eq 0 ]; then
  echo "Tamaño de swap configurado en 0 GiB. Omitiendo swap."
  exit 0
fi

if [ -e /swapfile ]; then
  echo "ERROR: /swapfile ya existe en el sistema. Rechazando por seguridad para evitar sobreescritura." >&2
  exit 1
fi

echo "Creando archivo de swap de \${SWAP_GB} GiB en /swapfile..."
fallocate -l "\${SWAP_GB}G" /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

if [ ! -f /etc/fstab.bak-bootstrap ]; then
  cp /etc/fstab /etc/fstab.bak-bootstrap
  echo "Respaldo de /etc/fstab guardado en /etc/fstab.bak-bootstrap."
fi

if ! grep -q '/swapfile' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Entrada añadida a /etc/fstab."
fi

echo "Configurando vm.swappiness=10 en /etc/sysctl.d/99-bootstrap-swap.conf..."
echo 'vm.swappiness=10' > /etc/sysctl.d/99-bootstrap-swap.conf
sysctl -p /etc/sysctl.d/99-bootstrap-swap.conf >/dev/null 2>&1 || true

systemctl daemon-reload
echo "Swap activado:"
swapon --show
EOF
}

generate_phase7_script() {
  cat <<'EOF'
#!/usr/bin/env bash
set -u

echo "=== Fase 7: Diagnóstico de Cloud-Init ==="
echo "Consultando estado actual de cloud-init..."
cloud-init status --long || true

cat <<'INFO'
--------------------------------------------------------------------------------
NOTA INFORMATIVA SOBRE CLOUD-INIT EN CONTABO:
Es común que cloud-init reporte un estado de error debido a que el script de
user-data 'bootcmd' proporcionado por la plantilla del proveedor intenta invocar
utilidades obsoletas (como chpasswd.list) o falla con código 1.
Este es un comportamiento conocido del proveedor y NO debe intentarse "reparar",
limpiar con 'cloud-init clean' ni deshabilitar en el servidor.
--------------------------------------------------------------------------------
INFO
EOF
}

generate_phase8_script() {
  local admin_user="${1:-}"
  local swap_gb="${2:-2}"
  local q_admin_user
  local q_swap_gb
  q_admin_user="$(printf '%q' "$admin_user")"
  q_swap_gb="$(printf '%q' "$swap_gb")"

  cat <<EOF
#!/usr/bin/env bash
set -u

ADMIN_USER=${q_admin_user}
SWAP_GB=${q_swap_gb}
OVERALL_STATUS=0

check_pass() {
  printf "  [PASS] %s\n" "\$1"
}

check_fail() {
  printf "  [FAIL] %s: %s\n" "\$1" "\$2"
  OVERALL_STATUS=1
}

check_info() {
  printf "  [INFO] %s: %s\n" "\$1" "\$2"
}

echo "=== Fase 8: Lectura y Verificación Final (Readback) ==="

# 1. Kernel
k_ver=\$(uname -r 2>/dev/null || echo "")
if [ -n "\$k_ver" ]; then
  check_pass "Kernel activo: \$k_ver"
else
  check_fail "Kernel" "No se pudo determinar la versión del kernel"
fi

# 2. NTP
ntp_sync=\$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo "")
if [ "\$ntp_sync" = "yes" ]; then
  check_pass "NTP sincronizado"
else
  if timedatectl 2>/dev/null | grep -iq "synchronized: yes"; then
    check_pass "NTP sincronizado"
  else
    check_fail "NTP" "El reloj no está sincronizado (NTPSynchronized=\$ntp_sync)"
  fi
fi

# 3. SSH active and the four effective values
if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
  check_pass "Servicio SSH activo"
else
  check_fail "SSH" "El servicio SSH no está activo"
fi

ssh_opts=\$(sshd -T 2>/dev/null || true)
p_root=\$(printf "%s\n" "\$ssh_opts" | awk '/^permitrootlogin /{print \$2}')
p_pass=\$(printf "%s\n" "\$ssh_opts" | awk '/^passwordauthentication /{print \$2}')
p_kbd=\$(printf "%s\n" "\$ssh_opts" | awk '/^kbdinteractiveauthentication /{print \$2}')
p_pub=\$(printf "%s\n" "\$ssh_opts" | awk '/^pubkeyauthentication /{print \$2}')

if [ "\$p_root" = "no" ]; then
  check_pass "SSH: PermitRootLogin no"
else
  check_fail "SSH: PermitRootLogin" "Valor detectado: '\$p_root' (esperado: no)"
fi

if [ "\$p_pass" = "no" ]; then
  check_pass "SSH: PasswordAuthentication no"
else
  check_fail "SSH: PasswordAuthentication" "Valor detectado: '\$p_pass' (esperado: no)"
fi

if [ "\$p_kbd" = "no" ]; then
  check_pass "SSH: KbdInteractiveAuthentication no"
else
  check_fail "SSH: KbdInteractiveAuthentication" "Valor detectado: '\$p_kbd' (esperado: no)"
fi

if [ "\$p_pub" = "yes" ]; then
  check_pass "SSH: PubkeyAuthentication yes"
else
  check_fail "SSH: PubkeyAuthentication" "Valor detectado: '\$p_pub' (esperado: yes)"
fi

# 4. UFW policy and rules
ufw_status=\$(ufw status verbose 2>/dev/null || true)
if printf "%s\n" "\$ufw_status" | grep -qi "Status: active"; then
  check_pass "UFW activo"
else
  check_fail "UFW" "UFW no se encuentra activo"
fi

if printf "%s\n" "\$ufw_status" | grep -qi "Default: deny (incoming), allow (outgoing)"; then
  check_pass "UFW políticas: deny incoming, allow outgoing"
else
  check_fail "UFW políticas" "Políticas por defecto difieren de deny incoming, allow outgoing"
fi

if printf "%s\n" "\$ufw_status" | grep -E -q "(22/tcp.*ALLOW|OpenSSH.*ALLOW)"; then
  check_pass "UFW regla: OpenSSH permitido"
else
  check_fail "UFW regla" "No se encontró regla activa para OpenSSH en UFW"
fi

# 5. Externally bound sockets limited to port 22
non_ssh_external=\$(ss -tlpn 2>/dev/null | awk 'NR>1 {print \$4}' | grep -v -E '^(127\.|\[::1\]|::ffff:127\.)' | grep -v -E ':(22)$' || true)
if [ -z "\$non_ssh_external" ]; then
  check_pass "Sockets externos limitados estrictamente al puerto 22 (SSH)"
else
  check_fail "Sockets externos" "Puertos externos no autorizados abiertos: \$non_ssh_external"
fi

# 6. Failed units
failed_units=\$(systemctl --failed --no-legend --no-pager 2>/dev/null | awk '{print \$1}' || true)
unexpected_failed=""
for u in \$failed_units; do
  if [ "\$u" != "cloud-init.service" ] && [ -n "\$u" ]; then
    unexpected_failed="\$unexpected_failed \$u"
  fi
done

if [ -z "\$unexpected_failed" ]; then
  if printf "%s\n" "\$failed_units" | grep -q "cloud-init.service"; then
    check_pass "Unidades systemd operativas (cloud-init.service documentado como fallo del proveedor)"
  else
    check_pass "Unidades systemd operativas (0 unidades fallidas)"
  fi
else
  check_fail "Unidades systemd" "Unidades fallidas inesperadas:\$unexpected_failed"
fi

# 7. Swap
if [ "\$SWAP_GB" -gt 0 ]; then
  swap_total=\$(free -m 2>/dev/null | awk '/^Swap:/{print \$2}' || echo "0")
  swappiness=\$(sysctl -n vm.swappiness 2>/dev/null || echo "")
  if [ "\$swap_total" -gt 0 ] && [ "\$swappiness" = "10" ]; then
    check_pass "Swap activo (\${swap_total}MB, vm.swappiness=\$swappiness)"
  else
    check_fail "Swap" "Configuración incompleta (total=\${swap_total}MB, swappiness=\$swappiness)"
  fi
else
  check_pass "Swap omitido por configuración (0 GiB)"
fi

# 8. Pending updates
if command -v apt-get >/dev/null 2>&1; then
  sim_up=\$(apt-get --simulate upgrade 2>/dev/null | grep -E '^[0-9]+ upgraded' || echo "")
  check_pass "Actualizaciones: \${sim_up:-al día o escalonadas}"
fi

# 9. Reboot-required
if [ -f /var/run/reboot-required ]; then
  check_fail "Reinicio del sistema" "Existe /var/run/reboot-required (se requiere reinicio)"
else
  check_pass "Sin reinicio pendiente"
fi

# 10. Unattended upgrades
if systemctl is-active --quiet unattended-upgrades 2>/dev/null || systemctl is-enabled --quiet unattended-upgrades 2>/dev/null; then
  check_pass "Actualizaciones automáticas (unattended-upgrades) activas"
else
  check_fail "Unattended upgrades" "El servicio unattended-upgrades no está activo"
fi

# 11. CPU vulnerability status (informational)
if [ -f /sys/devices/system/cpu/vulnerabilities/spec_rstack_overflow ]; then
  srso_status=\$(cat /sys/devices/system/cpu/vulnerabilities/spec_rstack_overflow 2>/dev/null || echo "desconocido")
  check_info "Vulnerabilidad CPU Spec Rstack Overflow (SRSO)" "\$srso_status"
fi

if [ "\$OVERALL_STATUS" -ne 0 ]; then
  echo "ERROR: Una o más comprobaciones obligatorias no pasaron." >&2
  exit 1
fi

echo "Todas las comprobaciones obligatorias pasaron exitosamente."
exit 0
EOF
}

# ==============================================================================
# Helper Functions for Remote Script Execution
# ==============================================================================

execute_remote_phase_as_root() {
  local host="$1"
  local script_content="$2"
  local b64_payload
  b64_payload="$(printf '%s' "$script_content" | base64 | tr -d '\r\n')"

  ssh -t "root@${host}" \
    "TMP_SCRIPT=\$(mktemp /tmp/bootstrap-XXXXXX.sh) && printf '%s' '$b64_payload' | base64 -d > \"\$TMP_SCRIPT\" && chmod 700 \"\$TMP_SCRIPT\" && { bash \"\$TMP_SCRIPT\"; RC=\$?; rm -f \"\$TMP_SCRIPT\"; exit \$RC; }"
}

execute_remote_phase_as_user() {
  local user="$1"
  local host="$2"
  local key_file="$3"
  local script_content="$4"
  local b64_payload
  b64_payload="$(printf '%s' "$script_content" | base64 | tr -d '\r\n')"

  ssh -t -i "$key_file" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${user}@${host}" \
    "TMP_SCRIPT=\$(mktemp /tmp/bootstrap-XXXXXX.sh) && printf '%s' '$b64_payload' | base64 -d > \"\$TMP_SCRIPT\" && chmod 700 \"\$TMP_SCRIPT\" && { sudo bash \"\$TMP_SCRIPT\"; RC=\$?; rm -f \"\$TMP_SCRIPT\"; exit \$RC; }"
}

configure_local_ssh_alias() {
  local server="$1"
  local user="$2"
  local alias="$3"
  local key="$4"

  local ssh_config="$HOME/.ssh/config"
  local ssh_dir="$HOME/.ssh"

  mkdir -p "$ssh_dir"
  chmod 700 "$ssh_dir"

  if [ -f "$ssh_config" ]; then
    if grep -E -q "^[[:space:]]*Host[[:space:]]+([^#]*[[:space:]])?${alias}([[:space:]]|$)" "$ssh_config"; then
      echo "El alias '${alias}' ya está configurado en ${ssh_config}. No se sobrescribirá."
      echo "Puedes conectarte usando: ssh ${alias}"
      return 0
    fi
    cp "$ssh_config" "${ssh_config}.bak-bootstrap"
    echo "Respaldo creado en ${ssh_config}.bak-bootstrap."
  else
    touch "$ssh_config"
    chmod 600 "$ssh_config"
  fi

  # A ~/ path works for OpenSSH on Linux, macOS, Git Bash, and native Windows,
  # unlike the MSYS form /c/Users/... that Git Bash expands $HOME to.
  local tilde='~'
  local identity_file="${key/#"$HOME"/$tilde}"

  cat >> "$ssh_config" <<EOF

Host ${alias}
    HostName ${server}
    User ${user}
    IdentityFile ${identity_file}
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOF

  chmod 600 "$ssh_config"
  echo "Alias '${alias}' configurado exitosamente en ${ssh_config}."
  echo "Puedes acceder directamente a tu servidor con:"
  echo "  ssh ${alias}"
}

# ==============================================================================
# Main Workflow
# ==============================================================================

main() {
  echo "=============================================================================="
  echo "       Aprovisionamiento Seguro de VPS Ubuntu 24.04 (Monteluna)               "
  echo "=============================================================================="

  # ----------------------------------------------------------------------------
  # P0: Tooling check and Inputs
  # ----------------------------------------------------------------------------
  local required_tools="bash ssh ssh-keygen ssh-agent ssh-add base64"
  for tool in $required_tools; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "ERROR: La herramienta local '$tool' es requerida pero no está instalada." >&2
      exit 1
    fi
  done

  echo ""
  echo "Ingresa los datos para configurar tu servidor:"
  echo ""

  local server_address=""
  while true; do
    printf "Dirección del servidor (IPv4, IPv6 o hostname): "
    read -r server_address || true
    if validate_server_address "$server_address"; then
      break
    fi
    echo "Dirección inválida. Intenta nuevamente (ej. 203.0.113.10 o vps.ejemplo.com)."
  done

  local admin_user=""
  while true; do
    printf "Nombre del usuario administrador (no root, ej. monteluna): "
    read -r admin_user || true
    if validate_username "$admin_user"; then
      break
    fi
    echo "Nombre de usuario inválido. Debe iniciar con minúscula y contener letras minúsculas, números o guiones (máx 32 caracteres)."
  done

  local ssh_alias=""
  while true; do
    printf "Alias SSH local para el servidor [contabo-vps]: "
    read -r ssh_alias || true
    if [ -z "$ssh_alias" ]; then
      ssh_alias="contabo-vps"
    fi
    if validate_alias "$ssh_alias"; then
      break
    fi
    echo "Alias SSH inválido. Debe iniciar con minúscula y contener letras minúsculas, números o guiones."
  done

  local default_key_path="${HOME}/.ssh/${ssh_alias}_ed25519"
  local key_path=""
  printf "Ruta del archivo de clave SSH [%s]: " "$default_key_path"
  read -r key_path || true
  if [ -z "$key_path" ]; then
    key_path="$default_key_path"
  fi
  # Expand leading tilde if present
  key_path="${key_path/#\~/$HOME}"

  local swap_size_gb=""
  while true; do
    printf "Tamaño de swap en GiB (0 para omitir, máx 8) [2]: "
    read -r swap_size_gb || true
    if [ -z "$swap_size_gb" ]; then
      swap_size_gb="2"
    fi
    if validate_swap_size "$swap_size_gb"; then
      break
    fi
    echo "Tamaño de swap inválido. Ingresa un entero entre 0 y 8."
  done

  echo ""
  echo "------------------------------------------------------------------------------"
  echo "Resumen de configuración:"
  echo "  Servidor:               $server_address"
  echo "  Usuario administrador:  $admin_user"
  echo "  Alias SSH:              $ssh_alias"
  echo "  Clave SSH:              $key_path"
  echo "  Tamaño de swap:         $swap_size_gb GiB"
  echo "------------------------------------------------------------------------------"
  printf "¿Deseas continuar con estos valores? (si/no): "
  local confirm=""
  read -r confirm || true
  if [ "$confirm" != "si" ]; then
    echo "Aprovisionamiento cancelado por el usuario."
    exit 0
  fi

  # ----------------------------------------------------------------------------
  # P1: SSH Key Generation / Reuse & ssh-agent setup
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 1: Clave SSH local y agente de autenticación ==="
  mkdir -p "$(dirname "$key_path")"
  chmod 700 "$(dirname "$key_path")"

  if [ -f "$key_path" ] || [ -f "${key_path}.pub" ]; then
    echo "Clave SSH existente detectada en $key_path."
    echo "Huella digital:"
    ssh-keygen -lf "${key_path}.pub" 2>/dev/null || ssh-keygen -lf "$key_path"
  else
    echo "Generando nueva clave SSH Ed25519..."
    ssh-keygen -t ed25519 -a 100 -f "$key_path" -C "${ssh_alias}-$(date +%Y%m%d)"
    echo "Huella digital de la nueva clave:"
    ssh-keygen -lf "${key_path}.pub"
  fi

  local pubkey_file="${key_path}.pub"
  if [ ! -f "$pubkey_file" ]; then
    echo "ERROR: No se encontró el archivo de clave pública $pubkey_file." >&2
    exit 1
  fi
  local pubkey_content
  pubkey_content="$(cat "$pubkey_file")"

  echo "Iniciando ssh-agent temporal para la sesión..."
  eval "$(ssh-agent -s)"
  SSH_AGENT_STARTED=1
  echo "Agregando clave al ssh-agent (ingresa tu frase de paso si tiene una):"
  ssh-add "$key_path"

  # ----------------------------------------------------------------------------
  # P2: Initial Provisioning as root
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 2: Conexión inicial como root ==="
  echo "A continuación, OpenSSH te solicitará la contraseña de root asignada por el proveedor:"
  local p2_script
  p2_script="$(generate_phase2_script "$admin_user" "$pubkey_content")"
  execute_remote_phase_as_root "$server_address" "$p2_script"

  # ----------------------------------------------------------------------------
  # Gate G2: Verification of fresh key-only login and sudo
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Puerta G2: Verificando acceso con clave y sudo para $admin_user ==="
  echo "Ingresa la contraseña de $admin_user cuando sudo la solicite."
  # The output is not captured so the sudo prompt stays visible; the remote
  # exit status alone decides the gate.
  if ! ssh -t -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" 'test "$(sudo whoami)" = root'; then
    echo "ERROR: Falló la verificación de acceso por clave y sudo para $admin_user." >&2
    echo "Se esperaba que 'sudo whoami' respondiera 'root'." >&2
    echo "Deteniendo aprovisionamiento para evitar bloqueos del sistema." >&2
    exit 1
  fi
  echo "Puerta G2 aprobada: el usuario $admin_user autentica con clave y posee privilegios sudo."

  # ----------------------------------------------------------------------------
  # Gate G1: Contabo VNC Console Verification
  # ----------------------------------------------------------------------------
  echo ""
  echo "=============================================================================="
  echo "=== Puerta G1: Verificación de Consola VNC de Emergencia                   ==="
  echo "=============================================================================="
  echo "Antes de habilitar el firewall y cerrar el acceso por contraseña en SSH,"
  echo "es INDISPENSABLE contar con una vía alternativa de rescate ante bloqueos."
  echo ""
  echo "Pasos para verificar tu acceso VNC en Contabo:"
  echo "1. Ingresa a tu panel de control de Contabo (Customer Control Panel)."
  echo "2. Ve a 'VPS Control' -> 'VNC'."
  echo "3. Establece una contraseña para VNC y pulsa 'Confirmar'."
  echo "4. Anota la IP y puerto VNC asignado (ej. 5900+X)."
  echo "5. Abre la aplicación oficial TigerVNC Viewer y conéctate."
  echo "6. Comprueba que la consola llega al prompt de login de Ubuntu."
  echo "------------------------------------------------------------------------------"
  printf "¿Confirmas que la consola VNC está activa y llega al prompt de login? Escribe 'si' para continuar: "
  local vnc_confirmed=""
  read -r vnc_confirmed || true
  if [ "$vnc_confirmed" != "si" ]; then
    echo "Aprovisionamiento detenido por seguridad."
    echo "Por favor prueba y confirma tu acceso VNC antes de continuar."
    exit 1
  fi
  echo "Puerta G1 aprobada: consola VNC confirmada."

  # ----------------------------------------------------------------------------
  # P3: System Updates & Reboot (if required)
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 3: Actualizaciones del sistema operativo ==="
  local p3_script
  p3_script="$(generate_phase3_script)"
  execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p3_script"

  local reboot_needed="NO"
  if ssh -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" "test -f /var/run/reboot-required" 2>/dev/null; then
    reboot_needed="YES"
  fi

  if [ "$reboot_needed" = "YES" ]; then
    echo ""
    echo "Se han instalado actualizaciones del kernel o paquetes base que requieren reiniciar el servidor."
    printf "¿Deseas reiniciar el servidor ahora? (si/no): "
    local do_reboot=""
    read -r do_reboot || true
    if [ "$do_reboot" = "si" ]; then
      # The boot_id changes on every boot, so the wait loop can tell a real
      # restart apart from the old system still answering on port 22.
      local pre_boot_id
      pre_boot_id="$(ssh -i "$key_path" \
        -o PasswordAuthentication=no \
        -o KbdInteractiveAuthentication=no \
        -o IdentitiesOnly=yes \
        "${admin_user}@${server_address}" "cat /proc/sys/kernel/random/boot_id")"
      echo "Reiniciando servidor (ingresa la contraseña de $admin_user si sudo la solicita)..."
      if ! ssh -t -i "$key_path" \
        -o PasswordAuthentication=no \
        -o KbdInteractiveAuthentication=no \
        -o IdentitiesOnly=yes \
        "${admin_user}@${server_address}" "sudo -v && { sudo systemctl reboot; true; }"; then
        # ssh exits 255 when the reboot closes the connection; only a failed
        # sudo authentication leaves the old boot running, checked below.
        echo "La conexión se cerró durante el reinicio (esperado)."
      fi

      echo "Esperando a que el servidor vuelva a estar disponible (hasta 5 minutos)..."
      local reboot_success=0
      local elapsed=0
      while [ "$elapsed" -lt 300 ]; do
        sleep 5
        elapsed=$((elapsed + 5))
        local current_boot_id=""
        current_boot_id="$(ssh -i "$key_path" \
          -o ConnectTimeout=5 \
          -o PasswordAuthentication=no \
          -o KbdInteractiveAuthentication=no \
          -o IdentitiesOnly=yes \
          "${admin_user}@${server_address}" "cat /proc/sys/kernel/random/boot_id" 2>/dev/null || true)"
        if [ -n "$current_boot_id" ] && [ "$current_boot_id" != "$pre_boot_id" ]; then
          reboot_success=1
          break
        fi
      done

      if [ "$reboot_success" -ne 1 ]; then
        echo "ERROR: No se detectó un arranque nuevo del servidor en 5 minutos." >&2
        echo "Si sudo rechazó la contraseña, el servidor no se reinició: vuelve a ejecutar el script." >&2
        echo "Si el servidor no responde, revisa su estado desde la consola VNC de Contabo." >&2
        exit 1
      fi

      local active_kernel
      active_kernel="$(ssh -i "$key_path" \
        -o PasswordAuthentication=no \
        -o KbdInteractiveAuthentication=no \
        -o IdentitiesOnly=yes \
        "${admin_user}@${server_address}" "uname -r" 2>/dev/null || echo "desconocido")"
      echo "Servidor en línea nuevamente. Kernel activo: $active_kernel."
    else
      echo "Reinicio omitido por elección del usuario."
    fi
  fi

  # ----------------------------------------------------------------------------
  # P4: UFW Firewall & Rollback Guard
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 4: Configuración de UFW con protección automática de rollback ==="
  local p4_script
  p4_script="$(generate_phase4_script)"
  execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p4_script"

  echo "Verificando conectividad local mediante inicio de sesión con clave tras activar UFW..."
  if ! ssh -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" "true" 2>/dev/null; then
    echo "ERROR: No fue posible conectar con el servidor tras activar UFW." >&2
    echo "ADVERTENCIA: El temporizador de rollback desactivará UFW automáticamente en menos de 5 minutos." >&2
    exit 1
  fi
  echo "Conectividad SSH con clave verificada exitosamente tras habilitar UFW."

  echo "Cancelando el temporizador de rollback de UFW..."
  if ! ssh -t -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" \
    "sudo -v && { sudo systemctl stop ufw-bootstrap-rollback.timer 2>/dev/null; sudo systemctl reset-failed ufw-bootstrap-rollback.timer ufw-bootstrap-rollback.service 2>/dev/null; ! systemctl is-active --quiet ufw-bootstrap-rollback.timer; }"; then
    echo "ERROR: Falló la cancelación o verificación del temporizador de rollback de UFW." >&2
    echo "ADVERTENCIA CRÍTICA: El rollback automático de UFW se ejecutará en menos de 5 minutos y desactivará el firewall." >&2
    exit 1
  fi
  echo "Rollback temporal de UFW cancelado exitosamente y verificado inactivo."

  # ----------------------------------------------------------------------------
  # P5: SSH Hardening & Rollback Guard
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 5: Endurecimiento de SSH con protección automática de rollback ==="
  local p5_script
  p5_script="$(generate_phase5_script)"
  execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p5_script"

  echo "Verificando políticas de endurecimiento SSH..."

  # Test 1: Key login succeeds
  if ! ssh -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" "true" 2>/dev/null; then
    echo "ERROR: Falló la conexión con clave tras recargar SSH." >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi
  echo "Conexión por clave de $admin_user confirmada."

  # Test 2: Password-only login is rejected (authoritative check)
  local pass_err=""
  set +e
  pass_err="$(ssh -o PubkeyAuthentication=no \
    -o PreferredAuthentications=password,keyboard-interactive \
    -o NumberOfPasswordPrompts=0 \
    -o ConnectTimeout=10 \
    "${admin_user}@${server_address}" "true" 2>&1)"
  local pass_rc=$?
  set -e

  if [ "$pass_rc" -eq 0 ]; then
    echo "ERROR CRÍTICO DE SEGURIDAD: El inicio de sesión por contraseña tuvo éxito." >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi

  if ! printf "%s" "$pass_err" | grep -qi "Permission denied (publickey)"; then
    echo "ERROR: El servidor no rechazó la conexión ofreciendo exclusivamente publickey." >&2
    echo "Salida obtenida: $pass_err" >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi

  if printf "%s" "$pass_err" | grep -Ei -q "(password|keyboard-interactive)"; then
    echo "ERROR: El servidor aún ofrece métodos de autenticación por contraseña o interactivos." >&2
    echo "Salida obtenida: $pass_err" >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi
  echo "Autenticación por contraseña rechazada autoritativamente (solo publickey ofrecido)."

  # Test 3: Root login is rejected (authoritative check)
  local root_err=""
  set +e
  root_err="$(ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    "root@${server_address}" "true" 2>&1)"
  local root_rc=$?
  set -e

  if [ "$root_rc" -eq 0 ]; then
    echo "ERROR CRÍTICO DE SEGURIDAD: El inicio de sesión como root tuvo éxito." >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi

  if ! printf "%s" "$root_err" | grep -qi "Permission denied (publickey)"; then
    echo "ERROR: El acceso de root no fue rechazado con 'Permission denied (publickey)'." >&2
    echo "Salida obtenida: $root_err" >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi

  if printf "%s" "$root_err" | grep -Ei -q "(password|keyboard-interactive)"; then
    echo "ERROR: El acceso de root ofrece métodos de contraseña o interactivos." >&2
    echo "Salida obtenida: $root_err" >&2
    echo "ADVERTENCIA: El temporizador de rollback restaurará la configuración previa en menos de 5 minutos." >&2
    exit 1
  fi
  echo "Acceso directo de root rechazado autoritativamente."

  # Cancel SSH rollback timer through ssh -t and verify inactive
  echo "Cancelando el temporizador de rollback de SSH..."
  if ! ssh -t -i "$key_path" \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    -o IdentitiesOnly=yes \
    "${admin_user}@${server_address}" \
    "sudo -v && { sudo systemctl stop sshd-bootstrap-rollback.timer 2>/dev/null; sudo systemctl reset-failed sshd-bootstrap-rollback.timer sshd-bootstrap-rollback.service 2>/dev/null; ! systemctl is-active --quiet sshd-bootstrap-rollback.timer; }"; then
    echo "ERROR: Falló la cancelación o verificación del temporizador de rollback de SSH." >&2
    echo "ADVERTENCIA CRÍTICA: El rollback automático de SSH se ejecutará en menos de 5 minutos y restaurará la configuración previa." >&2
    exit 1
  fi
  echo "Políticas SSH verificadas: acceso por clave exclusivo, root y contraseñas rechazados."
  echo "Rollback temporal de SSH cancelado exitosamente y verificado inactivo."

  # ----------------------------------------------------------------------------
  # P6: Swap Configuration
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 6: Configuración de memoria Swap ==="
  if [ "$swap_size_gb" -eq 0 ]; then
    echo "Swap omitido por configuración (0 GiB)."
  else
    local p6_script
    p6_script="$(generate_phase6_script "$swap_size_gb")"
    execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p6_script"
  fi

  # ----------------------------------------------------------------------------
  # P7: Cloud-Init Inspection (Read-Only)
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 7: Diagnóstico de Cloud-Init ==="
  local p7_script
  p7_script="$(generate_phase7_script)"
  execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p7_script"

  # ----------------------------------------------------------------------------
  # P8: Final Readback
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 8: Lectura y Verificación Final del Servidor ==="
  local p8_script
  p8_script="$(generate_phase8_script "$admin_user" "$swap_size_gb")"
  execute_remote_phase_as_user "$admin_user" "$server_address" "$key_path" "$p8_script"

  # ----------------------------------------------------------------------------
  # P9: Local SSH Config Alias
  # ----------------------------------------------------------------------------
  echo ""
  echo "=== Fase 9: Alias local en ~/.ssh/config ==="
  printf "¿Deseas configurar el alias '%s' en tu archivo local ~/.ssh/config? (si/no) [si]: " "$ssh_alias"
  local add_alias=""
  read -r add_alias || true
  if [ -z "$add_alias" ] || [ "$add_alias" = "si" ]; then
    configure_local_ssh_alias "$server_address" "$admin_user" "$ssh_alias" "$key_path"
  else
    echo "Configuración de alias local omitida."
  fi

  echo ""
  echo "=============================================================================="
  echo " ¡Aprovisionamiento completado exitosamente!                                 "
  echo " Servidor seguro y listo: $server_address (alias: $ssh_alias)                "
  echo "=============================================================================="
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
