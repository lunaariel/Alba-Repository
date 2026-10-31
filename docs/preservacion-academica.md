# Reglas de preservación del historial académico

Vigentes desde la Fase 5, entrega 2 (migración 0013), y ampliadas con el **versionado académico** (migración 0014, 31/10/2026). Se aplican en la base de datos: ni el panel ni un script pueden saltearlas.

**Principio:** lo que un alumno ya hizo (avance, intentos, puntajes, certificados, compras) nunca se borra ni se recalcula hacia atrás cuando la administradora edita un curso. Lo que tiene historial se **retira**, no se elimina.

## Versiones del programa

- Lo que la administradora edita en Temario y Evaluación es el **borrador**. Publicar crea una **versión** numerada (1, 2, 3…) que guarda qué lecciones, en qué orden, qué materiales, qué preguntas y qué criterios (puntaje mínimo e intentos) forman el programa.
- Una versión publicada **no se modifica nunca**: ni sus listas ni sus preguntas ni sus opciones ni sus respuestas correctas. Tampoco se puede eliminar una lección, un módulo o un material que forme parte de alguna versión.
- Cada acceso a un curso queda asociado a una versión. Quien compra recibe la versión vigente en ese momento. **Publicar una versión nueva no cambia a nadie de versión.**
- Cada alumno ve, avanza y rinde **su** versión: sus lecciones, sus materiales, sus preguntas y sus criterios. El sitio público muestra la versión vigente.
- Los intentos y los certificados guardan la versión con la que se hicieron. El certificado y su verificación pública indican «Programa: versión N».
- Los **objetivos y requisitos** del curso quedan fijados en cada versión (migración 0015). El sitio muestra los de la versión vigente; los editados en el panel rigen desde la próxima versión.
- El precio solo afecta compras futuras. Resumen, descripción comercial y título del curso no forman parte del programa académico.
- Al migrar (0014), cada curso publicado, archivado o con accesos recibió su versión 1 con el contenido vigente en ese momento, y todos los accesos, intentos y certificados quedaron asociados a ella. Ver «Migración y reconciliación».

## Cambios menores, cambios sustanciales y bloqueos (decisión de la titular, 30/10/2026)

Una lección o un módulo que forma parte de una versión publicada **no se edita directamente**: la base de datos lo rechaza (`leccion_publicada`, `modulo_publicado`). Hay tres caminos, y cada uno queda registrado:

| Tipo | Ejemplos | Cómo se hace | A quién afecta |
| --- | --- | --- | --- |
| **Corrección menor** | Ortografía, redacción que no cambia el sentido, formato, accesibilidad, enlace roto, el mismo video técnicamente mejorado, calidad de sonido o imagen | «Aplicar corrección menor» con tipo y motivo (`corregir_leccion_publicada`, `corregir_modulo_publicado`) | Todas las versiones, enseguida |
| **Cambio sustancial** | Otra clase, otro video pedagógicamente distinto, otro enfoque, lecciones nuevas o quitadas, objetivos, claves, puntaje mínimo, intentos, requisitos de certificación | En el borrador: «Crear lección de reemplazo» (`reemplazar_leccion`), editar y publicar una versión nueva | Alumnos nuevos; los anteriores conservan su versión y pueden cambiarse voluntariamente |
| **Bloqueo excepcional** | Contenido erróneo, dañino o con un problema legal o de seguridad | «Bloquear» con motivo y palabra escrita (`bloquear_contenido`) | Todas las versiones: deja de mostrarse y de contar como requisito |

Guardas objetivas de la base para una corrección menor: el video y la duración solo cambian declarando «video mejorado» o «calidad de sonido o imagen»; un texto solo cambia si conserva al menos la mitad de sus palabras (`similitud_texto`); agregar o borrar una descripción completa no es menor. La declaración del tipo y el motivo no se puede omitir. Las preguntas publicadas no admiten correcciones: guardarlas crea una pregunta nueva en el borrador; para claves equivocadas en intentos ya hechos existe la revisión favorable.

## Materiales PDF: complementarios o parte del programa

