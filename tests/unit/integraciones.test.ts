import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarConfiguracion, entornoDe } from '../../src/config/validacion';
import { VideoSimulado, firmaVideoSimulado, verificarVideoSimulado } from '../../src/servicios/video/simulado';
import { completarPlantilla } from '../../src/servicios/correo/plantillas';
import { procesarCola, type BaseCorreo } from '../../src/servicios/correo/procesar';
import { CorreoSimulado, type ProveedorCorreo } from '../../src/servicios/correo/tipos';
import { PagosSimulados } from '../../src/servicios/pagos/simulado';
import { procesarAvisoPago } from '../../src/servicios/pagos/procesar';
import type { EventoPago } from '../../src/servicios/pagos/tipos';

// ------------------------------------------------------------------ configuración

const jwt = (role: string) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;
const base = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'),
  NEXT_PUBLIC_URL_SITIO: 'http://localhost:3000', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
};
const SECRETO_REAL = 'valor-secreto-muy-largo-que-no-debe-aparecer-nunca-1234';

test('config: desarrollo con simuladores es válido (con avisos)', () => {
  const r = validarConfiguracion(base);
  assert.equal(r.entorno, 'desarrollo');
  assert.deepEqual(r.errores, []);
  assert.ok(r.avisos.some((a) => a.includes('Correo: simulado')));
});

test('config: faltan obligatorias → error controlado que nombra la variable', () => {
  const r = validarConfiguracion({ ...base, SUPABASE_SERVICE_ROLE_KEY: '' });
  assert.ok(r.errores.includes('SUPABASE_SERVICE_ROLE_KEY: falta.'));
});

test('config: producción rechaza simuladores, http, direcciones locales y valores de ejemplo', () => {
  const r = validarConfiguracion({ ...base, APP_ENTORNO: 'produccion', PROCESOS_CLAVE: 'cambiar-por-un-texto-largo-y-aleatorio', CONTACTO_SAL: 'corta' });
  const t = r.errores.join('\n');
  for (const esperado of ['VIDEO_PROVEEDOR', 'CORREO_PROVEEDOR', 'PAGOS_PROVEEDOR', 'NEXT_PUBLIC_URL_SITIO: en producción tiene que usar https://',
    'NEXT_PUBLIC_SUPABASE_URL: apunta a una dirección local', 'PROCESOS_CLAVE: tiene un valor de ejemplo', 'CONTACTO_SAL: demasiado corta']) {
    assert.ok(t.includes(esperado), `falta el error: ${esperado}\n${t}`);
  }
});

