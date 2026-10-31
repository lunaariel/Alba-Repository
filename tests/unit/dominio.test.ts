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

test('vecinas cruza módulos y respeta el orden', async () => {
  const { vecinas, ordenarLecciones } = await import('../../src/dominio/aprendizaje');
  const l = [
    { id: 'c', moduloOrden: 1, orden: 0 },
    { id: 'a', moduloOrden: 0, orden: 0 },
    { id: 'b', moduloOrden: 0, orden: 1 },
  ];
  assert.deepEqual(ordenarLecciones(l).map((x) => x.id), ['a', 'b', 'c']);
  const v = vecinas(l, 'b');
  assert.equal(v.anterior?.id, 'a');
  assert.equal(v.siguiente?.id, 'c');
  assert.equal(v.posicion, 2);
  assert.equal(vecinas(l, 'a').anterior, null);
  assert.equal(vecinas(l, 'c').siguiente, null);
  assert.equal(vecinas(l, 'x').posicion, 0);
});

test('textoAvance', async () => {
  const { textoAvance } = await import('../../src/dominio/aprendizaje');
  assert.equal(textoAvance(0, 0), 'Este curso todavía no tiene lecciones.');
  assert.equal(textoAvance(0, 3), '3 lecciones por delante');
  assert.equal(textoAvance(2, 3), '2 de 3 lecciones completadas');
  assert.equal(textoAvance(3, 3), 'Completó todas las lecciones');
});

test('respuestasDesdeFormulario solo acepta pares de uuid y sin duplicados', async () => {
  const { respuestasDesdeFormulario } = await import('../../src/dominio/aprendizaje');
  const p = '11111111-1111-1111-1111-111111111111';
  const o1 = '22222222-2222-2222-2222-222222222222';
  const o2 = '33333333-3333-3333-3333-333333333333';
  const r = respuestasDesdeFormulario([
    [`p:${p}`, o1], [`p:${p}`, o1], [`p:${p}`, o2], ['p:no-uuid', o1], [`p:${p}`, 'x'], ['otro', o1],
  ]);
  assert.deepEqual(r, { [p]: [o1, o2] });
});

test('describirActividad traduce acciones y muestra solo lo que cambió', async () => {
  const { describirActividad, grupoDesdeUrl } = await import('../../src/dominio/auditoria');
  const d = describirActividad({
    accion: 'taller_actualizado', entidad: 'talleres', entidadId: 'x',
    antes: { titulo: 'Límites', cupo: 1, precio_centavos: 1500, estado: 'publicado' },
    despues: { titulo: 'Límites', cupo: 12, precio_centavos: 1500, estado: 'publicado' },
  });
  assert.equal(d.titulo, 'Modificó un taller');
  assert.equal(d.nombre, 'Límites');
  assert.deepEqual(d.cambios, [{ campo: 'Cupo', antes: '1', despues: '12' }]);

  const precio = describirActividad({
    accion: 'curso_actualizado', entidad: 'cursos', entidadId: 'c',
    antes: { precio_centavos: 4900, estado: 'borrador' }, despues: { precio_centavos: 5900, estado: 'publicado' },
  });
  assert.deepEqual(precio.cambios, [
    { campo: 'Precio', antes: 'USD 49', despues: 'USD 59' },
    { campo: 'Estado', antes: 'Borrador', despues: 'Publicado' },
  ]);

  const alta = describirActividad({ accion: 'cupon_creado', entidad: 'cupones', entidadId: 'k', antes: null, despues: { codigo: 'BECA50', valor: 50, activo: true } });
  assert.equal(alta.nombre, 'BECA50');
  assert.ok(alta.cambios.every((c) => c.antes === null));
  assert.ok(alta.cambios.some((c) => c.campo === 'Activo' && c.despues === 'Sí'));

  const textos = describirActividad({ accion: 'configuracion_actualizado', entidad: 'configuracion_academia', entidadId: null,
    antes: { textos: { a: 1 } }, despues: { textos: { a: 2 } } });
  assert.deepEqual(textos.cambios, [{ campo: 'Textos del sitio', antes: null, despues: 'modificado' }]);

  const desconocida = describirActividad({ accion: 'algo_nuevo', entidad: 'x', entidadId: null, antes: null, despues: null });
  assert.equal(desconocida.titulo, 'Acción: algo nuevo');
  assert.equal(grupoDesdeUrl('talleres'), 'talleres');
  assert.equal(grupoDesdeUrl('constructor'), null);
  assert.equal(grupoDesdeUrl(undefined), null);
});
