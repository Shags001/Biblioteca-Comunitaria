// Helper functions to call backend API endpoints
// This file centralizes fetch calls so views (like Script.js) don't need to change.

async function apiFetch(path, options = {}) {
	const res = await fetch('/api' + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
	}
	return await res.json();
}

// Devoluciones
async function obtenerTodasLasDevoluciones() {
	return await apiFetch('/devoluciones');
}

async function guardarDevolucionEnBD(devolucion) {
	return await apiFetch('/devoluciones', { method: 'POST', body: JSON.stringify(devolucion) });
}

// Prestamos (buscar)
async function buscarPrestamo(params = {}) {
	const qs = new URLSearchParams(params).toString();
	return await apiFetch('/prestamos/buscar?' + qs, { method: 'GET' });
}

// Libros
async function obtenerLibros() {
	return await apiFetch('/libros');
}

async function obtenerLibro(id) {
	return await apiFetch(`/libros/${id}`);
}

async function guardarLibro(libro) {
	return await apiFetch('/libros', { method: 'POST', body: JSON.stringify(libro) });
}

// Usuarios
async function obtenerUsuarios() {
	return await apiFetch('/usuarios');
}

// Export helpers to window so existing scripts can call them without modularization
window.apiHelpers = {
	obtenerTodasLasDevoluciones,
	guardarDevolucionEnBD,
	buscarPrestamo,
	obtenerLibros,
	obtenerLibro,
	guardarLibro,
	obtenerUsuarios
};
