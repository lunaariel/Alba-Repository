# Pendientes registrados

Este registro no se borra al cambiar de fase: cada fila se cierra solo cuando su verificación está hecha.

Estados de verificación:
- **Implementado**: el código existe.
- **Probado con simulación**: pasa pruebas automáticas con servicios falsos o locales.
- **Verificado con servicio real**: probado contra la cuenta real del proveedor.

Hasta hoy, ninguna funcionalidad está en el tercer estado.

## Fase 4 (aprobada el 30/10/2026 con estos pendientes)

| Pendiente | Estado | Qué falta | Fase prevista |
| --- | --- | --- | --- |
| Video de lecciones con Bunny Stream | Implementado; firma probada con prueba unitaria | Probar con una cuenta real | 6 |
| Almacenamiento privado de PDF | Implementado; acceso probado en simulación | Crear el bucket `materiales` en el Supabase real y descargar un PDF real | 5 (subida) y 7 |
| Tipografía del certificado | Implementado con fuentes estándar | Incrustar Fraunces y Atkinson | 5 |
| Cambio de correo electrónico | No implementado (por contacto) | Flujo con confirmación en el correo nuevo | 5 o 7 |
| Baja de cuenta | No implementado (por contacto) | Solicitud y ejecución segura | 5 |
| Devolución pedagógica de la evaluación | No implementado | Temas a reforzar sin revelar respuestas | 5 |
| Integración con servicios externos | Adaptadores simulados | Pruebas con cuentas reales | 6 |
| Revisión final de permisos y privacidad | Pruebas de RLS automáticas | Revisión completa en el entorno real | 7 |

## Fase 5 · entrega 1 (base del panel)

| Pendiente | Estado | Qué falta | Entrega prevista |
| --- | --- | --- | --- |
| Lectura de `opciones.es_correcta` desde el panel | La columna no es legible por clientes, tampoco por la admin | El editor de evaluaciones la leerá por el servidor (clave de servicio) después de `exigirAdmin()` | 2 |
| Acciones de servidor del panel | Prueba estática: cada acción empieza con `exigirAdminAccion()`. Pruebas directas en CI: `acciones-protegidas.mjs` (formularios reales del panel) y `acciones-sensibles.mjs` (26 acciones capturadas en el panel, incluidas eliminar, quitar y subir archivos, revisión favorable, bloqueo, publicar versión, criterios y talleres) reenviadas con la sesión de una alumna y sin sesión: 404 controlado y base y almacenamiento sin cambios; control positivo con la admin; API de datos y almacenamiento con el token de la alumna | Repetir con las acciones de cada entrega nueva | 4 a 6 |
| Nombre de la persona en "Asignó el rol de administración" | El registro guarda el id, no lo muestra | Mostrar el nombre en la ficha del registro | 4 |

## Fase 5 · entrega 2 (cursos y evaluaciones)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Vista previa del borrador "como alumno" desde el panel | **Implementado** (pestaña Vista previa, solo lectura) | — | Hecho en la jornada autónoma |
| Duplicar un curso | **Implementado (0020, local y CI)** | — | Hecho en la jornada autónoma |
| Subir videos a Bunny desde el panel | Se pega el id del video subido a Bunny | Subida directa con la API de Bunny | Fase 6 |
| Pestaña "Alumnos del curso" | **Implementada** por versión, con finalización, vencimiento y validación docente | Avance lección por lección | Entrega 4 |
| Bucket `materiales` en el Supabase real | La migración lo crea si existe el esquema de Storage; la subida se probó en el Supabase local de CI | Confirmar en el proyecto real | Fase 7 |
| Mover una lección a otro módulo | No implementado; se reordena dentro del módulo | Selector de módulo en la lección | A definir |

