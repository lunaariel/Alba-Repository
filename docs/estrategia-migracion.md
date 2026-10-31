# Estrategia de migración a una base real

**Ninguna migración posterior a la 0013 se aplicó a una base real.** Este documento prepara el plan; ejecutarlo requiere la autorización específica de la titular.

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

Ensayos automáticos: `tests/db/migracion_0014.sh` y `tests/db/reversion_posteriores.sh` (0015 a 0023). Comprueban que los datos previos quedan idénticos, que las migraciones se pueden volver a aplicar y que la reversión se niega cuando perdería información.

## Plan propuesto (a autorizar)

1. **Entorno exacto.** Proyecto de Supabase, región y versión de Postgres; confirmar que no hay escrituras en curso.
2. **Respaldo verificable.** Volcado completo y respaldo del proveedor; restaurarlo en una base temporal y comparar los conteos.
3. **Ensayo sobre una copia.** Restaurar el respaldo en un proyecto de pruebas, aplicar de 0014 a 0023 en orden y correr la conciliación (`select public.conciliar_versionado();`) y las pruebas.
4. **Ventana de mantenimiento.** Ventas cerradas (ya lo están) y aviso en el campus.
5. **Aplicación en orden**, de a una migración, verificando cada paso.
6. **Pruebas posteriores.** Recorridos del campus y del panel con cuentas de prueba; verificación de certificados; conteos.
7. **Recuperación.** Las reversiones en orden inverso solo son posibles mientras no haya datos nuevos. Después, la recuperación es restaurar el respaldo del paso 2.

## Riesgos

- 0014 asigna versiones a todos los accesos: la conciliación debe dar cero antes de seguir.
- 0019 exige una duración comercial para vender: hay que cargarla en cada curso antes de abrir las ventas.
- 0023 exige un responsable para dar roles de admin: hay que actualizar el procedimiento interno (`scripts/asignar-admin.sql`, variable `responsable`).
