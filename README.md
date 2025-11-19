# Biblioteca-Comunitaria
Aplicación para una biblioteca comunitaria

# Un CRUD Application - python + Boostrap
Sistema CRUD completo para gestionar una bibliote comunitaria con flask (python)

# Funcionalidades 

-Agrega libros
-Hacer prestamos
-Entrar como admin o recepcionista
-Base de datos mySQL workbench

# Tecnologias utilizadas

Backend: Python 3.8, flask
Frontend: HTML5, Css, Boostrap, javascript (Vanilla)
-Base de datos MySQL Workbench

- Crear entorno virtual
py -m venv .venv

- Crear el entorno virtual

\.venv\Scripts\Activate.ps1

# Crear archivo de dependencia
Crear archivo requirements.txt

Flask==3.0.3
Flask-SQLAlchemy==3.0.1
Flask-Migrate==4.0.7
python-dotenv==1.0.1
PyMySQL==1.0.3
requests==2.31.0

- Instalar dependencias 
 python -m pip install -r .\requirements.txt

 # Hacer un Wipeo de datos.
$env:POPULATE_WIPE_TOKEN='(.env variable)'
py run.py

 # Llenado de Datos.
$env:POPULATE_MODE='create'
python .\scripts\populate_api.py

 # valor del .env. 

DATABASE_URL=mssql+pyodbc:///?odbc_connect=DRIVER%3D%7BODBC%20Driver%2017%20for%20SQL%20Server%7D%3BSERVER%3Dlocalhost%3BDATABASE%3DBibliotecaComunitaria%3BTrusted_Connection%3Dyes%3B
API_BASE_URL=http://127.0.0.1:5000
POPULATE_MODE=create
POPULATE_WIPE=true
POPULATE_WIPE_TOKEN=(token_seguro)