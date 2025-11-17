from flask import Blueprint, render_template

bp = Blueprint('main', __name__)

@bp.route('/')
@bp.route('/inicio')
def index():
    """Ruta principal de la aplicación."""
    return render_template('layouts/index.html', title='Inicio')


@bp.route('/logging')
def login():
    return render_template('modulos/authUsuario/InLoggeo/Loggeo.html', title='Loggin')

@bp.route('/rol')
def roles():
    return render_template('modulos/authUsuario/InLoggeo/rols/usuarios.html', title='Gestion de Usuarios')

@bp.route('/gestLibro')
def gestLibro():
    return render_template('modulos/gestLibro/index.html', title='Gestion de Libros')