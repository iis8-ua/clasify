# Iteración 08 - Cierre

## SPEC

### Objetivo

Revisar el conjunto de la aplicación, reforzar validaciones y casos límite, dejar las pruebas de
regresión y la documentación coherentes con la implementación final.

### Requisitos

Funcionales:

- Repaso de todas las validaciones (usuarios, anuncios, favoritos, mensajes).
- Casos límite cubiertos: precios límite, paginación fuera de rango, ids inexistentes, recursos de
  otros usuarios, tokens caducados.
- Verificación de que las reglas de acceso funcionan de extremo a extremo.

Técnicos:

- `README.md` con requisitos, instalación, variables de entorno (`ARCHITECTURE.md`), carga del
  esquema y ejecución de la suite de pruebas.
- `.env.example` con las variables necesarias (sin secretos reales).
- Suite de pruebas completa ejecutable con `npm test` sobre una base de datos de pruebas.
- Documentación `docs/` coherente con el código entregado, incluyendo los cambios relevantes
  respecto a lo previsto.

### Fuera de alcance

- Despliegue en producción.
- Añadir funcionalidad nueva. Lo que quede de Iteraciones 1 a 7 se revisa y se arregla, no se amplía.

### Ajustes durante la iteración

La revisión encontró once problemas reales, ocho en el backend de Supabase y tres en el propio.
Ninguno era un requisito incumplido del enunciado: todos eran errores de la implementación o
afirmaciones falsas en la documentación. Se detallan en el `AI_LOG`, en "Correcciones manuales".

Dos ajustes cambian el alcance aprobado:

1. **Se corrigió una inyección en la búsqueda de Supabase.** Un término con una coma se colaba como
   condición más del `.or()` y devolvía anuncios que no correspondían. Es un fallo de seguridad, y
   aunque la SPEC de esta iteración habla de "casos límite", no cabe dentro de "no añadir
   funcionalidad nueva": es tapar un agujero.
2. **`GET /categorias` pasó a paginarse en los dos backends.** Estaba documentado como excepción
   justificada, y el razonamiento era defendible (en el enunciado la exigencia de paginar está dentro
   del bloque del recurso principal, y las categorías no lo son). Aun así se pagina, para no tener un
   endpoint raro que recordar y porque los dos proyectos comparten la misma API. Es la única
   funcionalidad que se añadió, y se añadió para quitar una excepción, no para ampliar el alcance.

## PLAN

1. Ejecutar las dos suites completas y corregir las pruebas o el código que fallen: la del backend
   propio contra MySQL y la de Supabase contra el proyecto real.
2. Revisar y completar las validaciones y los códigos de error de cada recurso.
3. Redactar el `README.md` con las instrucciones de instalación y ejecución.
4. Verificar que los dos `.env.example` están completos y que no hay secretos ni `node_modules` en el
   repositorio (`.gitignore` correcto).
