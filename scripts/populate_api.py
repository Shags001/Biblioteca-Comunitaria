#!/usr/bin/env python3
"""Populate the Biblioteca API with sample data.

Usage: configure a `.env` file in the project root with at least:

API_BASE_URL=http://127.0.0.1:5000
POPULATE_MODE=create   # one of: create, validate, update
AUTH_TOKEN=           # optional: Bearer token if your API uses auth

Modes:
- create: create missing resources, skip existing
- validate: check presence and report differences (no writes)
- update: create missing resources and update existing ones (PUT)

The script is idempotent and prints a summary at the end.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import date, timedelta
from typing import Dict, Any, Optional, List

import requests
from dotenv import load_dotenv


ROOT = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(ROOT, '.env'))

API_BASE = os.getenv('API_BASE_URL', 'http://127.0.0.1:5000').rstrip('/')
MODE = os.getenv('POPULATE_MODE', 'create').lower()
AUTH_TOKEN = os.getenv('AUTH_TOKEN') or os.getenv('API_TOKEN')

# Debug info: print which file is being executed and its modification time
try:
    _this_file = os.path.abspath(__file__)
    _mtime = os.path.getmtime(_this_file)
    print(f"[POPULATE-START] running script: {_this_file}  mtime={_mtime}")
except Exception:
    print("[POPULATE-START] running populate script (could not stat file)")

HEADERS = {'Content-Type': 'application/json'}
if AUTH_TOKEN:
    HEADERS['Authorization'] = f'Bearer {AUTH_TOKEN}'

# Use a requests.Session so cookie-based Flask sessions set by the UI login are preserved
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def _req(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{API_BASE}{path}"
    # Use the shared session so cookies persist across requests
    resp = SESSION.request(method, url, timeout=15, **kwargs)
    try:
        resp.json_data = resp.json()
    except Exception:
        resp.json_data = None
    return resp


def _check_response(resp: requests.Response, path: str):
    """Raise an HTTPError with server body included to help debugging."""
    if resp.status_code >= 400:
        body = None
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        print(f"ERROR {resp.status_code} for {path}: {body}")
        # raise with original response attached
        resp.raise_for_status()


def get_all(path: str) -> List[Dict[str, Any]]:
    r = _req('GET', path)
    _check_response(r, path)
    return r.json()


def find_by_key(items: List[Dict[str, Any]], key: str, value) -> Optional[Dict[str, Any]]:
    for it in items:
        if key in it and it[key] == value:
            return it
    return None


def ensure_resource(collection_path: str, unique_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure a resource exists according to MODE. Returns the resource dict from server."""
    existing = get_all(collection_path)
    found = find_by_key(existing, unique_key, payload.get(unique_key))
    if MODE == 'validate':
        return {'status': 'exists' if found else 'missing', 'existing': found}

    if not found:
        # create
        r = _req('POST', collection_path, json=payload)
        r.raise_for_status()
        return r.json()

    # found
    if MODE == 'create':
        return found

    # update mode -> PUT
    r = _req('PUT', f"{collection_path}/{found['id']}", json=payload)
    r.raise_for_status()
    return r.json()


