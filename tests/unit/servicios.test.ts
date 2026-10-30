import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PagosSimulados } from '../../src/servicios/pagos/simulado';
import { LEYENDA_NO_FISCAL, SoloRecibo } from '../../src/servicios/facturacion/solo-recibo';
import { ReunionManual } from '../../src/servicios/reuniones/manual';
import { CorreoEnMemoria } from '../../src/servicios/correo/tipos';

test('pasarela simulada: webhook firmado se acepta, alterado se rechaza', async () => {
  const p = new PagosSimulados('secreto-de-prueba-123456');
  const sesion = await p.crearSesion({ ordenId: 'orden-1', montoCentavos: 4900 });
  assert.match(sesion.urlCheckout, /pago-simulado/);

  const { cuerpo, cabeceras } = p.generarWebhook(sesion.idExterno, 'aprobado');
  const evento = await p.verificarEvento(cuerpo, cabeceras);
  assert.equal(evento.estado, 'aprobado');
  assert.equal(evento.ordenId, 'orden-1');
  assert.equal(evento.montoCentavos, 4900);

  const alterado = cuerpo.replace('4900', '1');
  await assert.rejects(p.verificarEvento(alterado, cabeceras), /firma_invalida/);
  await assert.rejects(p.verificarEvento(cuerpo, {}), /firma_invalida/);
  assert.deepEqual(await p.consultarEstado(sesion.idExterno), { estado: 'aprobado', montoCentavos: 4900 });
});

test('pasarela simulada exige un secreto razonable', () => {
  assert.throws(() => new PagosSimulados('corto'));
});

test('el recibo comercial dice que no es fiscal', async () => {
  const r = await new SoloRecibo('Albor').emitir({
    ordenId: 'abcdef12-0000', fecha: new Date('2026-10-30T12:00:00Z'),
    cliente: { nombre: 'Alumna', correo: 'a@prueba.test' },
    items: [{ descripcion: 'Montessori en casa', precioCentavos: 4900 }], totalCentavos: 2450,
  });
  assert.equal(r.tipo, 'recibo');
  assert.match(r.contenido, /USD 24\.50/);
  assert.ok(r.contenido.includes(LEYENDA_NO_FISCAL));
});

test('reunión manual solo acepta enlaces https', async () => {
  assert.throws(() => new ReunionManual('no es un enlace'));
  assert.throws(() => new ReunionManual('http://zoom.us/j/1'));
  const r = await new ReunionManual('https://zoom.us/j/123').crear();
  assert.equal(r.enlaceAnfitrion, null);
});

test('correo en memoria no envía dos veces el mismo mensaje', async () => {
  const c = new CorreoEnMemoria();
  const m = { para: 'a@prueba.test', plantilla: 'confirmacion_compra' as const, variables: {}, claveIdempotencia: 'confirmacion_compra:o1' };
  await c.enviar(m);
  const segundo = await c.enviar(m);
  assert.equal(c.enviados.length, 1);
  assert.equal(segundo.idExterno, 'duplicado-ignorado');
});

test('VideoBunny firma la URL con la fórmula de Bunny', async () => {
  const { VideoBunny } = await import('../../src/servicios/video/bunny');
  const { createHash } = await import('node:crypto');
  const id = 'eb1c4f77-0cda-46be-b47d-1118ad7c2ffe';
  const url = new URL(await new VideoBunny('759', 'clave-secreta').urlReproduccion(id, { segundosValidez: 600 }));
  assert.equal(url.origin + url.pathname, `https://player.mediadelivery.net/embed/759/${id}`);
  const expires = Number(url.searchParams.get('expires'));
  assert.ok(Math.abs(expires - (Math.floor(Date.now() / 1000) + 600)) <= 2);
  assert.equal(url.searchParams.get('token'), createHash('sha256').update('clave-secreta' + id + expires).digest('hex'));
  assert.ok(!url.toString().includes('clave-secreta'), 'la clave nunca viaja en la URL');
  await assert.rejects(new VideoBunny('759', 'k').urlReproduccion('../otro', { segundosValidez: 1 }));
});

test('El certificado PDF se genera, dice que no es acreditación oficial y tolera nombres fuera de WinAnsi', async () => {
  const { generarCertificadoPdf, LEYENDA_CERTIFICADO } = await import('../../src/servicios/certificados/pdf');
  const bytes = await generarCertificadoPdf({
    nombre: 'Ana Łucja Núñez 😊', curso: 'Curso de prueba', emitidoEn: new Date('2026-10-30T12:00:00Z'),
    codigo: 'ABCDEF123456', urlVerificacion: 'https://albor.example/verificar/ABCDEF123456',
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.match(LEYENDA_CERTIFICADO, /No constituye una acreditación Montessori oficial/);
});