5. Revisar que `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `Diseno.md` y las iteraciones coincidan con la
   implementación final, en los dos subproyectos.
6. Fusionar `develop` en `main` y preparar la entrega. El enunciado pide comprimir "todos los archivos
   de vuestro proyecto" y avisa solo de una cosa: **no subir `node_modules`**. Con eso, el ZIP lleva
   todo el código, los `package-lock.json` (que son los que permiten reconstruir el `node_modules`),
   los `.env.example`, la documentación y el `.git` entero, para que se puedan comprobar los commits.
   Quedan fuera `node_modules` y el PDF del enunciado, que no es un fichero del proyecto.

### Revisión del estudiante

La revisión se hizo por capas, y en ese orden porque es el que sale más barato: primero leer el
código, luego comprobar contra la base de datos real lo que parecía sospechoso, y solo al final
tocar los tests.

**Lo que había bien.** La arquitectura aguantó el paso del tiempo: el reparto en rutas, servicios,
middleware y helpers de la iteración 1 sigue siendo el adecuado, y el contrato de paginación, el
formato de error y la convención de `precio` como texto se mantuvieron sin desviaciones en las siete
iteraciones. La paridad entre los dos backends se sostiene: las 13 pruebas de
`paridadConBackendPropio.test.js` siguen green.

**Lo que no estaba bien.** Once problemas, que se agrupan en cuatro clases muy distintas:

- *Un fallo que reventaba en cada llamada.* `perfilService.js` usaba `anuncioService` sin
  importarlo, así que `listarAnunciosPorUsuario()` lanzaba `ReferenceError` siempre. Un test que
  hubiera chamado esa función lo habría visto enseguida; no lo había porque nadie la llamaba.
- *Fuga de información.* Los errores reenviaban el texto de Postgres, que trae nombres de tabla,
  columna y restricción. Un `42501` llegaba al consumidor como `new row violates row-level security
  policy for table "anuncios"`.
- *Un agujero de seguridad.* El escapado del término de búsqueda en `.or()` era incorrecto, y lo
 peor era que no fallaba de forma visible: devolvía filas equivocadas sin error ni warning.
- *Documentación que afirmaba cosas falsas.* La más importante: el hash bcrypt de los cuatro ficheros
  de tests era distinto del de `seed.sql` mientras el comentario decía "Hash del seed". Al principio
  se diagnosticó al revés —que el del seed era inválido— y fue una falsa alarma del propio script de
  comprobación, que mutilaba el hash al leerlo de la shell; el de `seed.sql` es correcto y valida
  `Clasify123!`.

**Cómo se decide qué arreglar.** Solo lo que se puede reproducir. Cada problema se comprobó contra la
base de datos real o contra una petición real antes de escribir el arreglo, y el arreglo se volvió a
comprobar después. Eso descartaró cuatro hallazgos que parecían bugs y no lo eran, entre ellos el
hash del seed y una hypothesized carrera en la subida de imágenes que sí se confirmó pero por otro
motivo.

### Riesgos o dudas

- Que las dos suites (backend propio contra MySQL y Supabase contra el proyecto real) sigan en
  verde el mismo día de la entrega. La de Supabase tiene un límite de registros por hora del plan
  gratuito, así que encadenar ejecuciones la deja sin poder ni registrarse.
- Que la base de datos de pruebas de MySQL no interfiera con la de desarrollo.
- Que el segundo backend y el propio no se confundan en la entrega: son proyectos separados y cada
  uno con su propio SDD, y lo segundo se resolvió persiguiendo que se comporten igual.
- Que al corregir el escapado de la búsqueda se rompiera otra cosa. Pasó, y por eso el arreglo se hizo
  comprobando carácter a carácter contra el proyecto, no leyendo el código. La regla que salió es
  contraintuitiva: `%` y `_` necesitan dos barras invertidas y la comilla una sola.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `npm install` y arrancar el servidor siguiendo el README | Arranca sin errores | Correcto. `npm start` levanta en `http://localhost:3000/clasify_api` y conecta con MySQL sin avisos. |
| Cargar el esquema desde cero | Se crean todas las tablas | Correcto. `npm run db:schema` recrea las 7 tablas: anuncios, categorias, conversaciones, favoritos, mensajes, usuarios y valoraciones. |
| `npm test` en `backend/` | Toda la suite pasa contra MySQL | Correcto. **304 tests en 6 ficheros, todos en verde.** |
| `npm test` en `supabase-backend/` | Toda la suite pasa contra el proyecto real | Correcto. **169 tests en 7 ficheros, todos en verde.** |
| Revisión de los casos límite de cada recurso | Se comportan según la SPEC | Correcto. Con el servidor levantado: `?limite=0` devuelve 400 `VALIDACION` con `campo: "limite"`, y `GET /categorias?limite=3` devuelve la primera de 3 páginas con su `paginacion` completa. |
| `git log` | Se ven los commits de todas las iteraciones | Correcto. `git log --merges develop` devuelve ocho commits de fusión para las siete iteraciones: la I7 entró en dos pasos, primero la capa de servicios y después la paridad. Cada commit de esta iteración es atómico y lleva `Refs: I8` en el pie. |
| Zip de entrega | No incluye `node_modules` y sí incluye `.git` | Pendiente de ejecutar en el momento de comprimir. Se comprobó antes que `.gitignore` excluye `node_modules/`, `.env`, `.env.local`, `*.pdf` y `coverage/`, y que `git ls-files` no devuelve ninguno de ellos. |

### Tests automáticos

- Suite del backend propio (`backend/`), contra MySQL: **304 tests, 6 ficheros**, con peticiones HTTP
  reales a la API mediante Supertest.
- Suite del segundo backend (`supabase-backend/`), contra Supabase: **169 tests, 7 ficheros**.
  Cuatro de ellos (`auth`, `anuncios`, `lecturaPublica` y `paridadConBackendPropio`) llaman al
  proyecto real; los otros tres (`errores`, `listado` y `validacionAnuncio`) son puros, sin red.