test('config: una clave de servicio en una variable pública es un error', () => {
  const r = validarConfiguracion({ ...base, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') });
  assert.ok(r.errores.some((e) => e.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')));
  const r2 = validarConfiguracion({ ...base, NEXT_PUBLIC_PAGOS_SECRETO: 'x' });
  assert.ok(r2.errores.some((e) => e.startsWith('NEXT_PUBLIC_PAGOS_SECRETO')));
});

test('config: los mensajes nunca incluyen valores de secretos', () => {
  const r = validarConfiguracion({ ...base, APP_ENTORNO: 'produccion', PROCESOS_CLAVE: SECRETO_REAL, CONTACTO_SAL: SECRETO_REAL,
    BUNNY_CLAVE_TOKEN: SECRETO_REAL, SUPABASE_SERVICE_ROLE_KEY: SECRETO_REAL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRETO_REAL + 'x' });
  for (const m of [...r.errores, ...r.avisos]) assert.ok(!m.includes(SECRETO_REAL), m);
});

test('config: entorno desconocido cae en desarrollo y se informa', () => {
  assert.equal(entornoDe({ APP_ENTORNO: 'otro' }), 'desarrollo');
  assert.ok(validarConfiguracion({ ...base, APP_ENTORNO: 'otro' }).errores.some((e) => e.startsWith('APP_ENTORNO')));
});

test('config: el servidor no arranca en producción con configuración inválida', () => {
  const i = readFileSync('instrumentation.ts', 'utf8');
  assert.match(i, /r\.errores\.length && r\.entorno === 'produccion'/);
  assert.match(i, /throw new Error/);
  assert.doesNotMatch(i, /process\.env\[/, 'no imprime valores');
});

// ------------------------------------------------------------------ video

test('video simulado: enlace temporal firmado; manipulado o vencido no sirve', async () => {
  const secreto = 'secreto-video-simulado-1234567890';
  const url = new URL(await new VideoSimulado(secreto).urlReproduccion('video-1', { segundosValidez: 600 }), 'http://x');
  const vence = url.searchParams.get('vence');
  const firma = url.searchParams.get('firma');
  assert.equal(url.pathname, '/video-simulado/video-1');
  assert.equal(verificarVideoSimulado(secreto, 'video-1', vence, firma), 'valido');
  assert.equal(verificarVideoSimulado(secreto, 'video-2', vence, firma), 'firma_invalida', 'otro video con la misma firma');
  assert.equal(verificarVideoSimulado(secreto, 'video-1', String(Number(vence) + 3600), firma), 'firma_invalida', 'vencimiento estirado');
  assert.equal(verificarVideoSimulado('otro-secreto-de-16-caracteres', 'video-1', vence, firma), 'firma_invalida');
  assert.equal(verificarVideoSimulado(secreto, 'video-1', null, null), 'firma_invalida');
  const pasado = Math.floor(Date.now() / 1000) - 10;
  assert.equal(verificarVideoSimulado(secreto, 'video-1', String(pasado), firmaVideoSimulado(secreto, 'video-1', pasado)), 'vencido');
});

test('video simulado: un error del proveedor se informa como error (el campus muestra «reintente»)', async () => {
  await assert.rejects(new VideoSimulado('secreto-video-simulado-1234567890', true).urlReproduccion('v', { segundosValidez: 60 }));
  const campus = readFileSync('src/datos/campus.ts', 'utf8');
  assert.match(campus, /rpc\('autorizar_video_leccion'/, 'la base autoriza cada video');
  assert.doesNotMatch(campus, /select\('video_id'\)/, 'el campus ya no lee video_id directamente');
  assert.match(campus, /catch \{\n\s+return \{ estado: 'error' \}/);
});

test('video: el reproductor simulado no existe en producción', () => {
  const r = readFileSync('app/video-simulado/[id]/route.ts', 'utf8');
  assert.match(r, /APP_ENTORNO === 'produccion'[^\n]*\n\s+return new NextResponse\('No encontrado', \{ status: 404 \}\)/);
  const idx = readFileSync('src/servicios/video/index.ts', 'utf8');
  assert.match(idx, /elegido === 'simulado' && process\.env\.APP_ENTORNO !== 'produccion'/);
});

// ------------------------------------------------------------------ correo

test('correo: plantillas completas o error; sin inyección de cabeceras', () => {
  assert.equal(completarPlantilla('Hola, {{nombre}}.', { nombre: 'Ana' }), 'Hola, Ana.');
  assert.equal(completarPlantilla('{{x}}', { x: 'a\r\nBcc: otro@x.y' }), 'a Bcc: otro@x.y');
  assert.throws(() => completarPlantilla('Hola, {{nombre}}', {}), /variable_faltante:nombre/);
});

function baseFalsa(filas: { id: string; plantilla_clave: string; destinatario: string; clave_idempotencia: string; variables: Record<string, unknown> }[]) {
  const registros: Record<string, unknown>[] = [];
  const db: BaseCorreo = {
    rpc: async (fn, args) => {
      if (fn === 'tomar_correos') return { data: filas, error: null };
      if (fn === 'registrar_envio_correo') registros.push(args!);
      return { data: null, error: null };
    },
    plantillas: async () => new Map([['confirmacion_compra', { asunto: 'Su compra', cuerpo: 'Hola, {{nombre}}. Compró «{{curso}}».' }]]),
  };
  return { db, registros };
}
const fila = (id: string, variables: Record<string, unknown>) => ({ id, plantilla_clave: 'confirmacion_compra', destinatario: 'a@prueba.test', clave_idempotencia: `c:${id}`, variables });

test('correo: con el simulado todo queda «simulado», nunca «enviado»', async () => {
  const { db, registros } = baseFalsa([fila('1', { nombre: 'Ana', curso: 'Montessori' })]);
  const sim = new CorreoSimulado();
  const r = await procesarCola(db, sim);
  assert.deepEqual(r, { procesados: 1, simulados: 1, enviados: 0, errores: 0 });
  assert.equal(registros[0]!.p_resultado, 'simulado');
  assert.equal(sim.mensajes[0]!.texto, 'Hola, Ana. Compró «Montessori».');
});

test('correo: un error se registra con un código, sin datos de la persona ni del mensaje', async () => {
  const { db, registros } = baseFalsa([fila('1', { nombre: 'Ana' }), fila('2', { nombre: 'Bea', curso: 'C' })]);
  const r = await procesarCola(db, new CorreoSimulado((m) => m.para === 'a@prueba.test' && m.claveIdempotencia === 'c:2'));
  assert.equal(r.errores, 2);
  assert.equal(registros[0]!.p_error, 'variable_faltante');
  assert.equal(registros[1]!.p_error, 'proveedor_no_disponible');
  for (const x of registros) assert.ok(!JSON.stringify(x).includes('Bea') && !JSON.stringify(x).includes('a@prueba.test'));
});

test('correo: solo un proveedor real puede registrar «enviado»', async () => {
  const { db, registros } = baseFalsa([fila('1', { nombre: 'Ana', curso: 'C' })]);
  const real: ProveedorCorreo = { nombre: 'real-de-prueba', simulado: false, enviar: async () => ({ idExterno: 'r1' }) };
  await procesarCola(db, real);
  assert.equal(registros[0]!.p_resultado, 'enviado');
});

// ------------------------------------------------------------------ pagos

async function escenario() {
  const p = new PagosSimulados('secreto-de-prueba-123456');
  const { idExterno } = await p.crearSesion({ ordenId: 'orden-1', montoCentavos: 4900 });
  const registrados: EventoPago[] = [];
  const registrar = async (e: EventoPago) => { registrados.push(e); return { data: { estado: 'ok' }, error: null }; };
  return { p, idExterno, registrados, registrar };
}

test('pagos: confirmado, rechazado, reembolso y contracargo se registran solo tras verificar con la pasarela', async () => {
  const { p, idExterno, registrados, registrar } = await escenario();
  for (const estado of ['aprobado', 'rechazado', 'reembolsado', 'contracargo'] as const) {
    const w = p.generarWebhook(idExterno, estado);
    const r = await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar);
    assert.equal(r.http, 200, estado);
  }
  assert.deepEqual(registrados.map((e) => `${e.tipo}:${e.estado}`), ['pago:aprobado', 'pago:rechazado', 'reembolso:reembolsado', 'contracargo:contracargo']);
});

test('pagos: firma inválida → 401 y nada se registra', async () => {
  const { p, idExterno, registrados, registrar } = await escenario();
  const w = p.generarWebhook(idExterno, 'aprobado');
  const r = await procesarAvisoPago(p, w.cuerpo.replace('4900', '1'), w.cabeceras, registrar);
  assert.equal(r.http, 401);
  assert.equal(registrados.length, 0);
});

test('pagos: un aviso no alcanza: si la pasarela no confirma el importe, 409 y nada se registra', async () => {
  const { p, idExterno, registrados, registrar } = await escenario();
  const w = p.generarWebhook(idExterno, 'aprobado', { montoAviso: 100 });
  assert.equal((await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar)).http, 409);
  // Aviso de «aprobado» cuando la pasarela dice otra cosa (p. ej. un aviso viejo reenviado).
  const viejo = p.generarWebhook(idExterno, 'aprobado');
  p.generarWebhook(idExterno, 'reembolsado');
  assert.equal((await procesarAvisoPago(p, viejo.cuerpo, viejo.cabeceras, registrar)).http, 409);
  assert.equal(registrados.length, 0);
});

test('pagos: error de comunicación → 503 sin registrar; el reintento posterior se registra', async () => {
  const { p, idExterno, registrados, registrar } = await escenario();
  const w = p.generarWebhook(idExterno, 'aprobado');
  p.sinConexion = true;
  assert.equal((await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar)).http, 503);
  assert.equal(registrados.length, 0);
  p.sinConexion = false;
  assert.equal((await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar)).http, 200);
  assert.equal(registrados.length, 1);
});

test('pagos: aviso duplicado y confirmación tardía llegan a la base con el mismo id de evento (idempotente allí)', async () => {
  const { p, idExterno, registrados, registrar } = await escenario();
  const w = p.generarWebhook(idExterno, 'aprobado', { idEvento: 'evt-fijo' });
  await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar);
  await procesarAvisoPago(p, w.cuerpo, w.cabeceras, registrar);
  assert.deepEqual(registrados.map((e) => e.idEvento), ['evt-fijo', 'evt-fijo'], 'la base deduplica por evento (prueba SQL 99m y 20_compras)');
});

test('pagos: si la base falla, 500 para que la pasarela reintente', async () => {
  const { p, idExterno } = await escenario();
  const w = p.generarWebhook(idExterno, 'aprobado');
  const r = await procesarAvisoPago(p, w.cuerpo, w.cabeceras, async () => ({ data: null, error: { message: 'caida' } }));
  assert.equal(r.http, 500);
});
