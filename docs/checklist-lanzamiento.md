# Checklist técnico del lanzamiento inicial de cursos

Actualizado el 03/11/2026. **Lanzamiento de cursos únicamente**: los talleres y las videoconferencias se lanzan después. Nada de esta lista está activado ni contratado. Cada fila indica el estado real.

**Prioridad:** **O** = obligatorio antes del lanzamiento · **R** = recomendado · **P** = posponible.

**Estado:**
- **Hecho**: implementado y probado en local y CI.
- **Pendiente decisión**: falta una decisión de la titular o la maestra.
- **Pendiente contratación**: requiere autorización y gasto.

| # | Ítem | Prioridad | Estado | Qué falta |
| --- | --- | --- | --- | --- |
| 1 | Dominio definitivo | O | Pendiente decisión | Nombre comercial y compra («Albor» es nombre de trabajo) |
| 2 | Hosting (Next.js) | O | Pendiente contratación | Elegir proveedor y plan (`docs/presupuestos-proveedores.md`); `APP_ENTORNO=produccion`; `npm run configuracion` sin errores |
| 3 | Base de datos de producción (Supabase) | O | Pendiente contratación | Proyecto, región, plan con respaldos; SMTP propio para Auth; TOTP habilitado; bucket `materiales` privado |
| 4 | Migraciones 0014–0030 | O | Hecho en local y CI; no aplicadas | Autorización específica; respaldo verificado; `scripts/migrar.sh --registrar-existentes-hasta 0013`; conciliación |
| 5 | Segundo factor de la administradora | O | Implementado, política apagada | Registrar el factor principal y uno de respaldo; encender la política (`scripts/politica-mfa.sql`) |
| 6 | Recuperación administrativa | O | Implementada (0027), **inactiva** | Designar responsable técnico y aprobador independiente, canal de verificación, procedimiento de emergencia, prueba supervisada |
| 7 | Respaldos y restauración | O | Procedimiento local probado | Respaldos automáticos del proveedor, copia del bucket, cifrado y retención; un simulacro de restauración en producción |
| 8 | Videos privados (Bunny Stream) | O | Autorización en la base y simulador probados | Cuenta, biblioteca privada con *token authentication*, subir los videos reales |
| 9 | Correo transaccional | O | Cola, avisos y simulador probados | Proveedor; dominio verificado (SPF, DKIM, DMARC); SMTP de Supabase Auth para confirmación y recuperación |
| 10 | Pasarela de pago | O | Interfaz, simulador y verificación de avisos probados | Elegir Recurrente o Lemon Squeezy; confirmar por escrito firma de avisos, reembolsos y contracargos; ruta de avisos; prueba en el entorno de pruebas del proveedor |
| 11 | Facturación guatemalteca | O | Solo recibo no fiscal; diseño FEL | Situación tributaria con un contador (régimen, NIT, certificador, moneda, consumidor final) |
| 12 | Textos legales (términos, privacidad, reembolsos) | O | Páginas con texto editable | Redacción final revisada; política de reembolsos aprobada |
| 13 | Políticas comerciales | O | Duración comercial + 5 meses decidida; reembolsos parciales (decisión B) | Política de reembolsos (plazos, motivos); qué pasa con un certificado si se reembolsa |
| 14 | Cursos reales | O | Panel listo | La maestra carga los cursos: datos, temario, PDF, videos |
| 15 | Evaluaciones | O | Sumativa y formativa probadas | La maestra configura y revisa cada evaluación con la Vista previa |
| 16 | Certificados | O | Emisión, versión, verificación pública y descarga probadas | Tipografías definitivas (pendiente desde la Fase 4); revisar el diseño con un certificado real |
| 17 | Pruebas de compra y acceso | O | Probadas con el simulador | Repetirlas con la pasarela en su entorno de prueba y con una compra real de bajo monto, autorizada |
| 18 | Seguridad | O | RLS, aislamiento, MFA, verificación reforzada, CSP y auditoría probados | CSP en modo observación en el primer despliegue; revisar avisos; pasar a aplicar |
| 19 | Protección de `main` | O | Autorizada, no aplicada | La titular la aplica en Settings › Branches |
| 20 | Monitoreo | R | Registro de actividad; avisos `csp:` en el registro | Alertas de errores del servidor y de la tarea programada; revisar correos «fallido» |
| 21 | Tarea programada diaria (`/api/procesos`) | O | Ruta lista y probada | Configurarla con `PROCESOS_CLAVE` al contratar el hosting (vence reservas, registra avisos de vencimiento y procesa la cola de correos) |
| 22 | Gestor de contraseñas y custodia | O | Decidido en principio (la titular custodia) | Elegirlo y crear allí las cuentas reales |
| 23 | Aviso de privacidad y consentimiento de correos promocionales | R | Consentimiento registrado al registrarse | Revisión legal |
| 24 | Revocación de certificados | P | Sin definir | Decisión de la maestra |
| 25 | Eliminación de cuenta y cambio de correo automatizados | P | Por contacto con la academia | Flujo automatizado |
| 26 | Talleres y videoconferencias | P | Módulo listo, apagado (`talleres_publicos = false`) | Después del lanzamiento de cursos |

## Orden sugerido (cuando se autorice)

1. Decisiones: dominio, hosting, pasarela, contador y política de reembolsos.
2. Cuentas creadas por la titular en el gestor de contraseñas.
3. Entorno de pruebas real (Supabase y hosting de pruebas, sin datos personales): migraciones, MFA, Bunny y correo con cuentas reales en modo prueba.
4. Carga de cursos reales y revisión de la maestra.
5. Producción: respaldo, migraciones, configuración validada, CSP en observación, tarea programada.
6. Compra real de prueba autorizada, verificación de acceso, correo y recibo.
7. Apertura de ventas (`INSCRIPCIONES_ABIERTAS`), solo con autorización expresa.
