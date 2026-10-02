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

- (Vacío si no ha habido cambios)

## PLAN

1. Ejecutar las dos suites completas y corregir las pruebas o el código que fallen: la del backend
   propio contra MySQL y la de Supabase contra el proyecto real.
2. Revisar y completar las validaciones y los códigos de error de cada recurso.
3. Redactar el `README.md` con las instrucciones de instalación y ejecución.
4. Verificar que los dos `.env.example` están completos y que no hay secretos ni `node_modules` en el
   repositorio (`.gitignore` correcto).
5. Revisar que `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `Diseno.md` y las iteraciones coincidan con la
   implementación final, en los dos subproyectos.
6. Fusionar `develop` en `main` y preparar la entrega (repositorio git con `.git`, zip sin
   `node_modules` ni el PDF del enunciado).

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Que las dos suites (backend propio contra MySQL y Supabase contra el proyecto real) sigan en
  verde el mismo día de la entrega. La de Supabase tiene un límite de registros por hora del plan
  gratuito, así que encadenar ejecuciones la deja sin poder ni registrarse.
- Que la base de datos de pruebas de MySQL no interfiera con la de desarrollo.
- Que el segundo backend y el propio no se confundan en la entrega: son proyectos separados y cada
  uno con su propio SDD, y lo segundo se resolvió persiguiendo que se comporten igual.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `npm install` y arrancar el servidor siguiendo el README | Arranca sin errores | |
| Cargar el esquema desde cero | Se crean todas las tablas | |
| `npm test` en `backend/` | Toda la suite pasa contra MySQL | |
| `npm test` en `supabase-backend/` | Toda la suite pasa contra el proyecto real de Supabase | |
| Revisión de los casos límite de cada recurso | Se comportan según la SPEC | |
| `git log` | Se ven los commits de todas las iteraciones | |
| Zip de entrega | No incluye `node_modules` y sí incluye `.git` | |

### Tests automáticos

- Suite del backend propio (`backend/`), contra MySQL.
- Suite del segundo backend (`supabase-backend/`), contra Supabase.

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

Pendiente de completar: qué se aceptó y qué se rechazó de lo propuesto por la IA.

### Correcciones manuales

Pendiente de completar.

## COMMITS RELACIONADOS

- Pendiente. Se rellenará con los hashes después de crear los commits de la iteración.
