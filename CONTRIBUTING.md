# CONTRIBUTING

Convención de commits y proceso de trabajo del repositorio de *Clasify* (Práctica 1).
Este documento explica cómo se han hecho y cómo se harán los commits, para que el historial
reproduzca el proceso de desarrollo descrito en `docs/iterations/`.

## Estrategia de ramas

| Rama | Uso |
|---|---|
| `main` | Rama original. Se queda reservada hasta el final; recibe el merge de `develop` cuando la aplicación esté terminada. |
| `develop` | Rama de integración. Aquí se fusiona cada iteración al cerrarla. |
| `iteracion-NN-<nombre>` | Rama de trabajo de una iteración. Sale de `develop` y se fusiona en `develop` al cerrarla. |
| `supabase-iteracion-NN` | Rama de trabajo del segundo backend (Supabase), que es un subproyecto independiente. |

Se usa `--no-ff` al fusionar para que cada iteración quede visible en el grafo.

## Convención de commits

Mensajes tipo [Conventional Commits](https://www.conventionalcommits.org/), pero **en español**.

### Tipos

| Tipo | Uso |
|---|---|
| `añadir` | Nueva funcionalidad |
| `corregir` | Corrección de un error |
| `documentar` | Cambios solo de documentación |
| `probar` | Añadir o modificar pruebas |
| `refactor` | Reestructuración sin cambiar el comportamiento |
| `tarea` | Configuración, dependencias, esquema, scripts |

### Scopes

`config`, `schema`, `auth`, `usuarios`, `anuncios`, `favoritos`, `mensajes`, `docs`, `supabase`.

### Formato

```
tipo(scope): descripción

Refs: I<n>
```

- Descripción en imperativo, minúscula, sin punto final y de 72 caracteres o menos.
- El pie `Refs: I<n>` indica a qué iteración pertenece el commit.

### Ejemplos

```
añadir(auth): registro y login con hash de contraseña

Refs: I1
```

```
corregir(mensajes): evita marcar como leídos los propios mensajes

Refs: I5
```

## Reglas

- **Un cambio lógico por commit**: si el mensaje necesita la conjunción "y", probablemente son dos commits.
- **Documentación y código van separados**: los cambios de `docs/` se commitearon aparte del código, con `documentar(docs)`.
- **Nunca se versiona** `node_modules/`, `.env` ni los PDF del enunciado (ver `.gitignore`).
- **Un commit de cierre por iteración** que actualiza el `TEST_PLAN` con los resultados obtenidos.
- Los hashes de los commits de una iteración se registran en su documento
  (`docs/iterations/NN-*.md`, sección `COMMITS RELACIONADOS`) en un commit de documentación
  posterior, ya que un commit no puede containerse a sí mismo.

## Proceso de una iteración

```bash
git switch develop
git switch -c iteracion-01-setup

# ... trabajo, con commits atómicos tipo "tipo(scope): descripción" y pie "Refs: I1" ...

git switch develop
git merge --no-ff iteracion-01-setup
```

Orden de los commits dentro de la iteración:

1. Los cambios de código, uno por commit atómico.
2. `documentar(docs): actualiza los resultados de I<n>` (tablas de pruebas manuales y tests).
3. `documentar(docs): registra los commits de I<n>` (rellena `COMMITS RELACIONADOS` con los hashes).

## Cierre y entrega

```bash
git switch main
git merge --no-ff develop
```

Después se comprime todo el proyecto (incluido `.git`, sin `node_modules` ni el PDF) y se sube
a Moodle.
