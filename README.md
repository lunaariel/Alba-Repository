# Albor

Academia de primera infancia creada por una maestra en Guatemala: sitio público, campus de cursos grabados con evaluación y certificado, talleres en vivo y panel de administración.

**Estado: Fase 3 (sitio público).** Hay base de datos completa con permisos y pruebas, cuentas, protección de rutas y el sitio público: inicio, cursos, ficha de curso, la maestra, talleres, contacto, recursos (oculto hasta tener artículos) y legales. Todavía no hay campus (Fase 4), panel (Fase 5) ni pagos reales (Fase 6): la venta está apagada en `src/config/comercio.ts`.

## Requisitos

- Node.js 22 o superior
- [Supabase CLI](https://supabase.com/docs/guides/cli) y Docker, para la base local
- PostgreSQL 16 (solo para correr las pruebas de base de datos sin Docker)

## Arrancar en local

```bash
npm install
cp .env.example .env.local          # completar con lo que muestra el paso siguiente
npx supabase init                    # solo la primera vez: crea supabase/config.toml
npx supabase start                   # levanta Postgres, Auth y Storage en Docker
npx supabase db reset                # aplica supabase/migrations y supabase/seed.sql
npm run dev                          # http://localhost:3000
```

Para que una cuenta sea administradora, regístrese en el sitio y luego:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v correo="'su@correo.com'" -f scripts/asignar-admin.sql
```

## Verificar

| Comando | Qué prueba |
| --- | --- |
| `npm run probar:db` | Crea una base desde cero, aplica las migraciones y prueba aislamiento entre alumnos, compras y webhooks, evaluación y certificado, cupos, concurrencia, publicación, auditoría y registro |
| `npm run probar` | Reglas de dominio y adaptadores simulados |
| `npm run tipos` | Tipos de toda la aplicación |
| `npm run build` | Compilación de producción |

La verificación automática de GitHub (`.github/workflows/verificar.yml`) corre todo en cada cambio.

## Estructura

```text
app/                 rutas: (publico) sitio, (auth) ingreso y registro, campus, admin
src/dominio/         reglas puras (dinero, catálogo, artículos, progreso, certificado, talleres)
src/contenido/       textos editables del sitio con sus valores por defecto
src/datos/           clientes de Supabase y sesión
src/servicios/       pagos, facturación, reuniones, video y correo detrás de interfaces
src/ui/              componentes del sistema de diseño Albor
supabase/migrations/ esquema versionado con RLS
tests/db/            pruebas SQL de permisos y operaciones
tests/unit/          pruebas de dominio y servicios
docs/                decisiones y variables de entorno
```

## Reglas del proyecto

- Ninguna tabla sin RLS. Ninguna regla de acceso decidida solo en el navegador.
- El acceso a un curso nace solo de un pago verificado o de una concesión auditada.
- Secretos únicamente en variables de entorno; `.env.local` nunca se sube.
- Los cambios de diseño parten del sistema de diseño Albor.
- No se activan pagos reales ni facturación fiscal sin aprobación de la titular.
