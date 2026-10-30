import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarCupon, formatearUSD } from '../../src/dominio/dinero';
import { estadoCertificado, leccionParaContinuar, porcentajeAvance } from '../../src/dominio/aprendizaje';
import { formatearHorario, textoCupo } from '../../src/dominio/talleres';

test('formatearUSD escribe la moneda y no usa flotantes', () => {
  assert.equal(formatearUSD(4900), 'USD 49');
  assert.equal(formatearUSD(4950), 'USD 49.50');
  assert.equal(formatearUSD(123456), 'USD 1,234.56');
  assert.throws(() => formatearUSD(10.5));
  assert.throws(() => formatearUSD(-1));
});

test('aplicarCupon coincide con la regla de la base de datos', () => {
  assert.deepEqual(aplicarCupon(4900, { tipo: 'porcentaje', valor: 50 }), { descuento: 2450, total: 2450 });
  assert.deepEqual(aplicarCupon(4900, { tipo: 'monto', valor: 9999 }), { descuento: 4900, total: 0 });
  assert.deepEqual(aplicarCupon(4900, null), { descuento: 0, total: 4900 });
});

test('porcentajeAvance y leccionParaContinuar', () => {
  const l = [
    { id: 'a', moduloOrden: 0, orden: 0, completada: true },
    { id: 'b', moduloOrden: 0, orden: 1, completada: false },
    { id: 'c', moduloOrden: 1, orden: 0, completada: false, ultimaVisita: new Date('2026-10-30T10:00:00Z') },
  ];
  assert.equal(porcentajeAvance(l), 33);
  assert.equal(porcentajeAvance([]), 0);
  assert.equal(leccionParaContinuar(l)?.id, 'c', 'prioriza la última visitada sin completar');
  assert.equal(leccionParaContinuar(l.map((x) => ({ ...x, ultimaVisita: null })))?.id, 'b');
  assert.equal(leccionParaContinuar(l.map((x) => ({ ...x, completada: true }))), null);
});

test('estadoCertificado explica qué falta, en trato de usted', () => {
  assert.deepEqual(estadoCertificado({ accesoActivo: true, leccionesPendientes: 0, evaluacionAprobada: true }), { disponible: true });
  const p = estadoCertificado({ accesoActivo: true, leccionesPendientes: 2, evaluacionAprobada: true });
  assert.equal(p.disponible, false);
  assert.equal(!p.disponible && p.mensaje, 'Le faltan completar 2 lecciones.');
  const e = estadoCertificado({ accesoActivo: true, leccionesPendientes: 0, evaluacionAprobada: false });
  assert.equal(!e.disponible && e.motivo, 'evaluacion_no_aprobada');
  const s = estadoCertificado({ accesoActivo: false, leccionesPendientes: 0, evaluacionAprobada: true });
  assert.equal(!s.disponible && s.motivo, 'sin_acceso');
});

test('textoCupo', () => {
  assert.equal(textoCupo(null, 40, 'publicado'), 'Lugares disponibles');
  assert.equal(textoCupo(10, 9, 'publicado'), 'Queda 1 lugar');
  assert.equal(textoCupo(10, 7, 'publicado'), 'Quedan 3 lugares');
  assert.equal(textoCupo(10, 12, 'publicado'), 'Cupo completo');
  assert.equal(textoCupo(10, 0, 'cancelado'), 'Cancelado');
});

test('formatearHorario muestra la hora de Guatemala y la del visitante', () => {
  const inicio = new Date('2026-11-10T00:00:00Z'); // 18:00 del 9 de noviembre en Guatemala (UTC-6)
  const gt = formatearHorario(inicio, 'America/Guatemala');
  assert.match(gt, /18:00/);
  assert.match(gt, /hora de Guatemala/);
  const ar = formatearHorario(inicio, 'America/Guatemala', 'America/Argentina/Buenos_Aires');
  assert.match(ar, /21:00 en su zona horaria/);
});