def run():
    print(f"Populate script running against: {API_BASE}  (mode={MODE})")
    summary = {'roles': 0, 'users': 0, 'books': 0, 'loans': 0, 'returns': 0}

    # If in create mode and user enabled wiping, call the protected admin wipe endpoint.
    wipe_flag = os.getenv('POPULATE_WIPE', '').lower() in ('1', 'true', 'yes')
    wipe_token = os.getenv('POPULATE_WIPE_TOKEN')
    if MODE == 'create' and wipe_flag:
        print('POPULATE_WIPE requested: attempting destructive wipe via /admin/wipe')
        if not wipe_token:
            print('POPULATE_WIPE_TOKEN not set; refusing to wipe. Set POPULATE_WIPE_TOKEN in .env to enable.')
        else:
            try:
                # admin wipe endpoint is registered under the API blueprint at /api/admin/wipe
                wipe_url = f"{API_BASE}/api/admin/wipe"
                wheaders = {'Authorization': f'Bearer {wipe_token}', 'Content-Type': 'application/json'}
                print(f"Calling wipe endpoint: {wipe_url}")
                r = requests.post(wipe_url, headers=wheaders, timeout=60)
                try:
                    body = r.json()
                except Exception:
                    body = r.text
                if r.status_code >= 400:
                    print(f"Wipe failed ({r.status_code}): {body}")
                    print('Aborting populate due to failed wipe.')
                    return
                print('Wipe successful:', body)
            except requests.exceptions.RequestException as e:
                print('HTTP error while calling wipe endpoint:', e)
                print('Aborting populate.')
                return

    # Sample roles
    roles = [
        {'nombre_rol': 'Administrador', 'descripcion': 'Administrador del sistema'},
        {'nombre_rol': 'Recepcionista', 'descripcion': 'Usuario estándar'},
    ]

    # Roles
    print('\n== Roles ==')
    server_roles = get_all('/api/roles')
    for r in roles:
        exists = find_by_key(server_roles, 'nombre_rol', r['nombre_rol'])
        if MODE == 'validate':
            print(f"Role {r['nombre_rol']}: {'OK' if exists else 'MISSING'})")
            continue
        if not exists:
            resp = _req('POST', '/api/roles', json=r)
            _check_response(resp, '/api/roles')
            summary['roles'] += 1
            print(f"Created role {r['nombre_rol']}")
        else:
            if MODE == 'update':
                resp = _req('PUT', f"/api/roles/{exists['id']}", json=r)
                _check_response(resp, f"/api/roles/{exists['id']}")
                print(f"Updated role {r['nombre_rol']}")
            else:
                print(f"Role {r['nombre_rol']} exists")

    # Users (note: must reference id_rol)
    print('\n== Users ==')
    server_roles = get_all('/api/roles')
    # Prefer exact, case-sensitive role names used in the DB
    role_recepc = next((x for x in server_roles if x.get('nombre_rol') == 'Recepcionista'), None)
    role_admin = next((x for x in server_roles if x.get('nombre_rol') == 'Administrador'), None)
    # If exact-case roles are not found, try case-insensitive fallback and warn
    if not role_recepc:
        role_recepc = next((x for x in server_roles if x.get('nombre_rol', '').lower() == 'recepcionista'), None)
        if role_recepc:
            print("Warning: found role name 'recepcionista' with different case; using it. Consider renaming to 'Recepcionista' in DB for exact match.")
    if not role_admin:
        role_admin = next((x for x in server_roles if x.get('nombre_rol', '').lower() == 'administrador'), None)
        if role_admin:
            print("Warning: found role name 'administrador' with different case; using it. Consider renaming to 'Administrador' in DB for exact match.")
    users = [
    {'nombre': 'Admin Demo', 'email': 'admin@example.test', 'telefono': '0000000000', 'direccion': 'Oficina', 'username': 'admin', 'password': 'adminpass', 'id_rol': role_admin['id'] if role_admin else 1},
    {'nombre': 'Juan Perez', 'email': 'juan.perez@example.test', 'telefono': '111222333', 'direccion': 'Calle Falsa 123', 'username': 'juan', 'password': 'juanpass', 'id_rol': role_recepc['id'] if role_recepc else 2},
    ]

    server_users = get_all('/api/usuarios')
    for u in users:
        exists = None
        for su in server_users:
            if su.get('email') == u['email'] or su.get('username') == u['username']:
                exists = su
                break
        if MODE == 'validate':
            print(f"User {u['email']}: {'OK' if exists else 'MISSING'}")
            continue
        if not exists:
            resp = _req('POST', '/api/usuarios', json=u)
            _check_response(resp, '/api/usuarios')
            summary['users'] += 1
            print(f"Created user {u['email']}")
        else:
            if MODE == 'update':
                resp = _req('PUT', f"/api/usuarios/{exists['id']}", json=u)
                _check_response(resp, f"/api/usuarios/{exists['id']}")
                print(f"Updated user {u['email']}")
            else:
                print(f"User {u['email']} exists")

    # Attempt UI login as the admin user so subsequent API calls that rely on
    # Flask session (role-based) are allowed (create_libro requires 'Administrador').
    # Use the same credentials we created above.
    try:
        admin_email = next((x for x in users if x.get('username') == 'admin'), {}).get('email', 'admin@example.test')
        admin_password = next((x for x in users if x.get('username') == 'admin'), {}).get('password', 'adminpass')
        print(f"Attempting UI login as {admin_email} to obtain session for role-based endpoints...")
        # Do a preliminary GET to /login to obtain any non-auth cookies (session id)
        try:
            _ = SESSION.get(f"{API_BASE}/login", timeout=10)
        except Exception:
            pass
        # POST form-encoded (the app reads request.form) - ensure we don't send JSON Content-Type
        login_resp = SESSION.post(f"{API_BASE}/login", data={'email': admin_email, 'password': admin_password}, headers={'Content-Type': 'application/x-www-form-urlencoded'}, allow_redirects=True, timeout=15)
        # Debug: print login response status and session cookies
        try:
            print(f"Login response status: {login_resp.status_code}  url={getattr(login_resp, 'url', '')}")
            # avoid dumping huge HTML - print a short prefix
            text_snippet = (login_resp.text or '')[:300].replace('\n', ' ')
            print(f"Login response snippet: {text_snippet!r}")
        except Exception:
            pass
        try:
            print('Session cookies after login:', SESSION.cookies.get_dict())
        except Exception:
            pass

        # Check whether /rol (protected page) returns 200 under the session to confirm admin role
        try:
            rol_check = _req('GET', '/rol')
            try:
                print(f"/rol check: status={rol_check.status_code} body={rol_check.text[:300]}")
            except Exception:
                print(f"/rol check status={rol_check.status_code}")
            if rol_check.status_code == 200:
                print('Login successful: session has admin privileges.')
            else:
                print(f'Login attempt completed but /rol returned status {rol_check.status_code}; creating libros may be forbidden.')
        except Exception as e:
            print('Login attempt completed but failed to verify role page:', e)

        # Debug: print created admin user record from the server to ensure id_rol is set
        try:
            admin_rec = next((x for x in server_users if x.get('email') == admin_email), None)
            if admin_rec:
                print('Server admin user record:', admin_rec)
            else:
                # fetch fresh list
                fresh = get_all('/api/usuarios')
                admin_rec = next((x for x in fresh if x.get('email') == admin_email), None)
                print('Fetched admin user record:', admin_rec)
        except Exception as e:
            print('Could not fetch/print admin user record:', e)
    except Exception as e:
        print('UI login attempt failed:', e)

    # Books
    print('\n== Books ==')
    books = [
        {'titulo': 'Cien Años de Soledad', 'autores': ['Gabriel García Márquez'], 'ISBN': '978-0060883287', 'editorial': 'Harper', 'anioPublicacion': 1967, 'categoria': 'Novela', 'numeroLibros': 3, 'cantidadDisponible': 3, 'cantidadPrestada': 0},
        {'titulo': 'Don Quijote', 'autores': ['Miguel de Cervantes'], 'ISBN': '978-8491050254', 'editorial': 'Alianza', 'anioPublicacion': 1605, 'categoria': 'Clásico', 'numeroLibros': 2, 'cantidadDisponible': 2, 'cantidadPrestada': 0},
    ]

    server_books = get_all('/api/libros')
    for b in books:
        # refresh server list to avoid races/duplicates
        server_books = get_all('/api/libros')
        print(f"[POPULATE] attempting POST /api/libros ISBN={b.get('ISBN')} titulo={b.get('titulo')}")
        exists = None
        for sb in server_books:
            if sb.get('ISBN') == b['ISBN']:
                exists = sb
                break
        if MODE == 'validate':
            print(f"Book {b['ISBN']}: {'OK' if exists else 'MISSING'}")
            continue
        if not exists:
            try:
                resp = _req('POST', '/api/libros', json=b)
                _check_response(resp, '/api/libros')
                summary['books'] += 1
                print(f"Created book {b['ISBN']}")
            except requests.exceptions.HTTPError:
                # Possible unique constraint duplicate inserted by another process or earlier run.
                # Refresh and check if the ISBN exists now. If so, treat as existing and continue.
                server_books = get_all('/api/libros')
                exists_after = None
                for sb in server_books:
                    if sb.get('ISBN') == b['ISBN']:
                        exists_after = sb
                        break
                if exists_after:
                    print(f"Book {b['ISBN']} already exists (detected after failure)")
                else:
                    # Print additional debug info and attempt a small fallback payload
                    print(f"Failed to create book {b.get('ISBN')} (see server error above). Attempting fallback payload...")
                    # Build fallback: convert authors list to comma-separated string and try snake_case year
                    fb = dict(b)
                    if isinstance(fb.get('autores'), list):
                        fb['autores'] = ', '.join(fb['autores'])
                    if 'anioPublicacion' in fb:
                        fb['anio_publicacion'] = fb.pop('anioPublicacion')
                    try:
                        resp2 = _req('POST', '/api/libros', json=fb)
                        _check_response(resp2, '/api/libros')
                        summary['books'] += 1
                        print(f"Created book (fallback) {b['ISBN']}")
                    except Exception:
                        # final failure: print server response if available and continue
                        try:
                            print('Fallback failed, status:', resp2.status_code, 'body:', resp2.text)
                        except Exception:
                            pass
                        print(f"Skipping book {b.get('ISBN')} after fallback failure")
        else:
            if MODE == 'update':
                resp = _req('PUT', f"/api/libros/{exists['id']}", json=b)
                _check_response(resp, f"/api/libros/{exists['id']}")
                print(f"Updated book {b['ISBN']}")
            else:
                print(f"Book {b['ISBN']} exists")

    # Fetch users and books fresh
    server_users = get_all('/api/usuarios')
    server_books = get_all('/api/libros')

    # Loans
    print('\n== Loans (Prestamos) ==')
    # Use first user and first book for sample loan
    if server_users and server_books:
        u0 = server_users[0]
        b0 = server_books[0]
        today = date.today()
        loan_payload = {
            'id_usuario': u0['id'],
            'solicitante': u0['nombre'],
            'elemento_prestado': b0['titulo'],
            'tipo': 'libro',
            'fecha_prestamo': today.isoformat(),
            'fecha_devolucion': (today + timedelta(days=14)).isoformat(),
            'estado': 'Activo'
        }
        server_loans = get_all('/api/prestamos')
        exists = None
        for sl in server_loans:
            if sl.get('id_usuario') == loan_payload['id_usuario'] and sl.get('elemento_prestado') == loan_payload['elemento_prestado'] and sl.get('estado') == 'Activo':
                exists = sl
                break
        if MODE == 'validate':
            print(f"Loan for user {u0['id']} / book {b0['id']}: {'OK' if exists else 'MISSING'}")
        elif not exists:
            resp = _req('POST', '/api/prestamos', json=loan_payload)
            _check_response(resp, '/api/prestamos')
            summary['loans'] += 1
            print(f"Created loan for user {u0['id']} and book {b0['id']}")
        else:
            if MODE == 'update':
                resp = _req('PUT', f"/api/prestamos/{exists['id']}", json=loan_payload)
                _check_response(resp, f"/api/prestamos/{exists['id']}")
                print(f"Updated loan {exists['id']}")
            else:
                print("Loan already exists")
    else:
        print("Skipping loans: no users or no books available")

    # Devoluciones (returns)
    print('\n== Returns (Devoluciones) ==')
    server_loans = get_all('/api/prestamos')
    if server_loans:
        loan0 = server_loans[0]
        ret_payload = {
            'id_libro': server_books[0]['id'] if server_books else None,
            'id_prestamo': loan0['id'],
            'fecha_prestamo': loan0.get('fecha_prestamo'),
            'fecha_devolucion': loan0.get('fecha_devolucion'),
            'estado_prestamo': 'Devuelto'
        }
        server_returns = get_all('/api/devoluciones')
        exists = None
        for sr in server_returns:
            if sr.get('id_prestamo') == ret_payload['id_prestamo']:
                exists = sr
                break
        if MODE == 'validate':
            print(f"Return for loan {loan0['id']}: {'OK' if exists else 'MISSING'}")
        elif not exists:
            # create return
            resp = _req('POST', '/api/devoluciones', json=ret_payload)
            _check_response(resp, '/api/devoluciones')
            summary['returns'] += 1
            print(f"Created return for loan {loan0['id']}")
        else:
            if MODE == 'update':
                resp = _req('PUT', f"/api/devoluciones/{exists['id']}", json=ret_payload)
                _check_response(resp, f"/api/devoluciones/{exists['id']}")
                print(f"Updated return {exists['id']}")
            else:
                print("Return already exists")
    else:
        print("Skipping returns: no loans available")

    print('\nSummary:')
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    try:
        run()
    except requests.exceptions.RequestException as e:
        print("HTTP error:", e)
        sys.exit(2)
    except Exception as e:  # pragma: no cover - fail loudly
        print("Error:", e)
        raise
