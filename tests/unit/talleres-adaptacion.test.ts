import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGUIENTES_GRABACION, ESTADOS_GRABACION_TEXTO } from '../../src/dominio/talleres-admin';

const migracion = readFileSync('supabase/migrations/20261031000017_talleres_adaptacion.sql', 'utf8');

test('grabaciones: el panel solo ofrece transiciones que la base acepta, y nunca publicar sin verificar', () => {
  const bloque = migracion.slice(migracion.indexOf('transicion_grabacion_valida(p_de text'), migracion.indexOf('cambiar_estado_grabacion(p_grabacion uuid'));
  const validas = new Set([...bloque.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`));
  assert.ok(validas.size > 10);
  for (const [de, pasos] of Object.entries(SIGUIENTES_GRABACION)) {
    for (const p of pasos) {
      assert.ok(validas.has(`${de}>${p.estado}`), `${de} → ${p.estado} no es válida en la base`);
      assert.notEqual(p.estado, 'publicada', 'publicar se ofrece aparte, con palabra escrita');
    }
  }
  assert.deepEqual([...validas].filter((v) => v.endsWith('>publicada')), ['verificada>publicada']);
  for (const e of ['prevista', 'recibida', 'en_revision', 'en_edicion', 'verificada', 'publicada', 'no_publicable', 'retirada']) assert.ok(ESTADOS_GRABACION_TEXTO[e]);
});

test('talleres: el panel ya no tiene formulario ni acción para cortesías nuevas', () => {
  const acciones = readFileSync('app/admin/talleres/acciones.ts', 'utf8');
  assert.doesNotMatch(acciones, /inscribir_cortesia|inscribirCortesia/);
  const participantes = readFileSync('app/admin/talleres/[id]/participantes/page.tsx', 'utf8');
  assert.doesNotMatch(participantes, /inscribirCortesia/);
  assert.match(migracion, /revoke execute on function public\.inscribir_cortesia\([^)]*\) from authenticated/);
});

test('campus: las inscripciones pagas no muestran un botón de cancelación', () => {
  const pagina = readFileSync('app/campus/talleres/page.tsx', 'utf8');
  assert.match(pagina, /t\.paga \? \(/);
  assert.match(pagina, /escriba a la academia/);
  assert.match(pagina, /const cancelable = !t\.paga && t\.iniciaEn\.getTime\(\) - t\.plazoHoras \* HORA > Date\.now\(\)/);
});
