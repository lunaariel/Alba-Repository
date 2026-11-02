# Respaldos y restauración

Fase 6A (02/11/2026). **Procedimiento local equivalente, probado solo con bases de prueba** (`tests/db/respaldo.sh`, en `npm run probar:db` y en CI). No se usó ninguna base real ni credencial de producción, y no se copió información personal real.

## Procedimiento

| Paso | Herramienta | Garantía |
| --- | --- | --- |
| 1. Respaldo | `scripts/respaldo.sh destino.dump` (`RESPALDO_URL`) | `pg_dump -Fc` de `public` y `auth` sobre una **instantánea exportada**: coherente aunque haya escrituras. Permisos 600. Se niega a guardar dentro del repositorio y a conectarse a hosts no locales |
| 2. Huella | `scripts/huella-base.sql` (dentro de la misma instantánea) | Filas y md5 por tabla en `destino.dump.huella`; sin datos, solo resúmenes |
| 3. Restauración | `scripts/restaurar.sh respaldo.dump base_nueva` (`RESTAURAR_SERVIDOR`) | Siempre en una **base nueva** (si existe, se niega); `pg_restore --single-transaction --exit-on-error`: completa o nada |
| 4. Verificación | Huella igual a la del respaldo | Mismos datos, tabla por tabla |
| 5. Conciliación | `scripts/conciliar-restauracion.sql` | Claves foráneas validadas y sin huérfanos; `conciliar_periodos()` en cero; órdenes aprobadas con pago aprobado; códigos de certificado únicos |
| 6. Copia para pruebas | `restaurar.sh … --anonimizar` (`scripts/anonimizar.sql`) | Correos, nombres, datos del perfil, mensajes de contacto y nombre en certificados reemplazados; vínculos académicos y comerciales intactos |

## Qué prueba el ensayo

Base de prueba con compra pagada, avance, evaluación aprobada, certificado, inscripción paga a un taller y un mensaje de contacto:

1. Respaldo mientras otra sesión escribe en la auditoría → la restauración coincide con la huella del instante del respaldo.
2. Certificado idéntico (código y nombre) y su verificación pública responde igual en la copia.
3. Períodos de acceso y órdenes conciliados.
4. Restaurar sobre una base existente: rechazado.
5. Respaldo dañado: rechazado, sin tablas a medias.
6. Copia anonimizada: sin correos ni nombres reales y con la conciliación en cero.

## Diferencias con el entorno real (pendiente al contratar)

| Tema | Local | Supabase real |
| --- | --- | --- |
| Respaldos automáticos | Script manual | Diarios en el plan Pro (7 días); recuperación a un punto en el tiempo (PITR) es un complemento pago. **No contratado** |
| Esquema `auth` | Imitación mínima en las pruebas | Lo gestiona Supabase; `supabase db dump` incluye roles y esquema. Las contraseñas se restauran como hashes |
| Archivos (PDF de materiales, certificados) | No se respaldan en este ensayo | Bucket `materiales`: requiere copia aparte (API de Storage o S3), no la cubre `pg_dump` |
| Cifrado del respaldo | Permisos 600 | Cifrar con `age` o `gpg` antes de guardarlo fuera de Supabase; definir dónde (decisión pendiente) |
| Retención | — | Definir (sugerido: 30 diarios + 12 mensuales) |

## Recuperación ante un desastre (borrador)

1. Detener escrituras (modo mantenimiento del hosting).
2. Restaurar el último respaldo en una base **nueva** y verificar huella y conciliación.
3. Restaurar archivos del bucket.
4. Apuntar la aplicación a la base nueva; conservar la anterior sin tocar para análisis.
5. Reconciliar pagos con la pasarela por el período entre el respaldo y el incidente.

Ninguno de estos pasos se ejecutó contra servicios reales.
