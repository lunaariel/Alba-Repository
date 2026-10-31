# Decisiones

Registro breve de decisiones técnicas. La fuente completa es el documento «Albor — Fase 2: arquitectura y base técnica».

| Fecha | Decisión | Motivo |
| --- | --- | --- |
| 2026-10-30 | Next.js (App Router) + TypeScript estricto + Tailwind 4 + Radix UI | Sitio, campus y panel en una sola aplicación; SEO en el sitio público |
| 2026-10-30 | Supabase: PostgreSQL, Auth y Storage; región este de EE. UU. | Permisos por fila (RLS) en la base; menor latencia probable desde Guatemala |
| 2026-10-30 | Toda tabla nace con RLS activado | Un error en la interfaz no puede abrir datos de otra persona |
| 2026-10-30 | Reglas críticas en funciones SQL ejecutables solo por el servidor | Acceso por pago, cupos, corrección y certificados no dependen del navegador |
| 2026-10-30 | Columnas `lecciones.video_id`, `opciones.es_correcta` y `reuniones.enlace_anfitrion` sin permiso de lectura para clientes | Ni siquiera alumnos con acceso pueden leerlas; el servidor firma URLs y corrige |
| 2026-10-30 | Importes en centavos de USD (enteros) | Sin errores de redondeo |
| 2026-10-30 | Reserva de cupo de 15 minutos con bloqueo de fila | Evita sobreventa con compras simultáneas |
| 2026-10-30 | El perfil se crea con un disparador al registrarse; sin confirmación de mayoría de edad no hay cuenta | La regla no depende del formulario |
| 2026-10-30 | Recibo comercial hasta conectar FEL | No se emiten documentos que parezcan factura fiscal sin certificador autorizado |
| 2026-10-30 | Ingreso con Google: pospuesto | Sin respuesta de la titular; se puede sumar sin migrar datos |
| 2026-10-30 | Integraciones (pagos, FEL, Zoom/Meet, video, correo) detrás de interfaces con adaptadores simulados | Se eligen en la Fase 6 según Guatemala |
| 2026-10-30 | Filtros del catálogo como enlaces (`?para=`), no botones | Funcionan sin JavaScript y se pueden compartir; ajuste respecto del prototipo B, que filtraba en memoria |
| 2026-10-30 | Venta apagada (`INSCRIPCIONES_ABIERTAS = false`) hasta la Fase 6 | Sin pasarela, FEL ni política de reembolsos aprobadas no se vende |
| 2026-10-30 | Recursos y biografía sin contenido real no se indexan; Recursos no aparece en el menú sin artículos | No mostrar secciones vacías ni marcadores a buscadores |
| 2026-10-30 | Artículos en Markdown reducido, dibujados como elementos de React | Ningún texto del panel puede inyectar HTML o scripts |
| 2026-10-30 | Contacto con campo trampa y límite de 5 mensajes por hora por hash de IP | Protección contra spam sin guardar IPs |
| 2026-10-30 | Páginas públicas renderizadas por solicitud (`force-dynamic`) | Los textos, cursos y cupos cambian desde el panel; la compilación no depende de la base. Si el tráfico lo pide, se agrega caché por datos |
| 2026-10-30 | Quien compró un curso lo sigue viendo aunque se archive (políticas `*_alumno` en 0011) | El acceso no vence |
| 2026-10-30 | La evaluación final se rinde y se lee solo con todas las lecciones completas | Coincide con la regla del certificado y evita adelantar preguntas |
| 2026-10-30 | Tras corregir, el alumno ve su puntaje y el mensaje, no qué preguntas falló | Con intentos ilimitados, mostrar aciertos por pregunta permitiría deducir las respuestas |
| 2026-10-30 | PDF del certificado generado en cada descarga desde el registro congelado (pdf-lib, fuentes estándar) | Regenerar no duplica; no hace falta guardar archivos. Las fuentes de marca (Fraunces) se pueden incrustar más adelante |
| 2026-10-30 | Verificación pública por código de 12 caracteres (`/verificar`) que muestra solo lo impreso en el certificado | Terceros comprueban sin ver otros datos |
| 2026-10-30 | Materiales: URL firmada de Storage de 5 minutos, después de que RLS confirma el acceso | Un enlace compartido deja de funcionar enseguida |
| 2026-10-30 | Video de lecciones: Bunny Stream con token del reproductor (2 horas); sin credenciales, aviso de "video pendiente" | El id del video nunca llega al navegador sin firma |
| 2026-10-30 | Cambio de contraseña pide la actual; cambio de correo y baja de cuenta por contacto | Evita cambios desde una sesión olvidada abierta; la baja necesita revisar compras y certificados |
| 2026-10-30 | Menú del encabezado en móvil como botón "Menú" (`<details>`) | Cinco enlaces no entran en una línea a 390 px; funciona sin JavaScript |
| 2026-10-30 | El panel responde "no encontrado" a quien no es admin, con o sin sesión, y no figura en robots.txt | No se anuncia que existe; la protección real sigue siendo el servidor y RLS |
| 2026-10-30 | Registro de actividad por disparadores en la base (migración 0012), no desde la interfaz | Ningún cambio se salta el registro, venga del panel, de un script o del servidor |
| 2026-10-30 | Solo se registran columnas que importan (precio, fechas, cupo, estado, respuestas correctas, roles, configuración) | Un registro legible, sin ruido por cada edición de texto |
| 2026-10-30 | Los roles no se asignan desde el panel, solo con `scripts/asignar-admin.sql` | Una sesión robada de la admin no puede crear otra admin |
| 2026-10-30 | Los cambios de esquema de cada sección llegan con su entrega (0013 en adelante), no todos en 0012 | Cada entrega se revisa con sus propios cambios |
| 2026-10-31 | Reglas de preservación del historial académico (`docs/preservacion-academica.md`): lo que tiene historial se retira, no se borra; lo retirado deja de contar hacia adelante | Editar un curso nunca altera avances, intentos, puntajes ni certificados ya obtenidos |
| 2026-10-31 | Lo retirado se oculta con RLS (sitio y campus), no en cada pantalla | Ninguna consulta nueva puede mostrar por error contenido retirado |
| 2026-10-31 | Las preguntas se guardan con sus opciones en una sola función (`guardar_pregunta`) | Nunca queda a medias una pregunta sin respuesta correcta |
| 2026-10-31 | La admin lee `es_correcta` y `video_id` por el servidor, después de `exigirAdmin()` | Esas columnas siguen sin ser legibles desde ningún navegador |
| 2026-10-31 | PDF subidos directo al almacenamiento con URL firmada; el servidor verifica tamaño y firma `%PDF-` antes de registrarlos | Archivos de hasta 25 MB sin pasar por el servidor de la aplicación (límite de Vercel 4,5 MB) |
| 2026-10-31 | Avisos tras una acción viajan como códigos (`?ok=retirado`), nunca como texto | Nadie puede hacer que el panel muestre un mensaje inventado con un enlace |
