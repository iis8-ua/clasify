# Iteración 01 - Autenticación y perfil (Supabase)

## SPEC

### Objetivo

Montar el proyecto Supabase y la capa de servicios de autenticación y perfil.

### Requisitos

Funcionales:

- `registro(email, password, nombre)` crea el usuario en Supabase Auth y su fila en `perfiles`.
- `login(email, password)` devuelve la sesión (JWT emitido por Supabase).
- `logout()` cierra la sesión.
- `perfil(usuarioId)` y `actualizarPerfil(datos)` gestionan el perfil del usuario autenticado.
- No se pueden registrar dos usuarios con el mismo email.

Técnicos:

- Proyecto Supabase en la nube y cliente `@supabase/supabase-js`.
- Variables de entorno en `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) y `.env.example`.
- Políticas RLS en `perfiles` (lectura pública, edición solo del propio perfil).
- Los servicios encapsulan el API de Supabase; el cliente no lo usa directamente.

### Fuera de alcance

- Anuncios (iteración 02).
- Favoritos y mensajería (fuera del alcance de este backend).
- Frontend.

### Ajustes durante la iteración

- (Vacío si no ha habido cambios)

## PLAN

1. Crear el proyecto en Supabase (nube) y las tablas `perfiles` y `categorias`.
2. Configurar RLS en `perfiles` y cargar las categorías iniciales.
3. Crear el proyecto Node con `@supabase/supabase-js` y el cliente de Supabase.
4. Implementar `src/services/authService.js` y `src/services/perfilService.js`.
5. Configurar `.env` / `.env.example`.
6. Escribir las pruebas con Jest sobre la capa de servicios.

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Usar un proyecto Supabase distinto para las pruebas o limpiar los datos creados.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `registro` con datos válidos | Crea el usuario y su perfil | |
| `registro` con email repetido | Devuelve error | |
| `login` con credenciales correctas | Devuelve sesión y token | |
| `login` con contraseña incorrecta | Devuelve error | |
| `perfil(id)` | Devuelve los datos del perfil | |
| `actualizarPerfil(datos)` | Actualiza solo el perfil propio | |
| `logout()` | Cierra la sesión | |

### Tests automáticos

- `auth.test.js`: registro, email duplicado, login correcto/incorrecto y cierre de sesión.
- `perfil.test.js`: lectura y actualización del perfil.

## AI_LOG

### Herramienta usada

- Herramienta: OpenCode
- Modelo: (por completar)
- Tipo: (por completar)

### Uso realizado

Pendiente de completar durante la iteración.

### Prompt importante 1

Pendiente de completar.

### Resultado

Pendiente de completar.

### Decisión del estudiante

Pendiente de completar.

### Correcciones manuales

Pendiente de completar.

## COMMITS RELACIONADOS

- Pendiente. Se rellenará con los hashes después de crear los commits de la iteración.
