from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from app import db


class Libro(db.Model):
	__tablename__ = 'libros'
	__table_args__ = {'implicit_returning': False}
	id = db.Column('idLibro', db.Integer, primary_key=True)
	titulo = db.Column('titulo', db.String(255), nullable=False)
	autor = db.Column('autor', db.String(255), nullable=False)
	ISBN = db.Column('ISBN', db.String(20), nullable=False, unique=True)
	editorial = db.Column('editorial', db.String(150), nullable=False)
	anioPublicacion = db.Column('anioPublicacion', db.Integer, nullable=False)
	categoria = db.Column('categoria', db.String(100), nullable=True)
	numeroLibros = db.Column('numeroLibros', db.Integer, nullable=False, default=1)
	idioma = db.Column('idioma', db.String(50), nullable=True, default='Español')
	descripcion = db.Column('descripcion', db.Text, nullable=True)
	estado = db.Column('estado', db.String(50), nullable=False, default='Disponible')
	cantidadDisponible = db.Column('cantidadDisponible', db.Integer, nullable=False, default=0)
	cantidadPrestada = db.Column('cantidadPrestada', db.Integer, nullable=False, default=0)
	fechaRegistro = db.Column('fechaRegistro', db.DateTime, nullable=False, default=datetime.utcnow)
	ultimaActualizacion = db.Column('ultimaActualizacion', db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

	devoluciones = db.relationship('Devolucion', backref='libro', lazy=True)

	def to_dict(self):
		return {
			'id': self.id,
			'titulo': self.titulo,
			'autor': self.autor,
			'autores': [a.strip() for a in self.autor.split(',')] if self.autor else [],
			'ISBN': self.ISBN,
			'editorial': self.editorial,
			'anioPublicacion': self.anioPublicacion,
			'categoria': self.categoria,
			'numeroLibros': self.numeroLibros,
			'idioma': self.idioma,
			'descripcion': self.descripcion,
			'estado': self.estado,
			'cantidadDisponible': self.cantidadDisponible,
			'cantidadPrestada': self.cantidadPrestada,
			'fechaRegistro': self.fechaRegistro.isoformat() if self.fechaRegistro else None,
			'ultimaActualizacion': self.ultimaActualizacion.isoformat() if self.ultimaActualizacion else None,
		}

	@classmethod
	def from_dict(cls, data):
		return cls(
			titulo=data.get('titulo'),
			autor=data.get('autor') or (data.get('autores') and ', '.join(data.get('autores'))),
			ISBN=data.get('ISBN'),
			editorial=data.get('editorial'),
			anioPublicacion=data.get('anioPublicacion'),
			categoria=data.get('categoria'),
			numeroLibros=data.get('numeroLibros', 1),
			idioma=data.get('idioma', 'Español'),
			descripcion=data.get('descripcion'),
			estado=data.get('estado', 'Disponible'),
			cantidadDisponible=data.get('cantidadDisponible', 0),
			cantidadPrestada=data.get('cantidadPrestada', 0),
		)

	def update_from_dict(self, data):
		if 'autores' in data and data.get('autores') is not None:
			self.autor = ', '.join(data.get('autores'))
		for key in ['titulo', 'autor', 'ISBN', 'editorial', 'anioPublicacion', 'categoria', 'numeroLibros', 'idioma', 'descripcion', 'estado', 'cantidadDisponible', 'cantidadPrestada']:
			if key in data:
				setattr(self, key, data[key])


class Prestamo(db.Model):
	__tablename__ = 'prestamos'
	id = db.Column('id_prestamo', db.Integer, primary_key=True)
	# Link to Libro when the préstamo is for a specific book
	id_libro = db.Column('id_libro', db.Integer, db.ForeignKey('libros.idLibro'), nullable=True)
	cantidad = db.Column('cantidad', db.Integer, nullable=False, default=1)
	id_usuario = db.Column('id_usuario', db.Integer, db.ForeignKey('usuarios.id_usuario'), nullable=False)
	solicitante = db.Column('solicitante', db.String(100), nullable=False)
	elemento_prestado = db.Column('elemento_prestado', db.String(150), nullable=False)
	tipo = db.Column('tipo', db.String(20), nullable=False)
	fecha_prestamo = db.Column('fecha_prestamo', db.Date, nullable=False)
	fecha_devolucion = db.Column('fecha_devolucion', db.Date, nullable=False)
	estado = db.Column('estado', db.String(20), nullable=True, default='Activo')

	devoluciones = db.relationship('Devolucion', backref='prestamo', lazy=True)

	def to_dict(self):
		return {
			'id': self.id,
			'id_usuario': self.id_usuario,
			'id_libro': getattr(self, 'id_libro', None),
			'cantidad': getattr(self, 'cantidad', 1),
			'solicitante': self.solicitante,
			'elemento_prestado': self.elemento_prestado,
			'tipo': self.tipo,
			'fecha_prestamo': self.fecha_prestamo.isoformat() if self.fecha_prestamo else None,
			'fecha_devolucion': self.fecha_devolucion.isoformat() if self.fecha_devolucion else None,
			'estado': self.estado,
		}

	@classmethod
	def from_dict(cls, data):
		return cls(
			id_usuario=data.get('id_usuario'),
			id_libro=data.get('id_libro') or data.get('idLibro'),
			cantidad=int(data.get('cantidad')) if data.get('cantidad') is not None else 1,
			solicitante=data.get('solicitante'),
			elemento_prestado=data.get('elemento_prestado'),
			tipo=data.get('tipo'),
			fecha_prestamo=data.get('fecha_prestamo'),
			fecha_devolucion=data.get('fecha_devolucion'),
			estado=data.get('estado', 'Activo')
		)

	def update_from_dict(self, data):
		for key in ['id_usuario','id_libro','cantidad','solicitante','elemento_prestado','tipo','fecha_prestamo','fecha_devolucion','estado']:
			if key in data:
				# coerce numeric where appropriate
				if key == 'cantidad':
					try:
						setattr(self, key, int(data[key]))
					except Exception:
						setattr(self, key, getattr(self, 'cantidad', 1) or 1)
				else:
					setattr(self, key, data[key])


class Devolucion(db.Model):
	__tablename__ = 'devoluciones'
    # Prevent SQLAlchemy from emitting OUTPUT/RETURNING clauses on INSERT
    # (SQL Server disallows OUTPUT when the target table has triggers unless OUTPUT INTO is used).
	__table_args__ = {'implicit_returning': False}
	id = db.Column('id_devolucion', db.Integer, primary_key=True)
	id_libro = db.Column('id_libro', db.Integer, db.ForeignKey('libros.idLibro'), nullable=False)
	id_prestamo = db.Column('id_prestamo', db.Integer, db.ForeignKey('prestamos.id_prestamo'), nullable=True)
	fecha_prestamo = db.Column('fecha_prestamo', db.Date, nullable=False)
	fecha_devolucion = db.Column('fecha_devolucion', db.Date, nullable=False)
	estado_prestamo = db.Column('estado_prestamo', db.String(50), nullable=False)

	def to_dict(self):
		return {
			'id': self.id,
			'id_libro': self.id_libro,
			'id_prestamo': self.id_prestamo,
			'fecha_prestamo': self.fecha_prestamo.isoformat() if self.fecha_prestamo else None,
			'fecha_devolucion': self.fecha_devolucion.isoformat() if self.fecha_devolucion else None,
			'estado_prestamo': self.estado_prestamo,
		}

	@classmethod
	def from_dict(cls, data):
		return cls(
			id_libro=data.get('id_libro'),
			id_prestamo=data.get('id_prestamo'),
			fecha_prestamo=data.get('fecha_prestamo'),
			fecha_devolucion=data.get('fecha_devolucion'),
			estado_prestamo=data.get('estado_prestamo') or data.get('estado')
		)

	def update_from_dict(self, data):
		for key in ['id_libro','id_prestamo','fecha_prestamo','fecha_devolucion','estado_prestamo']:
			if key in data:
				setattr(self, key, data[key])


class Rol(db.Model):
	__tablename__ = 'roles'
	id = db.Column('id_rol', db.Integer, primary_key=True)
	nombre_rol = db.Column('nombre_rol', db.String(50), nullable=False, unique=True)
	descripcion = db.Column('descripcion', db.Text, nullable=True)
	fecha_creacion = db.Column('fecha_creacion', db.DateTime, nullable=True, default=datetime.utcnow)

	usuarios = db.relationship('Usuario', backref='rol', lazy=True)

	def to_dict(self):
		return {'id': self.id, 'nombre_rol': self.nombre_rol, 'descripcion': self.descripcion, 'fecha_creacion': self.fecha_creacion.isoformat() if self.fecha_creacion else None}


class Usuario(db.Model):
	__tablename__ = 'usuarios'
	id = db.Column('id_usuario', db.Integer, primary_key=True)
	nombre = db.Column('nombre', db.String(255), nullable=False)
	email = db.Column('email', db.String(255), nullable=False, unique=True)
	telefono = db.Column('telefono', db.String(20), nullable=False)
	direccion = db.Column('direccion', db.Text, nullable=True)
	username = db.Column('username', db.String(100), nullable=False, unique=True)
	password = db.Column('password', db.String(255), nullable=False)
	fecha_registro = db.Column('fecha_registro', db.DateTime, nullable=True, default=datetime.utcnow)
	id_rol = db.Column('id_rol', db.Integer, db.ForeignKey('roles.id_rol'), nullable=False)

	prestamos = db.relationship('Prestamo', backref='usuario', lazy=True)

	def to_dict(self):
		return {
			'id': self.id,
			'nombre': self.nombre,
			'email': self.email,
			'telefono': self.telefono,
			'direccion': self.direccion,
			'username': self.username,
			'fecha_registro': self.fecha_registro.isoformat() if self.fecha_registro else None,
			'id_rol': self.id_rol
		}

	@classmethod
	def from_dict(cls, data):
		return cls(
			nombre=data.get('nombre'),
			email=data.get('email'),
			telefono=data.get('telefono'),
			direccion=data.get('direccion'),
			username=data.get('username'),
			password=data.get('password'),
			id_rol=data.get('id_rol')
		)

	def update_from_dict(self, data):
		for key in ['nombre','email','telefono','direccion','username','password','id_rol']:
			if key in data:
				setattr(self, key, data[key])


class Loggeo(db.Model):
	__tablename__ = 'loggeo'
	id = db.Column('id_loggeo', db.Integer, primary_key=True)
	id_usuario = db.Column('id_usuario', db.Integer, db.ForeignKey('usuarios.id_usuario'), nullable=False)
	fecha_login = db.Column('fecha_login', db.DateTime, nullable=True, default=datetime.utcnow)
	fecha_logout = db.Column('fecha_logout', db.DateTime, nullable=True)
	ip_address = db.Column('ip_address', db.String(45), nullable=True)
	estado_sesion = db.Column('estado_sesion', db.String(20), nullable=True, default='activa')

	def to_dict(self):
		return {
			'id': self.id,
			'id_usuario': self.id_usuario,
			'fecha_login': self.fecha_login.isoformat() if self.fecha_login else None,
			'fecha_logout': self.fecha_logout.isoformat() if self.fecha_logout else None,
			'ip_address': self.ip_address,
			'estado_sesion': self.estado_sesion
		}

	@classmethod
	def from_dict(cls, data):
		return cls(
			id_usuario=data.get('id_usuario'),
			fecha_login=data.get('fecha_login'),
			fecha_logout=data.get('fecha_logout'),
			ip_address=data.get('ip_address'),
			estado_sesion=data.get('estado_sesion', 'activa')
		)

