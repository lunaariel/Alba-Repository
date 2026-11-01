# Auditoría de la rama `desarrollo/jornada-autonoma` frente a `main`

Fecha: 01/11/2026. Rama en `6336122`; `main` en `c11a247`. Auditoría de código, base de datos y pruebas.

**Se basa en:**

- lectura del diff completo;
- pruebas locales de base de datos y unitarias, más la integración continua: 461 comprobaciones E2E en verde;
- consultas SQL dirigidas a buscar fallas que las pruebas existentes no cubren.

**No se corrigió nada en esta auditoría:** las correcciones quedan propuestas.

## Resultado

**Apta para integrar con correcciones menores**, condicionada.

No se encontró ningún defecto que comprometa datos, seguridad o resultados académicos con el sistema tal como funciona hoy, es decir, con las ventas cerradas y sin pasarela real.

Hay dos defectos de flujo comercial (D1 y D2) que **sí serían críticos con ventas reales**. No afectan a esta integración porque ese flujo todavía no opera. Se corrigen con el diseño de renovaciones de `docs/renovaciones-becas.md` y son condición para abrir las ventas, no para integrar.

## Los 14 puntos

| # | Punto | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Diferencias | 8 commits, migraciones 0018 a 0023, panel, campus, documentos y pruebas. Sin cambios fuera del alcance de los bloques A a H | `git diff main..HEAD --stat` |
| 2 | Migraciones 0018 a 0023 | Correctas y ensayadas, con reversión que se niega si perdería datos. **No son idempotentes** (crean columnas y disparadores sin `if not exists`): una aplicación parcial deja la base a medias | `tests/db/reversion_posteriores.sh` |
| 3 | Dependencias nuevas | Ninguna (`package.json` sin cambios) | diff |
| 4 | Compatibilidad con migraciones anteriores | Correcta. **Una excepción:** una orden de curso **pendiente** creada antes de 0019 y pagada después da acceso **sin vencimiento** (`compra_sin_condiciones`), y `crear_orden` reutiliza esas órdenes pendientes | Lectura de `fijar_vencimiento_acceso` y `crear_orden` |
| 5 | Seguridad de acciones admin | Cada página y acción verifica el rol en el servidor; la base lo vuelve a verificar. Con la sesión de una alumna o sin sesión, las solicitudes reenviadas fallan. **El MFA no está activo** (sección Seguridad) | `acciones-sensibles.mjs`, prueba unitaria de páginas del panel |
| 6 | RLS y permisos | Todas las tablas con RLS. Funciones expuestas en lista cerrada; `respuestas_intento.correcta` revocada | `99h_permisos.sql` |
| 7 | Versiones académicas | Inmutables; el cambio de versión es voluntario y auditado; la duplicación de cursos no copia versiones ni alumnas | `97`–`99e` |
| 8 | Evaluaciones y certificados | Formativa y sumativa correctas; certificado idempotente por versión; los datos del PDF quedan congelados | `99c`, `recorrido-evaluaciones.mjs` |
| 9 | Condiciones y vencimientos | Correctos para la **primera** compra. **Defectos D1 a D3** en la segunda compra (renovación) | SQL dirigido (abajo) |
| 10 | Reservas y talleres | Plazo por inscripción, copiado e inmutable; los cupos no cambiaron | `99f`, `recorrido-talleres.mjs` |
| 11 | Regresiones | Ninguna detectada: todos los recorridos anteriores siguen en verde | CI |
| 12 | Código duplicado | Ayudantes E2E repetidos en cada `scripts/recorrido-*.mjs` (`sesion`, `comprobar`, `sinDesborde`). Sin duplicación relevante en la aplicación | Lectura |
| 13 | Manejo de errores | Errores de base traducidos a mensajes en español; 404 sin detalles. Un caso sin mensaje propio: el error de clave duplicada de `conceder_acceso` (D3) | Lectura |
| 14 | Escritorio y celular | Capturas en 1440 y 390 px sin desborde horizontal en las pantallas nuevas | Capturas de CI |

