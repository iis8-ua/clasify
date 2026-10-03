# ARCHITECTURE

## Plataforma

- Backend como servicio (BaaS) con **Supabase**, en **proyecto en la nube**.
- Cliente JavaScript: `@supabase/supabase-js`.
- Autenticación gestionada por **Supabase Auth** (email + contraseña). Supabase emite el JWT.

## Capa de servicios

El cliente **no** usa directamente el API de Supabase: se define una capa de servicios (funciones
JavaScript) que aísla el acceso. Ejemplos:

```
registro(email, password, nombre)
login(email, password)
logout()
perfil(usuarioId)
actualizarPerfil(datos)
listarCategorias({ pagina, limite })
crearAnuncio(datos)
listarAnuncios({ texto, categoria, pagina, limite })
obtenerAnuncio(id)
actualizarAnuncio(id, datos)
eliminarAnuncio(id)
```

Internamente estas funciones llaman a `supabase.auth.*` o a las consultas sobre las tablas
(`supabase.from(...)`).

## Tablas

### perfiles

- id # mismo id que auth.users (FK a auth.users)
- email
- nombre
- biografia
- created_at

### categorias

- id
- nombre

### anuncios

- id
- titulo
- descripcion
- precio
- estado # disponible | vendido
- imagen # URL o nombre del fichero
- created_at
- id_autor # FK a perfiles
- id_categoria # FK a categorias
- titulo_buscable # generado: minúsculas y sin acentos, para buscar
- descripcion_buscable # generado: minúsculas y sin acentos, para buscar

## Seguridad (RLS)

Se activa **Row Level Security** en las tablas:

- `anuncios`: lectura pública; `INSERT`/`UPDATE`/`DELETE` solo si `auth.uid() = id_autor`.
- `perfiles`: lectura pública (sin exponer datos sensibles); `UPDATE` solo del propio perfil.
- `categorias`: solo lectura.

## Búsqueda

El backend propio no distingue acentos ni mayúsculas porque la collation de la tabla es
`utf8mb4_unicode_ci`. En Postgres `ilike` sí los distingue: `electronica` no encontraba
`Electrónica`. Para igualarlo hay dos opciones y se descartaron las dos baratas:

- `unaccent()` en el `WHERE`: no usa ningún índice y PostgREST no deja escribir funciones dentro de
  `.or()`, que solo admite operadores sobre columnas.
- Normalizar en el cliente: obliga a traer todos los anuncios para filtrarlos en memoria.

Lo que se hizo es materializar la búsqueda. La migración `0002` añade `titulo_buscable` y
`descripcion_buscable`, con el texto en minúsculas y sin acentos, las rellena un trigger en cada
escritura y las indexa. La migración viene con una comprobación que aborta si queda alguna fila sin
normalizar, por si algún camino de escritura se saltara el trigger. La `0003` sustituye esos índices
por otros de trigramas (`pg_trgm`), que es lo que accelerate `ilike '%texto%'`: un `LIKE` con
comodines al principio no puede aprovechar un índice `btree` normal.

La tabla de control `schema_migrations` la crea `db/migrar.js`, no una migración, y el script le
quita los permisos a `anon` y a `authenticated` al crearla. Los permisos por defecto del proyecto
dejan leer lo que se cree en `public`, así que sin eso se podía leer desde fuera con la sola clave
anónima.

## Escapar el término de búsqueda

El filtro de texto se monta como una cadena para un `.or()`:

```
titulo_buscable.ilike."%termino%",descripcion_buscable.ilike."%termino%"
```

Hay dos gramáticas cruzadas ahí dentro y **no se escapan igual**, que es lo más fácil de liar de
todo el subproyecto. Se comprobó una por una contra el proyecto:

