import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regresiones de los defectos D8 a D15 corregidos en la Fase 6A (las pruebas de comportamiento están en
// tests/db/99k_mfa_reforzada.sql, tests/db/migrar.sh y los recorridos).

test('D11: el puntaje mínimo es obligatorio solo con la evaluación sumativa visible', () => {
  const f = readFileSync('app/admin/cursos/[id]/evaluacion/FormCriterios.tsx', 'utf8');
  assert.match(f, /required=\{modalidad === 'sumativa'\}/);
  assert.doesNotMatch(f, /setPuntaje\(e\.target\.value\)\} required /);
  assert.match(f, /conIntentos && modalidad === 'sumativa'/, 'la nota de intentos sigue la modalidad en edición');
  const a = readFileSync('app/admin/cursos/acciones.ts', 'utf8');
  assert.match(a, /const formativaEnviada = datos\.get\('modalidad'\) === 'formativa'/, 'el servidor no rechaza por campos ocultos de la formativa');
});

test('D8, D9 y D12 están en la migración 0026 con su reversión', () => {
  const m = readFileSync('supabase/migrations/20261102000026_mfa_reforzada.sql', 'utf8');
  assert.match(m, /raise exception 'demasiados_envios'/);
  assert.match(m, /perfil_id = auth\.uid\(\) and not formativo/);
  assert.match(m, /'baja_en_cascada'/);
  const r = readFileSync('supabase/rollback/20261102000026_mfa_reforzada_down.sql', 'utf8');
  assert.match(r, /reversion_imposible/);
});

test('D8: el campus traduce el límite de envíos formativos', () => {
  const c = readFileSync('app/campus/acciones.ts', 'utf8');
  assert.match(c, /demasiados_envios/);
});

test('D13: las migraciones se aplican con el ejecutor transaccional y registrado', () => {
  const s = readFileSync('scripts/migrar.sh', 'utf8');
  assert.match(s, /--single-transaction/);
  assert.match(s, /albor_control\.migraciones/);
  assert.match(s, /BLOQUEADO: \$host no es una base local/);
});

test('D15: ayudantes E2E compartidos', () => {
  const lib = readFileSync('scripts/lib/recorrido.mjs', 'utf8');
  for (const f of ['export function sql', 'export function crearInforme', 'export const sinDesborde']) assert.ok(lib.includes(f), f);
  assert.match(readFileSync('scripts/recorrido-mfa.mjs', 'utf8'), /from '\.\/lib\/recorrido\.mjs'/);
});
