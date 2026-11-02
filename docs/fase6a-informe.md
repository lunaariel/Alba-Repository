# Fase 6A: seguridad, estabilidad y preparación técnica — informe

Fecha: 02/11/2026. Rama `desarrollo/fase6a-seguridad` (también publicada como `claude/albor-fase6a-seguridad-ygztuq`, mismo contenido). **No integrada a `main`.** Todo se implementó y probó **solo en local y en CI**; ninguna base, cuenta, credencial ni servicio real fue tocado.

## 1. Estado inicial verificado

- `main` = `origin/main` = `d7b3cf1`; árbol limpio.
- Migraciones 0001–0025 aplicadas desde cero en Postgres 16 local: todas las pruebas SQL, de concurrencia y de migración en verde.
- Tipos y 57 pruebas unitarias en verde.
- Verificación E2E local con Supabase local (réplica del trabajo `capturas` de CI, `scripts/verificar-e2e.sh`): **506 comprobaciones satisfactorias** en una corrida; en la otra, 505 y una falla: **el error de hidratación #418 se reprodujo** (recorrido de cursos en el panel).

## 2. Defectos D8–D15

| ID | Impacto / riesgo | Causa | Resultado | Pruebas |
| --- | --- | --- | --- | --- |
| D8 | Un script podía enviar actividades formativas sin límite para deducir respuestas | Sin límite en la función | **Corregido (0026)**: 10 envíos por persona y minuto, en la base; el campus explica la espera | `99k`, `defectos.test.ts` |
| D9 | La alumna leía por la API el puntaje interno de sus envíos formativos | Política de lectura de `intentos_evaluacion` | **Corregido (0026)**: los formativos solo los lee la maestra; los sumativos siguen visibles para la alumna | `99k` |
| D10 | Posible lentitud de `seguimiento_curso` | Subconsultas por fila | **Medido**: lineal, 0,35 s con 2000 y 0,85 s con 5000 alumnas por curso. Índices existentes suficientes. Sin cambios; paginar si un curso supera ~10 000 | `tests/rendimiento/seguimiento_curso.sql` |
| D11 | El formulario de criterios no se enviaba en la formativa (campo obligatorio oculto) y mostraba una nota de la modalidad guardada | `required` fijo y condición sobre la configuración guardada | **Corregido**: obligatorio solo en la sumativa visible; nota según la modalidad en edición; el servidor no rechaza por campos ocultos | `defectos.test.ts` |
| D12 | Eliminar el usuario de una admin fallaba sin `albor.responsable` | El disparador de 0023 no distinguía la cascada | **Corregido (0026)**: la baja en cascada se admite y queda auditada como tal; una baja directa sigue exigiendo responsable | `99k` |
| D13 | Aplicación parcial de migraciones no idempotentes | Aplicación manual | **Corregido**: `scripts/migrar.sh` (transacción por archivo con su registro, huella, bloqueo, se detiene ante errores) | `tests/db/migrar.sh` |
| D14 | Error de hidratación #418 intermitente | Ver sección 6 | **Investigado; causa probable corregida**; regresión en CI | `recorrido-hidratacion.mjs`, `defectos.test.ts` |
| D15 | Ayudantes E2E duplicados | Copias por recorrido | **Corregido para los recorridos nuevos** (`scripts/lib/recorrido.mjs`); los anteriores se migran cuando se modifiquen | `defectos.test.ts` |

**Defecto nuevo encontrado y corregido:** el campus de la administradora mezclaba accesos, avances, certificados, compras y avisos **de todas las alumnas** (las consultas confiaban solo en RLS, que a la admin le deja leer todo). No exponía datos a alumnas, pero mostraba información ajena en «Mis cursos» de la admin y producía claves duplicadas en React. Ahora cada lectura «mis…» filtra por la propia persona.

## 3. MFA, verificación reforzada, CSP, respaldos, migraciones y `main`

Detalle en `docs/mfa.md`, `docs/recuperacion-acceso.md`, `docs/csp.md`, `docs/respaldos.md`, `docs/estrategia-migracion.md` y `docs/proteccion-main.md`.

## 6. Error de hidratación (D14)

