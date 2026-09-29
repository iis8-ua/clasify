# Iteración 06 - Cierre

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

- Segundo backend con Supabase (requerimiento adicional opcional, en proyecto aparte).
- Despliegue en producción.

### Ajustes durante la iteración

- (Vacío si no ha habido cambios)

## PLAN

1. Ejecutar la suite completa y corregir las pruebas o el código que fallen.
2. Revisar y completar las validaciones y los códigos de error de cada recurso.
3. Redactar el `README.md` con las instrucciones de instalación y ejecución.
4. Verificar que `.env.example` está completo y que no hay secretos ni `node_modules` en el
   repositorio (`.gitignore` correcto).
5. Revisar que `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `Diseno.md` y las iteraciones coincidan
   con la implementación final.
6. Fusionar `develop` en `main` y preparar la entrega (repositorio git con `.git`, zip sin
   `node_modules` ni el PDF del enunciado).

### Revisión del estudiante

Pendiente de completar tras implementar.

### Riesgos o dudas

- Decidir si se aborda el segundo backend con Supabase como requerimiento adicional.
- Comprobar que la base de datos de pruebas no interfiere con los datos de desarrollo.

## TEST_PLAN

### Pruebas manuales

| Caso | Resultado esperado | Resultado obtenido |
|---|---|---|
| `npm install` y arrancar el servidor siguiendo el README | Arranca sin errores | |
| Cargar el esquema desde cero | Se crean todas las tablas | |
| `npm test` | Toda la suite pasa | |
| Revisión de los casos límite de cada recurso | Se comportan según la SPEC | |
| `git log` | Se ven los commits de todas las iteraciones | |
| Zip de entrega | No incluye `node_modules` y sí incluye `.git` | |

### Tests automáticos

- Suite completa (`npm test`) que reúne los tests de todas las iteraciones.

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
