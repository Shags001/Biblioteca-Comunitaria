DROP DATABASE IF EXISTS `BibliotecaComunitaria`;
CREATE DATABASE `BibliotecaComunitaria` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `BibliotecaComunitaria`;

CREATE TABLE `alembic_version` (
  `version_num` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `libros` (
  `idLibro` INT NOT NULL AUTO_INCREMENT,
  `titulo` VARCHAR(255) NOT NULL,
  `autor` VARCHAR(255) NOT NULL,
  `ISBN` VARCHAR(20) NOT NULL,
  `editorial` VARCHAR(150) NOT NULL,
  `anioPublicacion` INT NOT NULL,
  `categoria` VARCHAR(100) DEFAULT NULL,
  `numeroLibros` INT NOT NULL,
  `idioma` VARCHAR(50) DEFAULT NULL,
  `descripcion` LONGTEXT DEFAULT NULL,
  `estado` VARCHAR(50) NOT NULL,
  `cantidadDisponible` INT NOT NULL,
  `cantidadPrestada` INT NOT NULL,
  `fechaRegistro` DATETIME NOT NULL,
  `ultimaActualizacion` DATETIME NOT NULL,
  PRIMARY KEY (`idLibro`),
  UNIQUE KEY `uq_libros_ISBN` (`ISBN`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índice compuesto para búsqueda: usar prefijos seguros para evitar el error 1071.
-- Ajusta los prefijos según tus necesidades de selectividad; estos valores son conservadores.
ALTER TABLE `libros`
  ADD KEY `idx_libros_busqueda` (`titulo`(150), `ISBN`(20), `autor`(100), `editorial`(100), `categoria`(50), `estado`(20));

-- Otras tablas (creadas tal cual, ajustadas a MySQL types)
CREATE TABLE `usuarios` (
  `id_usuario` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `telefono` VARCHAR(20) NOT NULL,
  `direccion` LONGTEXT DEFAULT NULL,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `fecha_registro` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `id_rol` INT NOT NULL,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  UNIQUE KEY `uq_usuarios_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `loggeo` (
  `id_loggeo` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `fecha_login` DATETIME DEFAULT NULL,
  `fecha_logout` DATETIME DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `estado_sesion` VARCHAR(20) DEFAULT NULL,
  PRIMARY KEY (`id_loggeo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `prestamos` (
  `id_prestamo` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `solicitante` VARCHAR(100) NOT NULL,
  `elemento_prestado` VARCHAR(150) NOT NULL,
  `tipo` VARCHAR(20) NOT NULL,
  `fecha_prestamo` DATE NOT NULL,
  `fecha_devolucion` DATE NOT NULL,
  `estado` VARCHAR(20) DEFAULT 'Activo',
  `id_libro` INT DEFAULT NULL,
  `cantidad` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_prestamo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id_rol` INT NOT NULL AUTO_INCREMENT,
  `nombre_rol` VARCHAR(50) NOT NULL,
  `descripcion` LONGTEXT DEFAULT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `uq_roles_nombre` (`nombre_rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `devoluciones` (
  `id_devolucion` INT NOT NULL AUTO_INCREMENT,
  `id_libro` INT NOT NULL,
  `id_prestamo` INT DEFAULT NULL,
  `fecha_prestamo` DATE NOT NULL,
  `fecha_devolucion` DATE NOT NULL,
  `estado_prestamo` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id_devolucion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `devoluciones`
  ADD CONSTRAINT `fk_devoluciones_libro` FOREIGN KEY (`id_libro`) REFERENCES `libros`(`idLibro`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_devoluciones_prestamo` FOREIGN KEY (`id_prestamo`) REFERENCES `prestamos`(`id_prestamo`);

ALTER TABLE `loggeo`
  ADD CONSTRAINT `fk_loggeo_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`) ON DELETE CASCADE;

ALTER TABLE `prestamos`
  ADD CONSTRAINT `fk_prestamos_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id_usuario`);

ALTER TABLE `usuarios`
  ADD CONSTRAINT `fk_usuarios_roles` FOREIGN KEY (`id_rol`) REFERENCES `roles`(`id_rol`);

-- CHECK constraints that don't use functions: keep them if tu MySQL los soporta (MySQL 8+).
-- Si usas MySQL < 8.0.16, los CHECK se almacenan pero no se aplican.
ALTER TABLE `libros`
  ADD CONSTRAINT `chk_libros_cant_nonneg` CHECK (`cantidadDisponible` >= 0 AND `cantidadPrestada` >= 0),
  ADD CONSTRAINT `chk_libros_cant_total` CHECK ((`cantidadDisponible` + `cantidadPrestada`) <= `numeroLibros`),
  ADD CONSTRAINT `chk_libros_numeroLibros` CHECK (`numeroLibros` >= 1);

ALTER TABLE `prestamos`
  ADD CONSTRAINT `chk_prestamos_estado` CHECK (`estado` IN ('Retrasado','Devuelto','Activo')),
  ADD CONSTRAINT `chk_prestamos_tipo` CHECK (`tipo` IN ('Documento','Libro'));

-- En MySQL no se permite usar CURDATE() dentro de una CHECK (ERROR 3814). 
-- Implementamos la validación anioPublicacion <= YEAR(CURDATE()) mediante triggers:

DELIMITER $$

CREATE TRIGGER `trg_libros_bi` BEFORE INSERT ON `libros`
FOR EACH ROW
BEGIN
  IF NEW.anioPublicacion IS NOT NULL AND NEW.anioPublicacion > YEAR(CURDATE()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'anioPublicacion cannot be in the future';
  END IF;
  -- Optional: also ensure cantidad fields are consistent with numeroLibros
  IF NEW.cantidadDisponible < 0 OR NEW.cantidadPrestada < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cantidadDisponible/cantidadPrestada must be non-negative';
  END IF;
  IF (NEW.cantidadDisponible + NEW.cantidadPrestada) > NEW.numeroLibros THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sum of cantidadDisponible and cantidadPrestada cannot exceed numeroLibros';
  END IF;
END$$

CREATE TRIGGER `trg_libros_bu` BEFORE UPDATE ON `libros`
FOR EACH ROW
BEGIN
  IF NEW.anioPublicacion IS NOT NULL AND NEW.anioPublicacion > YEAR(CURDATE()) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'anioPublicacion cannot be in the future';
  END IF;
  IF NEW.cantidadDisponible < 0 OR NEW.cantidadPrestada < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cantidadDisponible/cantidadPrestada must be non-negative';
  END IF;
  IF (NEW.cantidadDisponible + NEW.cantidadPrestada) > NEW.numeroLibros THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sum of cantidadDisponible and cantidadPrestada cannot exceed numeroLibros';
  END IF;
END$$

DELIMITER ;