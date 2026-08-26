# MentorIA Math — PMV 1

Plataforma educativa de matemáticas: un tutor que explica paso a paso, corrige
con un motor determinista en servidor (sin depender de la IA para la
matemática) y adapta cada lección al nivel real del estudiante.

Este repositorio contiene la migración del prototipo Node.js/Express a la
arquitectura del PMV 1: **Next.js (App Router) + TypeScript + PostgreSQL**.

> **Estado: Paso 1 completado** — fundación, arquitectura, persistencia,
> autenticación con roles y diagnóstico inicial. Los pasos 2, 3 y 4 (motor
> pedagógico LSG, capa multimodal y panel docente) están descritos al final.

---

## Índice

1. [Requisitos](#requisitos)
2. [Puesta en marcha paso a paso](#puesta-en-marcha-paso-a-paso)
3. [Variables de entorno](#variables-de-entorno)
4. [Comandos disponibles](#comandos-disponibles)
5. [Suite de validación (QA)](#suite-de-validación-qa)
6. [Arquitectura](#arquitectura)
7. [Modelo de datos](#modelo-de-datos)
8. [El diagnóstico inicial](#el-diagnóstico-inicial)
9. [Qué entra en el Paso 1 y qué no](#qué-entra-en-el-paso-1-y-qué-no)

---

## Requisitos

- **Node.js 18 o superior** (probado en Node 24).
- **PostgreSQL**: una instancia de Supabase o un PostgreSQL local.
- Una **API key de Google Gemini** (opcional en el Paso 1: sin ella la
  aplicación arranca en modo demostración y la suite de QA se ejecuta igual).

---

## Puesta en marcha paso a paso

### 1. Clonar e instalar

```bash
git clone https://github.com/vladimirgds/docenteia.git
cd docenteia
npm install
```

### 2. Configurar el entorno

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Abre `.env` y rellena, como mínimo, `DATABASE_URL`, `DIRECT_URL` y
`AUTH_SECRET`. Para generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Se usa `.env` y no `.env.local` porque la CLI de Prisma **sólo lee `.env`**:
> con la configuración en `.env.local` las migraciones fallan. Así hay una sola
> copia de la configuración, que leen a la vez Next.js, Prisma y los scripts de
> `qa/`. Ninguno de los dos ficheros se sube al repositorio.

#### Si usas Supabase

En *Project Settings → Database → Connection string*:

- `DATABASE_URL` → cadena del **pooler**, puerto `6543`, añadiendo
  `?pgbouncer=true&connection_limit=1`.
- `DIRECT_URL` → cadena de **conexión directa**, puerto `5432`.

Prisma usa la primera para consultar y la segunda para migrar. Con un
PostgreSQL local, ambas son la misma cadena.

### 3. Crear las tablas

```bash
npx prisma migrate deploy     # aplica la migración incluida en el repositorio
npm run db:generate           # genera el cliente de Prisma
```

Durante el desarrollo, para crear migraciones nuevas:

```bash
npm run db:migrate            # equivale a: prisma migrate dev
```

### 4. Sembrar los datos base

```bash
npm run db:seed
```

Crea la materia, el árbol de conocimiento de los cinco temas, el banco de
preguntas del diagnóstico y dos usuarios que el registro público **no** puede
crear:

| Rol     | Correo                        | Contraseña     |
| ------- | ----------------------------- | -------------- |
| ADMIN   | `admin@mentoriamath.local`    | `Admin-2026`   |
| DOCENTE | `docente@mentoriamath.local`  | `Docente-2026` |

> **Cámbialas antes de cualquier despliegue.** Se pueden fijar por entorno con
> `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DOCENTE_EMAIL` y
> `SEED_DOCENTE_PASSWORD`.

### 5. Levantar la aplicación

```bash
npm run dev
```

Abre **http://localhost:3000**.

### 6. Verificación del cierre del Hito 1

Los cuatro puntos comprometidos para el Paso 1, en el orden en que conviene
comprobarlos.

#### A. Flujo funcional: registro → diagnóstico → nivel → persistencia

1. Entra en `/registro` y crea una cuenta de estudiante.
2. Al terminar entras directamente en la **evaluación diagnóstica** (5 preguntas).
3. Responde y pulsa *Terminar evaluación*: el servidor corrige, aplica la regla
   de corte (0-2 Básico · 3-4 Intermedio · 5 Avanzado) y muestra el **nivel**.
4. En `/estudiante` verás el nivel y el historial, **leídos de PostgreSQL**.
5. Recarga la página o vuelve a entrar: el nivel sigue ahí. Eso es la persistencia.

Para comprobar que la corrección es real, no cosmética: repite el registro con
otra cuenta y responde a propósito 2 preguntas bien y 3 mal → debe salir
**Básico**. Con las 5 bien → **Avanzado**.

#### B. Control de roles (RBAC)

6. Sal y entra con el usuario **docente** de la semilla. En `/docente` verás al
   estudiante que acabas de crear, con su nivel.
7. Con ese mismo usuario, intenta abrir `/admin`: el sistema te devuelve a tu
   zona. Sin sesión, cualquier ruta protegida te manda a `/login`.
8. Entra como **admin** y abre `/admin`: verás el recuento de usuarios,
   preguntas activas, nodos del árbol y diagnósticos completados.

#### C. Persistencia en base de datos

```bash
npm run db:studio
```

Abre Prisma Studio y comprueba las tablas `usuarios`, `perfiles_estudiante`
(con `nivelActual` relleno), `intentos_diagnostico`, `respuestas_diagnostico` e
`historial_nivel`.

#### D. Paridad con el prototipo (suite de validación)

Con la aplicación levantada en otra terminal:

```bash
npm test
```

Debe terminar sin fallos. La última ejecución sobre esta versión da 1.673
comprobaciones aprobadas y 1.800 turnos de barrido sin una sola violación; el
detalle está en [Suite de validación](#suite-de-validación-qa).

---

## Variables de entorno

| Variable          | Obligatoria | Para qué sirve                                                        |
| ----------------- | ----------- | --------------------------------------------------------------------- |
| `DATABASE_URL`    | Sí          | Conexión de la aplicación a PostgreSQL (pooler en Supabase).           |
| `DIRECT_URL`      | Sí          | Conexión directa que usa Prisma para migrar.                          |
| `AUTH_SECRET`     | Sí          | Firma de la sesión de NextAuth.                                        |
| `AUTH_TRUST_HOST` | En la nube  | Necesaria detrás de un proxy (Vercel, Render).                        |
| `GEMINI_API_KEY`  | No          | Sin ella, la IA funciona en **modo demostración** (LSG simulado).      |
| `GEMINI_MODEL`    | No          | Por defecto `gemini-2.5-flash-lite`, con fallback automático.           |
| `BASE_URL`        | No          | URL contra la que corre la suite de QA. Por defecto `localhost:3000`.  |

Todas están documentadas con más detalle en [`.env.example`](.env.example).

> **Sobre Gemini:** Google retira modelos con frecuencia, así que el cliente
> lleva *fallback* automático: si un modelo devuelve 404, prueba el siguiente y
> recuerda cuál funcionó. Además, la API no está disponible en todas las
> regiones (`400 User location is not supported`) y, sin un proyecto de Google
> Cloud con **facturación activa**, los `429` son frecuentes.

---

## Comandos disponibles

| Comando               | Qué hace                                              |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | Arranca la aplicación en desarrollo (puerto 3000).    |
| `npm run build`       | Genera el cliente de Prisma y compila para producción.|
| `npm start`           | Sirve la compilación de producción.                   |
| `npm run typecheck`   | Comprueba los tipos sin compilar.                     |
| `npm run db:migrate`  | Crea y aplica migraciones (desarrollo).               |
| `npm run db:deploy`   | Aplica migraciones existentes (producción).           |
| `npm run db:seed`     | Siembra datos base y usuarios de demostración.        |
| `npm run db:studio`   | Abre Prisma Studio para inspeccionar la base.         |
| `npm test`            | Ejecuta la suite de validación completa.              |
| `npm run qa:diagnostico` | Valida el banco de preguntas (no necesita servidor).|
| `npm run legacy:start`| Arranca el prototipo Express original (puerto 3001).  |

---

## Suite de validación (QA)

La suite heredada del prototipo se conserva íntegra y **ya no depende de
Render**: corre contra `http://localhost:3000` o contra lo que indique
`BASE_URL`.

```bash
npm run dev      # en una terminal
npm test         # en otra
```

`npm test` empieza por una comprobación previa (`qa/preflight.mjs`) que verifica
que hay un servidor escuchando. Sin ella, una aplicación no arrancada se
manifiesta como una cascada de fallos de prueba, que es un síntoma engañoso.

| Batería               | Qué comprueba                                                       |
| --------------------- | ------------------------------------------------------------------- |
| `qa/diagnostico.mjs`  | El banco oficial de preguntas, contra el motor determinista.         |
| `qa/qa.mjs`           | Lógica (clasificador, solver, saneo) y lecciones reales end-to-end.  |
| `qa/frontend.mjs`     | Funciones de decisión del frontend, sin servidor.                    |
| `qa/sesiones.mjs`     | Continuidad de tema a lo largo de una conversación.                  |
| `qa/aceptacion.mjs`   | Los casos de aceptación de los cinco temas garantizados.             |
| `qa/barrido.mjs`      | Barrido por propiedades: genera conversaciones y exige invariantes.  |

Resultado de la última ejecución completa sobre esta versión:

```
Banco de preguntas    51 aprobadas · 0 fallidas
qa.mjs              1462 aprobadas · 0 fallidas
frontend.mjs          10 cargas    · 0 fallidas
sesiones.mjs         126 aprobadas · 0 fallidas
aceptacion.mjs        24 / 24 correctas
barrido.mjs          200 sesiones · 1800 turnos · 0 violaciones
```

Baterías sueltas y parámetros:

```bash
npm run qa:barrido
BASE_URL=http://localhost:3000 BARRIDO_TURNOS=10 BARRIDO_SEC=20 node qa/barrido.mjs
```

> `qa/qa.mjs` genera lecciones **reales con Gemini** cuando hay
> `GEMINI_API_KEY` configurada. Sin clave, funciona en modo demostración y no
> consume cuota.

---

## Arquitectura

```
Consulta (texto / voz)
        │
        ▼
 Clasificador de intención  →  resolver | aprender | explicar | practicar   (src/classifier.js)
        │
        ▼
 ¿Es un TEMA NÚCLEO?  ── SÍ ──→  MOTOR DETERMINISTA                         (src/lsgPrompt.js)
        │                        ecuaciones lineales · derivadas ·
        NO                       factorización · fracciones · aritmética
        │                        (0 coste de IA · matemática GARANTIZADA)
        ▼                                  │
 IA generativa (Gemini)  →  genera el LSG  │                                (src/geminiClient.js)
        │                                  │
        ▼                                  ▼
 PRE Light  →  valida y normaliza el LSG en pasos/módulos                   (src/preLight.js)
        │
        ▼
 Next.js  →  App Router, RSC, rutas de API                                  (app/)
```

### Por qué el núcleo sigue en JavaScript

`src/` contiene unas 5.000 líneas de lógica matemática validada en producción y
respaldada por la suite de QA. Reescribirlas en TypeScript habría sido
reescribir la pedagogía, que es justamente lo que este contrato pide **no**
hacer. En su lugar:

- El núcleo se mantiene tal cual y se declara su superficie pública en
  `src/queryCore.d.ts`.
- **Todo el código nuevo del PMV 1 es TypeScript en modo estricto** y consume
  ese núcleo con tipos.

### Paridad con el prototipo

El manejador de `/api/query` se extrajo a `src/queryCore.js`, un módulo
independiente del framework. Lo llaman **los dos** caminos:

- `app/api/query/route.ts` — la aplicación del PMV 1.
- `server.js` — el prototipo Express, que se conserva como referencia
  ejecutable (`npm run legacy:start`, puerto 3001).

Al compartir implementación no pueden divergir: la paridad algorítmica es
**estructural**, no algo que haya que verificar a mano tras cada cambio.

### Estructura del repositorio

```
app/                    Rutas y páginas (App Router)
  api/                    query · diagnostico · registro · health · auth
  estudiante/             panel y evaluación diagnóstica
  docente/  admin/        zonas protegidas por rol
components/             Componentes de UI (shadcn/ui) y KaTeX
lib/                    prisma · rbac · diagnóstico · utilidades
prisma/                 schema.prisma · migraciones · semilla
src/                    NÚCLEO HEREDADO: classifier · preLight · lsgPrompt ·
                        geminiClient · queryCore  (+ declaraciones .d.ts)
public/                 Frontend del prototipo (referencia del Paso 3)
qa/                     Suite de validación
auth.ts / auth.config.ts / middleware.ts    Autenticación y RBAC
```

---

## Modelo de datos

13 tablas en tres bloques (ver [`prisma/schema.prisma`](prisma/schema.prisma)):

**Usuarios y roles**
`usuarios` con RBAC de tres perfiles: `ESTUDIANTE`, `DOCENTE`, `ADMIN`.

**Perfil académico**
`perfiles_estudiante` (ciclo, grado, nivel vigente y metadatos de contexto que
se inyectan en cada consulta a la IA), `materias`, `perfil_materias` e
`historial_nivel`, que registra cada cambio de nivel con su motivo.

**Knowledge Tree**
`nodos_conocimiento` (árbol real, con padre e hijos), `ejercicios` (banco con
metadatos y marca de validado), `sesiones_aprendizaje`, `registros_progreso` y
`registros_error` (catálogo de debilidades frecuentes, acumulado por tipo).

**Diagnóstico**
`preguntas_diagnostico`, `intentos_diagnostico` y `respuestas_diagnostico`.

### Sobre la autenticación

Se usa **NextAuth v5 (Auth.js)** con proveedor *Credentials* y estrategia JWT.
Esa combinación no utiliza las tablas `Account`/`Session`/`VerificationToken`
del adaptador de base de datos, así que no están en el esquema: no son tablas
muertas, sencillamente no intervienen.

El registro público crea **siempre** usuarios `ESTUDIANTE`. El rol nunca se
acepta desde el cuerpo de la petición: un registro abierto que permita elegir
`ADMIN` es una escalada de privilegios servida en bandeja. Los perfiles docente
y administrador los crea la semilla o un administrador.

---

## El diagnóstico inicial

Cinco preguntas, una por cada tema garantizado por PRE Light, ordenadas de menor
a mayor dificultad. Regla de corte acordada:

| Aciertos | Nivel        |
| -------- | ------------ |
| 0 – 2    | `BASICO`     |
| 3 – 4    | `INTERMEDIO` |
| 5        | `AVANZADO`   |

Es **totalmente determinista**: se cuentan las respuestas correctas y se aplica
el tramo. La IA no interviene en ningún punto.

Dos decisiones de implementación que conviene conocer:

- **La respuesta correcta nunca sale del servidor.** Ni el `GET` de preguntas ni
  la respuesta del `POST` la incluyen; si viajara al navegador, falsear el
  diagnóstico sería cuestión de abrir las herramientas de desarrollo.
- **El envío debe cubrir el banco completo.** Un diagnóstico a medias produciría
  un recuento que no significa nada, así que se rechaza en lugar de clasificarlo.

El banco vive en
[`prisma/seed-data/preguntas-diagnostico.json`](prisma/seed-data/preguntas-diagnostico.json)
y la regla, en un único sitio:
[`lib/diagnostico/clasificar.ts`](lib/diagnostico/clasificar.ts).

---

## Qué entra en el Paso 1 y qué no

### Entregado en el Paso 1

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion.
- KaTeX configurado y en uso en el diagnóstico.
- PostgreSQL + Prisma: esquema completo, migración y semilla.
- RBAC de tres roles, con protección en middleware **y** en las rutas de API.
- Diagnóstico inicial determinista, con persistencia del nivel y su historial.
- Núcleo heredado integrado: Gemini por variables de entorno, PRE Light y
  esquemas LSG operativos desde la aplicación Next.
- Suite de QA ejecutable en local, sin dependencia de Render.

### Pasos siguientes

- **Paso 2** — Motor pedagógico LSG con las 4 fases obligatorias, validador
  ampliado y ramificación de errores con pistas.
- **Paso 3** — SmartBoard con renderizado progresivo, TTS sincronizado en
  español y avatar 2D reactivo. El avatar reutiliza el SVG existente
  (`public/avatar.js`) remapeando estados: *esperando* → `neutral`,
  *hablando* → `hablando`, *pensando* → `pensando`, *corrigiendo* →
  `preguntando`.
- **Paso 4** — Panel docente con métricas y mapa de calor, y despliegue
  productivo en Vercel + Supabase.

### Nota sobre el banco de preguntas

`prisma/seed-data/preguntas-diagnostico.json` contiene el **banco oficial**
entregado por el cliente, **guardado con su formato original tal cual** (`id`,
`tema` en minúsculas, `pregunta`, `opciones` como lista de textos,
`respuesta_correcta`). No se ha reescrito a propósito: así, sustituirlo por una
versión nueva es copiar y pegar el fichero y volver a ejecutar
`npm run db:seed`, sin tocar código.

La adaptación al esquema ocurre en la semilla ([`prisma/seed.ts`](prisma/seed.ts)):

- Las opciones pasan de lista de textos a pares `{ id, texto }` y la respuesta
  correcta pasa de ser el **texto** a ser el **id** de esa opción. Así, lo que
  el navegador envía al corregir es un identificador opaco y no la propia
  respuesta, y la comparación deja de depender de espacios, mayúsculas o de cómo
  esté escrita la fórmula.
- Si la `respuesta_correcta` no coincide con ninguna opción, la semilla **falla
  y se detiene**. Un banco así clasificaría mal a todos los alumnos sin dar
  ningún síntoma visible.
- Las preguntas que dejen de estar en el fichero se **desactivan**, no se
  borran: eliminarlas se llevaría por delante, en cascada, las respuestas de los
  alumnos que ya las contestaron.

Además, `npm run qa:diagnostico` contrasta cada respuesta declarada contra el
**mismo motor determinista que califica las prácticas** (`src/preLight.js`). Las
cinco del banco oficial están verificadas por esa vía; si el motor no cubriera
un enunciado, la batería lo declara «sin verificar» en lugar de darlo por bueno.
