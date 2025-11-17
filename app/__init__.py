from flask import Flask, session
from app.config import Config


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Registrar las rutas
    from app import routes
    app.register_blueprint(routes.bp)

    # Inyectar datos de sesión útiles en todas las plantillas
    @app.context_processor
    def inject_user():
        # Devuelve el rol, si está autenticado y el nombre de usuario
        return {
            'user_role': session.get('user_role'),
            'is_authenticated': session.get('is_authenticated', False),
            'user_name': session.get('user_name')
        }

    return app