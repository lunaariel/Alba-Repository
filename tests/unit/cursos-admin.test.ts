import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  precioACentavos, centavosATexto, slugDesde, requisitosPublicacion, temasConUnaPregunta, mensajeError, volverSeguro,
} from '../../src/dominio/cursos-admin';

test('precioACentavos acepta formatos comunes y rechaza lo inválido', () => {
  assert.equal(precioACentavos('49'), 4900);
  assert.equal(precioACentavos('49.5'), 4950);
  assert.equal(precioACentavos('49,50'), 4950);
  assert.equal(precioACentavos('USD 49'), 4900);
  assert.equal(precioACentavos('$ 0'), 0);
  assert.equal(precioACentavos('49.505'), null);
  assert.equal(precioACentavos('-5'), null);
  assert.equal(precioACentavos('abc'), null);
  assert.equal(precioACentavos('20000'), null);
  assert.equal(centavosATexto(4900), '49');
  assert.equal(centavosATexto(4950), '49.50');
});

test('slugDesde arma direcciones válidas', () => {
  assert.equal(slugDesde('Montessori en casa: un primer acercamiento'), 'montessori-en-casa-un-primer-acercamiento');
  assert.equal(slugDesde('  Niños de 0 a 3 años!! '), 'ninos-de-0-a-3-anos');
  assert.ok(slugDesde('x'.repeat(100)).length <= 60);
  assert.equal(slugDesde('¿?'), '');
});

test('requisitosPublicacion coincide con la regla de la base', () => {
  const r = requisitosPublicacion({ precioCentavos: 0, leccionesVigentes: 2, preguntasVigentes: 1, preguntasSinCorrecta: 1 });
  assert.deepEqual(r.filter((x) => !x.cumplido).map((x) => x.clave), ['precio', 'respuesta_correcta']);
  const ok = requisitosPublicacion({ precioCentavos: 4900, leccionesVigentes: 1, preguntasVigentes: 3, preguntasSinCorrecta: 0 });
  assert.ok(ok.every((x) => x.cumplido));
  const sinPreguntas = requisitosPublicacion({ precioCentavos: 4900, leccionesVigentes: 1, preguntasVigentes: 0, preguntasSinCorrecta: 0 });
  assert.deepEqual(sinPreguntas.filter((x) => !x.cumplido).map((x) => x.clave), ['evaluacion', 'respuesta_correcta']);
});

test('temasConUnaPregunta avisa los temas que revelarían la pregunta fallada', () => {
  assert.deepEqual(temasConUnaPregunta([
    { tema: 'Ambiente', retirada: false }, { tema: 'Ambiente ', retirada: false },
    { tema: 'Límites', retirada: false }, { tema: 'Rutinas', retirada: true }, { tema: null, retirada: false },
  ]), ['Límites']);
});

test('mensajeError traduce los códigos de la base', () => {
  assert.match(mensajeError('leccion_con_historial'), /retirarla/);
  assert.match(mensajeError('curso_incompleto: precio,lecciones'), /requisitos/);
  assert.match(mensajeError('duplicate key value violates unique constraint "cursos_slug_key"'), /dirección web/);
  assert.match(mensajeError('algo raro'), /Intente de nuevo/);
});

test('volverSeguro solo acepta rutas del editor de cursos', () => {
  assert.equal(volverSeguro('/admin/cursos/abc/temario', '/admin/cursos'), '/admin/cursos/abc/temario');
  assert.equal(volverSeguro('https://otro.sitio', '/admin/cursos'), '/admin/cursos');
  assert.equal(volverSeguro('//otro.sitio/admin/cursos', '/admin/cursos'), '/admin/cursos');
  assert.equal(volverSeguro('/admin/cursos/../../x', '/admin/cursos'), '/admin/cursos');
});

test('avisos por la dirección: solo códigos conocidos', async () => {
  const { codigoError, mensajeOk } = await import('../../src/dominio/cursos-admin');
  assert.equal(codigoError('leccion_con_historial'), 'leccion_con_historial');
  assert.equal(codigoError('curso_incompleto: precio'), 'curso_incompleto');
  assert.equal(codigoError('lo que sea'), 'desconocido');
  assert.match(mensajeOk('retirado') ?? '', /historial se conserva/);
  assert.equal(mensajeOk('<script>'), undefined);
  assert.equal(mensajeOk('constructor'), undefined);
});

test('registro de actividad: retiro de lección legible', async () => {
  const { describirActividad } = await import('../../src/dominio/auditoria');
  const d = describirActividad({ accion: 'leccion_actualizado', entidad: 'lecciones', entidadId: 'x',
    antes: { titulo: 'Rutinas', retirada: false, modulo_id: 'm' }, despues: { titulo: 'Rutinas', retirada: true, modulo_id: 'm' } });
  assert.equal(d.titulo, 'Cambió una lección');
  assert.equal(d.nombre, 'Rutinas');
  assert.deepEqual(d.cambios, [{ campo: 'Retirada', antes: 'No', despues: 'Sí' }]);
});
