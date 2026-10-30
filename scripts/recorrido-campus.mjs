// Recorrido de punta a punta del campus con la alumna de ejemplo (solo CI, datos de tests/visual/campus.sh).
// Comprueba: progreso manual, corrección en el servidor, certificado sin duplicados, PDF, verificación
// pública y que nadie vea lo ajeno. Guarda capturas de los pasos en SALIDA.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const { CORREO, CLAVE, LECCION } = process.env;
const UUID_AJENO = '00000000-0000-4000-8000-000000000000';

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };

// 1. Sin sesión, el campus y los archivos privados piden ingresar.
{
  const anonimo = await navegador.newContext();
  const p = await anonimo.newPage();
  await p.goto(`${BASE}/campus`);
  comprobar(new URL(p.url()).pathname === '/ingresar', 'sin sesión, /campus lleva a /ingresar');
  const r = await anonimo.request.get(`${BASE}/campus/certificados/${UUID_AJENO}`, { maxRedirects: 0 });
  comprobar([302, 303, 307, 308].includes(r.status()), `sin sesión, un certificado redirige (estado ${r.status()})`);
  await anonimo.close();
}

const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await contexto.newPage();
console.log(`lección de partida: ${LECCION}`);
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
const foto = (nombre) => p.screenshot({ path: `${SALIDA}/recorrido-${nombre}.png`, fullPage: true });

try {
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', CORREO);
  await p.fill('#contrasena', CLAVE);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  comprobar(true, 'ingreso con la alumna de ejemplo');

  // 2. Progreso manual: completar la segunda lección lleva a la tercera y sube el avance.
  const curso1 = '/campus/cursos/demo-montessori-en-casa';
  await p.goto(`${BASE}${curso1}/lecciones/${LECCION}`, { waitUntil: 'networkidle' });
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith(LECCION)), p.getByRole('button', { name: 'Completar y seguir' }).click()]);
  comprobar(/\/lecciones\//.test(p.url()), 'completar y seguir abre la lección siguiente');
  await p.goto(`${BASE}${curso1}`);
  comprobar(await p.getByText('2 de 3 lecciones completadas').first().isVisible(), 'el avance muestra 2 de 3');
  await foto('1-curso-con-avance');

  // 3. Evaluación: el HTML no trae las respuestas; se corrige en el servidor.
  const curso3 = '/campus/cursos/demo-ambiente-3-6';
  const html = await (await p.goto(`${BASE}${curso3}/evaluacion`, { waitUntil: 'networkidle' })).text();
  comprobar(!/es_correcta|"correcta"\s*:/i.test(html), 'la página de evaluación no contiene la respuesta correcta');
  for (const op of await p.getByLabel('Incorrecta', { exact: true }).all()) await op.check();
  await p.getByRole('button', { name: 'Enviar respuestas' }).click();
  await p.getByText('0 puntos').waitFor({ timeout: 15000 });
  comprobar(true, 'respuestas incorrectas: 0 puntos');
  await foto('2-evaluacion-desaprobada');
  await p.getByRole('button', { name: 'Intentar de nuevo' }).click();
  for (const op of await p.getByLabel('Correcta', { exact: true }).all()) await op.check();
  await p.getByRole('button', { name: 'Enviar respuestas' }).click();
  await p.getByText('100 puntos').waitFor({ timeout: 15000 });
  comprobar(true, 'respuestas correctas: 100 puntos');
  await foto('3-evaluacion-aprobada');

  // 4. Certificado: se emite una vez; pedirlo de nuevo devuelve el mismo.
  await Promise.all([p.waitForURL((u) => u.pathname === curso3), p.getByRole('link', { name: 'Ir a mi certificado' }).click()]);
  await Promise.all([p.waitForURL(/aviso=certificado-listo/), p.getByRole('button', { name: 'Obtener mi certificado' }).click()]);
  const enlace = p.getByRole('link', { name: 'Descargar PDF' });
  const href = await enlace.getAttribute('href');
  const codigo = (await p.locator('text=Código de verificación').locator('span').first().textContent())?.trim();
  await foto('4-certificado-listo');
  const pdf = await contexto.request.get(`${BASE}${href}`);
  comprobar(pdf.status() === 200 && (pdf.headers()['content-type'] ?? '').includes('application/pdf'), 'el certificado se descarga como PDF');
  await writeFile(`${SALIDA}/recorrido-certificado.pdf`, await pdf.body());
  const pdf2 = await contexto.request.get(`${BASE}${href}`);
  comprobar(pdf2.status() === 200, 'el PDF se puede volver a generar');
  await p.goto(`${BASE}/campus`);
  comprobar((await p.getByText('Ver curso y certificado').count()) === 2, 'dos cursos con certificado, sin duplicados');

  // 5. Verificación pública del código.
  const publico = await navegador.newContext();
  const v = await publico.newPage();
  await v.goto(`${BASE}/verificar/${codigo}`);
  comprobar(await v.getByText('Certificado válido').isVisible(), `el código ${codigo} se verifica sin sesión`);
  await publico.close();

  // 6. Lo ajeno no se ve.
  const ajeno = await contexto.request.get(`${BASE}/campus/certificados/${UUID_AJENO}`);
  comprobar(ajeno.status() === 404, `certificado inexistente o ajeno: ${ajeno.status()}`);
  const material = await contexto.request.get(`${BASE}/campus/materiales/${UUID_AJENO}`, { maxRedirects: 0 });
  comprobar(material.status() === 404, `material ajeno: ${material.status()}`);
  const otroCurso = await contexto.request.get(`${BASE}/campus/cursos/curso-que-no-compro`);
  comprobar(otroCurso.status() === 404, `curso sin acceso: ${otroCurso.status()}`);
} catch (e) {
  // Si un paso se cuelga, deja la captura y la dirección para diagnosticar.
  comprobar(false, `${String(e.message).split('\n')[0]} (en ${p.url()})`);
  await p.screenshot({ path: `${SALIDA}/recorrido-error.png`, fullPage: true }).catch(() => {});
}

for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
