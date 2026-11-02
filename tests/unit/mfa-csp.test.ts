import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { normalizarCodigo, pasoSegundoFactor, reforzadaVigente, ultimaVerificacionTotp } from '../../src/dominio/mfa';
import { construirCsp, modoCsp, nuevoNonce, ORIGENES_VIDEO } from '../../src/config/csp';

// ------------------------------------------------------------------ segundo factor

test('mfa: el código se normaliza y solo se aceptan 6 dígitos', () => {
  assert.equal(normalizarCodigo('123456'), '123456');
  assert.equal(normalizarCodigo(' 123 456 '), '123456');
  assert.equal(normalizarCodigo('123-456'), '123456');
  for (const malo of ['12345', '1234567', 'abcdef', '', null, undefined, 123456]) assert.equal(normalizarCodigo(malo), null);
});

test('mfa: la última verificación TOTP sale del claim amr (no de la contraseña)', () => {
  const amr = [{ method: 'password', timestamp: 100 }, { method: 'totp', timestamp: 200 }, { method: 'totp', timestamp: 150 }];
  assert.equal(ultimaVerificacionTotp(amr), 200);
  assert.equal(ultimaVerificacionTotp([{ method: 'password', timestamp: 100 }]), null);
  assert.equal(ultimaVerificacionTotp('no es una lista'), null);
});

test('mfa: vigencia de la verificación reforzada (5 minutos, sin marcas futuras)', () => {
  const ahora = 1_800_000_000_000;
  const hace = (s: number) => [{ method: 'totp', timestamp: ahora / 1000 - s }];
  assert.equal(reforzadaVigente(hace(60), 5, ahora), true);
  assert.equal(reforzadaVigente(hace(299), 5, ahora), true);
  assert.equal(reforzadaVigente(hace(301), 5, ahora), false);
  assert.equal(reforzadaVigente(hace(-120), 5, ahora), false, 'una marca en el futuro no vale');
  assert.equal(reforzadaVigente([{ method: 'password', timestamp: ahora / 1000 }], 5, ahora), false);
});

test('mfa: qué paso sigue al ingresar', () => {
  // Quien registró un factor lo verifica siempre.
  assert.equal(pasoSegundoFactor({ actual: 'aal1', siguiente: 'aal2', esAdmin: false, politicaActiva: false }), 'verificar');
  assert.equal(pasoSegundoFactor({ actual: 'aal1', siguiente: 'aal2', esAdmin: true, politicaActiva: true }), 'verificar');
  // Admin sin factor: lo activa solo si la política lo exige.
  assert.equal(pasoSegundoFactor({ actual: 'aal1', siguiente: 'aal1', esAdmin: true, politicaActiva: true }), 'activar');
  assert.equal(pasoSegundoFactor({ actual: 'aal1', siguiente: 'aal1', esAdmin: true, politicaActiva: false }), null);
  // Alumna sin factor: nada cambia.
  assert.equal(pasoSegundoFactor({ actual: 'aal1', siguiente: 'aal1', esAdmin: false, politicaActiva: true }), null);
  assert.equal(pasoSegundoFactor({ actual: 'aal2', siguiente: 'aal2', esAdmin: true, politicaActiva: true }), null);
});

