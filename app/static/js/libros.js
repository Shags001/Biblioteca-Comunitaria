import { getJson, postJson, putJson, deleteJson } from './apiClient.js';

// Lista ampliada de géneros (en español) — se usa para poblar el <select>
const GENRES = [
    'Fantasía', 'Fantasía Épica', 'Fantasía Urbana',
    'Ciencia Ficción', 'Distopía', 'Space Opera',
    'Romance', 'Romance Histórico', 'Romance Contemporáneo',
    'Misterio/Suspenso', 'Thriller', 'Policíaco',
    'Historia', 'Biografía', 'Memorias',
    'Poesía', 'Teatro', 'Ensayo', 'Filosofía',
    'Infantil', 'Juvenil',
    'Educativo', 'Didáctico',
    'Divulgación Científica', 'Tecnología', 'Informática',
    'Economía', 'Negocios', 'Política',
    'Salud', 'Medicina', 'Autoayuda',
    'Viajes', 'Arte', 'Fotografía', 'Cocina', 'Humor',
    'Religión', 'Espiritualidad'
];

// Hook para el módulo de libros
document.addEventListener('DOMContentLoaded', function() {
    // Indicate this module is active so global fallbacks (main.js) can avoid
    // binding duplicate handlers that would show duplicate messages.
    try { window.LIBROS_MODULE = true; } catch (e) { /* ignore */ }
    const booksTableBody = document.getElementById('booksTableBody');
    const searchInput = document.getElementById('searchInput');
    const bookModal = document.getElementById('bookModal');
    const bookForm = document.getElementById('bookForm');
    const btnAgregarLibro = document.getElementById('btnAgregarLibro');
    const btnCerrarModal = document.getElementById('btnCerrarModal');
    const btnCancelar = document.getElementById('btnCancelar');
    const modalTitle = document.getElementById('modalTitle');

    let books = [];
    let editingBookId = null;
    let currentMode = 'list'; // 'list' | 'add' | 'edit' | 'view'
    let currentLoansMap = {};

    // Read user information injected by the template (data attributes)
    const rootContainer = document.querySelector('.rol-container');
    const userRole = rootContainer ? (rootContainer.dataset.userRole || '') : '';
    const isAuthenticated = rootContainer ? (rootContainer.dataset.auth === 'true') : false;

    // Poblar el custom select de géneros y manejar la interacción responsiva
    const genreInput = document.getElementById('bookGenreInput');
    const genreOptions = document.getElementById('bookGenreOptions');
    function closeGenreOptions() {
        if (genreOptions) genreOptions.classList.add('d-none');
        if (genreInput) genreInput.setAttribute('aria-expanded', 'false');
    }
    function openGenreOptions() {
        if (genreOptions) genreOptions.classList.remove('d-none');
        if (genreInput) genreInput.setAttribute('aria-expanded', 'true');
    }
    if (genreOptions && genreInput) {
        // Clear any existing content
        genreOptions.innerHTML = '';
        // Add default placeholder as disabled option in the list
        const placeholder = document.createElement('div');
        placeholder.className = 'option';
        placeholder.textContent = 'Selecciona un género';
        placeholder.setAttribute('aria-disabled', 'true');
        genreOptions.appendChild(placeholder);

        GENRES.forEach(g => {
            const opt = document.createElement('div');
            opt.className = 'option';
            opt.setAttribute('role', 'option');
            opt.textContent = g;
            opt.addEventListener('click', () => {
                genreInput.textContent = g;
                genreInput.dataset.value = g;
                closeGenreOptions();
            });
            genreOptions.appendChild(opt);
        });

        // Open/close handlers
        genreInput.addEventListener('click', () => {
            if (genreOptions.classList.contains('d-none')) openGenreOptions(); else closeGenreOptions();
        });
        genreInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openGenreOptions(); }
            if (e.key === 'Escape') { closeGenreOptions(); }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!genreInput.contains(e.target) && !genreOptions.contains(e.target)) closeGenreOptions();
        });
    }

    function showNotification(message, type) {
        // Use flash container if present to keep consistent behavior
        const container = document.getElementById('flashContainer');
        const toast = document.createElement('div');
        toast.className = `flash ${type === 'success' ? 'alert-success' : 'alert-error'}`;
        toast.setAttribute('role', 'alert');
        // body
        const body = document.createElement('div');
        body.className = 'flash-body';
        body.textContent = message;
        toast.appendChild(body);
        // close button
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'flash-close btn-close';
        closeBtn.setAttribute('aria-label', 'Cerrar');
        closeBtn.innerHTML = '&times;';
        toast.appendChild(closeBtn);

        // Decide placement: on mobile show centered at bottom; on desktop use flash container if available
        const isMobile = window.innerWidth <= 576;
        if (isMobile) {
            // place at bottom center for better visibility on small screens
            toast.style.position = 'fixed';
            toast.style.left = '12px';
            toast.style.right = '12px';
            toast.style.bottom = '12px';
            toast.style.zIndex = 9999;
            document.body.appendChild(toast);
        } else if (container) {
            container.appendChild(toast);
        } else {
            // fallback: top-right
            toast.style.position = 'fixed';
            toast.style.right = '20px';
            toast.style.top = '20px';
            toast.style.zIndex = 9999;
            document.body.appendChild(toast);
        }

        // Allow icons to render if lucide used inside message (not required)
        if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();

        // Auto close after timeout (match initFlashMessages default)
        const timeout = 3500;
        const t = setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => { try { toast.remove(); } catch (e) {} }, 400);
        }, timeout);

        // Close button handler
        closeBtn.addEventListener('click', () => {
            clearTimeout(t);
            toast.classList.add('hide');
            setTimeout(() => { try { toast.remove(); } catch (e) {} }, 300);
        });
    }

    // Show flash message set by other pages (e.g., after creating a prestamo)
    try {
        const flashRaw = sessionStorage.getItem('flash');
        if (flashRaw) {
            try {
                const f = JSON.parse(flashRaw);
                if (f && f.message) showNotification(f.message, f.type || 'success');
            } catch (e) { /* ignore invalid flash */ }
            try { sessionStorage.removeItem('flash'); } catch (e) {}
        }
    } catch (e) { /* ignore sessionStorage errors */ }

    // Provide a global helper to show the confirm modal if markup exists
    // Returns a Promise<boolean>
    window.showConfirmModal = function(opts) {
        return new Promise((resolve) => {
            try {
                const modal = document.getElementById('confirmModal');
                if (!modal) { resolve(window.confirm ? window.confirm(opts.message || '¿Confirmar?') : false); return; }
                const msgEl = document.getElementById('confirmModalMessage');
                const titleEl = document.getElementById('confirmModalTitle');
                const okBtn = document.getElementById('confirmOkBtn');
                const cancelBtn = document.getElementById('confirmCancelBtn');
                const closeBtn = document.getElementById('confirmModalClose');
                if (msgEl) msgEl.textContent = opts.message || '¿Confirmar?';
                if (titleEl) titleEl.textContent = opts.title || 'Confirmar acción';
                modal.classList.remove('d-none');
                // render icons inside modal (if lucide available)
                try { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); } catch(e){}
                // focus
                if (okBtn) okBtn.focus();

                function cleanup() {
                    modal.classList.add('d-none');
                    okBtn && okBtn.removeEventListener('click', onOk);
                    cancelBtn && cancelBtn.removeEventListener('click', onCancel);
                    closeBtn && closeBtn.removeEventListener('click', onCancel);
                }

                function onOk() { cleanup(); resolve(true); }
                function onCancel() { cleanup(); resolve(false); }

                okBtn && okBtn.addEventListener('click', onOk);
                cancelBtn && cancelBtn.addEventListener('click', onCancel);
                closeBtn && closeBtn.addEventListener('click', onCancel);
                // also close when modal background clicked
                modal.addEventListener('click', function bgClick(e) { if (e.target === modal) { modal.removeEventListener('click', bgClick); onCancel(); } });
            } catch (e) { resolve(false); }
        });
    };

    function renderBooks(filtered = null, loansMap = {}) {
        const data = filtered || books;
        booksTableBody.innerHTML = '';
        data.forEach(book => {
            const tr = document.createElement('tr');
            // Build actions according to role/auth state
            const actions = [];
            // Always allow viewing
            actions.push(`<button class="btn-icon btn-view" data-id="${book.id}" title="Ver"><i data-lucide="eye"></i></button>`);

            if (isAuthenticated) {
                if (userRole === 'Administrador') {
                    // Admin: Ver, Editar, Prestar, Eliminar
                    actions.push(`<button class="btn-icon btn-edit" data-id="${book.id}" title="Editar"><i data-lucide="edit-3"></i></button>`);
                    actions.push(`<button class="btn-icon btn-loan" data-id="${book.id}" title="Prestar"><i data-lucide="package"></i></button>`);
                    actions.push(`<button class="btn-icon btn-delete" data-id="${book.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>`);
                } else if (userRole === 'Recepcionista') {
                    // Recepcionista: Ver, Prestar
                    actions.push(`<button class="btn-icon btn-loan" data-id="${book.id}" title="Prestar"><i data-lucide="package"></i></button>`);
                }
            }

            tr.innerHTML = `
                <td>${String(book.id).padStart(3, '0')}</td>
                <td>${book.titulo || book.title || ''}</td>
                <td>${book.autor || (book.autores && book.autores.join(', ')) || ''}</td>
                <td>${book.ISBN || book.isbn || ''}</td>
                <td>${book.categoria || book.genre || ''}</td>
                <td>${book.editorial || book.publisher || ''}</td>
                <td>${book.anioPublicacion || book.year || ''}</td>
                                <td>${(function(){
                                        // total copies: prefer numeroLibros, else sum disponible+prestada, else copies, else 0
                                        const nLib = (book.numeroLibros != null) ? Number(book.numeroLibros) : null;
                                        const d = (book.cantidadDisponible != null) ? Number(book.cantidadDisponible) : null;
                                        const p = (book.cantidadPrestada != null) ? Number(book.cantidadPrestada) : null;
                                        const copies = (book.copies != null) ? Number(book.copies) : null;
                                        if (!isNaN(nLib) && nLib != null) return nLib;
                                        if (!isNaN(d) && !isNaN(p) && d != null && p != null) return d + p;
                                        if (!isNaN(copies) && copies != null) return copies;
                                        return 0;
                                })()}</td>
                <td>${(function(){
                    // available: prefer explicit cantidadDisponible when present, otherwise derive from loansMap and totals
                    if (book.cantidadDisponible != null) return Number(book.cantidadDisponible);
                    const total = (function(){
                        const nLib = (book.numeroLibros != null) ? Number(book.numeroLibros) : null;
                        const d = (book.cantidadDisponible != null) ? Number(book.cantidadDisponible) : null;
                        const p = (book.cantidadPrestada != null) ? Number(book.cantidadPrestada) : null;
                        const copies = (book.copies != null) ? Number(book.copies) : null;
                        if (!isNaN(nLib) && nLib != null) return nLib;
                        if (!isNaN(d) && !isNaN(p) && d != null && p != null) return d + p;
                        if (!isNaN(copies) && copies != null) return copies;
                        return 0;
                    })();
                    const loaned = loansMap[String(book.id)] || 0;
                    return Math.max(0, total - loaned);
                })()}</td>
                <td>${(function(){
                    // prestados: prefer explicit cantidadPrestada, otherwise use loansMap
                    if (book.cantidadPrestada != null) return Number(book.cantidadPrestada);
                    return loansMap[String(book.id)] || 0;
                })()}</td>
                <td>${book.descripcion || book.description || ''}</td>
                <td>${actions.join(' ')}</td>
            `;
            booksTableBody.appendChild(tr);
        });
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
        // Attach handlers for the action buttons we've created
        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.getAttribute('data-id'));
                openViewModal(id);
            });
        });
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.getAttribute('data-id'));
                openEditModal(id);
            });
        });
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async function() {
                const id = parseInt(this.getAttribute('data-id'));
                // Use modal confirmation if available, otherwise fallback to confirm()
                let ok = false;
                try {
                    if (window.showConfirmModal) {
                        ok = await window.showConfirmModal({ title: 'Eliminar libro', message: '¿Eliminar este libro?' });
                    } else if (typeof confirm === 'function') {
                        ok = confirm('¿Eliminar este libro?');
                    }
                } catch (e) { ok = false; }
                if (!ok) return;
                deleteLibro(id);
            });
        });
        document.querySelectorAll('.btn-loan').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.getAttribute('data-id'));
                // Find the book object and store it in sessionStorage so the préstamo
                // page can access all needed data (avoids long query strings).
                const book = books.find(b => b.id === id) || {};
                try {
                    sessionStorage.setItem('loan_book', JSON.stringify(book));
                } catch (e) {
                    // fallback: if sessionStorage fails, still redirect with id/title
                    console.warn('sessionStorage unavailable, falling back to query params', e);
                    const q = new URLSearchParams({ bookId: id, title: book.titulo || book.title || '' });
                    window.location.href = '/prestamo?' + q.toString();
                    return;
                }
                // Redirect to préstamo page (it will read sessionStorage to get the book)
                window.location.href = '/prestamo';
            });
        });
    }

    function openAddModal() {
        editingBookId = null;
        currentMode = 'add';
        modalTitle.textContent = 'Agregar Libro';
        bookForm.reset();
        document.getElementById('bookId').value = '';
        // Reset custom genre picker to placeholder when adding new
        if (typeof genreInput !== 'undefined' && genreInput) {
            genreInput.textContent = 'Selecciona un género';
            try { delete genreInput.dataset.value; } catch (e) { genreInput.removeAttribute('data-value'); }
        }
        // Ensure editable and only standard footer buttons
        setModalEditable(true);
        removeExtraModalButtons();
        bookModal.classList.remove('d-none');
    }

    function openEditModal(bookId) {
        const b = books.find(x => x.id === bookId);
        if (!b) return;
        editingBookId = bookId;
        currentMode = 'edit';
        modalTitle.textContent = 'Editar Libro';
        document.getElementById('bookId').value = b.id;
        document.getElementById('bookTitle').value = b.titulo || b.title || '';
        document.getElementById('bookAuthor').value = b.autor || (b.autores && b.autores.join(', ')) || '';
        document.getElementById('bookISBN').value = b.ISBN || b.isbn || '';
        // Set the custom genre input value
        const currentGenre = b.categoria || b.genre || '';
        if (genreInput) {
            genreInput.textContent = currentGenre || 'Selecciona un género';
            genreInput.dataset.value = currentGenre || '';
        }
        document.getElementById('bookPublisher').value = b.editorial || b.publisher || '';
        document.getElementById('bookYear').value = b.anioPublicacion || b.year || '';
        document.getElementById('bookCopies').value = b.numeroLibros || b.copies || 1;
        document.getElementById('bookDescription').value = b.descripcion || b.description || '';
        // Ensure inputs are editable for editing
        setModalEditable(true);
        // Ensure Save button is visible (only admins should be able to edit, but caller ensures button shown)
        showModalFooterButtons();
        bookModal.classList.remove('d-none');
    }

    // Open a view-only modal. If userRole is 'Administrador' allow editing inside the modal
    function openViewModal(bookId) {
        const b = books.find(x => x.id === bookId);
        if (!b) return;
        editingBookId = bookId;
        currentMode = 'view';
        modalTitle.textContent = 'Ver Libro';
        document.getElementById('bookId').value = b.id;
        document.getElementById('bookTitle').value = b.titulo || b.title || '';
        document.getElementById('bookAuthor').value = b.autor || (b.autores && b.autores.join(', ')) || '';
        document.getElementById('bookISBN').value = b.ISBN || b.isbn || '';
        const currentGenre = b.categoria || b.genre || '';
        if (genreInput) {
            genreInput.textContent = currentGenre || 'Selecciona un género';
            genreInput.dataset.value = currentGenre || '';
        }
        document.getElementById('bookPublisher').value = b.editorial || b.publisher || '';
        document.getElementById('bookYear').value = b.anioPublicacion || b.year || '';
        document.getElementById('bookCopies').value = b.numeroLibros || b.copies || 1;
        document.getElementById('bookDescription').value = b.descripcion || b.description || '';

        // If admin, allow editing in-place (show save/delete/loan). If recepcionista, read-only but show loan button.
            // Always view-only in 'Ver' mode: inputs must not be editable here.
            // This prevents accidental edits when the user only intends to view details.
            setModalEditable(false);

        showModalFooterButtons();
        bookModal.classList.remove('d-none');
    }

    function closeModal() {
        bookModal.classList.add('d-none');
        bookForm.reset();
        editingBookId = null;
        // also reset custom genre picker
        if (typeof genreInput !== 'undefined' && genreInput) {
            genreInput.textContent = 'Selecciona un género';
            try { delete genreInput.dataset.value; } catch (e) { genreInput.removeAttribute('data-value'); }
        }
        // reset footer buttons to default (hide any dynamic modal buttons)
        removeExtraModalButtons();
        // make modal editable again (default)
        setModalEditable(true);
        currentMode = 'list';
    }

    // Utility: toggle modal inputs editable/read-only
    function setModalEditable(editable) {
        const inputs = bookForm.querySelectorAll('input, textarea');
        inputs.forEach(i => {
            if (i.id === 'bookId') return;
            try {
                i.readOnly = !editable;
                i.disabled = false; // keep enabled so readOnly shows value
            } catch (e) {}
        });
        // custom genre input
        if (genreInput) {
            if (!editable) {
                genreInput.setAttribute('aria-disabled', 'true');
                genreInput.style.pointerEvents = 'none';
            } else {
                genreInput.removeAttribute('aria-disabled');
                genreInput.style.pointerEvents = '';
            }
        }
        // Save button visibility (admins only)
        const saveBtn = document.getElementById('btnGuardar');
        if (saveBtn) {
            if (editable && isAuthenticated && userRole === 'Administrador') saveBtn.style.display = '';
            else saveBtn.style.display = 'none';
        }
    }

    // Add or remove footer buttons depending on role and mode
    function showModalFooterButtons() {
        // Remove existing extras first
        removeExtraModalButtons();
        const footer = document.querySelector('.modal-footer-custom');
        if (!footer) return;

        // If logged in, receptionist and admin can loan via modal
        if (isAuthenticated && (userRole === 'Recepcionista' || userRole === 'Administrador')) {
            const loanBtn = document.createElement('button');
            loanBtn.type = 'button';
            loanBtn.className = 'btn-primary-custom';
            loanBtn.dataset.role = 'extra-loan';
            loanBtn.innerHTML = '<i data-lucide="package" class="me-2"></i>Prestar';
            loanBtn.addEventListener('click', () => {
                const id = editingBookId;
                const book = books.find(b => b.id === id) || {};
                try {
                    sessionStorage.setItem('loan_book', JSON.stringify(book));
                } catch (e) {
                    console.warn('sessionStorage unavailable, falling back to query params', e);
                    const q = new URLSearchParams({ bookId: id, title: book.titulo || book.title || '' });
                    window.location.href = '/prestamo?' + q.toString();
                    return;
                }
                window.location.href = '/prestamo';
            });
            // insert before Cancel/Save
            footer.insertBefore(loanBtn, footer.lastElementChild);
            if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
        }

        // If admin, add delete button in modal footer
        if (isAuthenticated && userRole === 'Administrador') {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn-secondary-custom';
            delBtn.dataset.role = 'extra-delete';
            delBtn.innerHTML = '<i data-lucide="trash-2" class="me-2"></i>Eliminar';
            delBtn.addEventListener('click', async () => {
                let ok = false;
                try {
                    if (window.showConfirmModal) ok = await window.showConfirmModal({ title: 'Eliminar libro', message: '¿Eliminar este libro?' });
                    else ok = confirm('¿Eliminar este libro?');
                } catch (e) { ok = false; }
                if (!ok) return;
                deleteLibro(editingBookId);
                closeModal();
            });
            footer.insertBefore(delBtn, footer.lastElementChild);
            if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
        }
    }

    function removeExtraModalButtons() {
        const footer = document.querySelector('.modal-footer-custom');
        if (!footer) return;
        const extras = footer.querySelectorAll('[data-role^="extra-"]');
        extras.forEach(e => e.remove());
    }

    async function loadLibros() {
        try {
            const data = await getJson('/api/libros');
            books = Array.isArray(data) ? data : [];
            // Also fetch current préstamos to compute active loan counts per book id
            let loansMap = {};
            try {
                const prestamos = await getJson('/api/prestamos');
                if (Array.isArray(prestamos)) {
                    prestamos.forEach(p => {
                        // consider only active loans
                        const estado = (p.estado || '').toString().toLowerCase();
                        if (estado !== 'activo' && estado !== 'active') return;
                        // normalize id_libro field
                        const idLibro = p.id_libro || p.idLibro || p.libro_id || p.id_lib;
                        if (!idLibro) return;
                        const cantidad = (typeof p.cantidad === 'number' && !isNaN(p.cantidad)) ? p.cantidad : 1;
                        loansMap[String(idLibro)] = (loansMap[String(idLibro)] || 0) + cantidad;
                    });
                }
            } catch (err) {
                console.warn('No se pudieron cargar préstamos para ajustar contadores', err);
            }
            // store for later searches/filters
            currentLoansMap = loansMap;
            renderBooks(null, currentLoansMap);
        } catch (err) {
            console.error('Error cargando libros', err);
            showNotification('Error cargando libros: ' + (err.body && err.body.error ? err.body.error : err.message), 'error');
        }
    }

    async function createLibro(payload) {
        try {
            const res = await postJson('/api/libros', payload);
            showNotification('Libro creado', 'success');
            await loadLibros();
            closeModal();
        } catch (err) {
            console.error('createLibro error', err);
            showNotification('Error creando libro: ' + (err.body && err.body.error ? err.body.error : err.message), 'error');
        }
    }

    async function updateLibro(id, payload) {
        try {
            const res = await putJson(`/api/libros/${id}`, payload);
            showNotification('Libro actualizado', 'success');
            await loadLibros();
            closeModal();
        } catch (err) {
            console.error('updateLibro error', err);
            showNotification('Error actualizando libro: ' + (err.body && err.body.error ? err.body.error : err.message), 'error');
        }
    }

    async function deleteLibro(id) {
        try {
            await deleteJson(`/api/libros/${id}`);
            showNotification('Libro eliminado', 'success');
            await loadLibros();
        } catch (err) {
            console.error('deleteLibro error', err);
            showNotification('Error eliminando libro: ' + (err.body && err.body.error ? err.body.error : err.message), 'error');
        }
    }

    // Event bindings
    if (btnAgregarLibro) {
        btnAgregarLibro.addEventListener('click', openAddModal);
    }
    btnCerrarModal.addEventListener('click', closeModal);
    btnCancelar.addEventListener('click', closeModal);
    bookModal.addEventListener('click', function(e) { if (e.target === this) closeModal(); });

    bookForm.addEventListener('submit', function(e) {
        e.preventDefault();
        // Client-side validation before sending
        const validation = validateForm();
        if (!validation.valid) {
            showNotification(validation.message, 'error');
            if (validation.focus) validation.focus.focus();
            return;
        }
        const payload = {
            titulo: document.getElementById('bookTitle').value.trim(),
            autores: document.getElementById('bookAuthor').value.split(',').map(s => s.trim()).filter(Boolean),
            ISBN: document.getElementById('bookISBN').value.trim(),
            categoria: (genreInput && genreInput.dataset && genreInput.dataset.value) ? genreInput.dataset.value : '',
            editorial: document.getElementById('bookPublisher').value.trim(),
            anioPublicacion: document.getElementById('bookYear').value ? parseInt(document.getElementById('bookYear').value) : null,
            numeroLibros: document.getElementById('bookCopies').value ? parseInt(document.getElementById('bookCopies').value) : 1,
            descripcion: document.getElementById('bookDescription').value.trim(),
        };
        if (editingBookId) {
            updateLibro(editingBookId, payload);
        } else {
            createLibro(payload);
        }
    });

    // Validation helpers
    function markInvalid(el) {
        if (!el) return;
        el.classList.add('is-invalid');
    }
    function clearInvalid(el) {
        if (!el) return;
        el.classList.remove('is-invalid');
    }

    function validateForm() {
        // Title
        const titleEl = document.getElementById('bookTitle');
        const authorEl = document.getElementById('bookAuthor');
        const isbnEl = document.getElementById('bookISBN');
        const yearEl = document.getElementById('bookYear');
        const copiesEl = document.getElementById('bookCopies');
        const descEl = document.getElementById('bookDescription');

        // clear previous invalid markers
        [titleEl, authorEl, isbnEl, yearEl, copiesEl, descEl, genreInput].forEach(clearInvalid);

        const title = titleEl.value.trim();
        if (!title || title.length < 2) {
            markInvalid(titleEl);
            return { valid: false, message: 'El título es obligatorio y debe tener al menos 2 caracteres.', focus: titleEl };
        }

        const authors = authorEl.value.split(',').map(s => s.trim()).filter(Boolean);
        if (authors.length === 0) {
            markInvalid(authorEl);
            return { valid: false, message: 'Ingresa al menos un autor.', focus: authorEl };
        }

        // ISBN required and must match basic pattern (digits and dashes, 10-17 chars)
        const isbn = isbnEl.value.trim();
        const isbnPattern = /^[0-9\-]{10,17}$/;
        if (!isbn || !isbnPattern.test(isbn)) {
            markInvalid(isbnEl);
            return { valid: false, message: 'ISBN obligatorio e inválido. Use sólo dígitos y guiones (10-17 caracteres).', focus: isbnEl };
        }

        // Genre required (custom picker)
        const categoria = (genreInput && genreInput.dataset && genreInput.dataset.value) ? genreInput.dataset.value : '';
        if (!categoria) {
            if (genreInput) markInvalid(genreInput);
            return { valid: false, message: 'Selecciona un género.', focus: genreInput || titleEl };
        }

        // Year required and must be in reasonable bounds
        const yearVal = yearEl.value ? parseInt(yearEl.value) : null;
        if (!yearVal || isNaN(yearVal) || yearVal < 1800 || yearVal > 2025) {
            markInvalid(yearEl);
            return { valid: false, message: 'Año obligatorio inválido. Debe estar entre 1800 y 2025.', focus: yearEl };
        }

        // Editorial required
        const editorialEl = document.getElementById('bookPublisher');
        const editorial = editorialEl.value.trim();
        if (!editorial) {
            markInvalid(editorialEl);
            return { valid: false, message: 'La editorial es obligatoria.', focus: editorialEl };
        }

        // Copies required and >=1
        const copiesVal = copiesEl.value ? parseInt(copiesEl.value) : 0;
        if (!copiesVal || copiesVal < 1) {
            markInvalid(copiesEl);
            return { valid: false, message: 'La cantidad de ejemplares debe ser al menos 1.', focus: copiesEl };
        }

        // Description optional length limit
        if (descEl.value && descEl.value.length > 2000) {
            markInvalid(descEl);
            return { valid: false, message: 'La descripción es demasiado larga (máx. 2000 caracteres).', focus: descEl };
        }

        return { valid: true };
    }

    // Remove invalid marker on input/change
    ['bookTitle','bookAuthor','bookISBN','bookYear','bookCopies','bookDescription'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => clearInvalid(el));
    });
    if (genreInput) {
        genreInput.addEventListener('click', () => clearInvalid(genreInput));
    }

    searchInput.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) return renderBooks(null, currentLoansMap);
        const filtered = books.filter(b => {
            return (b.titulo && b.titulo.toLowerCase().includes(q)) ||
                   (b.autor && b.autor.toLowerCase().includes(q)) ||
                   (b.ISBN && b.ISBN.toLowerCase().includes(q)) ||
                   (b.categoria && b.categoria.toLowerCase().includes(q)) ||
                   (b.editorial && b.editorial.toLowerCase().includes(q)) ||
                   (b.descripcion && b.descripcion.toLowerCase().includes(q));
        });
        renderBooks(filtered, currentLoansMap);
    });

    // Inicializar
    loadLibros();
});
