from flask import Blueprint, render_template, session, abort, flash, redirect, url_for

bp = Blueprint('main', __name__)


@bp.route('/')
@bp.route('/inicio')
def index():
    """Ruta principal de la aplicación."""
    return render_template('layouts/index.html', title='Inicio')

# filepath: c:\Users\Nowe\Shags\Biblioteca-Comunitaria-4\app\routes.py
from flask import request
from .usuarios import usuarios  # Importa el archivo de usuarios

@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user_input = request.form.get('email')
        password = request.form.get('password')
        user = usuarios.get(user_input)
        # Si no se encuentra por clave, buscar por nombre de usuario (clave exacta)
        if not user:
            for k, v in usuarios.items():
                if k.lower() == user_input.lower():
                    user = v
                    break
        if user and user['password'] == password:
            session['is_authenticated'] = True
            session['user_role'] = user['role']
            session['user_name'] = user.get('name', user_input)
            flash(f'¡Bienvenido, {session["user_name"]}! Has iniciado sesión correctamente.', 'success')
            return redirect(url_for('main.index'))
        else:
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

@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('main.index'))