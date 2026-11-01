# Evaluación de los cursos: modalidad formativa y sumativa

Vigente desde la migración 0018 (Jornada autónoma, 01/11/2026). **Implementado y probado en local y en CI; no aplicado en ninguna base real.**

## Las dos modalidades

| | Evaluación final con puntaje (sumativa) | Evaluación formativa |
| --- | --- | --- |
| Para qué | Comprobar lo aprendido con un cuestionario corregido automáticamente | Acompañar el aprendizaje sin nota obligatoria |
| Requisitos de finalización | Todas las lecciones completadas + evaluación aprobada | Todas las lecciones completadas + lo que elija la maestra: actividades formativas respondidas y/o su validación docente |
| Nota | Puntaje 0–100 con mínimo (predeterminado **70 %**) | No se muestra nota. La base guarda el puntaje interno de cada envío solo para el seguimiento |
| Intentos | Limitados (predeterminado **2**) | Envíos sin límite |
| Lo que ve el alumno al enviar | Puntaje, mensaje y temas a reforzar | «Completas» o «faltan respuestas» y temas a repasar. Nunca qué opción es correcta |
| Certificado | Si aprueba | Si cumple los requisitos y el curso entrega certificado |

Los valores predeterminados (70 % y 2 intentos) rigen para las evaluaciones **nuevas**. Las existentes conservan los suyos: no se cambió nada hacia atrás.

## Conceptos que el sistema distingue

- **Actividad formativa**: cada pregunta de la pestaña Evaluación cuando el curso es formativo. No lleva nota.
- **Actividad completada**: un envío con todas las preguntas respondidas (`intentos_evaluacion.formativo = true`, `completo = true`).
- **Seguimiento del aprendizaje**: la pestaña **Alumnos** del curso muestra, por versión, quién lleva cuántas lecciones, envíos y validaciones.
- **Requisitos de finalización**: los que fija la versión. `estado_finalizacion_de()` es la única regla, y la usan el campus, el panel y la emisión del certificado.
- **Elegibilidad para certificado**: finalizado + el curso entrega certificado + al menos un criterio más allá de las lecciones.

## Reglas que impone la base de datos

- La sumativa no admite requisitos formativos (restricción `evaluacion_modalidad_coherente`).
- Una formativa con certificado y sin actividades ni validación **no se publica**: falta `criterios_certificacion`, así que el curso sigue en borrador hasta configurarlos. Abrir páginas, reproducir videos o marcar lecciones nunca alcanza para certificar.
- `corregir_evaluacion` se niega en versiones formativas (`modalidad_formativa`). `registrar_actividad_formativa` se niega en versiones sumativas.
- Un envío formativo nunca figura como aprobado (`intento_formativo_no_aprueba`) y nunca cuenta como aprobación sumativa.
- Validación docente:
  - `validar_finalizacion` es solo para la admin, con nota obligatoria (≥10 caracteres), una por persona y versión, y queda auditada.
  - `anular_validacion` exige motivo y no procede si ya se emitió el certificado de esa versión.
- Versiones:
  - Modalidad, requisitos, puntaje e intentos quedan fijados en cada versión publicada.
  - Una versión formativa nunca es «equivalente» a una sumativa, así que las aprobaciones no se trasladan.
  - Las versiones, intentos y certificados anteriores no se modifican.
- Los certificados guardan su modalidad. Los formativos pueden no tener intento asociado (los emitidos solo por validación docente).

## Defecto corregido en esta entrega

Antes, el alumno podía leer por la API la columna `respuestas_intento.correcta` de sus propios intentos. Eso permitía deducir qué pregunta había fallado, contra el criterio de informar solo «temas a reforzar». La columna dejó de ser legible para los clientes.

## Interfaz

- **Panel › Evaluación** muestra:
  - la forma de evaluar, con sus requisitos;
  - un aviso si falta un criterio para certificar;
  - «Qué cambia» frente a la versión vigente;
  - la vista previa de lo que verá el alumno.
- **Panel › Alumnos**: alumnos por versión, estado de finalización, lo que les falta, y la validación docente con nota (o su anulación).
- **Campus** muestra:
  - en la página del curso, la tarjeta «Para terminar el curso» y la tarjeta «Actividades formativas»;
  - un certificado que explica todo lo que falta;
  - la página `/campus/cursos/[slug]/actividades`;
  - en el cambio de versión, el aviso de que cambia la forma de evaluar.

## Pruebas

- **SQL** (`tests/db/99c_modalidad_evaluacion.sql`):
  - valores predeterminados, coherencia, publicación bloqueada sin criterios;
  - actividades incompletas y completas, y que visitar una lección no la completa;
  - validación con permisos, repetida, anulada y no anulable tras el certificado;
  - curso sin certificado, versiones históricas y no equivalencia;
  - estado propio frente a ajeno y la columna «correcta» protegida.
- **Unitarias**: `tests/unit/evaluacion.test.ts`.
- **E2E en CI** (`scripts/recorrido-evaluaciones.mjs`), con la admin y una segunda alumna reales: configuración, publicación bloqueada, actividades, validación, certificado, consecuencias, solicitudes reenviadas por la alumna y sin sesión, llamadas directas a la API, celular.
- **Reversión**: `supabase/rollback/20261101000018_modalidad_evaluacion_down.sql`, ensayada en `tests/db/reversion_posteriores.sh`. Se niega si ya hay datos formativos.

## Pendiente (no se inventó)

- Rúbricas, consignas o actividades pedagógicas concretas: las define la maestra.
- Actividades abiertas (texto o archivos) corregidas por la maestra: no implementadas. Hoy las actividades formativas son preguntas de opción.
