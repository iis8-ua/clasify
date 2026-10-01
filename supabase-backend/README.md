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
| `SUPABASE_TEST_EMAIL`, `SUPABASE_TEST_PASSWORD` | Credenciales de los tests |

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

// Anuncios.
await anuncioService.listar({ texto: 'bici', categoria: 8, pagina: 1, limite: 20 });
await anuncioService.crear(
  { titulo: 'Bicicleta', descripcion: 'Poca uso', precio: 250, id_categoria: 8 },
  contexto
);
```

## Estructura

```
migrations/     SQL de la migración, se aplica por orden de nombre
src/
  index.js             Agrupa y exporta los servicios
  config.js             Lee el .env y falla pronto si falta algo
  db/migrar.js          Aplica las migraciones (usa pg)
  db/limpiar.js         Vacía el proyecto, con confirmación explícita
  errors/               Traduce los errores de Supabase a errores de la capa
  helpers/listado.js    Paginación y total
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

## Documentación

- `docs/PROJECT_SPEC.md`: qué se pide.
- `docs/ARCHITECTURE.md`: cómo está montado, y los comportamientos de Supabase que conviene conocer.
- `docs/iterations/`: una por iteración, con lo que se ajustó sobre la marcha y por qué.