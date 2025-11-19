// devoluciones.js - Lógica del módulo Devoluciones adaptada para usar window.apiHelpers
// Requiere que `app/static/js/db.js` (api helpers) esté cargado antes.

document.addEventListener('DOMContentLoaded', function() {
    let devoluciones = [];
    let prestamosCache = null;
    let prestamosFetchInProgress = false;
    let usuariosCache = null;
    let usuariosFetchInProgress = false;
    // When a suggestion is selected we temporarily suppress the automatic
    // autocompletion function so it doesn't overwrite the chosen values.
    let suppressAutocomplete = false;

    // Referencias DOM
    const formDevolucion = document.getElementById('formDevolucion');
    const idPrestamoInput = document.getElementById('idPrestamo');
    const nombreResponsableInput = document.getElementById('nombreResponsable');
    const isbnInput = document.getElementById('isbn');
    const tituloLibroInput = document.getElementById('tituloLibro');
    const fechaPrestamoInput = document.getElementById('fechaPrestamo');
    const fechaDevolucionEsperadaInput = document.getElementById('fechaDevolucionEsperada');
    const estadoSelect = document.getElementById('estado');
    const fechaDevolucionRealInput = document.getElementById('fechaDevolucionReal');
    const btnLimpiar = document.querySelector('.btn-secundario');

    const filtroFecha = document.getElementById('filtroFecha');
    const filtroISBN = document.getElementById('filtroISBN');
    const filtroEstado = document.getElementById('filtroEstado');

    const historialContainer = document.querySelector('.seccion-card:last-of-type');

    // Fecha máxima para la fecha real
    const hoy = new Date().toISOString().split('T')[0];
    if (fechaDevolucionRealInput) fechaDevolucionRealInput.setAttribute('max', hoy);

    // Current user (injected by template). Used to display who performed the devolución.
    const CURRENT_USER_NAME = (document.getElementById('currentUserData') && document.getElementById('currentUserData').dataset && document.getElementById('currentUserData').dataset.userName) || '';
    const CURRENT_USER_ID = (document.getElementById('currentUserData') && document.getElementById('currentUserData').dataset && document.getElementById('currentUserData').dataset.userId) || '';

    // --------------------------------------------------------------------------------
    // Funciones que llaman al backend a través de window.apiHelpers (db.js)
    // --------------------------------------------------------------------------------
    async function obtenerTodasLasDevoluciones() {
        if (!window.apiHelpers || !window.apiHelpers.obtenerTodasLasDevoluciones) return [];
        try {
            return await window.apiHelpers.obtenerTodasLasDevoluciones();
        } catch (e) {
            console.error('Error al obtener devoluciones:', e);
            return [];
        }
    }

    async function guardarDevolucionEnBD(devolucion) {
        if (!window.apiHelpers || !window.apiHelpers.guardarDevolucionEnBD) throw new Error('apiHelpers.guardarDevolucionEnBD no disponible');
        return await window.apiHelpers.guardarDevolucionEnBD(devolucion);
    }

    async function buscarPrestamo(params) {
        if (!window.apiHelpers || !window.apiHelpers.buscarPrestamo) return null;
        try {
            return await window.apiHelpers.buscarPrestamo(params);
        } catch (e) {
            console.error('Error buscarPrestamo', e);
            return null;
        }
    }

    // Fetch all prestamos once and cache them for suggestion UX.
    async function fetchPrestamosOnce() {
        if (prestamosCache) return prestamosCache;
        if (prestamosFetchInProgress) return prestamosCache;
        prestamosFetchInProgress = true;
        try {
            const res = await fetch('/api/prestamos', { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
            if (!res.ok) {
                prestamosFetchInProgress = false;
                return null;
            }
            const json = await res.json();
            prestamosCache = json || [];
            prestamosFetchInProgress = false;
            return prestamosCache;
        } catch (e) {
            prestamosFetchInProgress = false;
            console.error('Error fetching prestamos list', e);
            return null;
        }
    }

    async function fetchUsuariosOnce() {
        if (usuariosCache) return usuariosCache;
        if (usuariosFetchInProgress) return usuariosCache;
        usuariosFetchInProgress = true;
        try {
            if (window.apiHelpers && window.apiHelpers.obtenerUsuarios) {
                const users = await window.apiHelpers.obtenerUsuarios();
                usuariosCache = users || [];
            } else {
                usuariosCache = [];
            }
        } catch (e) {
            console.error('Error fetching usuarios', e);
            usuariosCache = [];
        } finally {
            usuariosFetchInProgress = false;
        }
        return usuariosCache;
    }

    async function resolveUsuarioName(id_usuario) {
        if (!id_usuario) return null;
        try {
            const users = await fetchUsuariosOnce();
            const found = (users || []).find(u => String(u.id) === String(id_usuario) || String(u.id || u.id_usuario) === String(id_usuario));
            if (found) return found.nombre || found.name || found.username || null;
        } catch (e) {
            console.error('Error resolving usuario name', e);
        }
        return null;
    }

    // Render suggestion buttons
    function showPrestamoSuggestions(matches) {
        const container = document.getElementById('prestamoSuggestions');
        if (!container) return;
        container.innerHTML = '';
        if (!matches || matches.length === 0) { container.style.display = 'none'; return; }
        matches.slice(0, 30).forEach((p) => {
            // Skip any prestamo that is already devuelto (we don't want to show them at all)
            if (isPrestamoDevuelto(p)) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'list-group-item list-group-item-action';
            btn.dataset.id = p.id || p.id_prestamo || '';
            // Show primary info
            const title = document.createElement('div');
            title.innerHTML = `<strong>${p.elemento_prestado || p.titulo || ('Prestamo ' + (p.id || p.id_prestamo))}</strong>`;
            const small = document.createElement('small');
            small.className = 'text-muted';
            let extra = '';
            if (p.solicitante) extra += `Solicitante: ${p.solicitante}`;
            if (p.fecha_prestamo) extra += (extra ? ' · ' : '') + `Fecha: ${p.fecha_prestamo.split('T')[0]}`;
            small.textContent = extra;
            btn.appendChild(title);
            btn.appendChild(small);
            btn.addEventListener('click', function() {
                onPrestamoSelected(p);
                container.style.display = 'none';
            });
            container.appendChild(btn);
        });
        container.style.display = 'block';
    }

    // Helper: determine whether a prestamo is already marked as devuelto
    function isPrestamoDevuelto(p) {
        if (!p) return false;
        const s = (p.estado || p.estado_prestamo || p.estado_dev || '').toString().toLowerCase();
        return s.includes('devuelto');
    }

    async function onPrestamoSelected(p) {
        if (!p) return;
        // suppress the generic autocompletion for a short moment to avoid races
        suppressAutocomplete = true;
        setTimeout(() => { suppressAutocomplete = false; }, 400);
        // cancel any pending debounce/autocomplete and hide suggestions
        try { clearTimeout(timeoutBusqueda); } catch (e) {}
        const sug = document.getElementById('prestamoSuggestions'); if (sug) sug.style.display = 'none';
        // fill fields
        if (idPrestamoInput) { idPrestamoInput.value = p.id || p.id_prestamo || ''; idPrestamoInput.dataset.resolvedId = p.id || p.id_prestamo || ''; }
        // Fill responsable with the user who performed the loan when available
        (async () => {
            let responsableName = '';
            try {
                if (p.id_usuario || p.idUsuario) {
                    const name = await resolveUsuarioName(p.id_usuario || p.idUsuario);
                    if (name) responsableName = name;
                }
            } catch (e) {
                // ignore
            }
            if (!responsableName) responsableName = p.solicitante || '';
            if (nombreResponsableInput) nombreResponsableInput.value = responsableName;
        })();
        if (fechaPrestamoInput && p.fecha_prestamo) fechaPrestamoInput.value = p.fecha_prestamo.split('T')[0];
        if (fechaDevolucionEsperadaInput && p.fecha_devolucion) fechaDevolucionEsperadaInput.value = p.fecha_devolucion.split('T')[0];
        // Defer setting ISBN/title until we fetch the canonical Libro when available
        // if loan references a libro, store id_libro and try to fetch libro info
        const lid = p.id_libro || p.idLibro || null;
        if (lid && idPrestamoInput) {
            idPrestamoInput.dataset.idLibro = lid;
            try {
                if (window.apiHelpers && window.apiHelpers.obtenerLibro) {
                    const libro = await window.apiHelpers.obtenerLibro(lid);
                    if (libro) {
                        if (isbnInput && libro.ISBN) isbnInput.value = libro.ISBN;
                        if (tituloLibroInput && libro.titulo) tituloLibroInput.value = libro.titulo;
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        clearFieldError(idPrestamoInput);
        clearFieldError(nombreResponsableInput);
    }

    // --------------------------------------------------------------------------------
    // Autocompletar por ID de préstamo o nombre
    // --------------------------------------------------------------------------------
    let timeoutBusqueda = null;
    async function buscarYAutocompletar() {
        const id = idPrestamoInput && idPrestamoInput.value.trim();
        const nombre = nombreResponsableInput && nombreResponsableInput.value.trim();
        if (!id && !nombre) return;
        // Si se llama muy seguido, debounce
        clearTimeout(timeoutBusqueda);
        timeoutBusqueda = setTimeout(async () => {
            try {
                const params = {};
                // Backend expects query params named id_prestamo and solicitante
                if (id) params.id_prestamo = id;
                if (nombre) params.solicitante = nombre;
                const res = await buscarPrestamo(params);
                if (!res) return;
                // Si devuelve un solo préstamo, autocompletar
                const p = Array.isArray(res) ? (res[0] || null) : res;
                if (p) {
                    // If the found préstamo is already marked as devuelto, do not autocomplete/select it
                    // We intentionally DO NOT show a notification here; notifications appear only
                    // when the user explicitly clicks a devuelto item in the suggestions.
                    if (isPrestamoDevuelto(p)) {
                        return;
                    }
                    // If a suggestion was just selected, skip applying this autocomplete
                    if (suppressAutocomplete) return;
                    // Map API response fields. Prestamo.to_dict() returns 'id' and 'id_libro'
                    // Store the resolved IDs in dataset for later submission
                    if (idPrestamoInput) idPrestamoInput.dataset.resolvedId = p.id || p.id_prestamo || '';
                    // Resolve and fill nombreResponsable from usuario linked to prestamo if possible
                    try {
                        let resolvedName = '';
                        if (p.id_usuario || p.idUsuario) {
                            const n = await resolveUsuarioName(p.id_usuario || p.idUsuario);
                            if (n) resolvedName = n;
                        }
                        if (!resolvedName) resolvedName = p.solicitante || '';
                        if (nombreResponsableInput) nombreResponsableInput.value = resolvedName;
                    } catch (e) {
                        // ignore resolution errors
                    }
                    // Prefer to get book info from the referenced libro (id_libro) when available
                    if (idPrestamoInput && (p.id_libro || p.idLibro)) idPrestamoInput.dataset.idLibro = p.id_libro || p.idLibro;
                    if (idPrestamoInput && idPrestamoInput.dataset.idLibro) {
                        try {
                            if (window.apiHelpers && window.apiHelpers.obtenerLibro) {
                                const libro = await window.apiHelpers.obtenerLibro(idPrestamoInput.dataset.idLibro);
                                if (libro) {
                                    if (isbnInput && (libro.ISBN || libro.ISBN === '')) isbnInput.value = libro.ISBN || '';
                                    if (tituloLibroInput && libro.titulo) tituloLibroInput.value = libro.titulo || (p.elemento_prestado || p.titulo || '');
                                } else {
                                    if (isbnInput && (p.ISBN || p.isbn)) isbnInput.value = p.ISBN || p.isbn || '';
                                    if (tituloLibroInput) tituloLibroInput.value = p.elemento_prestado || p.titulo || '';
                                }
                            } else {
                                if (isbnInput) isbnInput.value = p.ISBN || p.isbn || '';
                                if (tituloLibroInput) tituloLibroInput.value = p.elemento_prestado || p.titulo || '';
                            }
                        } catch (e) {
                            // if fetching libro fails, fall back to prestamo fields
                            if (isbnInput) isbnInput.value = p.ISBN || p.isbn || '';
                            if (tituloLibroInput) tituloLibroInput.value = p.elemento_prestado || p.titulo || '';
                        }
                    } else {
                        if (isbnInput && (p.ISBN || p.isbn)) isbnInput.value = p.ISBN || p.isbn || '';
                        if (tituloLibroInput) tituloLibroInput.value = p.elemento_prestado || p.titulo || '';
                    }
                    if (fechaPrestamoInput && p.fecha_prestamo) fechaPrestamoInput.value = p.fecha_prestamo.split('T')[0];
                    if (fechaDevolucionEsperadaInput && p.fecha_devolucion) fechaDevolucionEsperadaInput.value = p.fecha_devolucion.split('T')[0];
                    
                }
            } catch (e) {
                console.error('Error autocompletar:', e);
            }
        }, 300);
    }

    if (idPrestamoInput) {
        idPrestamoInput.addEventListener('blur', buscarYAutocompletar);
        idPrestamoInput.addEventListener('input', function() {
            clearTimeout(timeoutBusqueda);
            timeoutBusqueda = setTimeout(async () => {
                buscarYAutocompletar();
                // suggestions UX: if input is numeric, show prestamos whose id starts with value
                const v = idPrestamoInput.value.trim();
                const sugContainer = document.getElementById('prestamoSuggestions');
                if (!v) { if (sugContainer) sugContainer.style.display = 'none'; return; }
                // numeric check
                const numeric = /^\d+$/.test(v);
                if (!numeric) { if (sugContainer) sugContainer.style.display = 'none'; return; }
                const all = await fetchPrestamosOnce();
                if (!all) { if (sugContainer) sugContainer.style.display = 'none'; return; }
                // Show prestamos whose id starts with value, but exclude those already devueltos
                const matches = all
                    .filter(p => String(p.id || p.id_prestamo).startsWith(v))
                    .filter(p => !isPrestamoDevuelto(p));
                showPrestamoSuggestions(matches);
            }, 250);
        });
    }
    // Nombre del responsable: campo de solo lectura (autocompletado desde el préstamo)
    if (nombreResponsableInput) {
        nombreResponsableInput.readOnly = true;
        nombreResponsableInput.title = 'Autocompletado desde el préstamo (no editable)';
    }

    // --------------------------------------------------------------------------------
    // Renderizar historial
    // --------------------------------------------------------------------------------
    function formatearFecha(fecha) {
        if (!fecha) return '';
        const d = new Date(fecha);
        if (isNaN(d)) return fecha;
        return d.toLocaleDateString();
    }

    function crearRegistroHTML(dev) {
        const wrapper = document.createElement('div');
        wrapper.className = 'registro-historial';
        // attach data id for later lookup/highlight
        try { wrapper.dataset.idDevolucion = dev.id || dev.id_devolucion || ''; } catch (e) {}

        const left = document.createElement('div');
        left.className = 'registro-header-historial';
    const titulo = document.createElement('div');
    titulo.className = 'registro-titulo-historial';
    const titleText = dev.tituloLibro || dev.titulo || dev.elemento_prestado || '—';
    // Prefer mostrar editorial en vez de ISBN si está disponible
    const editorialText = dev.editorial || dev.isbn || '';
    titulo.textContent = titleText + (editorialText ? ` — ${editorialText}` : '');

        const info = document.createElement('div');
        info.className = 'registro-info-text';
        // Mostrar 'Devuelto por' como el usuario que realizó la acción (sesión actual) cuando esté disponible.
        const quien = CURRENT_USER_NAME || dev.nombreResponsable || dev.responsable || '';
        info.innerHTML = `Devuelto por <strong>${quien}</strong><br>
            Fecha de devolución: ${formatearFecha(dev.fechaDevolucionReal || dev.fecha_devolucion_real)} `;

        left.appendChild(titulo);
        left.appendChild(info);

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.alignItems = 'flex-end';
        right.style.gap = '6px';

        const estado = document.createElement('span');
        estado.className = 'badge-estado';
        const est = (dev.estado || dev.estado_dev || '').toLowerCase();
        if (est.includes('devuelto')) estado.classList.add('badge-devuelto');
        else if (est.includes('vencido') || est.includes('retraso')) estado.classList.add('badge-rojo');
        else estado.classList.add('badge-tiempo');
        estado.textContent = dev.estado || dev.estado_dev || '—';

        const fechaPrest = document.createElement('div');
        fechaPrest.className = 'registro-info-text';
        fechaPrest.textContent = `Prestado: ${formatearFecha(dev.fechaPrestamo || dev.fecha_prestamo)}`;

        right.appendChild(estado);
        right.appendChild(fechaPrest);

        wrapper.appendChild(left);
        wrapper.appendChild(right);
        return wrapper;
    }

    function renderizarHistorial(lista) {
        if (!historialContainer) return;
        // Vaciar la sección-card (la última del template es el historial)
        // buscamos el contenedor de registros dentro de esa seccion
        // Para simplicidad, reemplazamos el innerHTML con una lista
        const container = historialContainer;
        // Mantener título (h2), reemplazar contenido posterior
        const h2 = container.querySelector('h2');
        let content = container.querySelector('.historial-list');
        if (!content) {
            content = document.createElement('div');
            content.className = 'historial-list';
        } else {
            content.innerHTML = '';
        }

        const datos = lista || devoluciones || [];
        if (datos.length === 0) {
            const aviso = document.createElement('div');
            aviso.className = 'registro-info-text';
            aviso.textContent = 'No hay devoluciones registradas.';
            content.appendChild(aviso);
        } else {
            datos.forEach(d => content.appendChild(crearRegistroHTML(d)));
        }

        // replace or append
        if (!container.querySelector('.historial-list')) container.appendChild(content);
    }

    // --------------------------------------------------------------------------------
    // Validación y envío del formulario
    // --------------------------------------------------------------------------------
    // UI helpers: show messages and field-level errors
    function ensureAlertContainer() {
        // Deprecated for this module — notifications are now floating toasts.
        // Keep for backward-compat but return null so callers don't insert inline alerts.
        return null;
    }

    // Floating toast-style notification (top-right). Replaces inline alert usage.
    function showMessage(type, text, timeout = 6000) {
        try {
            let container = document.getElementById('globalNotifications');
            if (!container) {
                container = document.createElement('div');
                container.id = 'globalNotifications';
                container.style.position = 'fixed';
                container.style.top = '1rem';
                container.style.right = '1rem';
                container.style.zIndex = 1050;
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '0.5rem';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.className = `alert alert-${type} devolucion-toast`;
            toast.role = 'alert';
            toast.textContent = text;
            toast.style.minWidth = '220px';
            toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 240ms ease, transform 240ms ease';
            toast.style.transform = 'translateY(-6px)';
            container.appendChild(toast);
            // fade in
            requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'none'; });
            if (timeout) setTimeout(() => {
                // fade out then remove
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 260);
            }, timeout);
            return toast;
        } catch (e) {
            // fallback: console and no-op
            console.log(type.toUpperCase()+':', text);
        }
    }

    function setFieldError(el, msg) {
        if (!el) return;
        el.classList.add('is-invalid');
        let fb = el.nextElementSibling;
        if (!fb || !fb.classList || !fb.classList.contains('invalid-feedback')) {
            fb = document.createElement('div');
            fb.className = 'invalid-feedback';
            el.parentNode.insertBefore(fb, el.nextSibling);
        }
        fb.textContent = msg || 'Campo inválido';
    }

    function clearFieldError(el) {
        if (!el) return;
        el.classList.remove('is-invalid');
        const fb = el.nextElementSibling;
        if (fb && fb.classList && fb.classList.contains('invalid-feedback')) fb.textContent = '';
    }

    function validarFormulario() {
        let valid = true;
        // Clear previous
        [idPrestamoInput, nombreResponsableInput, estadoSelect, fechaDevolucionRealInput].forEach(clearFieldError);

        if (!idPrestamoInput || !idPrestamoInput.value.trim()) {
            setFieldError(idPrestamoInput, 'Ingrese el ID del préstamo o busque por nombre');
            valid = false;
        }
        if (!nombreResponsableInput || !nombreResponsableInput.value.trim()) {
            setFieldError(nombreResponsableInput, 'Ingrese el nombre del responsable');
            valid = false;
        }
        if (!estadoSelect || !estadoSelect.value) {
            setFieldError(estadoSelect, 'Seleccione un estado');
            valid = false;
        }
        if (!fechaDevolucionRealInput || !fechaDevolucionRealInput.value) {
            setFieldError(fechaDevolucionRealInput, 'Seleccione la fecha de devolución');
            valid = false;
        }
        if (!valid) showMessage('warning', 'Corrija los campos resaltados antes de enviar');
        return valid;
    }

    if (formDevolucion) {
        formDevolucion.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!validarFormulario()) {
                return;
            }
            // Build payload with keys expected by the API/models (snake_case)
            const payload = {
                id_prestamo: idPrestamoInput ? (idPrestamoInput.dataset.resolvedId || idPrestamoInput.value.trim()) : null,
                id_libro: idPrestamoInput ? (idPrestamoInput.dataset.idLibro ? parseInt(idPrestamoInput.dataset.idLibro) : null) : null,
                fecha_prestamo: fechaPrestamoInput ? fechaPrestamoInput.value || null : null,
                fecha_devolucion: fechaDevolucionRealInput ? fechaDevolucionRealInput.value || null : null,
                estado_prestamo: estadoSelect ? estadoSelect.value : null
            };
            // Optional: include human-friendly fields for UI/backwards-compat
            payload._meta = {
                isbn: isbnInput ? isbnInput.value.trim() : '',
                titulo: tituloLibroInput ? tituloLibroInput.value.trim() : '',
                nombre_responsable: nombreResponsableInput ? nombreResponsableInput.value.trim() : ''
            };
            // disable submit while processing
            const submitBtn = formDevolucion.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.origText = submitBtn.textContent; submitBtn.textContent = 'Enviando...'; }
            try {
                // Before submitting, verify the préstamo is not already devuelto (fresh check)
                try {
                    // use the backend parameter name 'id_prestamo'
                    const remoteCheck = await buscarPrestamo({ id_prestamo: payload.id_prestamo });
                    const remoteItem = Array.isArray(remoteCheck) ? (remoteCheck[0] || null) : remoteCheck;
                    if (remoteItem && isPrestamoDevuelto(remoteItem)) {
                        setFieldError(idPrestamoInput, 'Este préstamo ya figura como devuelto');
                        showMessage('warning', 'No se puede registrar la devolución: el préstamo ya está marcado como devuelto.');
                        return;
                    }
                } catch (chkErr) {
                    // ignore check failure and continue — backend will enforce integrity if needed
                    console.warn('No se pudo verificar estado del préstamo antes de enviar:', chkErr);
                }

                const saved = await guardarDevolucionEnBD(payload);
                // Hot-reload authoritative data from server instead of client-only insert
                // Pass the newly created id so we can scroll/highlight it
                const newId = saved && (saved.id || saved.id_devolucion) ? (saved.id || saved.id_devolucion) : null;
                await reloadDevoluciones(newId);
                limpiarFormulario();
                if (window.showNotification) window.showNotification('Devolución registrada.','success');
                else showMessage('success', 'Devolución registrada correctamente');
            } catch (err) {
                console.error('Error al guardar devolucion', err);
                // Attempt to parse error body if present in message
                let msg = 'Error al registrar la devolución.';
                try {
                    // db.js/api helper often throws with message like: "API 500 INTERNAL SERVER ERROR: { ... }"
                    const parts = (err && err.message) ? err.message.split(':').slice(1).join(':').trim() : null;
                    if (parts) {
                        const parsed = JSON.parse(parts);
                        if (parsed && parsed.error) {
                            msg = parsed.error + (parsed.detail ? (': ' + parsed.detail) : '');
                        } else if (parsed && parsed.detail) {
                            msg = parsed.detail;
                        } else {
                            msg = parts;
                        }
                    } else if (err && err.message) {
                        msg = err.message;
                    }
                } catch (e2) {
                    // fallback to raw message
                    msg = err && err.message ? err.message : msg;
                }
                showMessage('danger', msg, 10000);
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.origText || 'Registrar Devolución'; }
            }
        });
    }

    // Botón limpiar
    if (btnLimpiar) btnLimpiar.addEventListener('click', limpiarFormulario);
    function limpiarFormulario() {
        if (!formDevolucion) return;
        formDevolucion.reset();
        if (isbnInput) isbnInput.value = '';
        if (tituloLibroInput) tituloLibroInput.value = '';
        if (fechaDevolucionRealInput) fechaDevolucionRealInput.value = '';
    }

    // --------------------------------------------------------------------------------
    // Filtros
    // --------------------------------------------------------------------------------
    function applyCurrentFilters() {
        const fecha = filtroFecha ? filtroFecha.value : '';
        const editorialQuery = filtroISBN ? filtroISBN.value.trim().toLowerCase() : '';
        const estado = filtroEstado ? filtroEstado.value : '';
        let out = devoluciones.slice();
        if (fecha) out = out.filter(d => (d.fechaDevolucionReal || d.fecha_devolucion_real || '').startsWith(fecha));
        if (editorialQuery) out = out.filter(d => ((d.editorial || d.isbn || '').toLowerCase().includes(editorialQuery) || (d.tituloLibro||d.titulo||'').toLowerCase().includes(editorialQuery)));
        if (estado) out = out.filter(d => ((d.estado || d.estado_dev || d.estado_prestamo || '').toLowerCase() === estado.toLowerCase()));
        return out;
    }

    function aplicarFiltros() { renderizarHistorial(applyCurrentFilters()); }
    if (filtroFecha) filtroFecha.addEventListener('change', aplicarFiltros);
    // Debounce para el filtro de editorial/título: esperar a que el usuario deje de escribir
    let filtroDebounceTimeout = null;
    if (filtroISBN) filtroISBN.addEventListener('input', function() {
        clearTimeout(filtroDebounceTimeout);
        // espera 400ms desde la última pulsación
        filtroDebounceTimeout = setTimeout(() => aplicarFiltros(), 400);
    });
    if (filtroEstado) filtroEstado.addEventListener('change', aplicarFiltros);

    // Reload devoluciones from server and rerender (hot reload for the table)
    async function reloadDevoluciones(highlightId) {
        try {
            const lista = await obtenerTodasLasDevoluciones();
            devoluciones = Array.isArray(lista) ? lista : (lista && lista.result) ? lista.result : [];
            // Enrich each devolucion with human-friendly fields (titulo, isbn, nombreResponsable, fechas)
            await Promise.all(devoluciones.map(async (d) => {
                try {
                    // normalize fecha fields
                    if (d.fecha_devolucion && !d.fechaDevolucionReal) d.fechaDevolucionReal = d.fecha_devolucion;
                    if (d.fecha_prestamo && !d.fechaPrestamo) d.fechaPrestamo = d.fecha_prestamo;
                    // estado
                    if (!d.estado && d.estado_prestamo) d.estado = d.estado_prestamo;
                    // libro info
                    try {
                        if (d.id_libro && window.apiHelpers && window.apiHelpers.obtenerLibro) {
                            const libro = await window.apiHelpers.obtenerLibro(d.id_libro);
                            if (libro) {
                                d.titulo = libro.titulo || d.titulo || '';
                                d.isbn = libro.ISBN || d.isbn || '';
                                d.editorial = libro.editorial || d.editorial || '';
                            }
                        }
                    } catch (e) { /* ignore libro fetch errors */ }
                    // prestamo -> responsable
                    try {
                        if (d.id_prestamo && window.apiHelpers && window.apiHelpers.buscarPrestamo) {
                            const r = await window.apiHelpers.buscarPrestamo({ id_prestamo: d.id_prestamo });
                            const p = Array.isArray(r) ? (r[0] || null) : r;
                            if (p) {
                                // prefer resolving usuario name
                                let name = null;
                                try {
                                    if (p.id_usuario) {
                                        const n = await resolveUsuarioName(p.id_usuario);
                                        if (n) name = n;
                                    }
                                } catch (e) {}
                                if (!name) name = p.solicitante || '';
                                d.nombreResponsable = name;
                                // ensure fechaPrestamo exists
                                if (p.fecha_prestamo && !d.fechaPrestamo) d.fechaPrestamo = p.fecha_prestamo;
                            }
                        }
                    } catch (e) { /* ignore prestamo fetch errors */ }
                } catch (e) {
                    // per-item error should not stop rendering
                    console.error('Error enriching devolucion', e, d);
                }
            }));
            renderizarHistorial(devoluciones);
            // If requested, scroll to and highlight the new devolucion
            try {
                if (highlightId) {
                    const selector = `.historial-list .registro-historial[data-id-devolucion="${highlightId}"]`;
                    const el = document.querySelector(selector) || document.querySelector(`.historial-list .registro-historial[data-id-devolucion='${highlightId}']`);
                    if (el) {
                        // smooth scroll into view
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // add highlight class
                        el.classList.add('highlight-devolucion');
                        // remove after a few seconds
                        setTimeout(() => { try { el.classList.remove('highlight-devolucion'); } catch (e) {} }, 3200);
                    }
                }
            } catch (e) {
                console.error('Error highlighting devolucion', e);
            }
        } catch (e) {
            console.error('Error reloading devoluciones', e);
        }
    }

    // --------------------------------------------------------------------------------
    // Inicialización: cargar todas las devoluciones (usamos reloadDevoluciones
    // porque contiene la lógica de enriquecimiento que resuelve título/isbn
    // y nombre del responsable consultando libros/usuarios/préstamos).
    // --------------------------------------------------------------------------------
    async function inicializar() {
        // reloadDevoluciones ya asigna `devoluciones` internamente y enriquece cada registro
        await reloadDevoluciones();
    }

    inicializar();
});
