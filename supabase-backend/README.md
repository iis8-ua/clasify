# Clasify — capa de servicios sobre Supabase

Capa de servicios de **Clasify** construida sobre Supabase (requerimiento adicional de la Práctica
1). No es un servidor HTTP: no hay Express ni rutas. Hay funciones que importas y llamas.

La diferencia con `backend/` es dónde vive la lógica: aquí no hay servidor propio, así que buena
parte de las reglas se aplican en la base de datos con RLS en lugar de en código.

## Puesta en marcha

```bash
npm install
cp .env.example .env    # y rellénalo con los datos de tu proyecto
npm run db:migrate      # crea tablas, RLS, trigger, RPC y categorías
npm test
```

### Requisitos del proyecto de Supabase

Antes de que nada funcione, en el panel del proyecto:

1. **Authentication → Providers → Email**: activar el proveedor.
2. **"Confirm email"**: ponerlo en **OFF**. Si no, el registro no devuelve sesión y cada alta gasta
   un correo, que en plan gratuito salta antes que el propio registro.

Para las migraciones hace falta la Connection string de la pestaña **SESSION POOLER**, no la de
"Direct connection": `db.<ref>.supabase.co` solo resuelve a IPv6.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable key (antes "anon") |
| `SUPABASE_DB_URL` | **Solo** migraciones y limpieza. El código de la app no la usa. |

No hay variables para los tests: no necesitan ninguna credencial. Se registran
solos con emails generados y una contraseña fija que vive en
`tests/ayudaSupabase.js`, que no es un secreto. Lo que sí hace falta es la
`SUPABASE_ANON_KEY` de este proyecto: los tests hablan con Supabase real.

`.env` está en el `.gitignore` del repo y no se sube nunca.

## Uso

```js
const { authService, perfilService, anuncioService, categoriaService } = require('./src');

// Registro: devuelve el token de sesión y el usuario.
const { token, usuario } = await authService.registro({
  email: 'ana@example.com',
  contrasena: 'una-contrasena-larga',
  nombre: 'Ana'
});

// A partir de aquí, las operaciones con sesión llevan el token y el id por
// separado: { token, usuarioId }.
const contexto = { token, usuarioId: usuario.id };

// Perfil propio, con el email (solo lo ve quien llama).
await perfilService.perfil({ token });

// Anuncios. Por defecto salen solo los disponibles; estado: 'todos' para ver
// también los vendidos, o 'vendido' para ver solo esos.
await anuncioService.listar({ texto: 'bici', categoria: 8, pagina: 1, limite: 20 });
await anuncioService.crear(
  { titulo: 'Bicicleta', descripcion: 'Poca uso', precio: 250, id_categoria: 8 },
  contexto
);

// Categorías, paginadas también (pocas filas, pero mismo formato que el resto).
await categoriaService.listarCategorias();

// Los anuncios de una persona, que es lo que en el backend propio contestan
// /usuarios/me/anuncios y /usuarios/:id/anuncios.
await anuncioService.listarPorAutor({ idAutor: usuario.id });
await perfilService.listarAnunciosPorUsuario(usuario.id);
```

## Estructura

```
migrations/     SQL de las migraciones, se aplican por orden de nombre
src/
  index.js             Agrupa y exporta los servicios
  config.js             Lee el .env y falla pronto si falta algo
  db/migrar.js          Aplica las migraciones (usa pg)
  db/limpiar.js         Vacía el proyecto, con confirmación explícita
  errors/               Traduce los errores de Supabase a errores de la capa
  helpers/listado.js    Paginación, total y normalización para la búsqueda
  services/             authService, perfilService, anuncioService, categoriaService
  supabase/cliente.js   Cliente sin sesión y cliente por token
tests/         Jest contra el proyecto real
docs/          Especificación, arquitectura e iteraciones
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm test` | Jest contra el proyecto real |
| `npm run test:cobertura` | Lo mismo, con cobertura |
| `npm run db:migrate` | Aplica `migrations/` en orden |
| `npm run db:limpiar` | **Borra usuarios y anuncios.** Pide `--confirmar` |

## Sobre las pruebas

Las pruebas van **contra el proyecto real de Supabase**, no contra un doble. Eso es lo que permite
comprobar que RLS bloquea de verdad: un doble en memoria no probaría nada de eso.

Dos cosas a tener en cuenta antes de ejecutarlas:

- **Necesitan el proveedor Email activo y "Confirm email" desactivado.** Si no, fallan todas las de
  registro.
- **No borran nada al terminar.** La clave publicable no tiene permiso para tocar `auth.users`, así
  que los usuarios se acumulan. Cada ejecución registra unos nueve, y el plan gratuito limita los
  registros por hora: se pueden hacer tres o cuatro seguidas. Para vaciar el proyecto:
  `npm run db:limpiar -- --confirmar`.

## Qué tiene y qué no tiene frente al backend propio

Lo de este backend son las mismas operaciones de anuncios, perfil y categorías, pero no es una copia
del otro: el enunciado deja fuera los favoritos, la mensajería y las valoraciones, y aquí no están.
Lo que sí se persiguió es que las operaciones que existen se comporten igual, y eso se comprueba en
`tests/paridadConBackendPropio.test.js`.

Por eso este `docs/iterations/` tiene dos documentos y el del backend propio tiene siete: el
enunciado acota el alcance de este a autenticación, registro y recurso principal. El detalle está en
`docs/PROJECT_SPEC.md`.

Dos cosas hubo que hacerlas a medida para que coincidieran:

- **El listado filtra por estado.** Por defecto enseña solo los disponibles y con `estado: 'todos'`
  aparecen también los vendidos, igual que en MySQL.
- **La búsqueda no distingue acentos.** MySQL lo consigue con la collation
  `utf8mb4_unicode_ci`; en Postgres se materializa con las columnas `titulo_buscable` y
  `descripcion_buscable`, que un trigger deja en minúsculas y sin acentos. Se normaliza también el
  término que escribe quien busca, porque si no "electronica" encontraría "Electrónica" pero
  "Electrónica" no encontraría nada.

## Documentación

- `docs/PROJECT_SPEC.md`: qué se pide.
- `docs/ARCHITECTURE.md`: cómo está montado, y los comportamientos de Supabase que conviene conocer.
- `docs/iterations/`: una por iteración, con lo que se ajustó sobre la marcha y por qué.
