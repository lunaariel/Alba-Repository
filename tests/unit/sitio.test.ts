import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaEdad, etiquetaDuracion, etiquetaPublico, filtrarCursos, filtroDesdeUrl, metadatosCurso, type CursoResumen } from '../../src/dominio/catalogo';
import { extracto, hrefSeguro, leerArticulo, leerLinea } from '../../src/dominio/articulo';
import { combinarTextos, enlaceWhatsApp, esPendiente, TEXTOS_POR_DEFECTO } from '../../src/contenido/textos';

const curso = (p: Partial<CursoResumen>): CursoResumen => ({
  slug: 's', titulo: 't', resumen: null, publico: [], edadDesdeMeses: null, edadHastaMeses: null,
  duracionMinutos: null, precioCentavos: 0, portadaRuta: null, ...p,
});

test('filtros del catálogo', () => {
  const c = [
    curso({ slug: 'casa', publico: ['familias'], edadDesdeMeses: 0, edadHastaMeses: 72 }),
    curso({ slug: 'bebes', publico: ['familias', 'cuidadores'], edadDesdeMeses: 0, edadHastaMeses: 36 }),
    curso({ slug: 'aula', publico: ['docentes'], edadDesdeMeses: 36, edadHastaMeses: 72 }),
  ];
  assert.deepEqual(filtrarCursos(c, 'todos').map((x) => x.slug), ['casa', 'bebes', 'aula']);
  assert.deepEqual(filtrarCursos(c, 'docentes').map((x) => x.slug), ['aula']);
  assert.deepEqual(filtrarCursos(c, 'cuidadores').map((x) => x.slug), ['bebes']);
  assert.deepEqual(filtrarCursos(c, '0-3').map((x) => x.slug), ['casa', 'bebes']);
  assert.deepEqual(filtrarCursos(c, '3-6').map((x) => x.slug), ['casa', 'aula']);
  assert.equal(filtroDesdeUrl('docentes'), 'docentes');
  assert.equal(filtroDesdeUrl('<script>'), 'todos');
  assert.equal(filtroDesdeUrl(undefined), 'todos');
  assert.equal(filtroDesdeUrl(['3-6', 'x']), '3-6');
});

test('etiquetas de la bandeja', () => {
  assert.equal(etiquetaPublico(['familias', 'cuidadores']), 'Familias y cuidadores');
  assert.equal(etiquetaPublico(['docentes', 'familias', 'cuidadores']), 'Docentes, Familias y cuidadores');
  assert.equal(etiquetaEdad(0, 36), '0 a 3 años');
  assert.equal(etiquetaEdad(0, 12), '0 a 12 meses');
  assert.equal(etiquetaEdad(18, 42), '1,5 a 3,5 años');
  assert.equal(etiquetaEdad(null, null), '');
  assert.equal(etiquetaDuracion(240), '4 h');
  assert.equal(etiquetaDuracion(95), '1 h 35 min');
  assert.equal(metadatosCurso(curso({ publico: ['familias'], edadDesdeMeses: 0, edadHastaMeses: 72, duracionMinutos: 240 })),
    'Familias · 0 a 6 años · 4 h');
  assert.equal(metadatosCurso(curso({})), '', 'sin datos no inventa nada');
});

test('artículos: estructura y enlaces seguros', () => {
  const b = leerArticulo('## Título\n\nUn **párrafo** con [enlace](https://albor.test/x).\nSigue.\n\n- uno\n- dos\n\n### Sub');
  assert.equal(b.length, 4);
  assert.deepEqual(b[0], { tipo: 'h2', contenido: [{ tipo: 'texto', valor: 'Título' }] });
  assert.equal(b[1]!.tipo, 'p');
  assert.deepEqual(b[2], { tipo: 'lista', items: [[{ tipo: 'texto', valor: 'uno' }], [{ tipo: 'texto', valor: 'dos' }]] });
  assert.equal(b[3]!.tipo, 'h3');
});

test('artículos: no deja pasar HTML ni enlaces peligrosos', () => {
  const l = leerLinea('<img src=x onerror=alert(1)> [clic](javascript:alert(1)) [datos](data:text/html,x) [ok](/cursos)');
  assert.ok(l.every((x) => x.tipo !== 'enlace' || x.href === '/cursos'), 'solo queda el enlace interno');
  assert.equal(l[0]!.tipo, 'texto', 'el HTML queda como texto plano, nunca como elemento');
  assert.equal(hrefSeguro('http://inseguro.test'), null);
  assert.equal(hrefSeguro('//otro-sitio.test'), null);
  assert.equal(hrefSeguro('https://seguro.test/a'), 'https://seguro.test/a');
});

