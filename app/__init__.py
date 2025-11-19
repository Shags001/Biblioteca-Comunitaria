from flask import Flask, session
from app.config import Config
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

# Inicializamos la extensión pero la ligamos en create_app
db = SQLAlchemy()
migrate = Migrate()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Inicializar extensiones de DB
    db.init_app(app)
    migrate.init_app(app, db)

    # Registrar las rutas de UI (blueprint principal)
    from app import routes
    app.register_blueprint(routes.bp)

    # Registrar blueprint API
    from app import api
    app.register_blueprint(api.api)

    # Inyectar datos de sesión útiles en todas las plantillas
    @app.context_processor
    def inject_user():
        # Devuelve el rol, si está autenticado y el nombre de usuario
        user_role = session.get('user_role')
        is_auth = session.get('is_authenticated', False)
        user_name = session.get('user_name')
        user_id = session.get('user_id')
        # If we have a user_id stored in session, prefer the authoritative DB value
        if user_id:
            try:
                from app.models import Usuario
                u = Usuario.query.get(user_id)
                if u and getattr(u, 'nombre', None):
                    user_name = u.nombre
            except Exception:
                # ignore DB errors and fall back to session value
                pass
        return {
            'user_role': user_role,
            'is_authenticated': is_auth,
            'user_name': user_name,
            'user_id': user_id
        }

    return app