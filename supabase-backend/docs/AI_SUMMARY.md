# AI_SUMMARY

## Herramientas usadas

- OpenCode (modelo big-pickle), como asistente de programación.

## Uso principal

- Planificación de las iteraciones del backend Supabase (SPEC, PLAN y TEST_PLAN antes de escribir
  código).
- Generación de la migración: tablas, RLS, trigger de perfil, RPC y categorías iniciales.
- Generación de la capa de servicios y de los tests.
- Corrección de errores y redacción de la documentación de las iteraciones.

## Partes modificadas manualmente

- Configuración del proyecto Supabase: creación del proyecto, activación del proveedor Email y
  desactivación de "Confirm email".
- Revisión de los permisos de columna de `perfiles`, que son los que impiden leer el email de otros.
- Comprobación con `pg` de que existe una fila en `perfiles` por cada usuario de `auth.users`, para
  confirmar que el trigger no se deja ninguno sin crear.
- Decisión sobre la limpieza de las pruebas: emails únicos y sin borrar, en vez de meter una
  credencial de superusuario en el código de test.

## Problemas encontrados con la IA

Cinco cosas las dio por buenas y resultaron no serlo. Todas aparecieron al probar contra el proyecto
real, no al leer el código:

1. **Diseñó el perfil creándose entero desde el trigger**, leyendo el nombre de
   `raw_user_meta_data`. Este proyecto corre una versión de GoTrue que descarta las claves propias en
   `signUp`, así que el perfil se quedaba siempre con el nombre vacío. Los tests lo tapaban porque
   comparaban el nombre devuelto con el que se había pedido. Se corrigió con una segunda llamada en
   `registro`.
2. **`perfilService` usaba un solo argumento como dos cosas distintas**, a la vez token de sesión y
   uuid en `.eq('id', ...)`. Se unificó la firma en `{ token, usuarioId }`.
3. **`actualizarPerfil` devolvía `null` en vez de fallar** cuando RLS bloqueaba la escritura, que es
   un caso en el que Supabase no da error. Ahora se comprueba si la fila existe para poder decir 403
   en vez de "no hay nada que actualizar".
4. **`getClaims()` sin argumento no validaba el token**, porque usa la sesión guardada en el cliente
   y `clienteConToken` no guarda ninguna. Ahora se le pasa el token explícito.
5. **Encadenó los filtros de PostgREST sobre `from()`**, que solo expone `select`, `insert`,
   `update`, `upsert` y `delete`. Todos los listados fallaban con `consulta.order is not a function`.
   El orden correcto es `from().select()` y luego filtrar.

También propuso la IA `perfilPublico(id)`, que no estaba en el spec. Se queda porque el anuncio necesita
el nombre de su autor y no puede llevar el email.

## Valoración personal

La IA arranca muy bien la estructura: la migración, los servicios y el reparto del código salen
rápido y en general bien ideados. Lo que no es fiable es el comportamiento real de la plataforma.
Todo lo que daba por supuesto de Supabase y de GoTrue acabó necesitando comprobación contra el
proyecto, y los cinco problemas de arriba son suposiciones que nadie verificó. El dato más útil de la iteración fue
descubrir que el `signUp` descarta las claves propias del metadata: eso no sale de la documentación
del enunciado ni de un test bien escrito, sino de mirar la tabla después de crear un usuario.

El error de fondo es el mismo en los cinco casos: escribir tests que comprueban lo que el código
devuelve en lugar de lo que debería devolver. Los tests pasaban con el listado roto porque solo
miraban la forma del resultado. Lo que sí funcionó fue hacer las comprobaciones manuales contra el
proyecto real y contrastar con `pg`.