## Versionado académico (31/10/2026)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Bloqueo excepcional de un material PDF desde el panel | **Implementado** (botón en cada material) | — | Hecho |
| Diferencias de orden entre borrador y versión vigente | **Implementado** (lecciones y preguntas que cambian de lugar) | Diferencias de texto | A definir |
| Lista de alumnos por versión | **Implementada** (pestaña Alumnos) | — | Hecho |
| Descartar una revisión calculada y no aplicada | **Implementado** (con motivo y registro) | — | Hecho |
| Migraciones 0014, 0015 y 0016 en una base real | Probadas solo en local y en CI (Supabase local efímero), con conciliación y reversión. **Aplicarlas en producción no está autorizado** | Presentar entorno exacto, respaldo verificable, plan, impacto, recuperación, pruebas posteriores y riesgos de reversión; pedir autorización específica | Cuando la titular lo autorice |

## Fase 5 · entrega 3 (talleres y eventos)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Venta de talleres pagos | Reserva de 15 minutos, pago simulado y pago tardío probados con el simulador | Pasarela real y política de reembolsos | Fase 6 |
| Reembolsos (incidencias «requiere reembolso» y «reembolso pendiente») | Se registran y se ven en el panel; nunca figuran como hechos | Ejecutarlos con la pasarela y cerrar la incidencia con su confirmación | Fase 6 |
| Envío real de correos (confirmación, recordatorios, reprogramación, cancelación) | Registrados como notificaciones pendientes; no se envía nada | Proveedor de correo transaccional | Fase 6 |
| Google Meet automático (proveedor oficial decidido por la maestra) | Enlace cargado a mano (adaptador manual) | Workspace (plan a decidir), cuenta y credenciales | Fase 6 (no autorizado todavía) |
| Ejecución programada de `/api/procesos` | Ruta lista con clave; probada en CI llamándola dos veces | Configurar Vercel Cron o pg_cron al definir el hosting | Con el hosting |
| Materiales descargables de talleres | No implementado (figuraba en el plan; no en el pedido de la entrega) | Tabla y subida privada, copia al duplicar | A definir |
| Avisos en «Hoy» (talleres sin enlace a 48 h, incidencias) | La lista de talleres y la página de incidencias los muestran | Tablero «Hoy» | Entrega 4 |
| Errores del proveedor de reuniones (reintentos) | Columnas de estado y error existen; sin proveedor no aplica | Reintentos y aviso urgente | Fase 6 |

## Adaptación de talleres (devolución de la maestra, 31/10/2026 · migración 0017)

