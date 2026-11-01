# Renovaciones, becas y reembolsos por compra: períodos de acceso

Fecha: 01/11/2026. **Implementado en la migración 0024 y probado en local y en CI con pagos simulados.**

- El modelo está aprobado por la titular.
- No se aplicó en ninguna base real y no hay pasarela conectada.
- Las pruebas se detallan en `docs/pruebas-periodos.md`.

## 1. Modelo

| Parte | Tabla | Qué guarda |
| --- | --- | --- |
| **Inscripción académica** | `accesos_curso` (una activa por persona y curso) | Alumno, curso, versión académica. De ella dependen avances, intentos, resultados y certificados |
| **Períodos de acceso** | `periodos_acceso` (nueva) | Para cada período:<br>• origen: compra, beca o concesión;<br>• `item_orden_id` (compras);<br>• inicio y vencimiento (nulo solo si se otorgó «sin vencimiento»);<br>• condiciones congeladas;<br>• precio pagado;<br>• versión al otorgar;<br>• motivo, responsable y quién otorgó;<br>• estado (activo o revocado), con fecha, motivo y responsable de la revocación;<br>• marca de período histórico |

**Vencimiento del acceso.** `accesos_curso.vence_en` es el fin del último período activo, o nulo si alguno es sin vencimiento.

- Lo escribe una sola función (`recalcular_vencimiento_acceso`). Por eso `tiene_acceso`, `version_de`, RLS y el campus siguen funcionando sin cambios.
- Si no queda ningún período activo, la inscripción pasa a «revocada», como antes del cambio. Su historial se conserva y una compra o beca posterior la reactiva, con la misma versión.

**Único camino para dar derechos: `agregar_periodo`.**

- Serializa por persona y curso, con un bloqueo de transacción.
- Reutiliza la inscripción activa, o la última revocada. Solo crea una nueva si nunca existió.
- Registra el período en la auditoría.

**Inserciones directas.** Cualquier inserción directa en `accesos_curso` (datos de prueba o migraciones anteriores) recibe su período automáticamente.

**Inmutabilidad.** Un período solo pasa de activo a revocado, una vez y con motivo (`periodo_inmutable`).

**Conciliación.** `conciliar_periodos()` lista los accesos cuyo estado o vencimiento no coincide con sus períodos. Debe devolver cero filas. La migración se niega a terminar si no da cero.

## 2. Compra y renovación (D1, D2)

| Situación | Comportamiento |
| --- | --- |
| Acceso vigente | `crear_orden` responde `ya_tiene_acceso` |
| Acceso vencido o revocado | Se puede comprar de nuevo. `oferta_curso` muestra antes de confirmar:<br>• el precio vigente;<br>• la duración, los 5 meses adicionales y el total;<br>• el vencimiento que tendría si el pago se confirmara hoy. |
| Orden pendiente | Se reutiliza (doble clic, recarga) solo si sigue ofreciendo exactamente lo mismo. Vence, con registro y motivo, y se crea otra con la oferta vigente si:<br>• cambió el precio;<br>• cambiaron la duración o los meses adicionales;<br>• cambió el cupón;<br>• no tiene condiciones;<br>• pasaron 24 h. |
| Pago confirmado | Un período por ítem (índice único). Empieza al confirmarse el pago y dura lo que se aceptó. El mismo aviso dos veces → `duplicado`. Otro aviso del mismo pago → `ignorado: ya_aprobada`, sin duplicar nada |
| Pago tardío de una orden vieja | Respeta el precio y las condiciones aceptados. Un importe distinto del autorizado se rechaza (`monto_no_coincide`) |
| Pago con un período vigente (carrera) | El período nuevo **se encadena**: empieza cuando termina el vigente. No acorta ni duplica derechos. Queda la incidencia `compra_con_acceso_vigente` para que la admin decida si lo mantiene o lo reembolsa |
| Falla al otorgar | El pago queda registrado y la orden aprobada. No hay acceso a medias. Queda la incidencia `otorgamiento_fallido` con el error |
| Recuperación de la falla | Hay dos formas:<br>• un nuevo aviso de la pasarela reintenta solo;<br>• la admin pulsa «Reintentar otorgamiento» en Incidencias.<br>El reintento es idempotente. |