- Reparto de los 169 tests de Supabase por fichero: `anuncios` 28, `auth` 26, `errores` 26,
  `lecturaPublica` 26, `listado` 25, `validacionAnuncio` 25 y `paridadConBackendPropio` 13.
- Los **45 tests nuevos** de esta iteración (127 + 3 = los que había antes) se reparten así: 26 en
  `errores.test.js`, que es un archivo nuevo y donde bastan 11 declaraciones porque dos son
  `test.each` y una va en un bucle sobre los siete códigos de Postgres que la aplicación puede
  provocar; 9 en `listado.test.js` (escapado de `%`, `_`, `"`, `\` y la coma que se colaba como
  condición); 4 en `anuncios.test.js` de Supabase (ids que no son uuid en las rutas de escritura); 3
  en `lecturaPublica.test.js` (paginación de categorías) y 3 en `anuncios.test.js` del backend propio
  (lo mismo, en MySQL).

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: big-pickle
- Tipo: (local / remoto) — asistente de programación en el repositorio

### Uso realizado

Generación de los arreglos, los tests de regresión y los cambios de documentación. La revisión fue
documento a documento, leyendo cada afirmación y comprobándola contra el código o contra la base de
datos real; cuando una afirmación parecía falsa, se fue a la fuente (la tabla, la petición, la
consulta) antes de aceptar o descartar el hallazgo. Los arreglos de seguridad se hicieron
probando variantes contra el proyecto real hasta dar con una que cumpliera las dos condiciones
contrapuestas, no leyendo la documentación de PostgREST.

### Prompt importante 1

> Revisa a fondo el código y la documentación de los dos backends, sin fiarte de nada. Busca errores
> de código y afirmaciones falsas en la documentación. Para cada hallazgo, verifícalo contra la base
> de datos real o contra una petición real antes de darlo por bueno, y descarta los que no se
> reproduzcan. Al final, comprueba los dos backends contra los requisitos del enunciado.

### Prompt importante 2

> El escapado del término de búsqueda en el `.or()` de Supabase no funciona: una coma se cuela como
> condición. Arréglalo, pero no rompas el escapado de los comodines `%` y `_`, que es lo que
> controla el test existente. Comprueba las dos cosas contra el proyecto real.

### Resultado

Once problemas corregidos, todos con test de regresión salvo los que solo eran documentación. El
detalle está en "Correcciones manuales". Dos de ellos consumieron casi todo el trabajo:

- El escapado de la búsqueda salió dos veces. La primera solución (entrecomillar el valor) arreglaba
  la inyección pero rompía los comodines: `%` volvía a hacer de comodín. La segunda (dos barras para
  todo) arreglaba los comodines pero rompía las comillas, con un error de parseo de Postgres. La
  buena era asimétrica —dos barras para `%`, `_` y `\`, una para `"`— y salió de probarla, no de
  deducirla. Está escrita en `supabase-backend/docs/ARCHITECTURE.md` y en el propio helper, porque
  volver a deducirla lleva a la misma trampa.
- Los errores de Postgres salían con su texto. El arreglo no es solo no reenviarlo: es mapear los
  códigos que la aplicación puede provocar de verdad (`22P02`, `23502`, `23503`, `23514`, `22003`) a
  errores propios con estado HTTP, y guardar el texto original en `errorOriginal`, que no es
  enumerable para que un `JSON.stringify` no lo salga en la respuesta.

Las dos suites quedaron en verde: 304 y 169 tests. Ningún requisito del enunciado quedó sin cumplir,
que era lo que se iba a comprobar.

### Decisión del estudiante

- **Se corrigió la inyección de la búsqueda aunque la SPEC dijera "no añadir funcionalidad".** Es un
  fallo de seguridad, no una mejora: se devuelve información de filas que el cliente no ha pedido. Se
 distinguió lo que es tapar un agujero de lo que es ampliar el alcance, y aquí fue lo primero.
- **`GET /categorias` se pagina aunque la documentación lo declaraba excepción justificada.** El
  razonamiento era correcto (el enunciado pide paginar los listados del recurso principal), pero
  dejarlo así obligaba a recordar un endpoint raro y a mantener dos formatos de respuesta entre
  proyectos que comparten API. Se documentó la decisión en los dos sitios en lugar de dejarla solo en
  el código.
- **No se corrigió el hash de los tests de los ficheros que no lo usaban para autenticarse.** Se
  corrigió igualmente por otra razón: el comentario mentía, y un comentario que miente sobre el
  estado de los datos de prueba es peor que no tenerlo.
- **Se retiró `docs_iniciales/`.** Eran la especificación de un *crowdfunding* obsoleto, sin una sola
  referencia en el repositorio y con equivalentes actuales en `docs/`. Mantenerlos era una fuente de
  contradicciones para quien leyera el proyecto entero.

### Correcciones manuales

Supabase (ocho):

1. `perfilService.js` usaba `anuncioService` sin importarlo: `listarAnunciosPorUsuario()` fallaba
   siempre con `ReferenceError`.
2. `ErrorDeServicio.js` reenviaba el texto de Postgres y de GoTrue al consumidor. Ahora traduce por
   código y deja el original en `errorOriginal`, no enumerable.
3. `helpers/listado.js`: el término de búsqueda se colaba en el filtro con una coma. Corregido y
   verificado con los tres intentos de inyección que devolvían 24 anuncios vendidos.
4. `helpers/listado.js`: el escapado de `%`, `_`, `\` y `"`, con la regla asimétrica de barras.
5. `anuncioService.js`: `actualizar`, `eliminar` y `listarPorAutor` mandaban ids sin validar y
   devolvían 500 con `invalid input syntax for type uuid`. Ahora pasan por `exigirUuid`, igual que
   `obtener`.
6. `db/migrar.js`: no había control de migraciones aplicadas, así que la segunda ejecución fallaba en
   el `ADD COLUMN` de la 0001. Añadida la tabla `schema_migrations` y una transacción por migración.
7. `db/migrar.js`: `schema_migrations` quedaba legible con la clave anónima, porque los permisos por
   defecto del proyecto dejan leer lo que se crea en `public`. Cerrado al crearla.
8. `migrations/0002` y nueva `0003`: la 0002 no era idempotente y la 0003 cierra permisos, índices de
   trigramas y `CHECK`s. Un `CHECK` de `nombre` con mínimo 1 rompía el registro, porque el trigger
   inserta `''` a propósito y el nombre se escribe después.

Backend propio (tres):

9. `anuncioService.js`: si el `UPDATE` entraba y fallaba la lectura posterior, el middleware borraba la
   imagen nueva que la fila ya referenciaba, dejando la ficha apuntando a un fichero inexistente.
   Ahora se deshace la columna de imagen antes de relanzar el error.
10. Cuatro ficheros de tests llevaban un hash bcrypt distinto del de `seed.sql` mientras el comentario
    decía "Hash del seed".
11. `categoriaService.js` y `routes/categorias.js`: listado paginado, con tests de paginación real y de
    los cuatro valores inválidos de `pagina` y `limite`.

Documentación:

- Retirada `docs_iniciales/`, que describía otro proyecto.
- `docs/iterations/07-supabase.md`: dos migraciones en vez de tres, y las cifras de tests.
- `supabase-backend/docs/ARCHITECTURE.md`: sección nueva con la tabla de escapado, la tercera
  migración y el cierre de `schema_migrations`.
- `docs/ARCHITECTURE.md`, `Diseno.md` y los dos `README.md`: la excepción de categorías y el total de
  pruebas.
- `docs/iterations/02-anuncios.md` y `06-valoraciones.md`: los resultados que ya eran de su momento
  se marcan como históricos, para que no se lean como el estado actual.

## COMMITS RELACIONADOS

- `a6f8627` - `corregir(supabase): importa el servicio de anuncios que perfilService usa`
- `36c836d` - `corregir(supabase): no reenvía el texto de Postgres en los errores`
- `118e28f` - `corregir(supabase): escapa el término de búsqueda del filtro`
- `968a04f` - `corregir(supabase): valida el uuid en las rutas de escritura`
- `7704a58` - `añadir(supabase): pagina el listado de categorías`
- `ad4223d` - `tarea(supabase): migraciones idempotentes, con registro y permisos cerrados`
- `e3582d4` - `corregir(anuncios): no deja la ficha apuntando a una imagen borrada`
- `25395e1` - `probar(auth): los tests usan el hash del seed`
- `20322d8` - `añadir(anuncios): pagina el listado de categorías`
- `4d4993c` - `documentar(docs): retira la especificación obsoleta de docs_iniciales`
- `217774a` - `documentar(docs): pone la documentación al día tras la revisión`