1. **Reproducción:** apareció 1 vez en 2 corridas completas locales (recorrido de cursos), como en el informe anterior (1 de 5). Las corridas anteriores no registraban la página: ahora todos los recorridos guardan la ruta de cada error de consola.
2. **Revisión:** fechas y zonas (todas se formatean en componentes de servidor con zona fija `America/Guatemala`; los componentes cliente con fecha o zona —`HoraLocal`, registro— las calculan en `useEffect`); valores no deterministas (ninguno en componentes cliente); `useId` (usado correctamente); componentes condicionales y `useSearchParams` (dentro de `Suspense`); configuración regional (formato fijo `es-GT`).
3. **Modo desarrollo** (React sin minificar, todos los recorridos): **ningún** aviso de hidratación ni de HTML mal anidado. Sí apareció una advertencia real: **claves duplicadas** (id de curso repetido) al ingresar la admin y entrar a su campus, por el defecto descrito arriba. Las claves duplicadas hacen que React reconcilie mal la lista y son la causa más probable del #418 intermitente: dependían de qué alumnas tenían accesos en ese momento del recorrido (por eso aparecía solo en algunas corridas y en el recorrido de cursos, donde la admin ingresa después de dar accesos).
4. **Corrección:** filtro por persona en todas las lecturas del campus (sin cambios de diseño).
5. **Regresión:** prueba unitaria que exige el filtro en cada lectura «mis…» y `scripts/recorrido-hidratacion.mjs`: sitio, campus de alumna, campus de admin y panel, 3 vueltas en escritorio y celular, con cargas completas, cargas rápidas y navegaciones interrumpidas; cualquier error de consola falla. En CI y en la verificación local.
6. **Incertidumbre que queda:** el #418 original no traía la ruta, así que no se puede afirmar con certeza que esa fuera su única causa. Si vuelve a aparecer, ahora el informe dirá en qué página.

## 11–12. Resultados de pruebas (02/11/2026, commit final de la rama)

| Conjunto | Resultado |
| --- | --- |
| Pruebas SQL (`npm run probar:db`): 24 archivos, 7 de concurrencia, 3 ensayos de migración, ejecutor de migraciones, respaldo y restauración | Todas en verde |
| Unitarias (`npm run probar`) | 74/74 (antes 57) |
| Tipos (`npm run tipos`) | Sin errores |
| Compilación (`npm run build`) | Correcta |
| E2E local (Supabase local, compilación de producción, CSP aplicada) | **571 comprobaciones, 0 fallas** (antes 506): campus, panel, cursos, talleres, evaluaciones, vencimientos, renovaciones, perfil, acciones protegidas y sensibles, seguridad MFA (siete perfiles) e hidratación repetida, en 1440 y 390 px |
| E2E en modo desarrollo (diagnóstico) | Sin avisos de hidratación ni de HTML mal anidado; reveló las claves duplicadas (corregidas). Las fallas propias de `next dev` (páginas de error con detalles internos, `unsafe-eval`) no existen en producción |
| CI en GitHub (rama `desarrollo/fase6a-seguridad`) | Corridas 50 y 52 en verde (base de datos, aplicación y capturas con el recorrido MFA); la 51 falló por la versión de `pg_dump` del runner, corregido |

Ninguna prueba se borró ni se cambió su resultado esperado. Cambios en pruebas existentes: la lista cerrada de funciones de `99h_permisos.sql` suma las funciones nuevas de 0026 (como exige su propio comentario) y `supabase_stub.sql` imita `auth.uid()` igual que Supabase real (ignora un `claim.sub` vacío).

## 13. Riesgos pendientes para producción (bloqueantes)

- Ninguna migración posterior a 0013 aplicada en la base real (no autorizado).
- Política de segundo factor apagada; falta encenderla con el factor y el respaldo de la maestra, y decidir la recuperación.
- `main` sin protección (propuesta lista, requiere autorización).
- Sin hosting, sin respaldos del proveedor, sin copia del bucket, sin pasarela, sin correo, sin FEL.
- CSP no probada en un despliegue real (primero en modo observación).

**Albor no está lista para producción.**
