# Plan de lanzamiento por etapas: primero los cursos

Fecha: 01/11/2026. Propuesta para aprobar. **No autoriza gastos, integraciones reales ni despliegues.** Reordena la Fase 6 de `docs/plan-fase6.md` según la decisión de la titular: primero los cursos grabados, los talleres después.

**Leyenda:**

- **Hecho** = implementado y probado en local y CI.
- **Falta** = pendiente.
- **Decide** = necesita una decisión.

## Primera etapa: cursos

| Bloque | Estado hoy | Falta para lanzar | Depende de |
| --- | --- | --- | --- |
| Catálogo público | **Hecho**: fichas con precio, duración comercial + 5 meses, modalidad y certificado | Cargar los cursos reales con su duración y precio | Contenido de la maestra |
| Compra de cursos | **Hecho** con pasarela simulada: órdenes con la oferta congelada y órdenes desactualizadas que vencen | Adaptador de la pasarela elegida, avisos verificados, botón de compra en la ficha y en «Renovar» | **Decide:** pasarela (Recurrente o Lemon Squeezy) y respuestas del contador |
| Campus | **Hecho**: avance, versiones, vencidos aparte | — | — |
| Evaluaciones | **Hecho**: sumativa y formativa, revisión favorable | — | — |
| Certificados | **Hecho**: también con el acceso vencido; verificación pública | Tipografía definitiva (pendiente menor) | — |
| Vencimientos | **Hecho**: meses + 5 desde la confirmación, condiciones por compra | — | — |
| Renovaciones | **Hecho** (0024): período nuevo, encadenado si hay uno vigente, reembolso por período | Botón de compra real | Pasarela |
| Becas | **Hecho** (0024): desde el panel, con fechas, motivo y responsable | — | — |
| Videos privados | **Hecho**: firma de Bunny probada en pruebas unitarias | Cuenta real de Bunny y prueba con un video real | Autorización de gasto (Presupuesto A) |
| Correo transaccional | Notificaciones registradas, sin envío | Proveedor (Resend), dominio verificado (SPF, DKIM, DMARC), plantillas en «usted», correo de Supabase Auth | **Decide:** nombre y dominio |
| Gestión administrativa | **Hecho**: panel de cursos, alumnos, becas, incidencias, registro de actividad | Ventas: listado de órdenes y reembolsos con la pasarela | Pasarela |
| Seguridad | Rol verificado en cada solicitud, RLS, auditoría, encabezados | **Bloqueantes:**<br>• MFA real de la admin con recuperación;<br>• autorización reforzada en acciones sensibles (becas, reembolsos, precios, roles);<br>• avisos de pago verificados;<br>• secretos de producción.<br>**Recomendado:** CSP y error de hidratación | **Decide:** recuperación del MFA |
| Respaldo | — | Respaldo diario + externo semanal, restauración probada | Hosting |
| Migraciones | Ensayadas en local y CI | Procedimiento de `docs/estrategia-migracion.md`, autorizado | **Decide:** autorización |
| Facturación legal | Solo recibo comercial no fiscal | FEL manual o certificador, según el contador | **Decide:** contador |

**Orden sugerido para la primera etapa:**

1. Decisiones de la titular: contador, pasarela, nombre y dominio, presupuesto.
2. Infraestructura (hosting, base, dominio, respaldo) y migraciones con su procedimiento.
3. MFA y autorización reforzada.
4. Video real (Bunny) y correo real.
5. Pasarela en *sandbox*: avisos verificados, compra, renovación y reembolso por período.
6. Facturación definida.
7. Pruebas E2E integrales.
8. Ensayo general y lanzamiento.

**Criterio de lanzamiento:**

- los bloqueantes de seguridad cerrados;
- la pasarela probada en *sandbox* con verificación de avisos y eventos de reembolso;
- la restauración del respaldo probada;
- autorización escrita de la titular.

## Segunda etapa: talleres

Todo lo construido se conserva. El sitio no muestra talleres ni admite inscripciones nuevas (`talleres_publicos = false`) hasta su lanzamiento.

| Bloque | Estado hoy | Falta |
| --- | --- | --- |
| Zoom o Google Meet | Enlace manual; plataforma por taller ya modelada | Prueba con cuentas gratuitas; elegir **una** licencia; creación automática de reuniones (opcional) |
| Inscripciones pagas a eventos | **Hecho** con simulador: reserva de cupo, pago tardío, incidencias | La misma pasarela de la primera etapa |
| Recordatorios | Registrados, sin envío | El correo de la primera etapa |
| Grabaciones | Modelo y estados completos | Obtener la grabación (manual primero) y subirla a la biblioteca privada de Bunny |
| Asistencia | `marcar_asistencia` | — |
| Cupones | Estructura lista | Activar en el flujo de compra |
| Venta posterior de grabaciones | Condiciones y accesos modelados | Pasarela y publicación de grabaciones |
| Política de reembolsos de talleres | Sin definir | **Decide** la maestra |

**Para activar la segunda etapa:**

1. autorización de la titular;
2. licencia de videoconferencia, si hace falta;
3. activar el interruptor (hoy por script, queda en el registro de actividad);
4. recorrido E2E de talleres con el interruptor encendido.
