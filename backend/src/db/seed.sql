-- Datos iniciales de Clasify.
-- Es idempotente (INSERT IGNORE), así que se puede ejecutar varias veces sin duplicar.
--
-- Usuarios de prueba: contraseña Clasify123! (hash bcrypt de coste 12).
--   ana@example.com  ·  carlos@example.com
-- El hash se generó con:  bcrypt.hashSync('Clasify123!', 12)
-- Si se cambia la contraseña del seed, hay que regenerar el hash:
--   node -e "console.log(require('bcrypt').hashSync('NUEVA', 12))"

INSERT IGNORE INTO categorias (nombre) VALUES
  ('Electrónica'),
  ('Moda'),
  ('Hogar y jardín'),
  ('Deportes'),
  ('Libros y música'),
  ('Motor'),
  ('Juguetes y bebé'),
  ('Bicicletas');

INSERT IGNORE INTO usuarios (email, nombre, password_hash, biografia) VALUES
  ('ana@example.com', 'Ana Ruiz',
   '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWDDQmfWt9eCZ3sak/G',
   'Vendo cosas que ya no uso. Perfil de prueba.'),
  ('carlos@example.com', 'Carlos Díaz',
   '$2b$12$zvGU1QCN7FVLhEl5ViOEd.QN907DrZYboJGWDDQmfWt9eCZ3sak/G',
   'Perfil de prueba.');
