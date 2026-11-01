# Presupuestos para el lanzamiento de cursos y comparación de pasarelas

Actualizado el 01/11/2026 con las decisiones de la titular:

- primero se lanzan **solo los cursos grabados**;
- los talleres van después;
- la pasarela no está elegida;
- **no se aprueba ningún gasto**.

**No se contrató ni se conectó nada.** Complementa `docs/investigacion-proveedores.md`.

**Convenciones:**

- **Tipo de cambio:** Q7.65 por USD.
- **Impuestos y recargos:** precios en USD, sin impuestos ni recargos bancarios por pagos en moneda extranjera. Se marcan aparte como posibles costos.
- **Confirmado:** leído en la página oficial del proveedor el 01/11/2026.
- **Estimado:** fuente secundaria, conocimiento previo o cálculo con supuestos. Hay que confirmarlo el día de contratar.
- **Supuesto de video:** 10 cursos de 4 h (unos 60 GB) y 100 alumnas que ven 4 h al mes (unos 280 GB). No es un dato real.

## 1. Presupuesto A: mínimo viable, solo cursos

| Rubro | Servicio | Plan | USD/mes | Q/mes | Tipo | Fuente |
| --- | --- | --- | --- | --- | --- | --- |
| Infraestructura | Vercel (sitio, campus, panel) | Pro, 1 usuario (el plan Hobby es solo para uso no comercial) | 20.00 | 153.00 | Fijo | Confirmado ([vercel.com](https://vercel.com/docs/plans/hobby)) |
| Base de datos y archivos | Supabase (Postgres con RLS, Auth, almacenamiento privado de PDF) | Pro (el plan Free pausa por inactividad y no tiene respaldos) | 25.00 | 191.25 | Fijo | Confirmado ([supabase.com/pricing](https://supabase.com/pricing)) |
| Seguridad | MFA TOTP de la admin | Incluido en Supabase Auth | 0 | 0 | — | Confirmado |
| Respaldos | Diarios del proveedor (7 días) + volcado externo semanal cifrado | Incluido + almacenamiento mínimo | 0 a 1 | 0 a 7.65 | Fijo | Estimado |
| Dominio | Registrador a elegir (el nombre todavía no está definido) | Anual | ≈ 1.25 | ≈ 9.56 | Fijo | Estimado: depende del dominio elegido |
| Correo | Resend (confirmaciones, recuperación de cuenta) | Gratis: 3,000 al mes y 100 al día | 0 | 0 | Fijo | Estimado: confirmar límites y términos |
| **Subtotal fijo** | | | **46.25 a 47.25** | **Q354 a Q361** | | |
| Video | Bunny Stream (lecciones privadas, URL firmada ya integrada) | Por uso | 3.40 a 13.20 | 26 a 101 | Variable por uso | Tarifa confirmada ([bunny.net](https://bunny.net/docs/stream/pricing)); uso estimado |
| **Total mensual estimado** | | | **49.65 a 60.45** | **Q380 a Q462** | | |

**Con este supuesto entra en Q500.** Lo que puede moverlo:

- un video visto mayormente desde Sudamérica: hasta unos Q101;
- un dominio caro;
- un certificador FEL (abajo).

**No incluye videoconferencia**: los talleres empiezan después. Al lanzarlos se suma una licencia de unos USD 14 al mes (Q107) o el equivalente de Zoom (sección 4).

## 2. Presupuesto B: recomendado, solo cursos

Lo mismo que A, con las mejoras de la tabla.

| Mejora sobre A | Servicio | USD/mes | Q/mes | Por qué |
| --- | --- | --- | --- | --- |
| Correo sin límite diario | Resend Pro (50,000 al mes) | +20.00 | +153.00 | Evita que un pico de avisos (por ejemplo, la apertura de un curso) supere los 100 diarios. Estimado |
| Alertas de errores | Sentry Team | +≈ 26 | +≈ 199 | Enterarse de un error del servidor o del navegador antes que las alumnas. Estimado: verificar precio y términos |
| Aviso de caída del sitio | Monitor de disponibilidad, plan gratuito | 0 | 0 | Estimado: verificar que el plan gratuito permita uso comercial |
| Respaldo externo con restauración mensual probada | Almacenamiento privado | +1 | +7.65 | Recuperación verificada, no solo copiada |
| Margen de video | Bunny Stream | hasta 20 | hasta 153 | Crecimiento de vistas |

**Total mensual estimado: USD 98.25 a 114.25 (Q752 a Q874).** Supera los Q500. Se recomienda llegar por etapas, a medida que haya ventas:

1. respaldo externo probado desde el lanzamiento;
2. alertas cuando haya ventas;
3. correo pago cuando se acerque a 100 por día.

## 3. Costos por transacción, fiscales y operativos

**Por transacción (cada venta).** Venta de referencia: USD 30.

| Pasarela | Comisión | En USD 30 | Retiro |
| --- | --- | --- | --- |
| Recurrente | 4.5% + Q2 (confirmado) | ≈ USD 1.61 (5.4%) | A confirmar |
| Lemon Squeezy | 5% + USD 0.50, +1.5% fuera de EE. UU. (confirmado) | ≈ USD 2.45 (8.2%) | +1% por retiro a un banco fuera de EE. UU. (confirmado) → total ≈ USD 2.73 (9.1%) |

**Reembolsos y contracargos:** el costo de cada uno no figura en las páginas consultadas. Hay que pedirlo.

**Posibles costos fiscales.** Son hipótesis: **los confirma el contador** (preguntas en la sección 6).

- **Régimen de pequeño contribuyente:** un impuesto sobre los ingresos brutos (se suele citar 5%). En USD 30, unos USD 1.50.
- **Régimen general:** el IVA va incluido en el precio. En USD 30, la base sería USD 26.79 y el IVA USD 3.21, más el ISR sobre la utilidad.
- **Facturación FEL:** las herramientas gratuitas de la SAT son manuales. Un certificador con API costaría entre Q50 y Q500 al mes (estimado).
- **Pagos en USD a proveedores extranjeros con tarjeta guatemalteca:** posible recargo del banco. Preguntar al banco.

**Operativos (no cotizados).** Hay que sumarlos aparte:

- honorarios del contador;
- tiempo de la maestra (producción, acompañamiento, validaciones docentes);
- difusión;
- soporte;
- reembolsos que se concedan.

**Lo que no se puede afirmar.** Ejemplo con Recurrente y la hipótesis del 5%: una venta de USD 30 deja unos USD 26.89 antes de los demás impuestos y gastos. Con ese número, **2 a 3 ventas al mes alcanzarían a pagar la infraestructura del Presupuesto A**. Eso **no** significa que el negocio sea rentable: no incluye contador, impuestos sobre la utilidad, reembolsos, difusión ni el trabajo de la maestra.

## 4. Videoconferencia (segunda etapa: talleres)

No forma parte del lanzamiento. La comparación completa está en `docs/investigacion-proveedores.md`. En resumen:

- **Google Workspace Business Standard**, en pago anual a unos USD 14 al mes: graba, admite 150 participantes, da 2 TB e incluye el buzón de la academia.
- **Zoom Pro**, a USD 15.99 al mes: 100 participantes y 10 GB en la nube.
- Se recomienda una sola licencia. El procedimiento de prueba (primero con cuentas gratuitas) se ejecuta al preparar el lanzamiento de talleres.

## 5. Recurrente o Lemon Squeezy (sin selección definitiva)

| Aspecto | Recurrente | Lemon Squeezy |
| --- | --- | --- |
| Disponibilidad en Guatemala | Empresa guatemalteca (confirmado) | Guatemala está en la lista de pagos a cuenta bancaria (confirmado, [países](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)) |
| Cobros internacionales | Tarjetas; recargo internacional a confirmar | Sí; +1.5% fuera de EE. UU. |
| Moneda | GTQ o USD | USD |
| Comisión total sobre USD 30 | ≈ 5.4% + retiro (a confirmar) | ≈ 9.1% con compradora fuera de EE. UU. |
| Reembolsos | Por panel o API; costo a confirmar | Los gestiona el proveedor; costo no listado |
| Contracargos | Los atiende la comerciante; costo a confirmar | Los gestiona el proveedor (vendedor legal) |
| Verificación de avisos (webhooks) | **No documentada públicamente.** La guía pide «validar que vienen de Recurrente» sin explicar cómo (confirmado, [apidocs](https://apidocs.recurrente.com/guides-english/getting-started/webhooks)) | Avisos firmados |
| Eventos de reembolso y contracargo | **No figuran** en su guía de avisos: solo pago exitoso o fallido, transferencias y suscripciones | Documentados |
| Plazos de liquidación | A confirmar | A confirmar |
| Responsabilidad fiscal | De la comerciante: IVA, ISR y FEL en Guatemala | Vendedor legal ante la compradora en otros países. **No resuelve las obligaciones de Albor en Guatemala** |
| Cursos digitales | Sí | Sí |
| Grabaciones y talleres en vivo (segunda etapa) | Sí | Productos digitales sí; los talleres en vivo podrían considerarse servicio: verificar en su política |
| Riesgo | Avisos y eventos no documentados | Comprada por Stripe (2024); fuentes secundarias de 2026 anuncian una migración a Stripe Managed Payments (verificar) |

**Lectura (no es una elección).**

- **Recurrente** tiene el menor costo y liquida localmente. Pero **no se puede integrar con seguridad** hasta saber cómo se verifica que un aviso viene de ellos y cómo se notifican y confirman reembolsos y contracargos. Sin eso, Albor no podría revocar un período con certeza ni distinguir un aviso falso.
- **Lemon Squeezy** documenta todo eso y resuelve los impuestos de compradoras extranjeras. Cuesta unos 4 puntos más por venta y tiene el riesgo de migración.

**Preguntas para Recurrente, por escrito:**

1. ¿Cómo se verifica la autenticidad de cada aviso: firma, secreto compartido, algoritmo, cabecera? ¿Hay reintentos? ¿Con qué frecuencia y por cuánto tiempo?
2. ¿Qué aviso llega cuando se confirma un reembolso, total o parcial? ¿Y cuando se abre, se gana o se pierde un contracargo?
3. ¿Se puede consultar por API el estado de un pago y de un reembolso, para conciliar?
4. ¿Cuál es el costo de un reembolso y de un contracargo? ¿Se devuelve la comisión?
5. ¿Hay recargo por tarjetas extranjeras? ¿En qué moneda se liquida? ¿Con qué plazo? ¿Cuánto cuesta retirar a una cuenta guatemalteca?
6. ¿Qué requisitos tiene la cuenta comercial (RTU, patente, régimen)? ¿Emite o integra la FEL?
7. ¿Admite productos digitales con acceso por tiempo limitado? ¿Y la venta a compradoras fuera de Guatemala?

## 6. Factura, recibo y preguntas para el contador

| Documento | Quién lo emite | Valor fiscal en Guatemala | En Albor hoy |
| --- | --- | --- | --- |
| **Factura FEL** | La titular, certificada por la SAT o un certificador | **Sí**: es el único documento fiscal | No implementada |
| **Recibo comercial** | Albor | **No**: constancia de la compra (curso, precio, condiciones) | Implementado; dice que no es factura |
| **Comprobante de la pasarela** | Recurrente o Lemon Squeezy | No para Albor en Guatemala | — |

Una beca no genera orden, pago ni recibo. Si hiciera falta algún registro, se decide con el contador.

**Preguntas:**

1. ¿Cuál es la condición tributaria actual de la titular (régimen, RTU, actividades inscritas)? ¿Hay que agregar la educación en línea?
2. ¿Está alcanzada por IVA la venta de cursos en línea? ¿Aplica alguna exención educativa, o tributa como servicio?
3. Pequeño contribuyente o régimen general: ¿cuál conviene con los ingresos esperados? ¿Qué pasa al superar el límite anual?
4. ¿Cómo se factura a compradoras en el extranjero sin NIT guatemalteco? ¿Es exportación de servicios? ¿Qué datos hay que pedir al comprar?
5. ¿Y a compradoras guatemaltecas que no dan su NIT?
6. Con Lemon Squeezy (vendedor legal extranjero): ¿se factura a Lemon Squeezy por lo liquidado o a cada compradora? ¿Cómo se declaran esos ingresos?
7. Con Recurrente: ¿la factura va por el monto bruto o por el neto? ¿La comisión es deducible? ¿Recurrente factura su comisión?
8. Reembolsos totales y parciales: ¿se anula la factura o se emite una nota de crédito? ¿En qué plazo?
9. Becas y accesos gratuitos: ¿requieren algún documento o registro?
10. Renovaciones: ¿cada compra nueva lleva su factura?
11. ¿Conviene un certificador FEL con API desde el inicio o la emisión manual mientras el volumen sea bajo? ¿Desde qué volumen conviene cambiar?
12. ¿Hay retenciones sobre lo que liquidan las pasarelas o los bancos, o por recibir USD del exterior?
13. ¿Qué registros de cada venta hay que conservar, y por cuánto tiempo?
14. ¿Hay obligaciones de protección de datos o de consumo para ventas en línea?
