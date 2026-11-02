# Política de seguridad de contenidos (CSP)

Fase 6A (02/11/2026). **Implementada y verificada en local y CI** con todos los recorridos (campus, panel, reproductor, subida de PDF, segundo factor) sin violaciones. No se desplegó en ningún entorno real.

## Dónde está

- `src/config/csp.ts`: arma la política (pura, con pruebas en `tests/unit/mfa-csp.test.ts`).
- `middleware.ts`: nonce nuevo de 128 bits por solicitud; lo pasa a Next (`x-nonce` y el encabezado en la solicitud) y envía la política en la respuesta.
- `app/layout.tsx`: todas las páginas se generan por solicitud (`headers()`), para que Next ponga el nonce en sus scripts. Antes ya eran dinámicas salvo `/_not-found`.
- `app/api/csp/route.ts`: recibe informes de violación y registra solo directiva, origen bloqueado y ruta (sin consulta ni datos personales).
- `next.config.ts`: se mantienen los encabezados que ya funcionaban (nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS, COOP).

## Política (producción)

```
default-src 'self';
script-src 'self' 'nonce-…' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' <origen de Supabase>;
media-src 'self';
frame-src https://iframe.mediadelivery.net https://player.mediadelivery.net;
worker-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
report-uri /api/csp; upgrade-insecure-requests
```

| Recurso | Necesidad identificada | Origen permitido |
| --- | --- | --- |
| Scripts | Next.js (runtime, páginas, componentes cliente) | Solo con el nonce de la respuesta; sin `unsafe-inline` ni `unsafe-eval` |
| Estilos | Hoja de Tailwind y atributos `style` de React/Next | `'self'` + `'unsafe-inline'` (riesgo residual: un estilo inyectado no ejecuta código; no hay HTML de usuarios) |
| Fuentes | Fraunces y Atkinson, autoalojadas por `next/font` | `'self'` |
| Imágenes | Marca y QR del segundo factor (SVG `data:` de Supabase Auth) | `'self' data: blob:` |
| Videos | Reproductor embebido de Bunny Stream (presentación y lecciones con token) | `frame-src` con los dos hosts de Bunny |
| Formularios | Acciones del servidor de Next | `form-action 'self'` |
| Conexiones | Subida de PDF con URL firmada de Supabase Storage | `connect-src` con el origen de `NEXT_PUBLIC_SUPABASE_URL` |
| Marcos | Nadie puede enmarcar Albor | `frame-ancestors 'none'` |

En desarrollo (`next dev`) se agregan `'unsafe-eval'` y `ws: wss:` (recarga en caliente), nunca en producción.

## Etapas

1. **Observación** (`CSP_MODO=observacion`): envía `Content-Security-Policy-Report-Only`. Recomendado para el primer despliegue real: revisar los avisos `csp:` del registro durante unos días.
2. **Aplicación** (predeterminada): `Content-Security-Policy`. Es la que corre en CI: los recorridos fallan ante cualquier error de consola, incluida una violación de CSP.

## Integraciones futuras

No se abrió ningún origen «por si acaso». Cada integración agrega su origen en `src/config/csp.ts` con su justificación:

| Integración (no contratada) | Qué agregaría |
| --- | --- |
| Pasarela de pago con formulario o redirección (Recurrente, Lemon Squeezy) | `form-action` o `frame-src` con su dominio de checkout, según cómo integre |
| Analítica | `script-src` no: cargarla desde el servidor o con nonce; `connect-src` con su dominio |
| Subida directa de videos a Bunny | `connect-src` con el host de subida de Bunny |
| Imágenes desde un CDN o Storage público | `img-src` con ese origen |

## Riesgos residuales

- `style-src 'unsafe-inline'` (arriba).
- Los informes de violación no tienen límite de frecuencia propio; el receptor descarta cuerpos grandes y solo escribe una línea por informe (máximo 5 por solicitud).
