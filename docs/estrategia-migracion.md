# Estrategia de migración a una base real

**Ninguna migración posterior a la 0013 se aplicó a una base real.** Este documento prepara el procedimiento. Ejecutarlo requiere la autorización expresa de la titular.

## Migraciones pendientes de autorización

| N.º | Contenido | Datos existentes | Reversión |
| --- | --- | --- | --- |
| 0014 | Versionado académico | Crea la versión 1 de cada curso publicado; conciliación automática | Ensayada; se niega con una versión 2 |
| 0015 | Ajustes del versionado | Completa objetivos y requisitos de las versiones | Ensayada |
| 0016 | Gestión de talleres | Clasifica las inscripciones existentes (`compra`) | Ensayada; se niega con incidencias |
| 0017 | Adaptación de talleres | Grabaciones previstas para los talleres existentes | Ensayada; se niega con datos nuevos |
| 0018 | Modalidad de evaluación | Versiones y certificados existentes quedan como sumativos; no cambia ningún resultado | Ensayada; se niega con datos formativos |
| 0019 | Vencimientos | Accesos existentes sin vencimiento (no retroactivo) | Ensayada; se niega con condiciones o vencimientos |
| 0020 | Duplicar curso, descartar revisiones | Ninguno | Ensayada; se niega con revisiones descartadas |
| 0021 | Plazo de cancelación por taller | Inscripciones existentes con 24 h (el plazo vigente) | Ensayada; se niega con plazos distintos de 24 h |
| 0022 | Área laboral y estudios | Ninguno | Ensayada; se niega con datos cargados |
| 0023 | Responsable de roles, permisos | Ninguno; no quita roles | Ensayada |
| 0024 | Períodos de acceso, becas, talleres no ofrecidos | Un período histórico por acceso, con sus mismas fechas y condiciones. Órdenes de curso pendientes sin condiciones: vencidas con incidencia. Talleres apagados para el público | Ensayada sobre datos representativos; exacta (incluida la orden clasificada); se niega después de cualquier uso |
| 0025 | Renovaciones futuras (acceso por cobertura) y reembolsos parciales a revisión | Ninguno: con datos sin intervalos, el acceso calculado es el mismo (verificado) | Ensayada; se niega si ya hay reembolsos parciales registrados o resueltos |

**Ensayos automáticos:**

- `tests/db/migracion_0014.sh`;
- `tests/db/reversion_posteriores.sh` (0015 a 0025);
- `tests/db/migracion_0024.sh` (datos históricos, conciliación y negativa; también 0025).

Comprueban que los datos previos quedan idénticos, que las migraciones se pueden volver a aplicar después de revertir y que la reversión se niega cuando perdería información.

## Dependencias y orden

Orden obligatorio: **0014 → 0015 → … → 0025**, de a una.

- 0015 a 0019 dependen de las versiones de 0014.
- 0018 redefine funciones de 0014 y 0016.
- 0019 usa `crear_orden` y los ítems de 0005 y 0008.
- 0021 depende de los talleres de 0016 y 0017.
- 0023 depende del panel de 0012.
- 0024 depende de 0019 (condiciones y vencimientos), 0016 y 0017 (incidencias y talleres) y 0014 (versiones).
- 0025 depende de 0024 (períodos) y redefine funciones de 0019 y 0024.

## Estrategia transaccional

- **Las migraciones no son idempotentes**: crean tablas, columnas y disparadores. Cada archivo se aplica con `psql -v ON_ERROR_STOP=1 --single-transaction -f <archivo>`. Si algo falla, ese archivo no deja nada a medias.
- **Después de cada archivo** se registra su verificación antes de pasar al siguiente. No se encadena todo en una sola transacción, para poder detenerse en un punto conocido.
- **0024 verifica su propia conciliación al final**: si un acceso no coincide con sus períodos, aborta (`conciliacion_fallida`) y no aplica nada.

## Procedimiento (no ejecutar sin autorización)

1. **Identificar el entorno.** Proyecto, región, versión de Postgres y últimas migraciones aplicadas (`supabase_migrations.schema_migrations`).
   - *Verificación:* la última aplicada es 0013.
2. **Congelar.** Ventas cerradas (ya lo están), aviso en el campus, sin escrituras de la admin.
   - *Verificación:* no hay órdenes pendientes recientes ni sesiones admin activas.
3. **Respaldar.**
   - `pg_dump` completo en formato personalizado, con su suma SHA-256.
   - Punto de respaldo del proveedor.
   - *Verificación:* restaurar en una base temporal y comparar los conteos por tabla.
4. **Registrar la línea de base.**
   - Conteos por tabla y suma de `items_orden.precio_centavos`.
   - Certificados; accesos por estado.
   - Órdenes de curso pendientes con y sin condiciones (las segundas serán clasificadas por 0024).
5. **Ensayar en una copia.** Restaurar el respaldo en un proyecto de prueba y aplicar 0014 a 0025 con `--single-transaction`. Después:
   - `select public.conciliar_versionado();`, tras 0014;
   - `select count(*) from public.conciliar_periodos();`, tras 0024, que debe dar 0;
   - las pruebas SQL adaptadas a esos datos;
   - los recorridos E2E con cuentas de prueba.
   - *Verificación:* todo en verde y conteos coherentes. **Si algo falla, se detiene y se informa.**
6. **Ventana de producción**, solo con autorización escrita. Se aplica de a un archivo y, después de cada uno:
   - conteos;
   - conciliación (desde 0014 y desde 0024);
   - `select` de muestra.
7. **Verificación final.**
   - Recorridos con cuentas de prueba.
   - Descarga de un certificado anterior y verificación pública.
   - Comparación con la línea de base.
   - Revisión de las incidencias `orden_sin_condiciones` creadas por 0024.
   - Confirmar que `talleres_publicos` está apagado, salvo autorización de lanzamiento.
8. **Plan de vuelta atrás.**
   - **Si falla durante la ventana:** las reversiones en orden inverso son válidas mientras no haya datos nuevos (cada script se niega con `reversion_imposible` si los hay).
   - **Si hay dudas después de abrir:** se restaura el respaldo del paso 3 y se comunica.

## Riesgos

- 0014 asigna versiones a todos los accesos: la conciliación debe dar cero antes de seguir.
- 0019 exige una duración comercial para vender: hay que cargarla en cada curso antes de abrir las ventas.
- 0023 exige un responsable para dar roles de admin: hay que actualizar el procedimiento interno (`scripts/asignar-admin.sql`, variable `responsable`).
- 0024 da por vencidas las órdenes de curso pendientes sin condiciones. Si alguien pagara una después, no recibe acceso: queda una incidencia para que la admin decida (reembolso o beca).
- 0024 apaga los talleres en el sitio. Las inscripciones existentes no cambian, pero nadie puede inscribirse hasta que se autorice el lanzamiento.
