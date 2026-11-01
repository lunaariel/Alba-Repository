# Presupuestos, videoconferencia, pasarelas y FEL

Preparado el 01/11/2026 para decidir. **No se contrató, no se creó ninguna cuenta y no se conectó ningún servicio.**

**Convenciones:**

- Tipo de cambio de referencia: **Q7.65 por USD**.
- Precios en USD, sin impuestos ni recargos bancarios por compras en moneda extranjera (preguntar al banco y al contador).
- **Confirmado** = leído en la página oficial del proveedor en la fecha indicada.
- **Estimado** = fuente secundaria, conocimiento previo o cálculo con supuestos de uso. Hay que confirmarlo el día de contratar.
- Complementa `docs/investigacion-proveedores.md`.

## 1. Presupuesto A: mínimo viable

**Criterio:**

- infraestructura apta para uso comercial, con respaldos y segundo factor;
- planes gratuitos solo cuando sus términos permiten el uso comercial y no comprometen la seguridad.

**Supuestos de uso del video:**

- 10 cursos de 4 h (unos 60 GB);
- 100 alumnas que ven 4 h al mes (unos 280 GB).

| Servicio | Proveedor | Función | Plan | USD/mes | Q/mes | USD/año | Límites | Costos variables | Riesgos | Alternativa | Fuente y fecha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hosting | Vercel | Sitio, campus, panel y acciones de servidor | Pro, 1 usuario | 20.00 | 153.00 | 240 | Uso incluido amplio para este volumen | Excedentes de uso (improbables al inicio) | Ninguno relevante | Cloudflare Workers pago, USD 5 (exige adaptar el despliegue con OpenNext; sin ensayar) | **Confirmado**: [vercel.com](https://vercel.com/docs/plans/hobby): Hobby solo uso personal no comercial; Pro USD 20 por usuario. 01/11/2026 |
| Base de datos, autenticación, archivos | Supabase | Postgres con RLS, Auth con MFA TOTP, almacenamiento privado | Pro | 25.00 | 191.25 | 300 | 8 GB de base, 100 GB de archivos, respaldos diarios por 7 días | Cómputo mayor o PITR si hiciera falta | Sin recuperación a un punto en el tiempo | — (Free pausa por inactividad y no tiene respaldos: **no apto**) | **Confirmado**: [supabase.com/pricing](https://supabase.com/pricing), 01/11/2026 |
| Video de lecciones y grabaciones | Bunny Stream | Video privado con URL firmada (ya integrado) | Por uso | 3.40 a 13.20 | 26 a 101 | 41 a 158 | Mínimo USD 1 al mes | Entrega por GB: 0.01 en Norteamérica y Europa, 0.045 en Sudamérica | El costo crece con las vistas | Cloudflare Stream (≈ USD 39 con el mismo uso) | **Confirmado** tarifa; **estimado** el uso. [bunny.net](https://bunny.net/docs/stream/pricing), 01/11/2026 |
| Correo transaccional | Resend | Confirmaciones, recordatorios, avisos | Gratis | 0 | 0 | 0 | 3,000 al mes y 100 al día | — | Límite diario si muchos recordatorios coinciden | Amazon SES, USD 0.10 por 1,000 | **Estimado** (fuente secundaria): confirmar límites y términos |
| Dominio | Registrador a elegir | Sitio y reputación del correo | Anual | 1.25 | 9.56 | 15 | — | — | — | — | **Estimado** |
| Videoconferencia y grabación | Google Workspace | Meet con grabación a Drive, buzón de la academia y 2 TB | Business Standard, 1 usuario, pago anual | 14.00 | 107.10 | 168 | 150 participantes, grabación (Starter **no** graba) | — | Sin informe automático de asistencia (eso es Plus) | Zoom Pro (sección 3) | **Confirmado** plan y funciones en [workspace.google.com](https://workspace.google.com/pricing), 01/11/2026. El monto en USD es **estimado**: la página oficial no lo mostró |
| Respaldo externo semanal | GitHub Actions + almacenamiento privado | Volcado cifrado fuera de Supabase | Por uso | 0 a 1 | 0 a 7.65 | 0 a 12 | — | Por GB guardado | Hay que custodiar la clave de cifrado | — | **Estimado** |
| MFA de la admin | Supabase Auth | TOTP | Incluido | 0 | 0 | 0 | — | — | — | — | **Confirmado** (incluido en Auth) |
| Registro de errores | Vercel y Supabase | Registros incluidos | Incluido | 0 | 0 | 0 | Retención corta | — | Sin alertas | Sentry (Presupuesto B) | **Estimado** |
| **Total fijo** | | | | **63.65 a 74.45** | **Q487 a Q570** | **764 a 893** | | | | | |
| Pasarela | Recurrente | Cobro | Cuenta comercial | — | — | — | — | **4.5% + Q2 por venta** (≈ USD 1.61, Q12.32 en una venta de USD 30). Retiros: a confirmar | — | Lemon Squeezy (sección 4) | **Confirmado**: [recurrente.com/precios](https://www.recurrente.com/precios), jornada del 01/11/2026 |
| FEL | SAT | Facturas | Herramientas gratuitas, manuales | 0 | 0 | 0 | Emisión manual | Tiempo de la titular | Depende de la condición tributaria | Certificador, Q50 a Q500 al mes | **Estimado**: confirmar con el contador |

### ¿Entra en Q500?

**Entra solo con poco consumo de video.** El total queda entre Q487 y Q570: supera Q500 cuando la entrega de video pasa de unos USD 5 al mes, es decir, cuando las vistas se hacen mayormente desde Sudamérica o crecen.

**Indispensable** (no se recorta):

- hosting comercial;
- base con respaldos;
- MFA;
- dominio;
- video protegido;
- correo;
- pasarela.

**Postergable sin perder seguridad ni cumplimiento:**

1. **Videoconferencia paga (USD 14, Q107).** Si los talleres en vivo empiezan después que los cursos, el total baja a **Q380 a Q462**. Hasta entonces se puede usar el enlace manual que Albor ya admite.
2. **Certificador FEL**: emisión manual mientras el volumen sea bajo, si el contador lo aprueba.
3. **Alertas y monitoreo pagos.**
4. **Cambiar Vercel por Cloudflare** (ahorraría USD 15, Q115). Antes requiere adaptar y ensayar el despliegue: es una evaluación técnica, no una decisión para hoy.

**Punto de equilibrio:** con un neto de unos USD 28.39 (Q217) por cada venta de USD 30, **3 ventas al mes cubren el Presupuesto A**.

## 2. Presupuesto B: recomendado

Mismo criterio que A, más alertas, más margen de correo y respaldos externos cifrados. Es la meta cuando haya ventas regulares.

| Servicio | Proveedor | Plan | USD/mes | Q/mes | USD/año | Diferencia con A | Fuente |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hosting | Vercel | Pro | 20.00 | 153.00 | 240 | Igual | Confirmado |
| Base de datos | Supabase | Pro (cómputo Micro incluido) | 25.00 | 191.25 | 300 | Igual. Agregar cómputo o PITR solo si las métricas lo piden | Confirmado |
| Respaldo externo | Almacenamiento privado | Semanal cifrado, con prueba de restauración mensual | 1 a 2 | 8 a 15 | 12 a 24 | Restauración probada | Estimado |
| Video | Bunny Stream | Por uso, con crecimiento | 5 a 20 | 38 a 153 | 60 a 240 | Más vistas | Confirmado tarifa, estimado uso |
| Correo | Resend | Pro (50,000 al mes, sin límite diario) | 20.00 | 153.00 | 240 | Sin límite de 100 al día | Estimado |
| Videoconferencia | Google Workspace | Business Standard anual | 14.00 | 107.10 | 168 | Igual | Confirmado funciones, estimado monto |
| Errores y alertas | Sentry | Team | ≈ 26 | ≈ 199 | ≈ 312 | Alertas de errores del servidor y del navegador | **Estimado** (verificar precio y términos) |
| Disponibilidad | Monitor de disponibilidad | Plan gratuito con alertas | 0 | 0 | 0 | Aviso si el sitio cae | **Estimado**: verificar que el plan gratuito permita uso comercial |
| Dominio | Registrador | Anual | 1.25 | 9.56 | 15 | Igual | Estimado |
| **Total fijo** | | | **112.25 a 128.25** | **Q859 a Q981** | **1,347 a 1,539** | | |

**Variables (iguales en A y B):**

- comisión de la pasarela por venta;
- costo de retiro;
- recargo bancario por pagos en USD con tarjeta guatemalteca;
- un certificador FEL si se adopta.

**B supera los Q500.** Se recomienda llegar a él por etapas:

1. Resend Pro cuando los correos pasen de 100 por día.
2. Sentry Team cuando haya ventas.
3. Respaldo externo desde el lanzamiento.

## 3. Zoom y Google Meet

Albor ya guarda la plataforma **por taller** (`talleres.plataforma`: `zoom` o `meet`) y admite un enlace manual. La admin puede elegir en cada taller sin cambios de modelo.

| Aspecto | Google Meet | Zoom |
| --- | --- | --- |
| Precio mensual | Business Standard ≈ USD 16.80 (flexible) | Pro **USD 15.99** (confirmado, página de Zoom, jornada del 01/11/2026) |
| Precio anual | Business Standard ≈ USD 14 al mes (estimado; Google confirma el 16% de ahorro anual) | Pro ≈ USD 14.16 al mes (estimado, fuente secundaria) |
| Gratis | Cuenta personal: reuniones de grupo de **60 min**, 100 participantes, sin grabación | Basic: **40 min**, 100 participantes, grabación **local** solamente |
| Duración máxima paga | 24 h | 30 h |
| Participantes | Standard 150; Plus 500 (confirmado) | Pro 100 (estimado, verificar) |
| Grabación | Desde Business Standard (Starter no), a Drive | Pro: en la nube |
| Grabación automática | Configurable en el espacio de Meet (API v2, `artifactConfig`) | Configurable en la cuenta y por reunión |
| Almacenamiento | 2 TB compartidos por usuario (Standard) | 10 GB en la nube por licencia |
| Recuperar la grabación | Drive API con alcances restringidos que exigen verificación de seguridad de Google | API de grabaciones en la nube |
| API y creación automática | Meet API `spaces.create`, con OAuth y alcances sensibles | Server-to-Server OAuth |
| Informe de asistencia | Desde Business Plus o Essentials (no en Standard) | Reportes por API desde Pro; Dashboard desde Business |
| Requisitos de permisos | App OAuth verificada por Google para alcances sensibles o restringidos | App Server-to-Server en el Marketplace de Zoom (uso interno) |
| Límites regionales | Google One con grabación probablemente no se vende en Guatemala (verificar); Workspace sí | Sin restricción conocida para Guatemala (verificar) |
| Integración con Albor | Adaptador por escribir; el modelo ya existe | Adaptador por escribir; el modelo ya existe |
| Extra | Incluye buzón de correo profesional para la academia | Solo videoconferencia |

**Recomendación de menor costo sostenible:** **una sola** licencia paga.

**Google Workspace Business Standard** en pago anual:

- graba;
- admite 150 participantes;
- da 2 TB para las grabaciones;
- incluye el buzón de la academia, que de otro modo sería un gasto aparte.

Zoom Pro cuesta parecido, pero solo da 10 GB y no incluye correo.

La asistencia se puede registrar en Albor (`marcar_asistencia` ya existe), así que **no hace falta Business Plus**. Pagar las dos plataformas no se justifica: se puede seguir eligiendo Zoom por taller con la cuenta gratuita en talleres de menos de 40 minutos, o con enlace manual.

### Procedimiento de prueba (sin ejecutar)

**Fase 1: cuentas gratuitas.** No requiere autorización de gasto, pero sí la de la titular para usar sus cuentas.

1. Crear una reunión de prueba en Meet (cuenta personal) y otra en Zoom Basic. Cargar el enlace en un taller de prueba de Albor como enlace manual.
2. Ingresar desde una computadora y un celular, con conexión doméstica de Guatemala, y si es posible desde otro país. Registrar la calidad de audio y video y si se comparte pantalla bien.
3. Probar la sala de espera de Zoom y el acceso restringido de Meet: ¿entra alguien sin invitación?
4. Verificar los cortes en los 60 y 40 minutos, y la grabación local de Zoom.
5. Que la maestra diga cuál le resulta más cómoda: es la decisión que más pesa.

**Fase 2: planes pagos.** Solo con autorización expresa. La prueba gratuita de Workspace pide tarjeta y puede convertirse en cobro.

1. Grabación en la nube y grabación automática.
2. Recuperar la grabación por API en una cuenta de prueba, sin datos de alumnas.
3. Crear una reunión desde Albor en un entorno de prueba.
4. Informe de asistencia, si se evalúa Plus.
5. Copiar la grabación a la biblioteca privada de Bunny.
6. Cancelar la prueba antes de la conversión si no se autoriza el plan.

## 4. Pasarelas para un comercio establecido en Guatemala

Venta de referencia: un curso de USD 30.

| Aspecto | Recurrente | Lemon Squeezy | PayPal | Stripe | Hotmart |
| --- | --- | --- | --- | --- | --- |
| Disponible desde Guatemala | Sí, empresa guatemalteca (confirmado) | Guatemala está en la lista de **pagos a cuenta bancaria** (confirmado, [docs](https://docs.lemonsqueezy.com/help/getting-started/supported-countries), 01/11/2026) | Sí; retiros locales con BAM (nota de prensa 2026) | **No** de forma directa: exige una empresa en EE. UU. | Probable (verificar) |
| Cobros internacionales | Sí, con tarjeta (recargo internacional: verificar) | Sí, es su fuerte | Sí | — | Sí |
| USD | Sí, y GTQ | Sí | Sí | — | Sí |
| Moneda de liquidación | GTQ o USD (verificar) | USD a la cuenta bancaria | USD | — | USD |
| Comisión | **4.5% + Q2** (confirmado) | 5% + USD 0.50; **+1.5% fuera de EE. UU.**; +1.5% con PayPal; +0.5% suscripciones (confirmado, [docs](https://docs.lemonsqueezy.com/help/getting-started/fees), 01/11/2026) | Tabla comercial internacional (verificar) | — | 9.9% + USD 0.50 (fuente secundaria) |
| Retiro | A confirmar | **1% por retiro** a banco fuera de EE. UU.; PayPal 3% hasta USD 30 (confirmado) | Según el banco | — | Verificar |
| Costo total en USD 30 | ≈ USD 1.61 (5.4%) + retiro | Compradora fuera de EE. UU.: USD 2.45 + 1% de retiro ≈ **USD 2.73 (9.1%)**. Compradora en EE. UU.: ≈ USD 2.28 (7.6%) | — | — | ≈ USD 3.47 (11.6%) |
| Reembolsos | Por el panel o la API (costo: verificar) | Los gestiona el proveedor; la página de tarifas no lista un costo | Sí | — | Los gestiona Hotmart |
| Contracargos | La comerciante los atiende (costo: verificar) | Los gestiona el proveedor como vendedor legal | La comerciante | — | Hotmart |
| Webhooks | `payment_intent.succeeded` y `.failed`, transferencias y suscripciones. **Su guía no lista eventos de reembolso ni de contracargo, ni explica cómo verificar la firma** (confirmado, [apidocs](https://apidocs.recurrente.com/guides-english/getting-started/webhooks), 01/11/2026). Hay que preguntarlo | Sí, firmados | Sí | — | Sí |
| Liquidación | A confirmar | A confirmar | Según el retiro | — | — |
| Requisitos de la cuenta | Cuenta comercial (RTU y patente: verificar) | Cuenta en línea y verificación de identidad | Cuenta empresarial | Empresa en EE. UU. | Cuenta en línea |
| Responsabilidad tributaria | **De la comerciante**: IVA, ISR y FEL en Guatemala | El proveedor es **vendedor legal** y cobra los impuestos de la compradora en otros países. **No resuelve las obligaciones de Albor en Guatemala** (ingresos y facturación: contador) | De la comerciante | — | Hotmart es intermediaria |
| Cursos digitales y grabaciones | Sí (venta de productos y servicios) | Productos digitales: sí. **Talleres en vivo: verificar** en su política de uso, porque podrían considerarse un servicio | Sí | — | Duplica el campus de Albor |
| Riesgo | Webhooks a confirmar | Comprada por Stripe en 2024. Fuentes secundarias de 2026 anuncian una migración a Stripe Managed Payments: **riesgo de migración forzada** (verificar) | Retenciones de fondos | — | Dependencia de la plataforma |

**Recomendación (no automática por precio):**

- **Recurrente como pasarela principal**, si la mayoría de las compradoras está en Guatemala o Centroamérica y el contador confirma que la condición tributaria lo permite. Es la de menor costo total y liquida localmente.
- **Antes de conectarla** hay que obtener por escrito:
  - los eventos de reembolso y contracargo;
  - la verificación de firma de los webhooks y sus reintentos;
  - el costo y los plazos de retiro;
  - el recargo por tarjetas extranjeras.
- **Lemon Squeezy solo si la mayoría compra desde fuera de Centroamérica** y la titular prefiere no gestionar impuestos extranjeros ni contracargos. Cuesta unos 4 puntos más y tiene el riesgo de migración.

## 5. Factura fiscal, recibo comercial y comprobante de la pasarela

| Documento | Quién lo emite | Valor fiscal en Guatemala | En Albor hoy |
| --- | --- | --- | --- |
| **Factura FEL** | La titular (contribuyente), certificada por la SAT o un certificador | **Sí**: es el único documento fiscal | No implementada |
| **Recibo comercial** | Albor | **No**: constancia de la compra (curso, precio, condiciones) | Implementado; dice que no es factura |
| **Comprobante de la pasarela** | Recurrente, Lemon Squeezy u otra | No para Albor en Guatemala. Lemon Squeezy, como vendedor legal, emite su propio recibo a la compradora | — |

Una pasarela extranjera **no reemplaza** la FEL ni las obligaciones de Albor ante la SAT.

### Preguntas para el contador

1. ¿Cuál es la condición tributaria actual de la titular: régimen, RTU, actividades inscritas? ¿Hay que agregar la actividad de educación en línea?
2. ¿Está alcanzada por IVA la venta de cursos en línea? ¿Aplica alguna exención educativa (por ejemplo, para centros autorizados)? ¿O tributa como servicio?
3. Pequeño contribuyente o régimen general: ¿cuál conviene con los ingresos esperados? ¿Qué pasa al superar el límite anual?
4. ¿Cómo se factura a compradoras **en el extranjero** sin NIT guatemalteco? ¿Se trata como exportación de servicios? ¿Qué datos del comprador hay que pedir en el checkout?
5. ¿Y a compradoras guatemaltecas que no quieren dar su NIT? ¿Se admite «CF» por debajo de algún monto?
6. Si se usa **Lemon Squeezy** (vendedor legal extranjero): ¿a quién se le factura, a Lemon Squeezy por el neto liquidado o a cada compradora? ¿Cómo se declaran esos ingresos?
7. Si se usa **Recurrente**: ¿la factura se emite por el monto bruto o por el neto de comisión? ¿La comisión de la pasarela es deducible y Recurrente factura su comisión?
8. **Reembolsos:** ¿se anula la factura o se emite una nota de crédito? ¿Dentro de qué plazo?
9. **Becas y accesos gratuitos:** ¿requieren algún documento fiscal o registro?
10. **Talleres en vivo y grabaciones:** ¿tienen el mismo tratamiento que los cursos?
11. ¿Conviene un certificador FEL con API desde el inicio, o la emisión manual en la Agencia Virtual mientras el volumen sea bajo? ¿Con qué volumen conviene cambiar?
12. ¿Hay retenciones de ISR o IVA sobre lo que liquidan las pasarelas o los bancos? ¿Y por recibir USD del exterior?
13. ¿Qué registros contables y por cuánto tiempo hay que conservar de cada venta: orden, recibo, comprobante de pago?
14. ¿Hay alguna obligación de protección de datos o de consumo para ventas en línea, en Guatemala o en los países de las compradoras?