test('extracto para buscadores', () => {
  assert.equal(extracto('## T\n\nPrimer **párrafo** útil.'), 'Primer párrafo útil.');
  assert.equal(extracto('x'.repeat(300), 20).length, 20);
});

test('textos editables: solo claves conocidas, lo demás por defecto', () => {
  const t = combinarTextos({ heroTitulo: '  Nuevo título ', maestraNombre: '', inyectado: 'x', preguntas: [{ pregunta: '¿A?', respuesta: 'B' }, { foo: 1 }] });
  assert.equal(t.heroTitulo, 'Nuevo título');
  assert.equal(t.maestraNombre, TEXTOS_POR_DEFECTO.maestraNombre, 'vacío no pisa el valor por defecto');
  assert.equal((t as unknown as Record<string, unknown>).inyectado, undefined);
  assert.deepEqual(t.preguntas, [{ pregunta: '¿A?', respuesta: 'B' }]);
  assert.deepEqual(combinarTextos(null), TEXTOS_POR_DEFECTO);
  assert.equal(esPendiente('[Nombre de la maestra]'), true);
  assert.equal(esPendiente(null), true);
  assert.equal(esPendiente('Laura Pérez'), false);
  assert.equal(enlaceWhatsApp('+502 5555-1234'), 'https://wa.me/50255551234');
  assert.equal(enlaceWhatsApp(''), null);
});

test('talleres: la hora escrita en la zona del taller se convierte bien, incluso con horario de verano', async () => {
  const { instanteEnZona, partesEnZona, vistaPreviaHorario } = await import('../../src/dominio/talleres');
  assert.equal(instanteEnZona('2026-11-09', '18:00', 'America/Guatemala')?.toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(instanteEnZona('2026-11-09', '18:00', 'America/Bogota')?.toISOString(), '2026-11-09T23:00:00.000Z');
  assert.equal(instanteEnZona('2026-11-09', '18:00', 'America/Argentina/Buenos_Aires')?.toISOString(), '2026-11-09T21:00:00.000Z');
  assert.equal(instanteEnZona('2026-07-01', '18:00', 'Europe/Madrid')?.toISOString(), '2026-07-01T16:00:00.000Z');   // verano: UTC+2
  assert.equal(instanteEnZona('2026-12-01', '18:00', 'Europe/Madrid')?.toISOString(), '2026-12-01T17:00:00.000Z');   // invierno: UTC+1
  assert.equal(instanteEnZona('2026-03-29', '02:30', 'Europe/Madrid'), null);   // hora que no existe (salto de verano)
  assert.equal(instanteEnZona('2026-13-01', '18:00', 'America/Guatemala'), null);
  assert.equal(instanteEnZona('2026-11-09', '18:00', 'Marte/Olympus'), null);
  assert.deepEqual(partesEnZona(new Date('2026-11-10T00:00:00Z'), 'America/Guatemala'), { fecha: '2026-11-09', hora: '18:00' });
  const vista = vistaPreviaHorario(new Date('2026-11-10T00:00:00Z'), 'America/Guatemala');
  assert.match(vista, /18:00 \(hora de Guatemala\)/);
  assert.match(vista, /19:00 en Bogotá/);
  assert.match(vista, /21:00 en Buenos Aires/);
  assert.match(vista, /01:00 en Madrid/);
});

test('presentación de la maestra: trayectoria informada, sin publicar hasta aprobarla', () => {
  assert.equal(TEXTOS_POR_DEFECTO.maestraLema, 'Una educadora que vela por las infancias');
  assert.equal(TEXTOS_POR_DEFECTO.presentacionAprobada, false);
  assert.equal(TEXTOS_POR_DEFECTO.maestraTrayectoria.length, 7);
  assert.ok(TEXTOS_POR_DEFECTO.maestraTrayectoria.every((x) => !/\d{4}/.test(x)), 'sin fechas inventadas');
  const t = combinarTextos({ maestraTrayectoria: ['  Diplomado  ', '', 3], presentacionAprobada: true, maestraLema: 'Otra frase' });
  assert.deepEqual(t.maestraTrayectoria, ['Diplomado']);
  assert.equal(t.presentacionAprobada, true);
  assert.equal(t.maestraLema, 'Otra frase');
  assert.equal(combinarTextos({ presentacionAprobada: 'si' }).presentacionAprobada, false);
  // Las preguntas frecuentes ya no prometen acceso sin vencimiento.
  assert.ok(!TEXTOS_POR_DEFECTO.preguntas.some((p) => /acceso a un curso comprado no vence/.test(p.respuesta)));
});
