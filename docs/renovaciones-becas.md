# Renovaciones de cursos vencidos y becas: modelo propuesto

Fecha: 01/11/2026. **Propuesta para aprobar; no está implementada.**

Parte de las decisiones ya tomadas por la titular:

- una nueva compra abre un período nuevo y no borra historia;
- la versión académica no cambia;
- las becas tienen duración configurable;
- no hay sistema paralelo.

## 1. Idea central: un acceso, varios períodos

Hoy `accesos_curso` mezcla dos cosas:

- el **vínculo académico** de la persona con el curso: versión, progreso, intentos y certificado;
- el **derecho a entrar**: inicio, vencimiento y origen.

El índice único `accesos_unico_activo` permite una sola fila activa por persona y curso. Por eso la recompra choca (D1 a D3 de la auditoría).

**El modelo propuesto separa las dos cosas:**

- **`accesos_curso` sigue siendo el ancla académica.** Una fila por persona y curso, con `version_id`, progreso, intentos y certificados que cuelgan de ella. La recompra no la duplica ni la reinicia.
- **Nueva tabla `periodos_acceso`.** Cada período es un derecho a entrar durante un intervalo, con su propio origen. Columnas:
  - `id`, `acceso_id`;
  - `origen`: `compra`, `beca`, `cortesia` o `historico`;
  - `item_orden_id` (compras);
  - `inicia_en`, `vence_en` (nulo solo si se autorizó «sin vencimiento»);
  - `condiciones` (jsonb congelado: duración comercial, meses adicionales, total, regla);
  - `precio_pagado` y `moneda` (compras);
  - `version_id` vigente al abrirlo (referencia, no la cambia);
  - `motivo`, `responsable`;
  - `estado`: `vigente`, `revocado` o `anulado`;
  - `revocado_en`, `revocado_motivo`;
  - `creado_en`.
  - Inmutable salvo `estado` y los campos de revocación, con el mismo patrón de disparadores del resto del sistema.
- **`accesos_curso.vence_en` pasa a ser un valor derivado:** el fin del último período vigente, o nulo si hay uno sin vencimiento. Lo recalcula una única función controlada (`recalcular_vencimiento_acceso`), que usa `albor.ajuste_vencimiento`. Así `tiene_acceso`, `version_de` y las políticas actuales siguen funcionando sin cambios.
- **Migración de datos:** cada acceso existente recibe un período `historico` con sus mismos `inicia_en`, `vence_en` y `condiciones`. No cambia ninguna fecha. Las cortesías y accesos anteriores conservan sus condiciones originales (sin vencimiento).

## 2. Renovación (nueva compra de un curso vencido)

| Paso | Regla |
| --- | --- |
| Crear la orden | `crear_orden` permite comprar si **no hay período vigente** (acceso vencido o inexistente). Si hay uno vigente, sigue respondiendo `ya_tiene_acceso` |
| Orden pendiente desactualizada | Si cambiaron el precio o las condiciones del curso, la orden pendiente se **anula** y se crea una nueva con los valores vigentes. Las órdenes pendientes vencen a las 24 h. Corrige D2 |
| Ítem de la orden | Congela, como hoy: precio, condiciones aceptadas (duración comercial vigente + 5 meses), curso y versión de referencia |
| Pago confirmado | `procesar_evento_pago` crea el período: inicio = fecha de confirmación; vencimiento = `calcular_vencimiento(inicio, total_meses)`. Si no existe la fila de acceso, la crea (primera compra) |
| Carrera: ya había un período vigente al confirmar el pago | No se pierde el pago (corrige D1). El período nuevo **se encadena** al final del vigente y se abre una incidencia para que la admin decida (mantener o reembolsar). No hay dos accesos contradictorios: hay un solo acceso con dos períodos consecutivos |
| Reembolso o contracargo | Revoca **solo el período** de esa compra y recalcula el vencimiento (corrige D4). Lo académico queda intacto |
| Auditoría | Cada período creado, revocado o encadenado queda en `auditoria`, con la orden y el responsable |

**Qué no cambia con la renovación:**

- **Versión académica:** la misma. Para pasar a la vigente se usa el cambio voluntario existente (vista previa, confirmación y auditoría).
- **Lecciones completadas, intentos y resultados:** se conservan. Al volver, la alumna sigue donde estaba.
- **Intentos de evaluación:** **no se reinician**. Si agotó los intentos, la renovación no da intentos nuevos. Hoy tampoco existe una función para que la admin habilite un intento adicional. Que una renovación (o la admin) dé intentos nuevos sería una regla académica nueva: **no se implementa sin decisión**.
- **Certificados:** uno por versión, idempotente. Renovar no emite otro. Si cambia de versión y aprueba la nueva, recibe el certificado de esa versión, como hoy. Una aprobación no se traslada a una evaluación sustancialmente distinta: el cambio de versión ya lo controla.
- **Compras anteriores:** cada una conserva su orden, su ítem, sus condiciones y su período.

**Interfaz prevista (Fase 6, etapa 6):**

- en «Mis cursos», un curso vencido muestra «Renovar acceso», con el precio vigente y el nuevo vencimiento calculado antes de pagar;
- el panel de alumnos muestra la línea de períodos de cada acceso.

## 3. Becas y accesos gratuitos

Usan **la misma tabla de períodos**: no hay sistema paralelo.

| Regla | Implementación propuesta |
| --- | --- |
| Solo la admin las otorga | Función `otorgar_beca(p_perfil, p_curso, p_motivo, p_inicio, p_fin, p_sin_vencimiento, p_responsable)`. Solo la ejecuta una sesión admin con nivel `aal2` cuando el MFA esté activo. Reemplaza el uso directo de `conceder_acceso` y corrige D3 |
| Duración configurable | Inicio y fin elegidos por la admin. **No** se aplica la fórmula comercial (+5 meses) |
| «Sin vencimiento» | Solo con una marca explícita y un motivo. Queda en la auditoría |
| Motivo y responsable | Obligatorios |
| Historia académica | No se toca: el período se agrega al acceso existente, o crea el acceso si no había |
| No es una compra | No crea orden, ni ítem, ni recibo, ni factura. Si en el futuro hiciera falta un comprobante de una operación sin pago, se decidirá con el contador |
| Fin de la beca | El contenido se protege como en cualquier vencimiento. **Los certificados se conservan** |
| Revocar una beca | Función admin con motivo; revoca solo ese período |
| Accesos gratuitos anteriores | Quedan como períodos `historico` sin vencimiento, con sus condiciones originales |
| Beca sobre un acceso con período vigente | Se encadena después del vigente, o la admin elige un inicio inmediato que se superpone. El vencimiento derivado es el más lejano; nunca hay ambigüedad |

## 4. Esfuerzo y riesgos

- **Esfuerzo:**
  - una migración: tabla, conciliación de datos y funciones;
  - ajustes en `crear_orden`, `procesar_evento_pago`, el reembolso y `conceder_acceso`;
  - la pantalla de becas en Alumnos;
  - pruebas de base y E2E.
  - Se estima en una jornada.
- **Riesgo principal:** que `accesos_curso.vence_en` y los períodos se desincronicen. Para evitarlo, solo una función los escribe y una prueba de conciliación compara el valor guardado con el calculado.
- **Lo que no se decide aquí:**
  - si una renovación da intentos nuevos (hoy no);
  - si hay precio de renovación distinto del precio de lista (hoy no, porque sería una política comercial nueva).
