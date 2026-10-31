# Accesos a los cursos y vencimientos

Vigente desde la migración 0019 (Jornada autónoma, 01/11/2026). **Implementado y probado en local y en CI con pagos simulados; no aplicado en ninguna base real.**

## Regla comercial (decisión de la maestra)

**Acceso = duración comercial del curso + 5 meses adicionales, contados desde la compra.**

- La **duración comercial** se configura por curso, en meses calendario (1 a 60), en *Datos y precio*. No es la suma de minutos de las lecciones: eso es la «duración del contenido» (horas), que se muestra aparte.
- Los **5 meses adicionales** son un valor único del sistema (`meses_adicionales_acceso()`).
- **Inicio del derecho**: el momento en que el pago queda confirmado, también cuando el pago llega tarde (`accesos_curso.inicia_en`).
- **Vencimiento**: lo calcula el servidor (`calcular_vencimiento`). Es el mismo día y hora de Guatemala N meses después; si ese día no existe, es el último día del mes (31/01 + 1 mes = 28/02, o 29 en año bisiesto).

## Condiciones conservadas por compra

1. Al crear la orden, cada ítem de curso copia sus condiciones (`items_orden.condiciones_acceso`: duración, meses adicionales, total, zona). Son las que la persona vio antes de pagar.
2. Al confirmarse el pago, el acceso copia esas condiciones (`accesos_curso.condiciones`) y fija `vence_en`.
3. Cambiar la duración comercial después vale solo para compras futuras. Ni el ítem ni el acceso se pueden reescribir: los disparadores devuelven `condiciones_inmutables` y `vencimiento_inmutable`. El cambio de duración queda en el registro de actividad.
4. Sin duración comercial definida, el curso **no se puede comprar** (`curso_sin_condiciones`). Se puede publicar, pero el panel avisa.

## Lo que no vence

- Los accesos anteriores a la migración 0019 no reciben vencimiento retroactivo (`condiciones.regla = 'anterior_sin_vencimiento'`).
- Las concesiones de la admin no vencen (`concesion_sin_vencimiento`) hasta que la maestra decida otra cosa.
- Los certificados nunca vencen: siguen siendo descargables y verificables.

## Al vencer

- `tiene_acceso` y `version_de` exigen un acceso vigente. Por eso, por RLS y por las funciones del servidor:
  - lecciones, video, materiales y evaluación dejan de estar disponibles;
  - no se puede marcar avance ni rendir;
  - la página del curso en el campus responde 404.
- Se conservan el avance, los intentos, los resultados y los certificados.
- Quien cumplió todos los requisitos antes de vencer puede pedir su certificado después (`version_historica_de`, que no da acceso al contenido).
- El campus muestra el curso en «Cursos con el acceso vencido», con sus certificados.
- El cambio de versión del alumno conserva el vencimiento.

## Interfaz

- **Ficha pública**: «Acceso por N+5 meses desde la compra (N meses del curso + 5 meses adicionales)». Se quitó el texto anterior «Acceso sin vencimiento».
- **Campus**: «Acceso hasta el …» en la tarjeta y en la página del curso, y una sección aparte para los cursos vencidos.
- **Panel**:
  - *Datos y precio*: la duración comercial, con el total en vivo.
  - *Publicación*: un aviso si falta la duración.
  - *Alumnos*: «acceso hasta» o «acceso vencido» de cada persona.

## Pruebas

- **SQL** (`tests/db/99d_vencimientos.sql`):
  - meses calendario, bisiesto y zona horaria;
  - curso sin condiciones; copia e inmutabilidad de las condiciones;
  - pago confirmado y cambio de duración posterior;
  - concesión; cambio de versión;
  - vencimiento: contenido, material, avance y evaluación protegidos; historial y certificados conservados; verificación pública.
- **Reversión**: `supabase/rollback/20261101000019_vencimientos_cursos_down.sql`. Se niega si ya hay duraciones, condiciones o vencimientos.
- **E2E** (`scripts/recorrido-vencimientos.mjs`):
  - duración en el panel; ficha pública;
  - compra anterior conservada; compra simulada nueva;
  - vencimiento con curso y material en 404 y certificado disponible;
  - lista de alumnos y celular.

## Decisiones pendientes de la maestra

- **Recompra o renovación** después de vencer. Hoy `crear_orden` responde `ya_tiene_acceso` y no toca el acceso anterior.
- **Vencimiento de las concesiones** (becas, cortesías de cursos). Hoy no vencen.
- **Aviso previo al vencimiento** (por ejemplo, 15 días antes). Requiere el servicio de correo de la Fase 6.
- **Unidad de la duración comercial**: se usaron meses porque la regla habla de «cinco meses adicionales». Si la maestra prefiere semanas, hay que cambiarlo antes de vender.