**Lo que la renovación no cambia:**

- la versión académica;
- los avances, intentos y resultados (no se reinician);
- los intentos de evaluación: no da intentos nuevos;
- los certificados: no emite otro;
- el vínculo con las compras anteriores.

## 3. Reembolsos (D4)

| Caso | Comportamiento |
| --- | --- |
| Reembolso total o contracargo confirmado por el proveedor | Revoca solo los períodos de esa orden. Otras compras, becas, avances, resultados y certificados no se tocan |
| Reembolso parcial confirmado | No revoca. Queda la incidencia `reembolso_parcial` |
| Período revocado con otro encadenado después | Queda la incidencia `revisar_periodos` |

Ningún reembolso se declara ejecutado sin la confirmación del proveedor.

## 4. Órdenes antiguas (D5)

- **Pendientes sin condiciones**, anteriores a 0019: la migración las clasifica. Vencen y queda una incidencia `orden_sin_condiciones` con su detalle. No se inventan condiciones.
- **Pago de una orden sin condiciones**: no da acceso, tampoco indefinido. Queda la incidencia `pago_sin_condiciones`.
- **Inserción directa** de un acceso de compra sin condiciones: la base la rechaza (`compra_sin_condiciones`).
- **Accesos ya otorgados con la regla `compra_sin_condiciones`**: conservan lo que se aceptó y no se modifican.

## 5. Becas y accesos gratuitos (D3)

- **Quién:** solo la admin (`otorgar_beca`, con `es_admin()`), desde *Cursos → Alumnos → Otorgar una beca*. La persona se busca por su correo con `buscar_perfil_por_correo`, que solo puede usar la admin.
- **Qué registra:** beneficiaria, curso, inicio, fin o «sin vencimiento», motivo (al menos 10 caracteres), responsable, admin que la otorgó, fecha y auditoría.
- **Inicio:**
  - vacío = ahora;
  - una fecha pasada se admite;
  - una fecha futura solo si continúa un acceso vigente sin dejar huecos. Si no, `inicio_futuro`, para evitar fechas ambiguas.
- **Fin o «sin vencimiento»:** uno de los dos, de forma expresa (`fin_o_sin_vencimiento`). Un fin pasado se rechaza. La fórmula comercial no se aplica.
- **Sin compra:** no crea orden, pago ni recibo.
- **Historia académica:** no se toca. Si la persona ya tuvo el curso, usa la misma inscripción y la misma versión.
- **Revocar:** con motivo (`revocar_beca`). Una compra no se revoca así: solo con un reembolso confirmado (`compra_solo_con_reembolso`). Al terminar o revocarse una beca, los certificados se conservan.
- **Concesiones anteriores:** conservan su regla (`concesion_sin_vencimiento`). `conceder_acceso` (servidor) ahora funciona también sobre un acceso vencido.

## 6. Campus y panel

- **Campus, curso vencido:**
  - certificados para descargar;
  - «Obtener mi certificado», para quien cumplió todo antes de vencer;
  - el bloque «Renovar el acceso», con precio, condiciones y vencimiento estimado. Con las ventas cerradas dice «Las compras abren pronto», sin botón de compra.
- **Panel, Alumnos del curso:**
  - los períodos de cada persona: origen, fechas, precio, estado, motivo y responsable;
  - el formulario de beca;
  - «Revocar» en becas y concesiones.
- **Panel, Incidencias:** los tipos nuevos y «Reintentar otorgamiento».
- **Panel, Ventas:** el enlace a Incidencias.

## 7. Pendiente (no implementado)

- Botón de compra o renovación con la pasarela real (Fase 6).
- Regla para reembolsos parciales y una herramienta de ajuste de fechas para la admin.
- Programar becas a futuro sin un acceso vigente.
- Intentos adicionales de evaluación: no hay regla académica.
- Aviso previo al vencimiento (requiere correo).
