# Pruebas de los períodos de acceso (migración 0024)

Fecha: 01/11/2026. Todas corren en local y en CI, con pagos simulados. Ninguna toca un servicio real.

## Dónde están

- `tests/db/99i_periodos_acceso.sql`: casos de base de datos, con pruebas negativas y controles directos.
- `tests/db/concurrencia.sh`: dos pagos simultáneos y el mismo aviso dos veces a la vez.
- `tests/db/migracion_0024.sh`: ensayo sobre datos históricos representativos, conciliación, reversión y negativa.
- `tests/db/reversion_posteriores.sh`: 0024 dentro de la secuencia 0015 a 0024. Datos idénticos tras revertir.
- `tests/db/99d_vencimientos.sql`, `99h_permisos.sql`: actualizados (abajo).
- `tests/unit/periodos.test.ts`: fechas de beca en hora de Guatemala y qué se revoca desde el panel.
- `scripts/recorrido-renovaciones.mjs` (E2E, CI):
  - renovación;
  - certificado con el acceso vencido;
  - becas en el panel;
  - reenvío de la acción como alumna y como visitante;
  - API;
  - talleres apagados;
  - celular.

## Los 20 casos pedidos

| # | Caso | Prueba |
| --- | --- | --- |
| 1 | Recompra de curso vencido | 99i: misma inscripción y versión, período nuevo desde la confirmación, precio y condiciones vigentes. E2E: oferta en el campus y renovación simulada |
| 2 | Recompra con acceso vigente | 99i: `ya_tiene_acceso`. Pago tardío con un período vigente: encadenado e incidencia |
| 3 | Reprocesamiento del mismo pago | 99i: `duplicado` y `ignorado: ya_aprobada`, sin períodos de más. Concurrencia: el mismo aviso dos veces a la vez da un solo período |
| 4 | Pago confirmado con error temporal al otorgar | 99i: falla simulada con un disparador de prueba. Pago y orden registrados, sin acceso a medias, incidencia con el error |
| 5 | Recuperación de incidencias | 99i: reintento automático por un nuevo aviso. Reintento de la admin, que informa si vuelve a fallar. La alumna no puede reintentar |
| 6 | Órdenes con precios antiguos | 99i: doble clic reutiliza; con el precio cambiado la orden vence con su motivo; un importe distinto se rechaza; el pago tardío respeta el precio aceptado |
| 7 | Órdenes antiguas sin condiciones | 99i: no se reutilizan; su pago no da acceso e incidencia; inserción directa rechazada. Ensayo de migración: la orden pendiente se clasifica con incidencia |
| 8 | Becas sobre accesos vencidos | 99i: misma inscripción, nuevo vencimiento, sin órdenes ni recibos, auditada. Validaciones: sin rol, motivo, responsable, fin y «sin vencimiento», fin pasado, inicio futuro. E2E: formulario del panel |
| 9 | Becas sin vencimiento | 99i: regla registrada; revocarla deja la inscripción revocada con historial; no se revoca dos veces; una compra no se revoca como beca |
| 10 | Reembolso de una compra entre varias | 99i: solo ese período, el acceso vuelve al fin de la otra compra, cada orden con su estado. Reembolso parcial: no revoca, incidencia |
| 11 | Reembolso con una beca vigente | 99i: el acceso sigue por la beca; el avance se conserva |
| 12 | Preservación de certificados | 99i: renovación y reembolso no duplican ni borran certificados; verificación pública vigente |
| 13 | Consulta de certificados con acceso vencido | 99d y 99i: RLS y verificación pública. E2E: «Obtener mi certificado», descarga del PDF (200) y verificación pública con el acceso vencido |
| 14 | Cambio de versión con acceso vencido | 99i: la base responde `acceso_vencido` aunque la solicitud se arme a mano |
| 15 | Cambio de versión después de renovar | 99i: el cambio voluntario funciona y no toca el vencimiento |
| 16 | Concurrencia en compras y renovaciones | `concurrencia.sh`: dos pagos simultáneos dan una inscripción, dos períodos contiguos, sin fallas y una incidencia. El mismo aviso dos veces a la vez da un período |
| 17 | Permisos administrativos | 99h: listas cerradas de funciones y política de solo lectura de la admin. 99i: alumna sin `otorgar_beca`, `revocar_beca`, `reintentar_otorgamiento` ni `buscar_perfil_por_correo`; sin ejecutar el núcleo ni escribir períodos. E2E: la acción de becas reenviada con la sesión de la alumna y sin sesión responde 404 y no crea nada; la API rechaza las funciones |
| 18 | Restricciones de acceso entre alumnos | 99i: no lee períodos ni accesos ajenos; la oferta es la propia; un visitante no consulta ofertas. E2E: la API con el token de la alumna no lee períodos |
| 19 | Regresión de cursos y talleres | Toda la batería anterior sin cambios (SQL, unitarias, E2E). Talleres con el interruptor encendido en las pruebas existentes; 99i y E2E prueban el estado apagado |
| 20 | Migración y conciliación de datos históricos | `migracion_0024.sh` sobre compra con condiciones, compra antigua sin condiciones, concesión, compra reembolsada, compra vencida, avance, intentos y certificado. Verifica:<br>• conciliación en cero;<br>• un período fiel por acceso;<br>• sin vencimientos retroactivos;<br>• accesos intactos;<br>• reversión exacta, reaplicación, renovación sobre datos históricos y reversión negada tras usarla. |

## Pruebas existentes que cambiaron (y por qué)

- **`99d_vencimientos.sql`**: afirmaba que la recompra tras vencer se rechazaba («pendiente de decisión»). Ahora la titular decidió permitirla. La prueba comprueba que se ofrece la condición vigente (6 + 5 meses) y que crear la orden no cambia el acceso vencido. No se debilitó: cambió la regla decidida.
- **`99h_permisos.sql`**: se agregaron explícitamente a las listas cerradas las funciones nuevas:
  - de sesión: `oferta_curso`, `otorgar_beca`, `revocar_beca`, `reintentar_otorgamiento`, `buscar_perfil_por_correo`;
  - de servidor: el núcleo de períodos.
  
  Además, comprueba que `periodos_acceso` no tenga escritura de clientes.
- **`00_ayudas.sql` y `tests/visual/demo.sql`**: encienden `talleres_publicos` para que las pruebas y capturas de talleres sigan funcionando. El valor por defecto de la migración es apagado.
- **`recorrido-vencimientos.mjs`**: la simulación del paso del tiempo mueve juntos el acceso y sus períodos, para que la conciliación siga en cero.
