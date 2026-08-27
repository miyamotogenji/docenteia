-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ESTUDIANTE', 'DOCENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "NivelAcademico" AS ENUM ('BASICO', 'INTERMEDIO', 'AVANZADO');

-- CreateEnum
CREATE TYPE "Tema" AS ENUM ('ECUACIONES_LINEALES', 'DERIVADAS', 'FACTORIZACION', 'FRACCIONES', 'ARITMETICA');

-- CreateEnum
CREATE TYPE "Intencion" AS ENUM ('RESOLVER', 'APRENDER', 'EXPLICAR', 'PRACTICAR');

-- CreateEnum
CREATE TYPE "OrigenContenido" AS ENUM ('DETERMINISTA', 'IA');

-- CreateEnum
CREATE TYPE "MotivoCambioNivel" AS ENUM ('DIAGNOSTICO_INICIAL', 'AJUSTE_AUTOMATICO', 'AJUSTE_DOCENTE');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'ESTUDIANTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfiles_estudiante" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ciclo" TEXT,
    "grado" TEXT,
    "institucion" TEXT,
    "nivelActual" "NivelAcademico",
    "nivelAsignadoEn" TIMESTAMP(3),
    "metadatos" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfiles_estudiante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materias" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "materias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_materias" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "materiaId" TEXT NOT NULL,
    "nivel" "NivelAcademico",
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_materias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_nivel" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "nivelAnterior" "NivelAcademico",
    "nivelNuevo" "NivelAcademico" NOT NULL,
    "motivo" "MotivoCambioNivel" NOT NULL,
    "ajustadoPorId" TEXT,
    "detalle" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_nivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodos_conocimiento" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "tema" "Tema" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "nivel" "NivelAcademico",
    "orden" INTEGER NOT NULL DEFAULT 0,
    "padreId" TEXT,

    CONSTRAINT "nodos_conocimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejercicios" (
    "id" TEXT NOT NULL,
    "nodoId" TEXT,
    "tema" "Tema" NOT NULL,
    "nivel" "NivelAcademico" NOT NULL,
    "enunciado" TEXT NOT NULL,
    "respuestaCorrecta" TEXT NOT NULL,
    "pasos" JSONB NOT NULL DEFAULT '[]',
    "origen" "OrigenContenido" NOT NULL DEFAULT 'DETERMINISTA',
    "validado" BOOLEAN NOT NULL DEFAULT false,
    "metadatos" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ejercicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones_aprendizaje" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "tema" "Tema",
    "intencion" "Intencion",
    "nivelEnSesion" "NivelAcademico",
    "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEn" TIMESTAMP(3),
    "metadatos" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "sesiones_aprendizaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_progreso" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "sesionId" TEXT,
    "nodoId" TEXT,
    "ejercicioId" TEXT,
    "tema" "Tema" NOT NULL,
    "acierto" BOOLEAN NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "tiempoRespuestaMs" INTEGER,
    "respuestaDada" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_progreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_error" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "nodoId" TEXT,
    "tema" "Tema" NOT NULL,
    "tipoError" TEXT NOT NULL,
    "detalle" TEXT,
    "ocurrencias" INTEGER NOT NULL DEFAULT 1,
    "primeraVez" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVez" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registros_error_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preguntas_diagnostico" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "tema" "Tema" NOT NULL,
    "enunciado" TEXT NOT NULL,
    "opciones" JSONB NOT NULL,
    "respuestaCorrecta" TEXT NOT NULL,
    "expresion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preguntas_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intentos_diagnostico" (
    "id" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "aciertos" INTEGER NOT NULL DEFAULT 0,
    "totalPreguntas" INTEGER NOT NULL DEFAULT 5,
    "nivelResultante" "NivelAcademico",
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),

    CONSTRAINT "intentos_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuestas_diagnostico" (
    "id" TEXT NOT NULL,
    "intentoId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "respuestaDada" TEXT NOT NULL,
    "correcta" BOOLEAN NOT NULL,
    "tiempoMs" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuestas_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_rol_idx" ON "usuarios"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_estudiante_usuarioId_key" ON "perfiles_estudiante"("usuarioId");

-- CreateIndex
CREATE INDEX "perfiles_estudiante_nivelActual_idx" ON "perfiles_estudiante"("nivelActual");

-- CreateIndex
CREATE UNIQUE INDEX "materias_codigo_key" ON "materias"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_materias_perfilId_materiaId_key" ON "perfil_materias"("perfilId", "materiaId");

-- CreateIndex
CREATE INDEX "historial_nivel_perfilId_creadoEn_idx" ON "historial_nivel"("perfilId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "nodos_conocimiento_clave_key" ON "nodos_conocimiento"("clave");

-- CreateIndex
CREATE INDEX "nodos_conocimiento_tema_nivel_idx" ON "nodos_conocimiento"("tema", "nivel");

-- CreateIndex
CREATE INDEX "ejercicios_tema_nivel_validado_idx" ON "ejercicios"("tema", "nivel", "validado");

-- CreateIndex
CREATE INDEX "sesiones_aprendizaje_perfilId_iniciadaEn_idx" ON "sesiones_aprendizaje"("perfilId", "iniciadaEn");

-- CreateIndex
CREATE INDEX "registros_progreso_perfilId_tema_creadoEn_idx" ON "registros_progreso"("perfilId", "tema", "creadoEn");

-- CreateIndex
CREATE INDEX "registros_error_perfilId_ocurrencias_idx" ON "registros_error"("perfilId", "ocurrencias");

-- CreateIndex
CREATE UNIQUE INDEX "registros_error_perfilId_tema_tipoError_key" ON "registros_error"("perfilId", "tema", "tipoError");

-- CreateIndex
CREATE UNIQUE INDEX "preguntas_diagnostico_clave_key" ON "preguntas_diagnostico"("clave");

-- CreateIndex
CREATE INDEX "preguntas_diagnostico_activa_orden_idx" ON "preguntas_diagnostico"("activa", "orden");

-- CreateIndex
CREATE INDEX "preguntas_diagnostico_tema_idx" ON "preguntas_diagnostico"("tema");

-- CreateIndex
CREATE INDEX "intentos_diagnostico_perfilId_iniciadoEn_idx" ON "intentos_diagnostico"("perfilId", "iniciadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "respuestas_diagnostico_intentoId_preguntaId_key" ON "respuestas_diagnostico"("intentoId", "preguntaId");

-- AddForeignKey
ALTER TABLE "perfiles_estudiante" ADD CONSTRAINT "perfiles_estudiante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_materias" ADD CONSTRAINT "perfil_materias_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_materias" ADD CONSTRAINT "perfil_materias_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "materias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_nivel" ADD CONSTRAINT "historial_nivel_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_nivel" ADD CONSTRAINT "historial_nivel_ajustadoPorId_fkey" FOREIGN KEY ("ajustadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodos_conocimiento" ADD CONSTRAINT "nodos_conocimiento_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicios" ADD CONSTRAINT "ejercicios_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_aprendizaje" ADD CONSTRAINT "sesiones_aprendizaje_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_progreso" ADD CONSTRAINT "registros_progreso_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_progreso" ADD CONSTRAINT "registros_progreso_sesionId_fkey" FOREIGN KEY ("sesionId") REFERENCES "sesiones_aprendizaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_progreso" ADD CONSTRAINT "registros_progreso_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_progreso" ADD CONSTRAINT "registros_progreso_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "ejercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_error" ADD CONSTRAINT "registros_error_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_error" ADD CONSTRAINT "registros_error_nodoId_fkey" FOREIGN KEY ("nodoId") REFERENCES "nodos_conocimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intentos_diagnostico" ADD CONSTRAINT "intentos_diagnostico_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "perfiles_estudiante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_diagnostico" ADD CONSTRAINT "respuestas_diagnostico_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "intentos_diagnostico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuestas_diagnostico" ADD CONSTRAINT "respuestas_diagnostico_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "preguntas_diagnostico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

