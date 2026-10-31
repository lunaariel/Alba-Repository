import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONFIG_PREDETERMINADA, aFinalizacion, configCoherente, consecuenciasCambio, faltaCriterioCertificacion, pendientesFinalizacion,
  requisitosParaAlumno, textoPendientes, usaPreguntas, type ConfigEvaluacion,
} from '../../src/dominio/evaluacion';
import { requisitosPublicacion } from '../../src/dominio/cursos-admin';

const formativa = (o: Partial<ConfigEvaluacion> = {}): ConfigEvaluacion => ({ ...CONFIG_PREDETERMINADA, modalidad: 'formativa', ...o });

test('evaluación: valores predeterminados de la maestra (70 % y 2 intentos), también en la base', () => {
  assert.equal(CONFIG_PREDETERMINADA.puntajeMinimo, 70);
  assert.equal(CONFIG_PREDETERMINADA.intentosPermitidos, 2);
  const m = readFileSync('supabase/migrations/20261101000018_modalidad_evaluacion.sql', 'utf8');
  assert.match(m, /alter column intentos_permitidos set default 2/);
});

test('evaluación: la sumativa no conserva requisitos formativos', () => {
  const c = configCoherente({ ...CONFIG_PREDETERMINADA, requiereActividades: true, requiereValidacion: true, conCertificado: false });
  assert.deepEqual([c.requiereActividades, c.requiereValidacion, c.conCertificado], [false, false, true]);
});

test('evaluación: formativa con certificado necesita un criterio además de las lecciones', () => {
  assert.equal(faltaCriterioCertificacion(formativa()), true);
  assert.equal(faltaCriterioCertificacion(formativa({ requiereValidacion: true })), false);
  assert.equal(faltaCriterioCertificacion(formativa({ conCertificado: false })), false);
  const r = requisitosPublicacion({ precioCentavos: 3000, leccionesVigentes: 2, preguntasVigentes: 0, preguntasSinCorrecta: 0,
    evaluacion: formativa() });
  assert.deepEqual(r.filter((x) => !x.cumplido).map((x) => x.clave), ['criterios_certificacion']);
  const conActividades = requisitosPublicacion({ precioCentavos: 3000, leccionesVigentes: 2, preguntasVigentes: 0, preguntasSinCorrecta: 0,
    evaluacion: formativa({ requiereActividades: true }) });
  assert.deepEqual(conActividades.filter((x) => !x.cumplido).map((x) => x.clave), ['actividades', 'respuesta_correcta']);
  assert.equal(usaPreguntas(formativa({ requiereValidacion: true })), false);
});

test('evaluación: vista previa para el alumno según la modalidad', () => {
  assert.match(requisitosParaAlumno(CONFIG_PREDETERMINADA).join(' '), /al menos 70 puntos sobre 100 \(2 intentos\)/);
  const f = requisitosParaAlumno(formativa({ requiereActividades: true, requiereValidacion: true })).join(' ');
  assert.match(f, /No llevan nota/);
  assert.match(f, /validación de la maestra/);
  assert.doesNotMatch(f, /puntos/);
  assert.match(requisitosParaAlumno(formativa({ conCertificado: false })).join(' '), /no entrega certificado/);
});

test('evaluación: consecuencias de cambiar la modalidad frente a la versión vigente', () => {
  const c = consecuenciasCambio(CONFIG_PREDETERMINADA, formativa({ requiereValidacion: true }));
  assert.ok(c.some((t) => /formativa/.test(t)));
  assert.ok(c.some((t) => /no se reconocen/.test(t)));
  assert.ok(c.some((t) => /próxima versión/.test(t)));
  assert.deepEqual(consecuenciasCambio(CONFIG_PREDETERMINADA, CONFIG_PREDETERMINADA), []);
  assert.ok(consecuenciasCambio(CONFIG_PREDETERMINADA, { ...CONFIG_PREDETERMINADA, puntajeMinimo: 80 }).some((t) => /no se reconoce/.test(t)));
  assert.deepEqual(consecuenciasCambio(null, CONFIG_PREDETERMINADA).length, 1);
});

test('evaluación: estado de finalización de la base y lo que falta', () => {
  const f = aFinalizacion({ modalidad: 'formativa', lecciones_pendientes: 2, requiere_actividades: true, actividades_completas: false,
    requiere_validacion: true, validada: false, finalizado: false, elegible_certificado: false, con_certificado: true });
  assert.ok(f);
  assert.equal(pendientesFinalizacion(f!).length, 3);
  assert.equal(textoPendientes(f!), 'Falta completar 2 lecciones, responder todas las actividades formativas y recibir la validación de la maestra.');
  assert.equal(aFinalizacion(null), null);
  const s = aFinalizacion({ modalidad: 'sumativa', lecciones_pendientes: 0, evaluacion_aprobada: true, finalizado: true, elegible_certificado: true });
  assert.deepEqual(pendientesFinalizacion(s!), []);
});
