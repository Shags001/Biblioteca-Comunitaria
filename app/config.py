import os


class Config:
    """Configuración de la aplicación.

    - Usa la variable de entorno `DATABASE_URL` cuando esté disponible.
    - Por defecto se deja un ejemplo para MySQL (usar `mysql+pymysql://user:pass@host/dbname`).
    """
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'tu-clave-secreta-aqui-cambiar-en-produccion'

    # Cadena de conexión: preferible establecerla en la variable de entorno DATABASE_URL
    # Ejemplo MySQL (usa PyMySQL):
    # mysql+pymysql://usuario:password@localhost/BibliotecaComunitaria
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://user:pass@localhost/BibliotecaComunitaria'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Otras configuraciones
    DEBUG = os.environ.get('FLASK_DEBUG', '1') == '1'