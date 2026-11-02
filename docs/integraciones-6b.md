# Integraciones del lanzamiento de cursos: preparación local

Fase 6B, preparación local (03/11/2026). Talleres y videoconferencias quedan fuera de esta etapa. **Ningún servicio real está conectado.** No se creó ninguna cuenta de proveedor, no se subieron videos, no se envió ningún correo y no se procesó dinero.

| Integración | Implementado | Probado | Pendiente de activación real |
| --- | --- | --- | --- |
| Video privado (Bunny Stream) | Adaptador con URL firmada; autorización en la base; simulador con enlace temporal | SQL `99m`, unitarias, `recorrido-integraciones.mjs` | Cuenta de Bunny, biblioteca privada con *token authentication*, subida de videos |
| Correo transaccional | Cola con estados, reintentos e idempotencia; plantillas; procesador; simulador | SQL `99m`, unitarias, `recorrido-integraciones.mjs` | Elegir proveedor, dominio verificado (SPF, DKIM, DMARC), SMTP propio para Supabase Auth |
| Pagos | Interfaz, simulador de todos los casos, procesamiento verificado de avisos | SQL (`20_compras`, `99i`, `99j`, `99m`), unitarias | Elegir entre Recurrente y Lemon Squeezy (decisión de la titular); confirmar por escrito la verificación de avisos y los eventos de reembolso |
| Facturación | Diseño de integración (abajo); recibo comercial no fiscal ya existente | — | Situación tributaria con un contador; certificador FEL; datos fiscales |

## Video privado

**Flujo:**

1. El campus solo muestra lecciones del temario de la versión de la persona y de cursos con acceso vigente.
2. Para el video, la base vuelve a decidir con `autorizar_video_leccion` (migración 0028, solo el servidor). Comprueba:
   - acceso activo y vigente; un período futuro no cuenta;
   - lección no bloqueada;
   - lección dentro de **su** versión académica;
   - video cargado.
3. Solo si responde «autorizado», el servidor pide al proveedor una URL **temporal** (2 horas).
4. Ni la persona ni la API pueden leer `lecciones.video_id`.

| Situación | Lo que ve la alumna |
| --- | --- |
| Autorizado | Reproductor (Bunny o el simulado) |
| Sin video cargado | «Video de la lección pendiente» |
| Sin acceso, vencido, fuera de su versión o bloqueado | La lección no aparece (404); si se pide igual, «no disponible» |
| El proveedor falla | «No pudimos cargar el video… recargue en unos minutos» |

**Versiones académicas:** una alumna en la versión 1 sigue viendo los videos de la versión 1, aunque el borrador o la versión 2 los reemplacen. El SQL comprueba que una lección agregada después no se autoriza a quien sigue la versión anterior.

**Simulador** (`VIDEO_PROVEEDOR=simulado`, solo `desarrollo` y `pruebas`): enlace `/video-simulado/<id>?vence=…&firma=…` con HMAC-SHA256 de una clave del servidor. Un enlace manipulado responde 403 y uno vencido 410. En producción la ruta no existe (404) y la validación de configuración rechaza el simulador.

**Para activar Bunny (no autorizado):**
- crear la biblioteca privada con *token authentication*;
- cargar `BUNNY_BIBLIOTECA_PRIVADA`, `BUNNY_CLAVE_TOKEN` y `VIDEO_PROVEEDOR=bunny`;
- subir videos y pegar su id en cada lección;
- probar con una cuenta real;
- revisar la CSP (los dos hosts de Bunny ya están permitidos).

## Correos transaccionales

| Mensaje | Quién lo envía | Estado |
| --- | --- | --- |
| Confirmación de cuenta | Supabase Auth | Requiere SMTP propio en producción (el de Supabase es limitado y solo para pruebas) |
| Recuperación de contraseña | Supabase Auth | Igual que la anterior |
| Confirmación de compra | Cola de Albor: se registra sola al aprobarse la orden (`confirmacion_compra:<orden>`) | Implementado; simulado |
| Aviso de vencimiento | Cola de Albor: `encolar_avisos_vencimiento(días)` | Implementado, **no programado**: la anticipación la decide la maestra |
| Comunicaciones importantes | Cola de Albor (plantilla `comunicacion_importante`) | Plantilla y cola listas; sin pantalla en el panel (no pedida) |