Al subir un PDF hay que elegir el tipo; el sistema no asume ninguno.
- **Complementario** (lectura opcional): no cambia el programa, el avance, los requisitos ni los certificados. La administradora elige a qué versiones publicadas se suma (`asociar_complemento`) y los alumnos de esas versiones lo ven enseguida, marcado como «complementario, opcional». Al publicar una versión nueva, los complementos de la vigente siguen asociados para las lecciones que continúan. Cada cambio de asociación queda registrado.
- **Parte del programa**: entra en el borrador y llega a los alumnos con la próxima versión. Quienes siguen versiones anteriores conservan su programa.
- El tipo de un material ya usado no se puede cambiar (`material_tipo_fijo`): sería un cambio silencioso de requisitos.

## Cambio voluntario de versión

- **Nunca es automático.** El alumno ve que hay una versión más reciente y puede seguir con la suya indefinidamente.
- Antes de cambiar ve qué lecciones nuevas tendrá que completar, cuáles salen del programa, cuántas completadas conserva, si la evaluación es la misma o cambió y si cambian el puntaje mínimo o los intentos. Confirma marcando una casilla explícita.
- Solo se puede pasar a la versión vigente, y solo hacia adelante. No se puede volver atrás por el flujo ordinario, y se le informa antes de confirmar.
- El servidor verifica que el destino sea exactamente la versión que se le mostró; un destino distinto, inexistente o anterior, una solicitud sin la casilla de confirmación o sin sesión no cambian nada (probado reenviando solicitudes manipuladas en CI).
- Se conservan siempre: lecciones completadas, intentos, resultados y certificados anteriores. Nada se borra. Las lecciones que siguen en la versión nueva cuentan como completadas.
- Una aprobación **se reconoce** en la versión nueva solo si la evaluación es equivalente (mismas preguntas y mismo puntaje mínimo). Si los requisitos cambiaron, hay que aprobar la nueva.
- Los certificados de versiones anteriores siguen válidos y siguen indicando su versión. El certificado de la versión nueva es otro, con otro código.
- Se registra quién cambió, de qué versión a cuál, cuándo y con qué texto de confirmación (tabla `cambios_version` y registro de actividad). Un cambio posterior no reescribe ese registro.

## Revisión favorable de una evaluación

Para corregir una clave equivocada en una pregunta ya publicada:
1. **Calcular** (no cambia nada): la administradora elige la versión, la respuesta que también se aceptará y escribe el motivo. Ve el error corregido, qué alumnos e intentos mejoran, con su puntaje antes y después, y si pasan a aprobado.
2. **Aplicar** (acción distinta): escribe `CORREGIR` y la cantidad de intentos que mejoran.

Reglas: solo **suma** respuestas aceptadas (nunca quita la correcta original), por lo tanto nunca baja un puntaje ni revoca un certificado. El puntaje y el resultado originales de cada intento se conservan; el corregido se guarda aparte (`puntaje_revisado`, `aprobado_revisado`) con el detalle en `ajustes_intento`. Se registran responsable, fecha, motivo y alcance. Aplicar dos veces no hace nada más (idempotente). La clave corregida vale también para los intentos futuros de esa versión. Un alumno que pasa a aprobado puede pedir su certificado.

## Bloqueo excepcional

Para contenido erróneo o dañino que no puede seguir visible ni en versiones anteriores. Afecta a todas las versiones: la lección, el material o la pregunta deja de mostrarse y deja de contar como requisito. Exige motivo (al menos 10 caracteres) y confirmación escrita; queda registrado y se puede deshacer. No toca avances, intentos ni certificados.

## Tabla de cambios

