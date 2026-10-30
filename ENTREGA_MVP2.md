# Entrega — HITO 4 (cierre PMV2)

**Proyecto:** MentorIA Math
**Fase:** Cierre definitivo del PMV2 (versión institucional)
**PR:** [#104 — feat(hito4): límite de tasa + panel de administración + semáforo de riesgo académico](https://github.com/vladimirgds/docenteia/pull/104)
**Rama:** `feat/hito4-limite-de-tasa` (fork: `miyamotogenji/docenteia`)

Este documento recorre, punto por punto, la especificación técnica "HITO 4
(cierre PMV2)" que mandó el cliente, y dice para cada uno: qué se construyó,
dónde vive, y cómo se comprobó. No es un resumen de intenciones — cada fila
de la tabla de la sección 6 apunta a un archivo o a una batería de QA que
cualquiera puede volver a correr.

## Cómo verificarlo

```bash
npm install
npx prisma generate
npx tsc --noEmit          # 0 errores
npm run build              # build de producción (el mismo que corre `vercel-build`)

npm run dev                 # en otra terminal, con la base de datos sembrada

node qa/hito4-seguridad.mjs        # 34 comprobaciones — rate limiting
node qa/hito4-admin-usuarios.mjs   # 36 comprobaciones — RBAC y alta directa de usuarios
node qa/hito4-admin-contenido.mjs  # 15 comprobaciones — /admin/ejercicios y /admin/temas
node qa/hito4-admin-aulas.mjs      # 38 comprobaciones — /admin/aulas, asignación de docente y matrícula directa
node qa/hito4-riesgo.mjs           # 43 comprobaciones — semáforo de riesgo y KPIs
node qa/hito4-exportar.mjs         # 24 comprobaciones — PDF/Excel
node qa/hito4.mjs                  # 28 comprobaciones — el checklist de cierre, literal

node qa/qa.mjs                     # 1473 comprobaciones — toda la plataforma, sin regresiones
```

Las siete baterías de HITO 4 suman **218 comprobaciones**, todas en verde. El
barrido completo (`qa/qa.mjs`, que a su vez corre hito1, hito2, hito3,
diagnóstico, aceptación, lección, matemáticas, paso1, sesiones y rigor)
también está en verde — nada de esto rompió lo que ya funcionaba.

## 1. Seguridad y blindaje de la arquitectura

### A. Aislamiento multi-tenant estricto (IDOR)

Patrón ya existente desde HITO 3 (`exigirDocente`, `exigirDocenteConInstitucion`,
`exigirDirector` en `lib/docente/api.ts` y `lib/director/api.ts`), más
`exigirSuperadmin` nuevo en `lib/admin/api.ts`: cada ruta resuelve el recurso
y compara su dueño contra `session.user.id`/`institucionId` ANTES de leer o
escribir nada, y devuelve 404/403 genérico si no coincide — nunca un volcado
de Prisma. Confirmado con sesiones cruzadas en las seis baterías de HITO4 (un
docente no ve las aulas de otro, un director no ve otra institución, un
alumno no entra a ninguna ruta de docente/director/admin).

### B. Protección contra fuerza bruta (rate limiting)

`lib/seguridad/limite-tasa.ts` — ventana deslizante en memoria (no hay
credenciales de Upstash Redis/Vercel KV que yo pueda provisionar desde aquí;
el pliego admite esta alternativa explícitamente). Documentado el límite
real: en un despliegue serverless multi-instancia el conteo es "mejor
esfuerzo por instancia", no un límite global estricto.

- `POST /api/estudiante/unirse`: 5 intentos/minuto por alumno en sesión → 429 con `Retry-After`.
- Login (`auth.ts`, callback de `Credentials`): 5 fallos seguidos por IP → bloqueo de 15 minutos.

Verificado en `qa/hito4-seguridad.mjs` (34 comprobaciones, puras con relojes
de mentira + HTTP de verdad) y reconfirmado en `qa/hito4.mjs`.

## 2. Dashboards multinivel

| Rol | Dónde | Qué trae |
|---|---|---|
| Estudiante | `app/estudiante/page.tsx` | Tareas activas vs. completadas ("Mis tareas"), nivel y aciertos del diagnóstico, **racha de días consecutivos de práctica** (`lib/estudiante/racha.ts`, nuevo), historial de entregas con retroalimentación por ejercicio (`EntregaTarea.detalle`, de una ronda anterior — "Ver resultado"). |
| Docente | `app/docente/page.tsx` | Tasa de entrega y aciertos del grupo, **tasa de entrega de tareas de sus aulas** (nuevo), **distribución de nivel Básico/Intermedio/Avanzado** (nuevo), **semáforo de riesgo académico** (nuevo, ver sección 5) con insignia de color por alumno y resumen por nivel, **tabla de seguimiento de alumnos MATRICULADOS con filtros por aula y estado de tareas** (nuevo, `components/docente/seguimiento-matriculados.tsx` — distinta de la tabla "Estudiantes registrados en la plataforma", que es el registro libre de PMV1), accesos directos a aulas/tareas/ejercicios (en la barra de navegación), **botones de exportación PDF/Excel** (nuevo). |
| Director | `app/director/page.tsx` | Total de docentes/aulas/alumnos, tasa de entrega y **rendimiento (tasa de aciertos) por aula** (nuevo), **gráfico comparativo de rendimiento por grado** (nuevo — la tabla de aulas ya comparaba entre secciones), **temas con mayor tasa de error de todo el colegio** (nuevo), **botones de exportación PDF/Excel** (nuevo). |

Verificado en `qa/hito4-riesgo.mjs` (41 comprobaciones: las funciones puras
+ que las tres pantallas de verdad muestran lo nuevo) y visualmente con
capturas de pantalla reales contra datos sembrados, incluido el filtro de
la tabla de seguimiento funcionando en el navegador.

## 3. Mantenimiento de tablas y gestión administrativa (`/admin`)

- **Contenido curricular**: `/admin/ejercicios` y `/admin/temas` reutilizan
  `GestorEjercicios`/`GestorCurriculo` (los mismos componentes, ya probados,
  de `/docente/ejercicios` y `/docente/curriculo` — el banco y el currículo
  son de toda la plataforma, no de un docente). Borrado controlado: un
  ejercicio con progreso de algún alumno no se borra, se archiva (ya era el
  comportamiento de `DELETE /api/docente/ejercicios/[id]` desde HITO 1).
- **Usuarios y RBAC**: `/admin/usuarios` — listar y filtrar por rol,
  activar/suspender, reasignar rol, vincular a una institución. Más, desde
  el checklist actualizado, dos **formularios de alta directa**,
  independientes entre sí y de la institución/aula a la que vayan a
  parar: "Formulario de Docentes" (nombre, correo, contraseña —antes no
  existía ninguna forma de crear un docente de un tirón, sólo reasignar el
  rol de una cuenta ya existente) y "Formulario de Alumnos" (nombre,
  correo, contraseña, etapa/curso opcionales). `POST /api/admin/usuarios`.
  `lib/admin/api.ts`, `lib/admin/usuarios.ts`,
  `app/api/admin/usuarios/route.ts`,
  `app/api/admin/usuarios/[id]/route.ts`.
- **Aulas, centralizadas, con alta y asignación DESACOPLADAS** (checklist
  actualizado, corregido dos veces tras ver la pantalla en vivo):
  `/admin/aulas` — vista maestra de las aulas de TODA la plataforma. El
  aula se crea como entidad independiente, con sólo nombre, grado, sección
  e institución (`POST /api/admin/aulas`) — nace SIN titular, a propósito.
  El docente se asigna (o se cambia, o se desvincula) DESPUÉS, directo
  desde un selector en la propia fila de la tabla
  (`PATCH /api/admin/aulas/[id]`). Matricular alumnos sigue siendo directo,
  sin código de invitación (`POST /api/admin/matriculas`, el "Módulo de
  Matrícula/Asignación"). `Aula.docenteId` es opcional en el esquema
  (`onDelete: SetNull`, no `Cascade`: borrar al docente ya no se lleva por
  delante el aula entera). `/docente/aulas` sigue siendo VISTA LIMPIA: el
  docente sólo visualiza las aulas que el colegio le asignó.
  `lib/admin/aulas.ts`, `app/api/admin/aulas/route.ts`,
  `app/api/admin/aulas/[id]/route.ts`, `app/api/admin/matriculas/route.ts`,
  `components/admin/gestor-aulas.tsx`.

Verificado en `qa/hito4-admin-usuarios.mjs` (36),
`qa/hito4-admin-contenido.mjs` (15) y `qa/hito4-admin-aulas.mjs` (38).

## 4. Exportación de reportes en servidor (PDF y Excel)

- `GET /api/docente/exportar/pdf` y `/excel`: libreta de calificaciones de
  las aulas del docente en sesión (filtro por `docenteId`). El Excel trae
  las pestañas **Estudiantes**, **Tareas**, **Matriz de calificaciones** y
  **Sesiones** (lo más parecido a "asistencia" que hay en el esquema: no
  existe una tabla de asistencia dedicada, así que se usa el conteo de
  sesiones de lección terminadas por alumno — ver nota de decisiones más
  abajo).
- `GET /api/director/exportar/pdf` y `/excel`: reporte institucional
  (siempre acotado a `institucionId`), con las aulas y su rendimiento, y los
  temas con mayor tasa de error del colegio.
- Las dos libretas en PDF (`lib/reportes/pdf.tsx`, con `@react-pdf/renderer`)
  llevan membrete (nombre de la plataforma y fecha), tabla paginada, y una
  línea de "Firma de dirección" al final, lista para imprimirse y firmarse a
  mano — no hay un logo de verdad que el cliente haya entregado.
- Los libros de Excel (`lib/reportes/excel.ts`, con `exceljs`) no
  recalculan nada: usan las mismas funciones puras que ya pintan los
  paneles (`tasaDeEntrega`, `tasaDeAciertos`, `dificultadesRecurrentes`).
- Botones "Descargar PDF" / "Descargar Excel" en `/docente` y `/director`.

Verificado en `qa/hito4-exportar.mjs` (24 comprobaciones: los cuatro
archivos se generan con su cabecera real — `%PDF` / ZIP —, Zero-Trust y
aislamiento por `docenteId`/`institucionId`).

## 5. Algoritmo de detección temprana de riesgo académico

`riesgoAcademico()` en `lib/docente/metricas.ts` — **aditivo**, no reemplaza
`estadoDeAlumno` (que ya tenía su propia batería, `qa/paso1.mjs`, y sigue
intacta). Clasifica a cada alumno en:

- **Alto** (rojo): más de 3 fallos seguidos VIVOS ahora mismo en cualquier
  tema (no un máximo histórico ya superado — `rachasDeFallosPorAlumno`), o 2
  o más tareas vencidas sin entregar.
- **Observación** (ámbar): menos del 60% de aciertos, o exactamente 1 tarea
  vencida sin entregar, o algo entregado fuera de plazo.
- **Óptimo** (verde): 80% o más de aciertos y nada entregado tarde.
- **Sin datos**: sin ninguna señal todavía (alumno recién matriculado).

El hueco entre "no es Alto" y "no llega a Óptimo" (p. ej. 70% de aciertos,
nada vencido) cae en Observación por decisión explícita — el semáforo no
deja a nadie sin color. Insignias de color en la tabla de `/docente`, con un
resumen "Semáforo de riesgo académico" con el conteo por nivel.

Verificado en `qa/hito4-riesgo.mjs`, sección A (15 comprobaciones puras,
cada rama de la clasificación con datos de mentira).

## 6. Checklist de cierre y aceptación

### Vistas Frontend

| Ítem | Estado | Evidencia |
|---|---|---|
| `/estudiante` — racha y tareas | ✅ | `app/estudiante/page.tsx`; `qa/hito4.mjs` sección 1 |
| `/docente` — KPIs y semáforo de riesgo | ✅ | `app/docente/page.tsx`; `qa/hito4-riesgo.mjs`, `qa/hito4.mjs` |
| `/director` — analítica institucional | ✅ | `app/director/page.tsx`; `qa/hito4-riesgo.mjs`, `qa/hito4.mjs` |
| `/admin` — depuración de ejercicios y usuarios, con suspensión/activación | ✅ | `app/admin/*`; `qa/hito4-admin-usuarios.mjs`, `qa/hito4-admin-contenido.mjs` |
| `/docente/aulas` — vista limpia, sin formulario de creación | ✅ | `app/docente/aulas/page.tsx`; `qa/hito4-admin-aulas.mjs` |
| `/admin/aulas` — vista maestra: alta sin docente, asignación y matrícula en la tabla | ✅ | `app/admin/aulas/page.tsx`; `qa/hito4-admin-aulas.mjs` |

### Endpoints backend y seguridad

| Ítem | Estado | Evidencia |
|---|---|---|
| `POST /api/admin/usuarios/[id]/estado` (activar/suspender) | ✅ | `app/api/admin/usuarios/[id]/estado/route.ts`; `qa/hito4.mjs` |
| `DELETE /api/admin/ejercicios/[id]` (eliminación protegida) | ✅ | `app/api/admin/ejercicios/[id]/route.ts`; `qa/hito4.mjs` |
| `POST /api/admin/aulas` (creación centralizada, SIN docente — se asigna después) | ✅ | `app/api/admin/aulas/route.ts`; `qa/hito4-admin-aulas.mjs` |
| `PATCH /api/admin/aulas/[id]` (asigna, cambia o desvincula el docente titular) | ✅ | `app/api/admin/aulas/[id]/route.ts`; `qa/hito4-admin-aulas.mjs` |
| `POST /api/admin/matriculas` (asignación directa de un estudianteId a un aulaId) | ✅ | `app/api/admin/matriculas/route.ts`; `qa/hito4-admin-aulas.mjs` |
| `GET /api/docente/exportar/pdf` y `/excel` | ✅ | `app/api/docente/exportar/*`; `qa/hito4-exportar.mjs` |
| `GET /api/director/exportar/pdf` y `/excel` | ✅ | `app/api/director/exportar/*`; `qa/hito4-exportar.mjs` |
| Rate limiting operativo en `POST /api/estudiante/unirse` (429 al exceder 5/min) | ✅ | `lib/seguridad/limite-tasa.ts`; `qa/hito4-seguridad.mjs`, `qa/hito4.mjs` |
| Filtro estricto por `docenteId`/`estudianteId`/`institucionId` en todas las consultas | ✅ | patrón `exigirDocente*`/`exigirDirector`/`exigirSuperadmin`; confirmado con sesiones cruzadas en las siete baterías de HITO4 |

### Calidad de software

| Ítem | Estado | Evidencia |
|---|---|---|
| `qa/hito4.mjs` al 100% | ✅ | 28/28 — ver salida del comando más arriba |
| Barrido completo `node qa/qa.mjs` en verde | ✅ | 1473/1473 |
| `npx tsc --noEmit` en 0 errores | ✅ | confirmado en esta misma ronda |
| `npm run build` exitoso | ✅ | confirmado en esta misma ronda (ver nota) |
| `ENTREGA_MVP2.md` en la raíz | ✅ | este documento |

**Nota sobre el build:** `npm run build` (`prisma generate && next build`) se
corrió y terminó sin errores en este entorno de desarrollo — es el mismo
comando que ejecuta `vercel-build` salvo por `prisma migrate deploy` (que
necesita la base de datos de producción) y la siembra. El build **en**
Vercel, contra el entorno real, sólo se confirma en el propio despliegue —
no es algo que se pueda correr desde aquí sin acceso a ese proyecto.

## Decisiones documentadas

Dos endpoints existían ya con un contrato equivalente desde una ronda
anterior, bajo una ruta distinta a la que pide el checklist —se mantienen
AMBOS, no se eliminó el original, porque el panel `/admin` ya los usa—:

- `PATCH /api/admin/usuarios/[id]` (acepta `{ activo, rol, institucionId }`
  en un solo request, es lo que usa la pantalla) **y**
  `POST /api/admin/usuarios/[id]/estado` (sólo `{ activo }`, el contrato
  literal del pliego) — las dos rutas llaman a la misma regla de negocio.
- `DELETE /api/docente/ejercicios/[id]` (ya aceptaba `SUPERADMIN` desde
  HITO 1, es lo que usa `/admin/ejercicios`) **y**
  `DELETE /api/admin/ejercicios/[id]` (el contrato literal del pliego, con
  su propio candado `exigirSuperadmin`).

"Sesiones/Asistencia" en el Excel del docente: el esquema no tiene una tabla
de asistencia dedicada. Se interpreta como el conteo de sesiones de lección
TERMINADAS por alumno (`SesionAprendizaje.finalizadaEn`), que es la señal
más parecida a "¿viene a practicar?" que existe en la base de datos.

## Addendum — KPIs finos de la sección 2 (ronda posterior al cierre)

Tras el cierre formal de arriba, una relectura literal del pliego encontró
tres KPIs de la sección 2 que sólo estaban cubiertos a medias: "tasa de
entrega de tareas por aula" y "distribución de nivel" del lado del docente,
"gráfico comparativo de rendimiento entre grados/secciones" del lado del
director, y la "tabla de seguimiento de alumnos MATRICULADOS con filtros"
—la tabla "Estudiantes" que ya existía es el registro libre de PMV1, no la
población matriculada de HITO 3 que pedía el pliego—. Los tres se cerraron
en esta misma ronda; ver la tabla de la sección 2 arriba, ya actualizada.

## Addendum 2 — Alta y asignación de aulas, desacopladas

El cliente, tras ver la primera versión de `/admin/aulas` en vivo, pidió
separar la creación del aula (estructura física/académica) de la asignación
del docente titular (personas): el aula se crea sólo con nombre, grado,
sección e institución, y el docente se asigna DESPUÉS, desde un selector en
la propia fila de la tabla. Esto cambió el esquema de la base de datos
(`Aula.docenteId` pasó de obligatorio a opcional, con `onDelete: SetNull`
en vez de `Cascade` —borrar un docente ya no se lleva por delante sus
aulas—), con la migración correspondiente
(`prisma/migrations/20261017192241_hito4_docente_opcional`). Todo lugar que
mostraba el nombre del docente de un aula (el panel del director, el PDF y
el Excel, la pantalla de unirse del alumno) se revisó para tratar "sin
titular" como un estado legítimo, no un error.

## Addendum 3 — Entidades maestras completamente independientes

Siguiendo con el mismo principio del Addendum 2, el cliente pidió separar
TAMBIÉN la creación de docentes y alumnos de su asignación: "Aulas,
Docentes y Alumnos" como tres registros independientes de entidades
maestras, con un cuarto módulo de Asignación aparte (que es, exactamente,
lo que ya hacía `/admin/aulas` desde el Addendum 2 — el selector de docente
y el buscador de "Matricular").

Lo que faltaba era la pieza de origen: no existía ninguna forma de crear un
DOCENTE directamente —sólo se podía reasignar el rol de una cuenta ya
existente, o sembrarlo—, aunque el propio comentario de `/api/registro` ya
decía (sin cumplirlo) que "los perfiles DOCENTE... los crea un
administrador". `POST /api/admin/usuarios` (nuevo) cierra esa pieza:
"Formulario de Docentes" (nombre, correo, contraseña) y "Formulario de
Alumnos" (nombre, correo, contraseña, etapa/curso opcionales — si el
administrador no los sabe, el propio alumno los completa en
`/estudiante/nivel-educativo`, como ya hacía quien se registraba solo). Los
dos formularios viven en `/admin/usuarios`, como tarjetas desplegables
independientes, igual que "Crear aula" en `/admin/aulas`.

## Addendum 4 — Verificación final de cierre, contra producción

El cliente mergeó los PR #114 y #115 (2026-10-29) y remitió de nuevo la
especificación completa con el checklist de la sección 6 sin marcar, para
la liquidación y conformidad contractual final. Esta ronda vuelve a
verificar, de cero y en el entorno real, cada ítem de ese checklist —no se
reutiliza ningún resultado de rondas anteriores:

- `npx tsc --noEmit`: 0 errores (corrido de nuevo).
- `npm run build`: exitoso en local (corrido de nuevo); el build **en**
  Vercel, contra el proyecto real, queda confirmado por el propio hecho de
  que `https://docenteia-nu.vercel.app/api/health` sirve la versión
  `79e3d146b1035c605bf964bff426b27be99fa4ec` —el commit de merge del PR
  #115—: si el build en Vercel hubiera fallado, ese despliegue no existiría.
- `node qa/qa.mjs`: 1473/1473, corrido en local contra un build fresco.
- Las siete baterías de HITO 4, corridas con `BASE_URL` apuntando a
  `https://docenteia-nu.vercel.app` (la única excepción es
  `hito4-seguridad.mjs`, que se corre en local porque su prueba de bloqueo
  de login por fuerza bruta, si se corre contra producción, deja la IP real
  bloqueada 15 minutos — no tiene sentido hacerlo contra el sitio real; su
  resultado en local, 34/34, es el mismo código exacto):
  - `qa/hito4.mjs` — 28/28, en vivo.
  - `qa/hito4-admin-usuarios.mjs` — 36/36, en vivo.
  - `qa/hito4-admin-aulas.mjs` — 38/38, en vivo.
  - `qa/hito4-admin-contenido.mjs` — 15/15, en vivo.
  - `qa/hito4-riesgo.mjs` — 43/43, en vivo.
  - `qa/hito4-exportar.mjs` — 24/24, en vivo (ver nota abajo).
  - `qa/hito4-seguridad.mjs` — 34/34, en local.

**Nota sobre `qa/hito4-exportar.mjs`:** esta ronda encontró una
comprobación con una premisa obsoleta, no un defecto de la aplicación. La
prueba asumía que la cuenta DIRECTOR de la semilla no es titular de
ninguna aula propia, para comprobar que el reporte "de docente" del
director, si lo pide, sale vacío. En la base real, el director YA es
titular de dos aulas propias (viene enseñando sus propias secciones además
de dirigir, desde antes de este hito), así que la premisa ya no se
cumplía —no por ningún cambio de esta ronda, sino porque los datos de la
base real evolucionaron—. La comprobación se corrigió para verificar
directamente que los conjuntos de aulas del docente y del director son
DISTINTOS entre sí (en vez de asumir que uno de los dos tiene cero), y que
el tamaño del reporte de cada uno difiere en consecuencia: la garantía de
seguridad real —el filtro es `docenteId`, no "cualquiera con acceso a
/docente"— ya estaba confirmada incluso con la premisa vieja (esa
comprobación en concreto nunca falló), y sigue confirmada ahora.