| Carácter | Cómo se escapa | Por qué |
| --- | --- | --- |
| `,` | entrecomillado del valor | Separa las condiciones del `.or()`. Sin comillas, buscar `",estado.eq.vendido,descripcion_buscable.ilike."x` devolvía 24 anuncios, los 24 vendidos, sin error. |
| `%` | **dos** barras invertidas | El parser del filtro de PostgREST reduce `\\` a `\` antes de mandar el valor a Postgres, así que hay que escribir dos para que llegue una. Con una sola, `buscar cincuenta%` encontraba el anuncio entero porque el `%` volvía a ser comodín. Con tres, el filtro no parseaba. |
| `_` | **dos** barras invertidas | Por lo mismo que el `%`. |
| `"` | **una** sola barra | Aquí dentro de las comillas, el `\"` lo entiende el propio parser de PostgREST y no cierra el valor. Con dos barras, no. |
| `\` | cuatro barras | Tiene que llegar a Postgres como `\\`, que es un backslash literal. |

El término se entrecomilla siempre, y el escapado va después de normalizar. `escaparParaLike` está en
`helpers/listado.js` con esta tabla escrita en el comentario, porque volver a deducirla desde cero
lleva a la misma trampa.

El otro lado también importa: el término que escribe quien busca se normaliza igual en JavaScript
(`normalizarParaBusqueda`), porque si no la columna queda en `electronica` y el término en
`Electrónica`, y buscar con acento no encontraría nada. Buscar con mayúsculas funciona porque la
columna ya está en minúsculas. Hay una tabla de letras aparte para las que `unaccent` convierte y la
descomposición Unicode no toca, como la `ñ`: sin ella, `ninos` no encontraría `niños`.

## Listado por autor

`listarPorAutor` es el equivalente a `/usuarios/me/anuncios` y `/usuarios/:id/anuncios` del backend
propio. Filtra por `id_autor`, que es una columna y no un JWT, así que es una ruta pública y no
necesita sesión: RLS ya decide qué se puede leer. Comparte `aplicarFiltros` con `listar`, de forma
que los dos listados filtran, ordenan y paginan igual.

La paginación va en el mismo objeto que los filtros, no en un argumento aparte. Se probó lo
contrario y tenía un fallo discreto: `pagina` y `limite` acababan dentro de los filtros y se
ignoraban en silencio, así que la función devolvía siempre la página de 20.

## Paginación

Se implementa con el método `.range(desde, hasta)` de Supabase, a partir de `pagina` y `limite`,
con el mismo contrato que el backend propio: `pagina` desde 1 y `limite` entre 1 y 100.

El **total** sale de una segunda petición con `select('id', { count: 'exact', head: true })`, en
paralelo a la de datos. No sirve el `count` de la respuesta de la página: ese es el número de filas
de la página, no el total de la tabla, y usarlo haría que el bloque de paginación dijera siempre que
hay una sola página.

Todos los listados devuelven el mismo sobre `datos` + `paginacion`, **`listarCategorias` incluido**.
Las categorías son filas fijas de una tabla de referencia y podrían quedar fuera de la paginación; se
pagan igual porque el backend propio sí lo hace y los dos proyectos comparten la misma API, así que
dejarlo solo aquí significaría mantener dos formatos de respuesta.

## Comportamientos de Supabase que conviene conocer

Estas seis cosas se encontraron implementando y probando, y no están en el enunciado:

1. **GoTrue descarta las claves propias de `raw_user_meta_data` al registrarse.** De
   `signUp({ data: { nombre } })` solo llega `{ sub, email, email_verified, phone_verified }`. Con
   `updateUser({ data })` sí se guarda. Por eso `registro` hace el `signUp` y luego una segunda
   llamada para poner el nombre en `perfiles`: el trigger crea la fila, pero el nombre lo escribe el
   servicio.
2. **`from()` sin `select()` no tiene filtros.** `eq`, `or`, `order` y `range` están en el objeto que
   devuelve `select()`. El orden es `from().select()` y luego filtrar.
3. **El logout no invalida el access token.** `signOut` revoca el refresh token, pero los JWT son sin
   estado: un access token ya emitido sigue aceptándose hasta que caduca (una hora por defecto). No
   hay que confundir "el token está bien formado" con "la sesión sigue viva".
4. **El plan gratuito tiene límites.** Se puede superar el de registros de usuario por hora
   (unos 30), que es el que más fácil alcanza una suite que crea usuarios, y el de correos enviados,
   que solo se dispara si "Confirm email" está activado.
5. **`unaccent` no es `IMMUTABLE`.** No se puede usar dentro de una columna generada ni de un
   índice de expresión sin envolverla. Aquí se evita el problema porque el unaccent lo hace el
   trigger, que no exige inmutabilidad.
6. **`getClaims()` necesita el token explícito.** La sesión que guarda el cliente no es la del
   cliente por token, así que hay que pasárselo.
7. **Dentro de un `.or()`, el escapado de PostgREST no es el de `LIKE`.** El parser del filtro
   reduce cada `\\` a un solo `\` antes de mandar el valor a Postgres, de modo que para que el
   `ILIKE` reciba `\%` hay que escribir **dos** barras. Con una, el `%` vuelve a ser comodín. La
   tabla completa está en [Escapar el término de búsqueda](#escapar-el-término-de-búsqueda).

## Configuración

- Variables de entorno en `.env`: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (sin subir secretos al repo).
- `.env.example` con las claves vacías.
- **`SUPABASE_DB_URL`** solo la usan `npm run db:migrate` y `npm run db:limpiar`. El código de la
  aplicación no la lee nunca.
- Debe ser la Connection string de la pestaña **SESSION POOLER**, no la de "Direct connection":
  `db.<ref>.supabase.co` solo resuelve a IPv6 y no es alcanzable desde una red sin IPv6.
- En el panel del proyecto hay que activar el **proveedor Email** y poner **"Confirm email" en OFF**.
  Con la confirmación activada, el registro no devuelve sesión y cada alta consume un correo.

## Pruebas

- **Jest** sobre la capa de servicios, contra el proyecto Supabase de la nube. Script `npm test`.
- 169 tests en 7 ficheros. `auth`, `anuncios`, `lecturaPublica` y `paridadConBackendPropio` van
  contra el proyecto real —este último registra usuarios de verdad para comparar las dos
  implementaciones—; `errores`, `listado` y `validacionAnuncio` son puros, sin red.
- Requisito para que funcione: el proveedor Email activado y "Confirm email" desactivado.
- Los tests **no borran nada** al terminar, porque la clave publicable no puede tocar `auth.users`.
  Cada usuario tiene un email único y se reutiliza entre tests. Para vaciar el proyecto:
  `npm run db:limpiar -- --confirmar`.
- Cada ejecución completa registra once usuarios. No es un usuario por test, sino cinco usuarios
  memorizados por cada fichero que los usa, porque la caché de `tests/ayudaSupabase.js` es por
  fichero: 4 en `anuncios.test.js`, 5 en `auth.test.js` y 1 en `paridadConBackendPropio.test.js`, más
  el registro del test de email duplicado. Con el límite horario del plan gratuito dan para dos o tres
  ejecuciones seguidas.
