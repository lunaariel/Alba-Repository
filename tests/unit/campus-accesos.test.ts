import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diasRestantesGuatemala, textoAccesoVigente } from '../../src/dominio/accesos';

// 2027-03-10 05:30 UTC = 09/03/2027 23:30 en Guatemala (UTC-6).
const FIN = new Date('2027-03-10T05:30:00Z');

test('acceso: días calendario de Guatemala, no de UTC', () => {
  assert.equal(diasRestantesGuatemala(FIN, new Date('2027-03-08T07:00:00Z')), 1, '08/03 01:00 GT → último día 09/03');
  assert.equal(diasRestantesGuatemala(FIN, new Date('2027-03-09T20:00:00Z')), 0, 'el mismo día');
  // Fin exacto a medianoche de Guatemala: el último día con acceso es el anterior.
  assert.equal(diasRestantesGuatemala(new Date('2027-03-10T06:00:00Z'), new Date('2027-03-08T12:00:00Z')), 1);
});

test('acceso: sin vencimiento, normal y destacado con 30 días o menos', () => {
  assert.deepEqual(textoAccesoVigente(null), { texto: 'Acceso sin vencimiento', fecha: null, urgente: false });
  const lejos = textoAccesoVigente(FIN, new Date('2026-12-01T12:00:00Z'));
  assert.equal(lejos.urgente, false);
  assert.equal(lejos.texto, 'Acceso hasta el');
  assert.match(textoAccesoVigente(FIN, new Date('2027-02-20T12:00:00Z')).texto, /^Su acceso termina en 17 días/);
  assert.match(textoAccesoVigente(FIN, new Date('2027-03-08T12:00:00Z')).texto, /termina mañana/);
  assert.match(textoAccesoVigente(FIN, new Date('2027-03-09T12:00:00Z')).texto, /termina hoy/);
});

test('campus: el acceso mostrado es el fin de la cobertura continua', () => {
  const c = readFileSync('src/datos/campus.ts', 'utf8');
  assert.match(c, /rpc\('mis_fines_cobertura'\)/);
  const m = readFileSync('supabase/migrations/20261103000030_panel_consultas.sql', 'utf8');
  assert.match(m, /a\.perfil_id = auth\.uid\(\)/, 'solo los accesos propios');
});