test('mfa: la política se lee de la base; ante un error se exige el segundo factor', () => {
  const s = readFileSync('src/datos/sesion.ts', 'utf8');
  assert.match(s, /rpc\('politica_seguridad_vigente'\)/);
  assert.match(s, /if \(error \|\| !p\) return \{ mfaAdminObligatorio: true/);
  assert.equal((s.match(/!\(await cumpleMfa\(\)\)/g) ?? []).length, 2, 'páginas y acciones del panel aplican la misma regla');
});

test('mfa: ningún código ni secreto se escribe en registros', () => {
  const archivos = ['src/datos/mfa.ts', 'app/(auth)/segundo-factor/acciones.ts', 'app/(auth)/acciones.ts'];
  for (const a of archivos) assert.doesNotMatch(readFileSync(a, 'utf8'), /console\.(log|info|warn|error)/, a);
});

/** Archivos .ts de un directorio, recursivo. */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('mfa: las acciones sensibles del panel piden la verificación reforzada', () => {
  const sensibles: Record<string, string[]> = {
    'app/admin/cursos/acciones.ts': ['guardarDatosCurso', 'cambiarEstadoCurso', 'eliminarCurso', 'publicarVersion', 'aplicarRevision',
      'bloquearContenido', 'anularValidacion', 'otorgarBeca', 'revocarBeca'],
    'app/admin/talleres/acciones.ts': ['guardarTaller', 'cambiarEstadoTaller', 'eliminarTaller', 'cancelarTaller', 'guardarCondicionesGrabacion',
      'resolverReembolsoParcial', 'reintentarOtorgamiento'],
  };
  for (const [archivo, acciones] of Object.entries(sensibles)) {
    const s = readFileSync(archivo, 'utf8');
    for (const a of acciones) {
      const inicio = s.indexOf(`export async function ${a}(`);
      assert.ok(inicio >= 0, `${a} existe`);
      const fin = s.indexOf('\nexport async function', inicio + 10);
      assert.match(s.slice(inicio, fin < 0 ? undefined : fin), /clienteOperacionSensible\(datos\)/, `${a} usa la verificación reforzada`);
    }
  }
  // Y la base lo exige por su cuenta (no depende de la interfaz).
  const m = readFileSync('supabase/migrations/20261102000026_mfa_reforzada.sql', 'utf8');
  for (const t of ['cursos', 'talleres', 'versiones_curso', 'periodos_acceso', 'roles_usuario', 'configuracion_academia', 'cupones', 'incidencias']) {
    assert.match(m, new RegExp(`on public\\.${t} for each row`), `disparador de verificación reforzada en ${t}`);
  }
  assert.ok(archivos('app').length > 0);
});

// ------------------------------------------------------------------ CSP

test('csp: política restrictiva con nonce, sin comodines ni unsafe-eval en producción', () => {
  const nonce = nuevoNonce();
  const csp = construirCsp({ nonce, desarrollo: false, supabaseUrl: 'https://abc.supabase.co/rest', https: true });
  assert.match(csp, new RegExp(`script-src 'self' 'nonce-${nonce.replace(/[+/=]/g, (c) => `\\${c}`)}' 'strict-dynamic'`));
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(csp, /(^|\s)\*(\s|;|$)/, 'sin comodín');
  assert.doesNotMatch(csp, /https:(\s|;)/, 'sin «cualquier origen https»');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co(;|$)/);
  assert.match(csp, new RegExp(`frame-src ${ORIGENES_VIDEO.join(' ')}`));
  assert.match(csp, /upgrade-insecure-requests/);
});

test('csp: en desarrollo admite lo que necesita Next (eval y websocket), nada más', () => {
  const csp = construirCsp({ nonce: nuevoNonce(), desarrollo: true, supabaseUrl: 'http://127.0.0.1:54321' });
  assert.match(csp, /'unsafe-eval'/);
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:54321 ws: wss:/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test('csp: nonce nuevo en cada solicitud y validado', () => {
  const a = nuevoNonce();
  assert.notEqual(a, nuevoNonce());
  assert.ok(Buffer.from(a, 'base64').length === 16);
  assert.throws(() => construirCsp({ nonce: "x' 'unsafe-inline", desarrollo: false }));
});

test('csp: modo de observación solo si se pide expresamente', () => {
  assert.equal(modoCsp(undefined), 'aplicar');
  assert.equal(modoCsp('cualquiera'), 'aplicar');
  assert.equal(modoCsp('observacion'), 'observacion');
  const mw = readFileSync('middleware.ts', 'utf8');
  assert.match(mw, /Content-Security-Policy-Report-Only/);
  assert.match(mw, /request\.headers\.set\('x-nonce', nonce\)/);
});
