from flask import Blueprint, render_template, session, abort, flash, redirect, url_for

bp = Blueprint('main', __name__)


@bp.route('/')
@bp.route('/inicio')
def index():
    """Ruta principal de la aplicación."""
    return render_template('layouts/index.html', title='Inicio')

# filepath: c:\Users\Nowe\Shags\Biblioteca-Comunitaria-4\app\routes.py
from flask import request
from app.models import Usuario, Rol, Loggeo
from app import db

@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user_input = request.form.get('email')
        password = request.form.get('password')
        # Try to authenticate against DB users first
        user = None
        try:
            # search by email or username
            user = Usuario.query.filter((Usuario.email == user_input) | (Usuario.username == user_input)).first()
        except Exception:
            user = None

        if user:
            # passwords are stored plain in seed data; compare directly
            if user.password == password:
                # Prevent login if the user's last loggeo entry marks the account as inactive
                try:
                    last = Loggeo.query.filter(Loggeo.id_usuario == user.id).order_by(Loggeo.fecha_login.desc()).first()
                    if last and getattr(last, 'estado_sesion', '') and str(last.estado_sesion).strip().lower() == 'inactiva':
                        flash('Cuenta inactiva: contacta al administrador.', 'warning')
                        return render_template('modulos/authUsuario/InLoggeo/Loggeo.html', title='Loggin')
                except Exception:
                    # If loggeo lookup fails for any reason, proceed with login (do not block due to DB error)
                    pass
                session['is_authenticated'] = True
                # try to resolve role name from Rol table if available
                role_name = None
                try:
                    # user.rol should be available via relationship/backref
                    role_name = getattr(user, 'rol', None)
                    if role_name:
                        role_name = role_name.nombre_rol
                except Exception:
                    role_name = None
                # fallback: if Rol mapping not available, try to look up by id_rol
                if not role_name and getattr(user, 'id_rol', None):
                    try:
                        r = Rol.query.get(user.id_rol)
                        if r:
                            role_name = r.nombre_rol
                    except Exception:
                        role_name = None

                session['user_role'] = role_name or 'Usuario'
                session['user_name'] = user.nombre or user_input
                session['user_id'] = user.id
                flash(f'¡Bienvenido, {session["user_name"]}! Has iniciado sesión correctamente.', 'success')
                return redirect(url_for('main.index'))

        # Si no se autenticó con la BD, devolver error de credenciales.
        flash('Usuario, correo o contraseña incorrectos. Intenta de nuevo.', 'danger')
    return render_template('modulos/authUsuario/InLoggeo/Loggeo.html', title='Loggin')

@bp.route('/rol')
def roles():
    """Gestión de usuarios — acceso solo para Administrador.

    Requiere que en la sesión exista 'is_authenticated' == True y
    'user_role' == 'Administrador'. Si no, devuelve 403 (prohibido).
    """
    if not session.get('is_authenticated') or session.get('user_role') != 'Administrador':
        # Opcional: flash y redirección en lugar de 403. Aquí usamos 403 para bloquear el acceso.
        # flash('Acceso denegado: permiso requerido: Administrador', 'warning')
        return abort(403)

    return render_template('modulos/authUsuario/InLoggeo/rols/usuarios.html', title='Gestion de Usuarios')


@bp.route('/gestLibro')
def gestLibro():
    return render_template('modulos/gestLibros/index.html', title='Gestion de Libros')


@bp.route('/prestamo')
def prestamo():
    return render_template('modulos/prestamo/devoluciones/prestamo.html', title='Prestamos de Libros')

@bp.route('/devolucion')
def devolucion():
    return render_template('modulos/devoluciones/devoluciones.html', title='Devoluciones de Libros')

@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('main.index'))