| Cambio | Sin versiones (curso nunca publicado) | Con versiones publicadas |
| --- | --- | --- |
| Editar títulos, textos, duración, video de lecciones y módulos | Libre | Solo correcciones menores declaradas (se ven en todas las versiones); lo sustancial, por lección de reemplazo y versión nueva |
| Agregar un PDF | Libre | Complementario: se asocia a las versiones elegidas. Del programa: borrador y versión nueva |
| Cambiar objetivos o requisitos del curso | Libre | En el borrador; rigen desde la próxima versión |
| Cambiar el precio | Libre | Libre. Solo compras futuras; cada orden guarda su precio |
| Agregar o retirar lecciones, módulos o materiales; reordenar | Libre | Solo en el borrador. Rige desde la próxima versión publicada |
| Eliminar una lección, un módulo o un material | Libre | **Bloqueado** si está en alguna versión o si alguien la vio. Se retira del borrador (el archivo del material se conserva) |
| Editar una pregunta o sus opciones | Libre | La pregunta publicada no se toca: al guardar se crea una pregunta nueva para el borrador |
| Cambiar la respuesta correcta | Libre | Solo en el borrador (pregunta nueva). Para intentos ya hechos, revisión favorable |
| Cambiar puntaje mínimo o intentos | Libre | Solo en el borrador; cada versión conserva los suyos |
| Eliminar una pregunta | Libre | **Bloqueado** si está en una versión o fue respondida. Se retira del borrador |
| Retirar la última lección o pregunta vigente del borrador de un curso publicado | — | **Bloqueado** |
| Volver un curso publicado a borrador | Libre | **Bloqueado** si tiene accesos. Se puede archivar |
| Archivar | Libre | Libre. Quien tiene acceso lo conserva, en su versión |
| Eliminar un curso | Solo si nunca tuvo accesos, órdenes ni certificados | **Bloqueado**. Se archiva |

Además:
- Los certificados guardan, al emitirse, el nombre del alumno, el título del curso y la versión. Editar el curso no los modifica.
- Cada publicación de versión, retiro, restauración, eliminación, revisión favorable, bloqueo y cambio de versión de un alumno queda en el registro de actividad.

## Talleres: reprogramaciones, cortesías y grabaciones (migración 0017)

- Una reprogramación nunca cambia en silencio un estado comercial: la inscripción sigue confirmada, con su lugar, y queda «pendiente de respuesta» hasta que la persona decide. Cada respuesta queda en `respuestas_reprogramacion` (una por inscripción y reprogramación) con las fechas anterior y nueva y el texto confirmado.
- Las cortesías históricas no se modifican: alumno, taller, fecha, origen, motivo y estado están protegidos por disparador (`cortesia_historica`). No se crean nuevas.
- Los accesos a grabaciones guardan las condiciones con que se otorgaron; cambiarlas después o dejar de vender la grabación no modifica accesos existentes. Al vencer, el acceso deja de valer, pero no se borra ningún archivo ni registro.
- Nada de esto toca avances, evaluaciones, certificados ni versiones de cursos.

## Migraciones 0014 a 0017 — solo en entornos de prueba

**Ninguna se aplicó a una base real ni a producción** y no está autorizado hacerlo. Antes de una ejecución real se presentará: identificación exacta del entorno, respaldo verificable, plan de ejecución, impacto esperado, procedimiento de recuperación, pruebas posteriores y riesgos de reversión, y se pedirá autorización específica.

Reversión: en orden inverso (0017, 0016, 0015, 0014), con `supabase/rollback/*_down.sql`. Cada script se niega (`reversion_imposible`) si ya existen datos que solo tienen sentido con esa migración (por ejemplo, complementos asociados, correcciones menores, incidencias, notificaciones, respuestas a reprogramaciones o grabaciones que avanzaron de «prevista»). La reversión de 0015 y 0016 sobre datos previos se ensaya en `tests/db/reversion_0015_0016.sh` (datos idénticos, se reaplican, y se niega cuando perdería información). La 0015 completa las columnas nuevas de objetivos y requisitos de las versiones existentes con los valores vigentes al migrar; es el único ajuste a versiones ya publicadas.

## Migración y reconciliación (0014)

- Antes de cambiar datos, la migración copia accesos, avances, intentos, respuestas y certificados al esquema `respaldo_0014` y guarda las lecciones pendientes de cada alumno.
- `select public.conciliar_versionado();` compara antes y después: cantidades iguales y todos los contadores de alteraciones, accesos sin versión y pendientes distintos en cero. Se ejecuta en el ensayo automático (`tests/db/migracion_0014.sh`).
- **Recuperación:** `supabase/rollback/20261031000014_versionado_down.sql` deja la base como estaba en 0013, con los datos idénticos (probado). **Solo es posible mientras no se haya publicado una versión 2, ni haya cambios de versión, revisiones aplicadas o certificados de más de una versión del mismo curso**: en ese caso el script se niega (`reversion_imposible`), porque volver atrás perdería información. A partir de ese momento la recuperación es restaurar el respaldo de la base tomado antes de migrar.