## Defectos y riesgos

### Críticos con ventas reales (no bloquean la integración)

**D1. El pago de una renovación se ignora sin aviso.**

- `procesar_evento_pago` inserta el acceso con `on conflict … do nothing`. Si la persona ya tiene una fila de acceso activa, aunque esté vencida, el pago queda aprobado y no se le da nada. Ningún aviso lo registra.
- Hoy no es alcanzable, porque `crear_orden` lo impide (D2). Lo sería si se habilitara la recompra sin corregir esto.
- Verificado por SQL.

**D2. La renovación está bloqueada y la orden pendiente queda desactualizada.**

- `crear_orden` responde `ya_tiene_acceso` también cuando el acceso está vencido. La alumna no puede volver a comprar.
- Además, reutiliza una orden de curso pendiente con el precio y las condiciones del momento en que se creó. Verificado: una orden con USD 49 y 8 meses se mantuvo después de cambiar el curso a USD 99 y 11 meses.

### Menores (corregir antes de abrir las ventas o en la Fase 6)

| ID | Defecto | Propuesta |
| --- | --- | --- |
| D3 | `conceder_acceso` sobre un acceso vencido falla con un error de clave duplicada (`accesos_unico_activo`) | Resolverlo con los períodos de acceso (becas) |
| D4 | Un reembolso o contracargo revoca **toda** la fila de acceso, aunque corresponda a una sola compra de varias | Revocar solo el período de esa compra (diseño de renovaciones) |
| D5 | Orden pendiente anterior a 0019 → acceso sin vencimiento (punto 4) | En el procedimiento de migración: anular las órdenes de curso pendientes antes de aplicar 0019 |
| D6 | Certificado obtenido antes de vencer: el PDF sigue disponible por su enlace, pero el campus no ofrece el botón con el acceso vencido (`cursoCampus` devuelve nulo) | Listar los certificados emitidos en «Mis cursos» aunque el acceso haya vencido |
| D7 | `cambiar_version` no verifica el vencimiento en la base; solo lo hace la interfaz | Agregar la verificación en la función |
| D8 | Sin límite de frecuencia en los envíos formativos | Límite por persona y minuto en la acción |
| D9 | La alumna puede leer por la API el puntaje interno de su propio envío formativo | Ocultar la columna si la maestra lo prefiere (ya registrado en Seguridad) |
| D10 | `seguimiento_curso` calcula el estado de cada alumna con subconsultas por fila | Medir con datos reales; agregar índices si hace falta |
| D11 | Formulario de criterios: la nota se basa en la configuración guardada, no en la que se está editando, y hay un campo obligatorio dentro de un bloque oculto | Ajuste de interfaz |
| D12 | 0023 exige `albor.responsable` también cuando se borra una admin en cascada (por ejemplo, al eliminar su usuario) | Documentar el procedimiento o admitir la baja en cascada con responsable del sistema |
| D13 | Migraciones no idempotentes | Aplicarlas con `psql --single-transaction` de a una (procedimiento de migración) |
| D14 | Error de hidratación #418 intermitente, de origen no identificado | Investigar antes del lanzamiento (Seguridad) |
| D15 | Ayudantes E2E duplicados | Extraer a `scripts/lib/recorrido.mjs` cuando se toquen los recorridos |

## Recomendación sobre `main`

Integrar **después de autorización**, sin correcciones previas obligatorias: ninguno de los defectos es alcanzable con las ventas cerradas.

Condiciones:

1. registrar D1 a D5 como requisito para abrir las ventas;
2. no aplicar ninguna migración a una base real hasta autorizar el procedimiento.

Si se prefiere integrar con la menor deuda posible, D6 y D7 se resuelven en una hora cada uno, sin cambios estructurales, y podrían ir en la misma rama antes de integrar.