Implementado y probado **solo en local y en CI**. Nada de lo siguiente está conectado a un servicio real.

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Política de reembolsos (por anticipación) | Sin definir. Las inscripciones pagas no se cancelan desde el campus: se indica escribir a la academia. No se calculan montos ni se ejecutan reembolsos | Aprobación de la política por la titular; luego, cancelación paga con montos | Fase 6 |
| Jurisdicción fiscal y facturación | Solo recibo comercial no fiscal | Definir jurisdicción y certificador | Fase 6 o posterior |
| Pasarela de pago | Simulador | Elegir y conectar la pasarela | Fase 6 |
| Cupones comerciales (invitaciones al 100 %) | El panel ya no crea cortesías; las históricas se conservan intactas | Cupones en el flujo de compra | Fase 6 |
| Google Workspace: Business Standard o Business Plus | **No decidido ni contratado.** Comparar con fuentes oficiales: precio mensual y anual, moneda, facturación, licencias mínimas; creación automática de Meet, grabación, grabación automática, almacenamiento; recuperación por API, informes de asistencia, datos de participantes; permisos OAuth, restricciones y cuotas; operación por una sola administradora; dependencia de Calendar y Drive. Costos presentados aparte del resto de la infraestructura | Comparación y autorización; no se crean suscripciones ni pruebas con cargos | Antes de la Fase 6 |
| Meet automático (creación de reuniones) | Enlace cargado a mano | Workspace + API de Meet | Fase 6 |
| Grabación automática | Solo el modelo de estados | Configuración de grabación automática en el espacio de Meet | Fase 6 |
| Recuperación de la grabación desde Drive | No implementada | Lectura con permisos restringidos de Drive/Meet | Fase 6 |
| Edición y revisión de la grabación (solo la maestra y sus materiales) | Estados, revisión con cuatro comprobaciones e historial; el contenido real no existe | Proceso de edición fuera de Albor; nunca se publica el original | Fase 6 |
| Alojamiento privado de videos | No contratado | Elegir proveedor (p. ej., Bunny Stream) y reproductor con vencimiento verificado en el servidor | Fase 6 |
| Venta de grabaciones | Condiciones guardadas (precio, duración o sin vencimiento) y función de acceso por compra, solo para el servidor; venta no habilitada | Pasarela y alojamiento | Fase 6 |
| Duraciones y precios de las grabaciones | No se inventaron: quedan «sin definir» hasta que la maestra los cargue | Valores de la maestra | Cuando ella los defina |
| Asistencia automática | Se marca a mano | Informes de asistencia (requieren Business Plus o superior) y estrategia de identidad | Fase 6 |
| Servicio de correo | Notificaciones registradas como pendientes; nada se envía | Proveedor transaccional | Fase 6 |
| Notificaciones reales | Avisos dentro del campus (con «leído»); los correos no salen | Envío y estados de entrega reales | Fase 6 |
| Textos legales de grabación y privacidad | No redactados | Aviso a participantes, consentimiento y condiciones de acceso | Antes de grabar talleres reales |
| Migraciones 0014 a 0017 en producción | Probadas en local y CI con reversión. **No autorizadas** | Plan con entorno, respaldo, impacto, recuperación y autorización específica | Cuando la titular lo autorice |
| MFA de la administradora | No implementado | Ver «Seguridad» | Antes del lanzamiento |
| Integraciones reales y sus pruebas | Ninguna integración verificada contra un servicio real | Pruebas con cuentas reales | Fase 6 |

## Jornada autónoma (01/11/2026, rama `desarrollo/jornada-autonoma`, migraciones 0018 a 0023)

Implementado y probado **solo en local y en CI**. Nada integrado a `main` ni aplicado en una base real.

