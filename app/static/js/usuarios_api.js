import { getJson, postJson, putJson } from '/static/js/apiClient.js';

// Small helper to show notifications (keeps style used in template)
function showNotification(message, type='success'){
    // Use the app's flash container and markup so behavior matches other modules
    const container = document.getElementById('flashContainer');
    const toast = document.createElement('div');
    toast.className = `flash ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    toast.setAttribute('role', 'alert');
    const body = document.createElement('div');
    body.className = 'flash-body';
    body.textContent = message;
    toast.appendChild(body);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'flash-close btn-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.innerHTML = '&times;';
    toast.appendChild(closeBtn);

    const isMobile = window.innerWidth <= 576;
    if (isMobile) {
        toast.style.position = 'fixed';
        toast.style.left = '12px';
        toast.style.right = '12px';
        toast.style.bottom = '12px';
        toast.style.zIndex = 9999;
        document.body.appendChild(toast);
    } else if (container) {
        container.appendChild(toast);
    } else {
        toast.style.position = 'fixed';
        toast.style.right = '20px';
        toast.style.top = '20px';
        toast.style.zIndex = 9999;
        document.body.appendChild(toast);
    }

    if (window.lucide && typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try { lucide.createIcons(); } catch (e) {}
    }

    const timeout = 3500;
    const t = setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => { try { toast.remove(); } catch (e) {} }, 400);
    }, timeout);

    closeBtn.addEventListener('click', () => {
        clearTimeout(t);
        toast.classList.add('hide');
        setTimeout(() => { try { toast.remove(); } catch (e) {} }, 300);
    });
}

let roles = [];
let users = [];
let editingUserId = null;
let loggeos = [];

const btnAgregarUsuario = document.getElementById('btnAgregarUsuario');
const btnCerrarModal = document.getElementById('btnCerrarModal');
const btnCancelar = document.getElementById('btnCancelar');
const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
if (!userForm) {
    // If the form isn't present, stop further binding to avoid silent failures
    console.warn('usuarios_api: #userForm not found — aborting script bindings');
}
const usersTableBody = document.getElementById('usersTableBody');

async function loadRoles(){
    try{
        const data = await getJson('/api/roles');
        roles = Array.isArray(data) ? data : [];
        const select = document.getElementById('userRole');
        // Clear existing except placeholder
        select.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
        roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id; // use id for backend
            opt.textContent = r.nombre_rol;
            select.appendChild(opt);
        });
    }catch(err){
        console.error('Error loading roles', err);
        showNotification('No se pudieron cargar los roles desde la API', 'error');
    }
}

async function loadUsers(){
    try{
        const data = await getJson('/api/usuarios');
        users = Array.isArray(data) ? data : [];
        // also load loggeo to determine current session state per user
        try {
            const ldata = await getJson('/api/loggeo');
            loggeos = Array.isArray(ldata) ? ldata : [];
        } catch (e) {
            console.warn('no loggeo data', e);
            loggeos = [];
        }
        renderUsers();
    }catch(err){
        console.error('Error loading usuarios', err);
        showNotification('No se pudieron cargar los usuarios desde la API', 'error');
    }
}

function roleNameForId(id){
    const r = roles.find(x=>String(x.id) === String(id));
    return r ? r.nombre_rol : '—';
}

function renderUsers(){
    usersTableBody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        // Determine latest loggeo for this user (if any)
        const userLoggeos = loggeos.filter(l => String(l.id_usuario) === String(user.id));
        let latest = null;
        if (userLoggeos.length) {
            // loggeos are returned ordered by fecha_login desc from the API; pick first
            latest = userLoggeos[0];
        }
        const active = latest ? ((latest.estado_sesion || '').toString().toLowerCase() === 'activa') : true;
        tr.innerHTML = `
            <td>${String(user.id).padStart(3,'0')}</td>
            <td>${user.nombre || ''}</td>
            <td>${user.email || ''}</td>
            <td>${roleNameForId(user.id_rol)}</td>
            <td>
                <span class="badge-${active ? 'active' : 'inactive'}">
                    <i data-lucide="${active ? 'check-circle' : 'slash'}" class="me-1 estado-anim"></i>
                    ${active ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <button class="btn-icon btn-edit" data-id="${user.id}" title="Editar">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-icon btn-${active ? 'deactivate' : 'activate'}" data-id="${user.id}" data-action="toggle" title="${active ? 'Desactivar' : 'Activar'}">
                    <i data-lucide="${active ? 'lock' : 'unlock'}"></i>
                </button>
            </td>
        `;
        usersTableBody.appendChild(tr);
    });
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    // attach listeners
    document.querySelectorAll('.btn-edit').forEach(btn=>{
        btn.addEventListener('click', e=>{
            const id = parseInt(btn.getAttribute('data-id'));
            editUser(id);
        });
    });
    document.querySelectorAll('[data-action="toggle"]').forEach(btn=>{
        btn.addEventListener('click', e=>{
            const id = parseInt(btn.getAttribute('data-id'));
            toggleUserStatus(id);
        });
    });
}

function openAddUserModal(){
    editingUserId = null;
    document.getElementById('modalTitle').textContent = 'Agregar Usuario';
    userForm.reset();
    document.getElementById('userId').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('passwordHelp').classList.add('d-none');
    userModal.classList.remove('d-none');
}

function closeUserModal(){
    userModal.classList.add('d-none');
    userForm.reset();
    editingUserId = null;
}

function editUser(userId){
    const user = users.find(u=>u.id === userId);
    if (!user) return showNotification('Usuario no encontrado', 'error');
    editingUserId = userId;
    document.getElementById('modalTitle').textContent = 'Editar Usuario';
    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.nombre || '';
    document.getElementById('userEmail').value = user.email || '';
    // try to select the user's role id
    if (user.id_rol) document.getElementById('userRole').value = user.id_rol;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('passwordHelp').classList.remove('d-none');
    userModal.classList.remove('d-none');
}

function toggleUserStatus(userId){
    // Persist session state in loggeo: create a new loggeo entry with estado_sesion
    const user = users.find(u => u.id === userId);
    if (!user) return showNotification('Usuario no encontrado', 'error');
    // Determine current state from last loggeo
    const userLoggeos = loggeos.filter(l => String(l.id_usuario) === String(userId));
    const latest = userLoggeos.length ? userLoggeos[0] : null;
    const isActive = latest ? ((latest.estado_sesion || '').toString().toLowerCase() === 'activa') : true;
    const newState = isActive ? 'Inactiva' : 'Activa';
    const payload = {
        id_usuario: userId,
        estado_sesion: newState,
    };
    // set fecha_logout when deactivating, fecha_login when activating
    const now = new Date().toISOString();
    if (isActive) payload['fecha_logout'] = now; else payload['fecha_login'] = now;
    postJson('/api/loggeo', payload).then(res => {
        // refresh loggeos and users display
        return getJson('/api/loggeo');
    }).then(ld => {
        loggeos = Array.isArray(ld) ? ld : [];
        renderUsers();
        showNotification(`Estado de sesión actualizado: ${newState}`, 'success');
    }).catch(err => {
        console.error('Error updating loggeo', err);
        showNotification('No se pudo actualizar el estado de sesión', 'error');
    });
}

// form submit -> create user via API (editing attempts PUT and will fallback to local update if not available)
if (userForm) {
    userForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const roleVal = document.getElementById('userRole').value;
    const password = document.getElementById('userPassword').value;

    if (!name || !email || !roleVal){
        showNotification('Por favor completa todos los campos requeridos', 'error');
        return;
    }

    // Build payload. Models require telefono and username; derive reasonable defaults if not provided by the form.
    const username = email.split('@')[0];
    const telefono = '';
    const direccion = '';

    // Resolve role id: the select may contain either numeric ids (from API) or legacy role names.
    let idRolNum = parseInt(roleVal);
    if (isNaN(idRolNum)) {
        // try to resolve by role name from loaded roles
        const found = roles.find(r => String(r.nombre_rol) === String(roleVal));
        if (found) idRolNum = found.id;
    }
    if (!idRolNum || isNaN(idRolNum)) {
        showNotification('Selecciona un rol válido antes de guardar', 'error');
        return;
    }

    const payload = {
        nombre: name,
        email: email,
        username: username,
        password: password || 'changeme',
        telefono: telefono,
        direccion: direccion,
        id_rol: parseInt(idRolNum)
    };

    if (editingUserId){
        // Try to PUT to update if backend supports it. If API returns error, fallback to a local update.
        try{
            const updated = await putJson(`/api/usuarios/${editingUserId}`, payload);
            showNotification('Usuario actualizado vía API', 'success');
            // refresh users
            await loadUsers();
            closeUserModal();
            return;
        }catch(err){
            console.warn('PUT /api/usuarios/<id> failed or not supported', err);
            // fallback: update local list and re-render
            const idx = users.findIndex(u=>u.id===editingUserId);
            if (idx !== -1){
                users[idx].nombre = payload.nombre;
                users[idx].email = payload.email;
                users[idx].id_rol = payload.id_rol;
                showNotification('Edición aplicada localmente (la API no soporta PUT para usuarios)', 'success');
                renderUsers();
                closeUserModal();
                return;
            }
            showNotification('No se pudo actualizar el usuario', 'error');
            return;
        }
    }

    // Create new user
    try{
        const created = await postJson('/api/usuarios', payload);
        showNotification('Usuario creado correctamente vía API', 'success');
        // refresh users list from API to include DB-assigned id
        await loadUsers();
        closeUserModal();
    }catch(err){
        console.error('Error creando usuario', err);
        showNotification('Error al crear usuario vía API', 'error');
    }
    });
}

btnAgregarUsuario.addEventListener('click', openAddUserModal);
btnCerrarModal.addEventListener('click', closeUserModal);
btnCancelar.addEventListener('click', closeUserModal);
userModal.addEventListener('click', function(e){ if (e.target === this) closeUserModal(); });

// init
(async function init(){
    await loadRoles();
    await loadUsers();
})();
