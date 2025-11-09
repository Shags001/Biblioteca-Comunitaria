from flask import Blueprint, render_template

bp = Blueprint('main', __name__)

@bp.route('/')
@bp.route('/index')
def index():
    """Ruta principal de la aplicación."""
    return render_template('layouts/index.html', title='Inicio')


@bp.route('/registro')
def citas():
    return render_template('modulos/authUsuario/regUsuario/registro.html', title='Registro')