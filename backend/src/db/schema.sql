-- Esquema de la base de datos de Clasify.
-- Convenciones según docs/ARCHITECTURE.md:
--   * id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY
--   * fechas TIMESTAMP con DEFAULT CURRENT_TIMESTAMP
--   * textos VARCHAR en utf8mb4, salvo descripcion de anuncios (TEXT)
--   * precio DECIMAL(10,2)
--   * leido BOOLEAN (TINYINT(1)) y estado ENUM('disponible','vendido')
--   * claves foráneas con ON DELETE CASCADE
--
-- Es idempotente: se puede ejecutar tantas veces como haga falta.

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  nombre        VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  biografia     VARCHAR(500) NULL,
  fecha_alta    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_categorias_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anuncios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  titulo        VARCHAR(150) NOT NULL,
  descripcion   TEXT NOT NULL,
  precio        DECIMAL(10,2) NOT NULL,
  estado        ENUM('disponible', 'vendido') NOT NULL DEFAULT 'disponible',
  imagen        VARCHAR(255) NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_autor      INT UNSIGNED NOT NULL,
  id_categoria  INT UNSIGNED NOT NULL,
  KEY idx_anuncios_autor (id_autor),
  KEY idx_anuncios_categoria (id_categoria),
  CONSTRAINT fk_anuncios_autor
    FOREIGN KEY (id_autor) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_anuncios_categoria
    FOREIGN KEY (id_categoria) REFERENCES categorias (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favoritos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_usuario INT UNSIGNED NOT NULL,
  id_anuncio INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_favoritos_usuario_anuncio (id_usuario, id_anuncio),
  KEY idx_favoritos_anuncio (id_anuncio),
  CONSTRAINT fk_favoritos_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_favoritos_anuncio
    FOREIGN KEY (id_anuncio) REFERENCES anuncios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversaciones (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_anuncio   INT UNSIGNED NOT NULL,
  id_comprador INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_conversaciones_anuncio_comprador (id_anuncio, id_comprador),
  KEY idx_conversaciones_comprador (id_comprador),
  CONSTRAINT fk_conversaciones_anuncio
    FOREIGN KEY (id_anuncio) REFERENCES anuncios (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversaciones_comprador
    FOREIGN KEY (id_comprador) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  texto           VARCHAR(1000) NOT NULL,
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leido           BOOLEAN NOT NULL DEFAULT FALSE,
  id_conversacion INT UNSIGNED NOT NULL,
  id_emisor       INT UNSIGNED NOT NULL,
  KEY idx_mensajes_conversacion (id_conversacion),
  CONSTRAINT fk_mensajes_conversacion
    FOREIGN KEY (id_conversacion) REFERENCES conversaciones (id) ON DELETE CASCADE,
  CONSTRAINT fk_mensajes_emisor
    FOREIGN KEY (id_emisor) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un usuario valora a otro una sola vez; si repite, la fila se sobrescribe. Las dos
-- claves foráneas van en CASCADE para que al borrar un usuario se borren las
-- valoraciones que dio y las que recibió, sin dejar filas colgando.
--
-- El CHECK sobre la puntuación es una red de seguridad, no la validación de la API:
-- `validar.js` ya rechaza lo que no sea un entero de 1 a 5 con un 400, y un CHECK
-- violado sería un 500. MySQL solo aplica los CHECK a partir de la 8.0.16.
CREATE TABLE IF NOT EXISTS valoraciones (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  puntuacion   TINYINT UNSIGNED NOT NULL,
  comentario   VARCHAR(500) NULL,
  fecha        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_valorador INT UNSIGNED NOT NULL,
  id_valorado  INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_valoraciones_usuarios (id_valorador, id_valorado),
  KEY idx_valoraciones_valorado (id_valorado),
  CONSTRAINT ck_valoraciones_puntuacion CHECK (puntuacion BETWEEN 1 AND 5),
  CONSTRAINT fk_valoraciones_valorador
    FOREIGN KEY (id_valorador) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_valoraciones_valorado
    FOREIGN KEY (id_valorado) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
