# Talleres en vivo: estado de las decisiones aprobadas

Migraciones 0016, 0017 y 0021. **Todo implementado y probado en local y en CI; nada conectado a servicios reales ni aplicado en producción.**

| Decisión aprobada | Estado | Dónde se garantiza |
| --- | --- | --- |
| Duración configurable | Implementado | Formulario del taller (fecha, hora y duración en la zona del taller) |
| Cupos configurables o sin límite | Implementado | `talleres.cupo`; control con bloqueo (`ocupados_taller`) y prueba de concurrencia |
| Plazo de cancelación configurable por taller | **Implementado en esta jornada (0021)** | `talleres.cancelacion_horas`, 24 h por defecto. Cada inscripción copia el plazo al inscribirse (`plazo_inmutable`), así que un cambio vale solo para inscripciones nuevas |
| Zoom o Google Meet seleccionable | Implementado (selección) | `talleres.plataforma`. El enlace se carga a mano: la creación automática de reuniones es Fase 6 |
| Enlace visible solo para inscripciones confirmadas | Implementado | `enlace_taller()`. El enlace de anfitrión no es legible por clientes |
| Reprogramación pendiente hasta aceptación expresa | Implementado | `responder_reprogramacion`. Nunca se acepta ni se cancela sola, y el lugar no se libera |
| Historial de respuestas | Implementado | `respuestas_reprogramacion` y registro de actividad |
| Reembolsos sin cálculo automático | Implementado | El pedido de reembolso crea una incidencia; la orden no se toca |
| Inscripciones gratuitas seguras | Implementado | `inscribirme_gratis`, sin duplicados, con cupo bajo bloqueo |
| Cortesías históricas conservadas, sin cortesías nuevas | Implementado | `proteger_cortesias`. `inscribir_cortesia` no se puede ejecutar |
| Avisos internos | Implementado | `notificaciones` con «leída» en el campus. Ningún correo sale (Fase 6) |
| Grabaciones con estados y revisión administrativa | Implementado (solo modelo) | `grabaciones_taller`, revisión con cuatro comprobaciones; nunca se publica el original |
| Acceso a grabaciones con vencimiento configurable | Implementado | Condiciones por grabación, copiadas en cada acceso |
| Talleres pagos sin cancelación ordinaria | Implementado | `cancelar_mi_inscripcion` devuelve `inscripcion_paga`; el campus indica escribir a la academia |

## Pruebas

- **SQL**: `40_talleres`, `99_talleres_gestion`, `99b_adaptacion_talleres` y `99f_plazo_cancelacion`. Este último cubre el plazo predeterminado, la copia del plazo en la inscripción, que un cambio no sea retroactivo, que la copia del taller herede el plazo, el rango permitido y la auditoría.
- **Concurrencia**: último cupo, gratuito con 5 personas a la vez, recordatorios en paralelo, respuestas simultáneas.
- **Reversión**: `tests/db/reversion_posteriores.sh`, de 0015 a 0021.
- **E2E**: `scripts/recorrido-talleres.mjs`, que incluye la configuración del plazo, y `scripts/acciones-sensibles.mjs` con una segunda alumna real.

## Pendiente (Fase 6 o decisión de la maestra)

- Política de reembolsos, que habilitaría la cancelación de talleres pagos.
- Plan de Google Workspace; creación automática de Meet; grabación y recuperación automáticas; asistencia automática.
- Envío real de correos y recordatorios.
