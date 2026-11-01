import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoAcceso, textoEvaluacion } from '../../src/dominio/catalogo';

test('vencimientos: condiciones visibles antes de comprar', () => {
  assert.equal(textoAcceso({ duracionMeses: 3, mesesAdicionales: 5 }), 'Acceso por 8 meses desde la compra (3 meses del curso + 5 meses adicionales)');
  assert.equal(textoAcceso({ duracionMeses: 1, mesesAdicionales: 5 }), 'Acceso por 6 meses desde la compra (1 mes del curso + 5 meses adicionales)');
  assert.equal(textoAcceso({ duracionMeses: null, mesesAdicionales: 5 }), 'Condiciones de acceso por definir');
});

test('vencimientos: la ficha pública ya no promete acceso sin vencimiento', () => {
  const ficha = readFileSync('app/(publico)/cursos/[slug]/page.tsx', 'utf8');
  assert.doesNotMatch(ficha, /Acceso sin vencimiento/);
  assert.match(ficha, /textoAcceso\(curso\.acceso\)/);
  const campus = readFileSync('app/campus/page.tsx', 'utf8');
  assert.doesNotMatch(campus, /no vence/);
});

test('vencimientos: la regla vive en la base (5 meses, calendario de Guatemala, sin retroactividad)', () => {
  const m = readFileSync('supabase/migrations/20261101000019_vencimientos_cursos.sql', 'utf8');
  assert.match(m, /meses_adicionales_acceso\(\) returns int language sql immutable as \$\$ select 5 \$\$/);
  assert.match(m, /at time zone 'America\/Guatemala'\) \+ make_interval\(months => p_meses\)/);
  assert.match(m, /'anterior_sin_vencimiento'/);
  assert.match(m, /raise exception 'curso_sin_condiciones'/);
});

test('evaluación en la ficha pública según la modalidad', () => {
  assert.equal(textoEvaluacion({ modalidad: 'sumativa', conCertificado: true, tieneEvaluacion: true }), 'Evaluación final y certificado de finalización');
  assert.match(textoEvaluacion({ modalidad: 'formativa', conCertificado: false, tieneEvaluacion: false }) ?? '', /sin certificado/);
});