| Pendiente | Estado | Qué falta | Quién decide |
| --- | --- | --- | --- |
| Rúbricas, consignas y actividades abiertas (texto o archivo) de la evaluación formativa | No implementado: no se inventaron. Hoy las actividades formativas son preguntas de opción, sin nota | Que la maestra defina las actividades; un tipo de entrega revisada por ella | Maestra |
| Recompra o renovación de un curso vencido | `crear_orden` responde `ya_tiene_acceso` | Definir la regla comercial | Maestra |
| Vencimiento de las concesiones (becas) | No vencen | Decidir si vencen | Maestra |
| Aviso previo al vencimiento | No implementado | Servicio de correo (Fase 6) y anticipación | Maestra |
| Unidad de la duración comercial | Meses calendario | Confirmar que no se prefieren semanas | Maestra |
| Pasarela de pago | Investigada: Recurrente o Lemon Squeezy (`docs/investigacion-proveedores.md`) | Decisión y confirmación de condiciones por escrito | Maestra |
| FEL y condición tributaria | Investigado; solo recibo no fiscal | Contador; decidir entre certificador o emisión manual | Maestra con contador |
| Workspace Standard o Plus | Comparado (asistencia automática solo en Plus) | Decisión; no se contrata nada sin autorización | Maestra |
| Presupuesto de Q500 | El conjunto mínimo queda en ≈ Q487 a Q562 al mes (detalle en la investigación) | Aceptar el límite o ampliarlo | Maestra |
| Presentación de la maestra | Editable, con la trayectoria informada; **no publicada** hasta su aprobación | Revisión y aprobación; foto real | Maestra |
| MFA de la administradora | **Implementado y probado en local y CI (Fase 6A)**; política apagada | Activar en producción (ver Fase 6A) | Titular |
| CSP (política de seguridad de contenidos) | **Implementada y probada en CI (Fase 6A)** | Primer despliegue en modo observación | Técnico |
| Error de hidratación de React (#418) visto una vez en las capturas públicas | Intermitente: apareció en 1 de 5 ejecuciones y no se reprodujo en las siguientes | Investigar la página que lo produce (el informe no la identifica) | Técnico |
| Migraciones 0014 a 0023 en producción | Probadas en local y CI, con reversión ensayada. **No autorizadas** | Plan de ejecución (`docs/estrategia-migracion.md`) y autorización específica | Titular |

## Fase 6B: preparación local del lanzamiento de cursos (03/11/2026 · migración 0028)

Implementado y probado **solo en local y en CI**, con simuladores. Ningún servicio real conectado.

| Pendiente | Estado | Qué falta | Quién decide |
| --- | --- | --- | --- |
| Video privado (Bunny) | Autorización en la base, adaptador y simulador con enlace temporal | Cuenta de Bunny, biblioteca privada, subir videos | Titular (contratación) |
| Correo transaccional | Cola, plantillas, procesador y simulador; confirmación de compra automática | Proveedor, dominio verificado, SMTP propio para Supabase Auth | Titular |
| Aviso previo al vencimiento | Implementado, no programado | Anticipación (días) | Maestra |
| Pasarela de pago | Interfaz, simulador y procesamiento verificado de avisos | Elegir Recurrente o Lemon Squeezy; condiciones por escrito; ruta pública de avisos al elegir | Titular |
| Facturación FEL | Diseño documentado; solo recibo no fiscal | Situación tributaria con contador, NIT, certificador, moneda | Titular con contador |
| Infraestructura | Entornos y validación de configuración; requisitos de despliegue | Hosting, Supabase de producción, dominio, gestor de contraseñas | Titular |
| Recuperación excepcional | Implementada (0027), **inactiva** | Seis pendientes en `docs/recuperacion-acceso.md` | Titular |
| Protección de `main` | Autorizada; no aplicable desde la sesión de trabajo | Aplicarla desde Settings › Branches | Titular |

## Fase 6A: seguridad y preparación técnica (02/11/2026 · migración 0026)

Implementado y probado **solo en local y en CI**. Nada integrado a `main`, nada aplicado en bases reales, ninguna cuenta real modificada.

| Pendiente | Estado | Qué falta | Quién decide |
| --- | --- | --- | --- |
| Encender la política de segundo factor en producción | Lista y probada; apagada | Migrar 0026 (autorización), habilitar TOTP en Supabase, factor principal y de respaldo de la maestra, `scripts/politica-mfa.sql` | Titular |
| Procedimiento de recuperación del segundo factor | **Aprobado** (maestra + responsable técnico + verificación independiente); implementado y probado (0027) | Designar responsable técnico, persona o autoridad independiente, sus usuarios de base de datos y los canales (tabla en `docs/recuperacion-acceso.md`); bloqueado hasta entonces | Titular |
| Cifrado en reposo de los secretos TOTP en Supabase | Gestionado por Supabase Auth | Confirmarlo en el proyecto real | Técnico |
| CSP en el despliegue | Aplicada en CI | Primer despliegue en modo observación (`CSP_MODO=observacion`) y luego aplicar | Técnico |
| Error de hidratación #418 (D14) | Investigado; ver `docs/fase6a-informe.md` | Seguir observando en CI con la ruta registrada | Técnico |
| Respaldos del entorno real | Procedimiento local probado | Plan del proveedor (Pro/PITR), copia del bucket, cifrado y retención | Titular (costos) |
| Migraciones 0014 a 0027 en producción | Ejecutor transaccional ensayado; reversión de 0026 y 0027 ensayada | Autorización; elegir registro (ejecutor o CLI de Supabase) | Titular |
| Protección de `main` | **Autorizada**; no aplicable desde la sesión de trabajo (sin herramienta para configurar ramas) | Aplicarla desde Settings › Branches con los pasos de `docs/proteccion-main.md` | Titular |
| D10 `seguimiento_curso` | Medido: 0,85 s con 5000 alumnas | Paginación si supera ~10 000 por curso | Técnico |
| Ayudantes E2E (D15) | Módulo compartido usado por el recorrido nuevo | Migrar los recorridos anteriores cuando se modifiquen | Técnico |
| El formulario de datos del curso vuelve a los valores guardados tras un error | Comportamiento previo de React 19 con acciones de formulario | Conservar lo escrito tras un error (mejora de interfaz) | Técnico |

## Seguridad requerida por la titular (30/10/2026)

| Requisito | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Trazabilidad completa de roles: fecha, cuenta afectada, rol anterior, rol nuevo y responsable (persona o servicio) | Parcial: el disparador registra alta y baja del rol admin con fecha, cuenta y autor; si lo ejecuta un script, el autor figura como "Sistema" | Exigir que el script identifique a la persona que lo ejecuta y rechazar cambios de rol sin responsable identificado | Antes del lanzamiento (Fase 7), o antes si se necesita una segunda cuenta admin |
| Autenticación multifactor (MFA) para la administradora | **Implementado (0026, Fase 6A)**, política apagada | Encenderla en producción | Requisito previo al lanzamiento comercial |
| Nueva verificación de identidad para operaciones muy sensibles | **Implementada (0026, Fase 6A)**: código del momento, ≤ 5 min, un solo uso | Activa con la política | Antes del lanzamiento |

## Decisiones tomadas por la titular (30/10/2026), a implementar

- **Eliminación definitiva de cuenta** (distinta de darse de baja de los correos): quita el acceso a cursos, evaluaciones y certificados; los certificados se revocan y la verificación pública deja de mostrarlos como vigentes y no muestra datos personales. Se conserva solo lo que la ley obligue (por ejemplo, registros de pago sin datos personales innecesarios). Entrega 4.
- **Reembolso confirmado** revoca automáticamente el acceso al curso; solicitado, pendiente o fallido no. Queda auditado. Antes de implementarlo se propondrá qué pasa con un certificado ya emitido para ese curso; no se revoca en silencio. Entregas 4 y 6.
- **Duplicar talleres**: copia título, descripción, materiales y configuración; permite cambiar fecha, horario, precio y cupo; no copia inscriptos, pagos, enlaces de reunión ni asistencia; la copia nace en borrador. Entrega 3.

## Lista de control permanente (pedido de la titular, 30/10/2026)

Ninguna de estas medidas se considera implementada hasta que exista una prueba que lo demuestre.

### Seguridad

| Medida | Estado | Prueba que la demostrará |
| --- | --- | --- |
| MFA obligatorio para la administradora antes del lanzamiento | **Implementado, apagado** | `recorrido-mfa.mjs`: sin segundo factor no hay panel ni API de admin |
| Nueva verificación de identidad para operaciones muy sensibles | **Implementada** | `recorrido-mfa.mjs` y `99k_mfa_reforzada.sql`: sesión antigua rechazada sin cambios |
| Responsable real de los cambios de rol, incluidos los hechos por scripts | **Implementado (0023)**: sin responsable se rechaza | `90_panel_base.sql` |
| Validación de permisos en todas las acciones nuevas del panel | Vigente para las 19 acciones actuales (prueba estática + 404 + SQL) | Cada entrega nueva amplía la prueba; falta invocar una acción directamente con sesión de alumna |
| Registro de auditoría de operaciones críticas | Vigente para cursos, temario, evaluaciones, talleres, roles, cupones, configuración | Cada operación crítica nueva suma su prueba SQL |

### Integraciones (ninguna activa; no se activan proveedores pagos ni credenciales de producción sin autorización)

| Integración | Estado |
| --- | --- |
| Validación real de Bunny Stream | Firma probada en prueba unitaria; sin cuenta real |
| Subida de videos desde el panel | No implementada (se pega el id) |
| Almacenamiento privado de PDF en el entorno definitivo | Probado en el Supabase local de CI; falta el proyecto real |
| Correo transaccional | Adaptador simulado |
| Cambio de correo y eliminación de cuenta | No implementados (decisión de la titular registrada arriba) |
| Pagos reales y reembolsos | Adaptador simulado; ventas cerradas |
| Facturación según la jurisdicción comercial (FEL en Guatemala) | Solo recibo comercial no fiscal |
| Videoconferencias automáticas (Zoom o Meet) | Adaptador manual |

## Correcciones D1–D7 y períodos de acceso (01/11/2026 · migración 0024)

**Implementado y probado solo en local y en CI**, con pagos simulados. No se aplicó en ninguna base real y no hay pasarela conectada.

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Botón de compra o renovación en el sitio | El campus muestra la oferta vigente; con las ventas cerradas dice «Las compras abren pronto» | Flujo de compra con la pasarela elegida | Fase 6, etapa 5 |
| Reembolsos parciales | **Decidido (B, 0025):** se registran, el acceso se mantiene y la incidencia queda pendiente de revisión; la admin registra su resolución por escrito, sin cambiar accesos | Política comercial y legal para reembolsos parciales (qué hacer con el acceso) | Cuando la titular la apruebe |
| Período revocado con otro encadenado después | **Decidido (A, 0025):** el posterior conserva sus fechas; el intervalo queda sin acceso | — | Hecho |
| Becas con inicio futuro sin acceso vigente | Se rechazan (`inicio_futuro`) para evitar fechas ambiguas | Programar becas a futuro, si la maestra lo necesita | A definir |
| Intentos adicionales de evaluación | No existe forma de otorgarlos; la renovación no los da | Regla académica de la maestra | A definir |
| Pasarela real: verificación de avisos y eventos de reembolso | Solo simulador | Recurrente no documenta públicamente los eventos de reembolso o contracargo ni cómo verificar la firma: hay que obtenerlo por escrito antes de elegir | Antes de la Fase 6, etapa 5 |
| Migración 0024 en una base real | Ensayada con datos históricos representativos, conciliación en cero y reversión exacta | Autorización específica; procedimiento en `docs/estrategia-migracion.md` | Cuando la titular lo autorice |

## Talleres: lanzamiento posterior (01/11/2026)

| Pendiente | Estado | Qué falta |
| --- | --- | --- |
| Talleres en el sitio | Ocultos al público y sin inscripciones nuevas (`talleres_publicos = false`). Módulo, datos y pruebas conservados | Autorización del lanzamiento de talleres; luego, activar el interruptor (hoy se activa solo por script, con registro de actividad) |
| Licencia de videoconferencia | No contratada ni incluida en el presupuesto de lanzamiento | Decidir al lanzar los talleres |

## Planes presentados y en espera de aprobación (30/10/2026)

- Versionado académico: **implementado** (31/10/2026, migraciones 0014 y 0015), aprobado condicionalmente por la titular. Vista previa de borradores y duplicación de cursos: aprobadas, sin implementar, como bloque aparte.
- Fase 5, entrega 3: talleres y eventos. **Implementada en local y en pruebas** (31/10/2026, migración 0016) y adaptada a la devolución de la maestra (migración 0017). No se aplicó en ninguna base real.
- Defecto detectado al planificar: un pago aprobado después del vencimiento de la reserva, sin lugar disponible, deja la orden pendiente sin aviso. Su corrección está prevista en la entrega 3.

## Decisiones de negocio abiertas

Pasarela de pago (Recurrente o Lemon Squeezy, sin elegir) · certificador FEL y condición tributaria (contador) · política de reembolsos · nombre comercial y dominio (en estudio; «Albor» es nombre de trabajo) · hosting y presupuesto (A o B, sin aprobar) · fotos y biografía reales de la maestra.