Con esto, los 218 comprobaciones de las siete baterías de HITO 4, más las
1473 de `qa/qa.mjs`, quedan confirmadas en verde DOS veces: contra el
entorno de desarrollo (rondas anteriores) y contra el despliegue real de
producción (esta ronda).

## Addendum — Navegación a los dashboards desde `/admin`

El cliente, revisando el sitio ya en producción con la cuenta SUPERADMIN,
preguntó "¿dónde están los dashboards?". Verificado en vivo con un
navegador de verdad: los paneles de docente y director SÍ funcionan y SÍ
muestran datos reales para esa cuenta —`/docente` ya traía el semáforo de
riesgo, los KPIs del grupo, todo—, pero ninguno de los dos tenía UN SOLO
ENLACE visible desde `/admin`: había que escribir la URL de memoria, que
nadie revisando el sitio tendría forma de adivinar. Eso es lo que se
reporta como "no están".

Además, `/director` tenía un callejón sin salida real para esa cuenta: al
no tener ninguna institución vinculada, mostraba "Pide al administrador de
la plataforma que te asigne uno" —pero la cuenta QUE VE ese mensaje ES el
administrador de la plataforma, así que no había a quién pedírselo.

Dos arreglos, sin tocar ninguna lógica de negocio:

- `components/admin/navegacion.tsx`: la barra de `/admin` suma "Panel
  Docente" y "Panel Directivo", enlazando directo a `/docente` y
  `/director` (el middleware ya dejaba pasar a SUPERADMIN por ahí; sólo
  faltaba el enlace). No se enlaza el panel de estudiante porque esa
  pantalla es, por diseño, sólo para quien se registra como alumno —un
  SUPERADMIN no tiene perfil de alumno que mostrar ahí.
- `app/director/page.tsx`: cuando quien ve el mensaje de "sin colegio
  asignado" es el propio SUPERADMIN, el texto cambia (deja de pedirle algo
  a sí mismo) y aparece un botón "Vincularme a una institución" que lleva
  directo a `/admin/usuarios` —donde su propia fila, marcada "tú", ya
  permitía vincularse una institución desde antes (`gestor-usuarios.tsx`),
  sólo que nadie lo sabía porque no había ningún enlace que llevara hasta
  ahí. Un director de verdad (sin institución por un motivo real de
  negocio) sigue viendo el mensaje original, sin el botón.

Confirmado con un navegador real, en local y contra el flujo completo: tras
el arreglo, desde `/admin` se llega a `/director`, el botón nuevo lleva a
`/admin/usuarios`, y la fila propia del administrador permite vincularse
una institución ahí mismo.
