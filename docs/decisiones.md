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
