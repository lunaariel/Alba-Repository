# Investigación de proveedores: Guatemala, Fase 6

Preparada el 01/11/2026 para decidir, **no para contratar**. No se creó ninguna cuenta, prueba ni suscripción. Los precios son públicos, en USD sin impuestos, y cambian: hay que confirmarlos en la página oficial del proveedor el día de contratar. Tipo de cambio de referencia: **Q7.65 por USD** (Banguat, rango 2026 entre Q7.61 y Q7.67). Con ese cambio, el presupuesto de **Q500 al mes equivale a unos USD 65**.

Cada dato indica de dónde sale. «(conocimiento previo, verificar)» marca lo que no se pudo confirmar en una fuente durante esta jornada.

## 1. Pasarelas de pago para un comercio establecido en Guatemala

Precio de referencia de un curso: USD 30.

| Opción | ¿Disponible desde Guatemala? | Comisión por venta | Sobre un curso de USD 30 | Moneda | Costos fijos | Reembolsos y contracargos | Webhooks / API | Requisitos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Recurrente** (local) | Sí, es guatemalteca | Cuenta comercial **4.5% + Q2**; cuenta personal 5.25% + Q2 ([precios](https://www.recurrente.com/precios)) | ≈ USD 1.61 (5.4%) | Quetzales o dólares | Sin mensualidad ni implementación | No figuran en la página de precios: hay que preguntarlo | Tiene API y enlaces de pago; webhooks a confirmar con su documentación | Cuenta gratuita en minutos. Las condiciones de la cuenta comercial (RTU, patente) hay que confirmarlas |
| **Lemon Squeezy** (*merchant of record*) | Guatemala figura entre los países con **pago a cuenta bancaria** ([países](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)) | 5% + USD 0.50 ([reseña](https://dodopayments.com/blogs/lemonsqueezy-review)) | ≈ USD 2.00 (6.7%) | USD | Sin mensualidad | El proveedor gestiona reembolsos, contracargos e impuestos de los compradores extranjeros | Sí, webhooks firmados | Cuenta en línea; ellos son el vendedor legal ante el comprador |
| **Hotmart** (plataforma de cursos) | Muy usada en Latinoamérica (conocimiento previo, verificar Guatemala) | 9.9% + USD 0.50 por venta en USD; USD 1.49 más si se usa su reproductor ([fuente](https://www.pandavideo.com/blog/hotmart-fees)) | ≈ USD 3.47 (11.6%) | USD | Sin mensualidad | Los gestiona Hotmart | Sí | Cuenta en línea. Duplica funciones de Albor (alojamiento, área de alumnos) |
| **Stripe** | **No** opera directamente en Guatemala: solo con una empresa en EE. UU. ([guía](https://www.zenind.com/help/post/how-to-open-a-stripe-account-in-guatemala-through-a-u-s-business-structure)) | 2.9% + 0.30 en EE. UU. (conocimiento previo, verificar) | — | USD | Empresa en EE. UU. y su mantenimiento anual | Sí | Excelentes | Descartada por costo y complejidad legal |
| **PayPal** | Se usa en Guatemala; hay retiros a cuentas locales con BAM ([nota 2026](https://newsinamerica.com/pdcc/noticias/gerenciales/2026/bam-anuncia-su-nueva-alianza-con-paypal-en-la-innovacion-de-pagos-digitales-y-retiros-a-cuentas-locales/)) | Comisión comercial internacional (verificar la tabla vigente para Guatemala) | — | USD | Sin mensualidad | Sí | Sí | Cuenta empresarial. Conviene como medio adicional, no como único |
| **Adquirentes bancarios** (Visanet/Cybersource, BAC Compra Click, Neonet) | Sí | Por contrato (verificar) | — | GTQ / USD | Suelen pedir contrato, empresa y a veces mensualidad | Sí | Sí, más complejos | Para más adelante, con volumen |

**Recomendación fundada**

- **Pasarela principal: Recurrente.** Es local, cobra en USD o GTQ, no tiene costos fijos y su comisión es la más baja de las disponibles directamente (5.4% sobre USD 30), y Albor ya tiene una interfaz de pago simulada para conectarla.
- Antes de contratar hay que confirmar por escrito:
  1. el procedimiento y el costo de reembolsos y contracargos;
  2. los webhooks firmados y su reintento;
  3. los requisitos de la cuenta comercial según la condición tributaria de la titular;
  4. si emite o integra FEL.
- **Alternativa si la mayoría de las compras viene del extranjero: Lemon Squeezy.** Cobra más, pero resuelve los impuestos de otros países y los contracargos.
- La decisión depende de dónde estén las alumnas y de la condición tributaria: **decisión de la maestra**.

## 2. Facturación electrónica (FEL)

Fuente: resumen de [trámites FEL](https://livinginguatemala.com/es/tramites/fel-habilitacion/) (confirmar con la SAT).

- La FEL es obligatoria para el 100% de los contribuyentes desde marzo de 2023. Toda factura lleva el NIT del comprador; ya no se emite a «consumidor final».
- La habilitación es gratuita en la Agencia Virtual de la SAT. Hay herramientas sin costo: el portal web y la App FEL. Son manuales: **no se integran automáticamente con Albor**.
- Para emitir automáticamente desde el sistema hace falta un **certificador** autorizado, por API: entre **Q50 y Q500 al mes** según el volumen (por ejemplo, [Digifact tiene SDK](https://pypi.org/p/digifact-sdk)).
- Régimen de pequeño contribuyente: el límite subió a 125 salarios mínimos no agrícolas (Decreto 31-2024), unos **Q500,285 en 2026**.
- **No se implementó facturación legal.** Albor emite solo un recibo comercial no fiscal y lo dice. Falta confirmar con un contador:
  1. la condición tributaria de la titular;
  2. cómo facturar a compradores extranjeros sin NIT guatemalteco (exportación de servicios);
  3. si conviene un certificador o la emisión manual al empezar.

## 3. Precios y promociones: estructura preparada

Ya existen en la base:

- precio individual por curso, configurable, con historial en el registro de actividad;
- cupones por porcentaje o monto, con vigencia desde y hasta, límite de usos y contador;
- cada orden guarda su precio, su descuento y el cupón aplicado;
- el precio de cada compra queda fijado.

**No se activaron descuentos reales ni se inventaron promociones.** Las «promociones de temporada» son cupones con fechas: no hace falta otra estructura. El precio de referencia de USD 30 se informa en la ficha y se carga curso por curso.

## 4. Videoconferencias: Google Meet y Zoom

| | Google Meet (Workspace) | Zoom Workplace Pro |
| --- | --- | --- |
| Precio por usuario | Business Standard USD 14 anual / USD 16.80 mensual; Business Plus USD 22 / USD 26.40 ([fuente](https://eesel.ai/blog/google-workspace-pricing), verificar en Google) | USD 15.99 mensual ([Zoom](https://www.zoom.com/en/products/collaboration-tools/zoom-workplace-pro-annual)) |
| Participantes | Standard 150; Plus 500 | 100 en Pro (conocimiento previo, verificar) |
| Grabación | Desde Business Standard (a Drive, almacenamiento compartido de 2 TB por usuario) | En la nube, 10 GB por licencia |
| Grabación automática | API de Meet v2: configuración del espacio (`artifactConfig`) | Configurable en la cuenta y por API (verificar) |
| Asistencia | Informes de asistencia **desde Business Plus** (investigación anterior) | Informes de reuniones por API (verificar plan) |
| Crear reuniones por API | Meet API `spaces.create`, con OAuth de usuario o delegación de dominio | Server-to-Server OAuth |
| Recuperar la grabación | Drive API con permisos restringidos (`drive.readonly` / `drive.meet.readonly`), que requieren verificación de Google | API de grabaciones en la nube |
| Seguridad | Acceso restringido (`RESTRICTED`) y cuentas de Google | Sala de espera, contraseña, autenticación |
| Una sola administradora | Sí; depende de Calendar y Drive | Sí |

**Para Albor:** la maestra ya eligió Meet. **Business Standard** alcanza para crear reuniones y grabar. **Business Plus** solo hace falta para los informes automáticos de asistencia. Con una licencia, la diferencia es de USD 8 a 9.60 por mes, y Plus deja el total fuera del presupuesto.

## 5. Video alojado (lecciones y grabaciones)

| | Bunny Stream | Cloudflare Stream | Mux |
| --- | --- | --- | --- |
| Almacenamiento | USD 0.01 por GB al mes (más réplicas) ([Bunny](https://bunny.net/docs/stream/pricing)) | USD 5 por cada 1,000 minutos guardados ([Cloudflare](https://developers.cloudflare.com/stream/pricing)) | Por minuto (verificar) |
| Entrega | USD 0.01 por GB en Norteamérica y Europa; USD 0.045 por GB en Sudamérica | USD 1 por cada 1,000 minutos vistos | Por minuto (verificar) |
| Codificación | Estándar incluida | Incluida | Incluida en el plan básico |
| Mínimo | USD 1 al mes | Compra en bloques de USD 5 | — |
| Reproducción protegida | URL firmada con token (ya implementada en Albor); DRM opcional a USD 99 al mes por biblioteca | URL firmadas | URL firmadas |
| Integración en Albor | **Ya implementada** (firma probada); falta una cuenta real | Habría que escribir el adaptador | Habría que escribir el adaptador |

**Ejemplo de costo** (supuestos, no datos: 10 cursos de 4 h, unos 60 GB; 100 alumnas que ven 4 h al mes, unos 280 GB):

- Bunny: unos USD 0.60 de almacenamiento + entre USD 2.80 y 12.60 de entrega, según la región = **entre USD 3.40 y 13.20 al mes**.
- Cloudflare: 2,400 minutos guardados = USD 15 (tres bloques de USD 5) + 24,000 minutos vistos = USD 24, es decir **USD 39 al mes**.

**Recomendación: Bunny Stream**, porque ya está integrado y sale más barato con este perfil de uso. Las grabaciones de talleres (solo la maestra) se suben como videos de una biblioteca privada aparte.

## 6. Correo transaccional

| | Gratis | Pago | Notas |
| --- | --- | --- | --- |
| Resend | 3,000 correos al mes ([fuente](https://costbench.com/compare/amazon-ses-vs-resend/)) | USD 20 al mes por 50,000 | API simple; hay que verificar el dominio (SPF y DKIM) |
| Amazon SES | Sin plan gratis | USD 0.10 por 1,000 | El más barato con volumen; la configuración inicial es más técnica |
| Brevo | Unos 300 al día (verificar) | Planes desde unos USD 9 | También sirve para boletines |

Confirmaciones, recordatorios, cambios de fecha, avisos importantes y recuperación de cuenta (esta última hoy la manda Supabase Auth) caben en el plan gratis de Resend al empezar. Hace falta un dominio propio para la reputación de envío. **Recomendación: Resend.**

## 7. Infraestructura base (fuera de las integraciones)

| | Precio | Fuente |
| --- | --- | --- |
| Vercel Pro | USD 20 al mes | [comparativa al 26/09/2026](https://www.jetadmin.io/blog/vercel-vs-supabase/). El plan Hobby es para uso personal, no comercial (términos de Vercel, verificar) |
| Supabase Pro | USD 25 al mes | Misma fuente. El plan gratuito pausa los proyectos inactivos y no incluye respaldos diarios (conocimiento previo, verificar) |
| Dominio | unos USD 15 al año (≈ USD 1.25 al mes) | Varía según el registrador |

## 8. Conjunto mínimo y presupuesto de Q500 al mes

| Servicio | Opción mínima | USD al mes | Q al mes (×7.65) |
| --- | --- | --- | --- |
| Hosting | Vercel Pro | 20.00 | 153.00 |
| Base de datos, autenticación y archivos | Supabase Pro | 25.00 | 191.25 |
| Videoconferencia y grabación | Workspace Business Standard (anual, 1 usuario) | 14.00 | 107.10 |
| Video | Bunny Stream (ejemplo anterior) | 3.40 a 13.20 | 26 a 101 |
| Correo | Resend gratis | 0 | 0 |
| Dominio | — | 1.25 | 9.56 |
| **Total fijo** | | **63.65 a 73.45** | **≈ Q487 a Q562** |
| Pasarela | Recurrente, por venta | 5.4% de cada venta | — |
| FEL automática | Certificador | — | Q50 a Q500 |

**Conclusión con cifras:** Q500 alcanza **apenas** para el conjunto mínimo con poco tráfico de video, Workspace Standard en pago anual y sin certificador FEL. **No alcanza** si:

- se elige Workspace Business Plus por la asistencia automática (+Q61 a Q74);
- el video se ve mayormente desde Sudamérica (+Q75);
- se suma un certificador FEL (+Q50 a Q500).

**Alternativas para no pasarse:**

1. Empezar con Workspace Standard y tomar la asistencia a mano.
2. Emitir la FEL manualmente, con las herramientas gratuitas de la SAT, mientras el volumen sea bajo.
3. Pagar Workspace en forma anual (16% menos que el mensual).
4. Revisar a los 3 meses el consumo real de video.
5. Los planes gratuitos de Supabase y Vercel ahorrarían USD 45, pero **no se recomiendan** para vender: pausas, falta de respaldos y términos de uso comercial.

## 9. Decisiones que necesita tomar la maestra

1. Pasarela: Recurrente (local) o Lemon Squeezy (*merchant of record*), según dónde estén las compradoras.
2. Condición tributaria y forma de facturar: con un contador.
3. Workspace Business Standard (asistencia manual) o Business Plus (asistencia automática).
4. Si acepta el conjunto mínimo con el presupuesto al límite, o lo amplía.