**Estados en `envios_correo`:**

| Estado | Significado |
| --- | --- |
| `creado` | Registrado, todavía no listo |
| `pendiente` | En cola o esperando un reintento |
| `enviando` | Tomado por un proceso |
| `enviado` | Solo con un proveedor real; la base rechaza «enviado» con el simulador |
| `simulado` | Procesado por el simulador: **no salió** |
| `fallido` | Después de 5 errores, con espera de 2, 4, 8 y 16 minutos |

Un envío trabado vuelve a la cola a los 15 minutos. La misma clave nunca genera dos correos. Las variables con nombre de secreto se rechazan. Los errores guardan un código, no el texto ni los datos de la persona.

## Pagos

Interfaz `ProveedorPagos` (`src/servicios/pagos/tipos.ts`):
- crear el *checkout*;
- verificar la firma del aviso;
- consultar el estado real;
- reembolsar.

**Procesamiento de un aviso** (`procesarAvisoPago`). Un aviso nunca alcanza solo:

1. Se verifica la firma; si es inválida, 401 y no se registra nada.
2. Se consulta el estado en la pasarela; si no responde, 503 para que reintente, sin registrar nada.
3. El estado y el importe tienen que coincidir; si no, 409 y no se registra nada.
4. Recién entonces se registra en la base (`procesar_evento_pago`). La base es idempotente por evento y por pago.

**Simulador** (`PagosSimulados`). Cubre:
- pago confirmado y rechazado;
- aviso duplicado (mismo evento);
- importe distinto;
- aviso viejo reenviado;
- reembolso y contracargo;
- pasarela sin conexión, con reintento posterior.

La base ya cubre la confirmación tardía (pago después del vencimiento de la reserva → incidencia) y el reembolso parcial (decisión B).

**Garantías probadas en SQL:**
- un pago repetido no genera accesos ni períodos duplicados;
- un reembolso revoca solo el período de su compra; el de otra compra se conserva;
- un pago no da acceso si el importe no coincide.

**Ruta de avisos:** no se publicó una ruta pública de avisos. Las ventas están cerradas y la pasarela no está elegida. Al elegirla, la ruta solo tiene que leer el cuerpo crudo, llamar a `procesarAvisoPago` con `registrarEnBase` y devolver el código HTTP que indica.

**Comparación de proveedores:** se conserva en `docs/investigacion-proveedores.md`, sin elegir.

## Facturación (solo diseño)

La operación comercial será desde Guatemala.

- **Hoy:** recibo comercial con la leyenda «no es un documento fiscal» (`SoloRecibo`). No se emiten facturas ni se simulan comprobantes fiscales como válidos.
- **Diseño:** un adaptador `ProveedorFiscal` (`src/servicios/facturacion/tipos.ts`) por certificador FEL autorizado por la SAT. Al aprobarse una orden, si la configuración fiscal está completa, se pide el DTE al certificador. Se guarda serie, número y autorización en `documentos_fiscales`, y el XML o PDF en almacenamiento privado.
- **Anulación:** acompaña al reembolso, con el motivo.
- **Lo que define la titular con un contador:**
  - régimen (pequeño contribuyente o general) y si corresponde FEL desde el inicio;
  - NIT y datos del emisor;
  - certificador;
  - tratamiento de compradores sin NIT («CF»);
  - moneda (USD o GTQ) y tipo de cambio;
  - si las ventas al exterior tienen otro tratamiento.

Hasta entonces, nada de esto se implementa.

## Costos pendientes (sin contratar)

Detalle y estimaciones en `docs/presupuestos-proveedores.md` y `docs/investigacion-proveedores.md`. Pendientes de autorización:
- hosting;
- Supabase de producción (plan pago para respaldos diarios y PITR opcional);
- dominio;
- Bunny Stream (almacenamiento y entrega);
- proveedor de correo con dominio verificado;
- pasarela (comisiones por transacción);
- certificador FEL;
- gestor de contraseñas.
