import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('seguridad: MFA de la admin preparado pero no activo por defecto (no deja a nadie sin acceso)', () => {
  const s = readFileSync('src/datos/sesion.ts', 'utf8');
  assert.match(s, /process\.env\.ADMIN_MFA_OBLIGATORIO === 'si'/);
  assert.equal((s.match(/!\(await cumpleMfa\(\)\)/g) ?? []).length, 2, 'páginas y acciones del panel aplican la misma regla');
  const ci = readFileSync('.github/workflows/verificar.yml', 'utf8');
  assert.doesNotMatch(ci, /ADMIN_MFA_OBLIGATORIO/);
});

test('seguridad: encabezados de respuesta', () => {
  const c = readFileSync('next.config.ts', 'utf8');
  for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Strict-Transport-Security', 'Cross-Origin-Opener-Policy']) {
    assert.match(c, new RegExp(h));
  }
  assert.match(c, /poweredByHeader: false/);
});

test('seguridad: el alta de admin exige responsable identificado', () => {
  const script = readFileSync('scripts/asignar-admin.sql', 'utf8');
  assert.match(script, /set_config\('albor\.responsable', btrim\(:responsable\), true\)/);
  const m = readFileSync('supabase/migrations/20261101000023_seguridad.sql', 'utf8');
  assert.match(m, /raise exception 'responsable_requerido'/);
});
