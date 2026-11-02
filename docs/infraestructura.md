# Infraestructura y configuración por entorno

Fase 6B, preparación local (03/11/2026). **No se creó infraestructura real, no se contrató hosting y no se crearon
credenciales reales.** Este documento prepara lo necesario para un despliegue futuro autorizado.

## Entornos

| Entorno (`APP_ENTORNO`) | Dónde | Base | Proveedores | Datos |
| --- | --- | --- | --- | --- |
| `desarrollo` | Computadora local | Supabase local (Docker) | Simuladores | De ejemplo |
| `pruebas` | CI de GitHub o copia efímera | Supabase local efímero de CI | Simuladores (video simulado en CI) | De ejemplo; nunca reales |
| `produccion` | Hosting a contratar | Proyecto Supabase real | Solo reales (Bunny, correo y pasarela autorizados) | Reales |

Cada entorno tiene **sus propias** claves: nunca se reutiliza una clave de producción en desarrollo o pruebas, ni al revés.

## Validación de la configuración

- `src/config/validacion.ts` define las reglas. Los mensajes nombran variables, **nunca muestran valores**.
- `instrumentation.ts`: al arrancar en `produccion`, una configuración incompleta o insegura **detiene el servidor** con la lista de variables a corregir. En `desarrollo` y `pruebas` informa y sigue.
- `npm run configuracion` (o `npm run configuracion -- archivo.env`): la misma comprobación, para revisar antes de desplegar.

| Regla | Desarrollo / pruebas | Producción |
| --- | --- | --- |
| Supabase (URL, clave anónima, clave de servicio) y URL del sitio | Obligatorias | Obligatorias, `https://`, no locales |
| Clave de servicio en una variable `NEXT_PUBLIC_` (o la anónima reemplazada por la de servicio) | Error | Error |
| Variables públicas con nombre de secreto | Error | Error |
| Simuladores de video, correo o pagos | Permitidos (aviso) | **Error** |
| Video | `bunny`, `simulado` o `ninguno` | Solo `bunny`, con sus dos variables |
| `PROCESOS_CLAVE`, `CONTACTO_SAL` | Opcionales (mín. 24 si se definen) | Obligatorias, ≥ 24 caracteres, sin valores de ejemplo |
| `CSP_MODO` | Libre | Aviso si no es `observacion` (recomendado para el primer despliegue) |

## Secretos

| Secreto | Uso | Dónde vive en producción |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones del servidor ya autorizadas | Variables del hosting (servidor), nunca en el navegador |
| `PROCESOS_CLAVE` | Autoriza las tareas programadas | Variables del hosting y de la tarea programada |
| `BUNNY_CLAVE_TOKEN` | Firma los enlaces de video | Variables del hosting |
| Clave del proveedor de correo, secreto de la pasarela | Futuro | Variables del hosting |
| Credencial de dueño de la base | Migraciones y recuperación | Gestor de contraseñas bajo custodia de la titular |

Reglas:
- Ningún secreto en Git (`.gitignore` excluye `.env*`, salvo `.env.example`, que solo tiene nombres).
- Nunca se comparten por mensajes.
- No van en archivos de prueba: las pruebas usan valores de ejemplo propios de CI.
- La validación impide secretos con prefijo `NEXT_PUBLIC_`.
- Las pruebas comprueban que no aparecen en páginas ni registros.

## Custodia de credenciales (decisión de la titular, 03/11/2026)

- La **titular** conserva la custodia institucional de las cuentas y credenciales principales: hosting, Supabase, dominio, Bunny, correo, pasarela y GitHub.
- Los accesos técnicos son **individuales** cuando el proveedor lo permite: cada persona usa su propio usuario, con permisos acotados, que se puede revocar sin cambiar la cuenta principal.
- Se usará un **gestor de contraseñas** apropiado cuando se creen las cuentas reales. El proveedor está pendiente de elección; preferir uno que permita compartir con otra persona sin revelar la contraseña.
- Ninguna persona técnica tiene control exclusivo e irrecuperable de la infraestructura. La titular debe poder entrar a todas las cuentas sin depender de nadie.
- **No se crearon ni distribuyeron credenciales reales en esta etapa.**

## Respaldos y restauración

Procedimientos implementados y probados en local: `docs/respaldos.md` (`scripts/respaldo.sh`, `scripts/restaurar.sh`) y `docs/estrategia-migracion.md` (`scripts/migrar.sh`). En producción se suman los respaldos del proveedor (plan pago) y la copia del almacenamiento de archivos.

## Lista de requisitos para un despliegue futuro (nada de esto está hecho ni autorizado)

1. Autorización de la titular para contratar hosting, Supabase de producción y dominio (costos en `docs/presupuestos-proveedores.md`).
2. Cuentas creadas por la titular, con su correo institucional y el gestor de contraseñas.
3. Proyecto Supabase de producción: región, TOTP habilitado, SMTP propio para los correos de Auth, bucket `materiales` privado.
4. Migraciones 0014 a 0028 con `scripts/migrar.sh --registrar-existentes-hasta 0013`, después de un respaldo verificado (autorización específica).
5. Variables de producción cargadas en el hosting y `npm run configuracion` sin errores.
6. `CSP_MODO=observacion` en el primer despliegue; revisar los avisos `csp:` y pasar a `aplicar`.
7. Tarea programada para `/api/procesos` con `PROCESOS_CLAVE`.
8. Política de segundo factor encendida (`scripts/politica-mfa.sql`), con el factor principal y el de respaldo de la maestra ya registrados.
9. Recuperación excepcional: designaciones y prueba supervisada (`docs/recuperacion-acceso.md`).
10. Protección de `main` aplicada (`docs/proteccion-main.md`).
11. Respaldos automáticos del proveedor y copia del bucket.
12. Proveedores reales autorizados (video, correo, pasarela) y, para vender, la decisión fiscal y la política de reembolsos.
