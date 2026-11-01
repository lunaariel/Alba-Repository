import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instanteGuatemala, revocableDesdePanel } from '../../src/dominio/accesos';

test('las fechas de una beca se toman en hora de Guatemala', () => {
  assert.equal(instanteGuatemala('2027-03-31', 'inicio'), '2027-03-31T06:00:00.000Z');
  // El fin incluye todo el día elegido: vence al comenzar el siguiente.
  assert.equal(instanteGuatemala('2027-03-31', 'fin'), '2027-04-01T06:00:00.000Z');
  assert.equal(instanteGuatemala('2028-02-28', 'fin'), '2028-02-29T06:00:00.000Z');
});

test('fechas inválidas no se aceptan', () => {
  assert.equal(instanteGuatemala('', 'inicio'), null);
  assert.equal(instanteGuatemala('2027-02-30', 'fin'), null);
  assert.equal(instanteGuatemala('31/03/2027', 'fin'), null);
  assert.equal(instanteGuatemala('2027-13-01', 'inicio'), null);
});

test('una compra no se revoca desde el panel', () => {
  assert.equal(revocableDesdePanel({ origen: 'compra', estado: 'activo' }), false);
  assert.equal(revocableDesdePanel({ origen: 'beca', estado: 'activo' }), true);
  assert.equal(revocableDesdePanel({ origen: 'concesion', estado: 'activo' }), true);
  assert.equal(revocableDesdePanel({ origen: 'beca', estado: 'revocado' }), false);
});
