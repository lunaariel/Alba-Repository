// Recorrido del editor de cursos (Fase 5, entrega 2) en CI, con la admin de ejemplo.
// Crea un curso de punta a punta y comprueba las reglas de historial sobre los cursos de ejemplo
// que ya tienen alumnos (datos de tests/visual/campus.sh). Corre al final: modifica datos.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, CODIGO, PREGUNTA, PREGUNTA_C3, LECCION } = process.env;
const C1 = 'c1000000-0000-0000-0000-000000000001'; // comprado por la alumna, con avance
const C2 = 'c1000000-0000-0000-0000-000000000002'; // completo, con certificado e intentos
const C3 = 'c1000000-0000-0000-0000-000000000003'; // con acceso concedido

await mkdir(SALIDA, { recursive: true });
// Un PDF mínimo válido y un archivo que dice ser PDF pero no lo es.
const pdf = `${SALIDA}/../material-prueba.pdf`;
const falso = `${SALIDA}/../no-es-pdf.pdf`;
await writeFile(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
await writeFile(falso, 'esto no es un pdf');

const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };

async function ingresar(contexto, correo, clave) {
  const p = await contexto.newPage();
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  return p;
}
// Abre la confirmación de un botón, escribe la palabra si hace falta y confirma.
async function confirmar(p, boton, { palabra, textoConfirmar, campos = {} } = {}) {
  const texto = (await boton.first().textContent()).trim();
  await boton.first().click();
  const dialogo = p.locator('dialog[open]');
  for (const [nombre, valor] of Object.entries(campos)) await dialogo.locator(`[name=${nombre}]`).fill(valor);
  if (palabra) await dialogo.locator('input[name=confirmacion]').fill(palabra);
  await dialogo.getByRole('button', { name: textoConfirmar ?? texto, exact: true }).click();
  await p.waitForLoadState('networkidle');
}
// Espera a que aparezca un aviso con ese texto (hasta 15 s). Devuelve si apareció.
const ve = async (p, re) => {
  const ok = await p.locator('[role=status], [role=alert]').filter({ hasText: re }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!ok) {
    const vistos = await p.locator('[role=status], [role=alert]').allTextContents();
    console.log(`      (en ${p.url()} se ve: ${JSON.stringify(vistos)})`);
    await p.screenshot({ path: `${SALIDA}/recorrido-cursos-sin-aviso-${Date.now()}.png`, fullPage: true });
  }
  return ok;
};

const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const errores = [];
let p;
try {
  p = await ingresar(contexto, ADMIN_CORREO, ADMIN_CLAVE);
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

  // 1. Crear un curso: nace en borrador.
  await p.goto(`${BASE}/admin/cursos`, { waitUntil: 'networkidle' });
  await p.fill('#titulo', 'Curso de prueba del panel');
  await p.fill('#precio', '39');
  await Promise.all([p.waitForURL(/\/admin\/cursos\/[0-9a-f-]{36}\?ok=creado/), p.getByRole('button', { name: 'Crear curso' }).click()]);
  const id = new URL(p.url()).pathname.split('/').pop();
  const base = `/admin/cursos/${id}`;
  comprobar(await p.locator('main').getByText(/Borrador/).first().isVisible(), 'el curso nuevo nace en borrador');

  // 2. Datos y precio.
  await p.fill('#resumen', 'Un curso creado por el recorrido automático.');
  await p.getByLabel('Familias').check();
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await ve(p, /Cambios guardados/), 'se guardan los datos del curso');
  await p.fill('#precio', 'cuarenta');
  await p.getByRole('button', { name: 'Guardar cambios' }).click();
  comprobar(await ve(p, /precio en dólares/), 'un precio inválido se explica');

  // 3. Sin contenido no se puede publicar.
  await p.goto(`${BASE}${base}/publicacion`, { waitUntil: 'networkidle' });
  comprobar((await p.getByRole('button', { name: 'Publicar el curso' }).count()) === 0, 'sin temario ni evaluación no aparece «Publicar»');

  // 4. Temario: módulo, lección, PDF.
  await p.goto(`${BASE}${base}/temario`, { waitUntil: 'networkidle' });
  await p.fill('#nuevo-modulo', 'Primer módulo');
  await p.getByRole('button', { name: '+ Agregar módulo' }).click();
  await p.waitForLoadState('networkidle');
  comprobar(await ve(p, /Módulo agregado/), 'se agrega un módulo');
  await p.getByLabel('Nueva lección en este módulo').fill('Primera lección');
  await Promise.all([p.waitForURL(/\/temario\/[0-9a-f-]{36}/), p.getByRole('button', { name: '+ Agregar lección' }).click()]);
  await p.fill('#duracion', '12');
  await p.fill('#descripcion', 'Descripción de la primera lección.');
  await p.getByRole('button', { name: 'Guardar lección' }).click();
  comprobar(await ve(p, /Lección guardada/), 'se guarda la lección');
  await p.fill('#video', 'no-es-un-id');
  await p.getByRole('button', { name: 'Guardar lección' }).click();
  comprobar(/8-4-4-4-12/.test(await p.locator('#video-error').textContent()), 'un id de video inválido se explica');
  await p.reload({ waitUntil: 'networkidle' });

  await p.setInputFiles('#pdf', falso);
  await p.getByRole('button', { name: 'Subir PDF' }).click();
  await p.getByText(/no es un PDF válido|No se pudo/).first().waitFor({ timeout: 20000 });
  comprobar(true, 'un archivo que no es PDF se rechaza');
  await p.setInputFiles('#pdf', pdf);
  await p.fill('#pdf-titulo', 'Guía de prueba');
  await p.getByRole('button', { name: 'Subir PDF' }).click();
  await p.getByText('Material agregado.').waitFor({ timeout: 20000 });
  comprobar(await p.getByText('Guía de prueba').first().waitFor({ timeout: 15000 }).then(() => true, () => false),
    'el PDF se sube al almacenamiento privado y queda en la lección');
  await p.screenshot({ path: `${SALIDA}/recorrido-cursos-1-leccion.png`, fullPage: true });

  // 5. Evaluación: una pregunta con tema y criterios.
  await p.goto(`${BASE}${base}/evaluacion/nueva`, { waitUntil: 'networkidle' });
  await p.fill('#enunciado', '¿Qué conviene hacer antes de intervenir?');
  await p.fill('#tema', 'Observación');
  await p.getByLabel('Texto de la opción 1').fill('Observar');
  await p.getByLabel('Texto de la opción 2').fill('Corregir enseguida');
  await Promise.all([p.waitForURL(/ok=pregunta_creada/), p.getByRole('button', { name: 'Crear pregunta' }).click()]);
  comprobar(true, 'se crea la pregunta');
  await p.goto(`${BASE}${base}/evaluacion`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/tiene una sola pregunta/).isVisible(), 'avisa que un tema con una sola pregunta revelaría la fallada');
  await p.fill('#puntaje', '60');
  await p.getByRole('button', { name: 'Guardar criterios' }).click();
  comprobar(await ve(p, /Criterios guardados/), 'se guardan los criterios de aprobación');

  // 6. Publicar con confirmación; aparece en el sitio.
  await p.goto(`${BASE}${base}/publicacion`, { waitUntil: 'networkidle' });
  await confirmar(p, p.getByRole('button', { name: 'Publicar el curso' }));
  comprobar(await ve(p, /publicado/i), 'el curso se publica tras confirmar');
  const publico = await (await contexto.request.get(`${BASE}/cursos`)).text();
  comprobar(publico.includes('Curso de prueba del panel'), 'el curso publicado aparece en el catálogo');

  // 7. Reglas de historial sobre cursos con alumnos (ya versionados: se edita el borrador).
  await p.goto(`${BASE}/admin/cursos/${C1}/temario`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/Está editando el/).first().isVisible(), 'el temario avisa que se edita el borrador');
  const primera = p.locator('li', { hasText: 'Qué significa acompañar' }).first();
  comprobar((await primera.getByRole('button', { name: 'Eliminar' }).count()) === 0 && (await primera.getByRole('button', { name: 'Retirar' }).count()) === 1,
    'una lección ya vista solo se puede retirar, no eliminar');

  // 8. Versionado: retirar del borrador no cambia nada hasta publicar una versión nueva.
  const alumna = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pa = await ingresar(alumna, CORREO, CLAVE);
  const cursoAlumna = `${BASE}/campus/cursos/demo-autonomia-0-3`;
  await p.goto(`${BASE}/admin/cursos/${C2}/temario`, { waitUntil: 'networkidle' });
  const rutinas = p.locator('li', { hasText: 'Rutinas que dan autonomía' }).first();
  await confirmar(p, rutinas.getByRole('button', { name: 'Retirar' }));
  comprobar(await ve(p, /Retirado/), 'se retira una lección del borrador de un curso con certificados');
  let ficha = await (await contexto.request.get(`${BASE}/cursos/demo-autonomia-0-3`)).text();
  comprobar(ficha.includes('Rutinas que dan autonomía'), 'retirar del borrador no cambia el sitio hasta publicar');

  await p.goto(`${BASE}/admin/cursos/${C2}/publicacion`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/Lecciones quitadas: Rutinas que dan autonomía/).isVisible(), 'la publicación muestra la diferencia con la versión vigente');
  await confirmar(p, p.getByRole('button', { name: 'Publicar la versión 2' }), { palabra: 'PUBLICAR', campos: { resumen: 'Se quitó la lección de rutinas; el resto no cambia.' } });
  comprobar(await ve(p, /Versión publicada/), 'se publica la versión 2 tras escribir PUBLICAR y el resumen');
  comprobar(await p.locator('table').getByText('vigente').isVisible(), 'el historial de versiones marca la vigente');
  await p.screenshot({ path: `${SALIDA}/recorrido-versiones-1-publicacion.png`, fullPage: true });
  ficha = await (await contexto.request.get(`${BASE}/cursos/demo-autonomia-0-3`)).text();
  comprobar(!ficha.includes('Rutinas que dan autonomía'), 'el sitio muestra la versión 2');
  let verificacion = await (await contexto.request.get(`${BASE}/verificar/${CODIGO}`)).text();
  comprobar(verificacion.includes('Certificado válido') && verificacion.includes('versión 1'), 'el certificado emitido sigue válido e indica la versión 1');

  // La alumna sigue en la versión 1 hasta que decide cambiar.
  await pa.goto(cursoAlumna, { waitUntil: 'networkidle' });
  comprobar(await pa.getByText('Rutinas que dan autonomía').first().isVisible() && await pa.getByText(/Programa: versión 1/).isVisible(),
    'la alumna sigue en la versión 1, con su temario completo');
  comprobar(await pa.getByText('Hay una versión más reciente de este curso').isVisible(), 'la alumna ve que hay una versión nueva, sin cambio automático');
  await pa.screenshot({ path: `${SALIDA}/recorrido-versiones-2-alumna-v1.png`, fullPage: true });
  await Promise.all([pa.waitForURL(/\/version$/), pa.getByRole('link', { name: /Ver qué cambia/ }).click()]);
  comprobar(await pa.getByText(/Ya no forman parte del programa: Rutinas que dan autonomía/).isVisible(), 'antes de cambiar ve qué lecciones salen');
  comprobar(await pa.getByText(/La evaluación final es la misma/).isVisible(), 'antes de cambiar ve si la evaluación cambia');
  await pa.screenshot({ path: `${SALIDA}/recorrido-versiones-3-que-cambia.png`, fullPage: true });
  await pa.getByLabel(/Entiendo qué cambia/).check();
  await Promise.all([pa.waitForURL(/aviso=version-cambiada/), pa.getByRole('button', { name: 'Pasar a la versión 2' }).click()]);
  comprobar(await pa.getByText(/Programa: versión 2/).isVisible(), 'tras confirmar, la alumna sigue la versión 2');
  comprobar((await pa.getByText('Rutinas que dan autonomía').count()) === 0, 'su temario ya es el de la versión 2');
  comprobar(await pa.getByText(/Certificado de una versión anterior/).isVisible(), 'conserva el certificado de la versión 1');
  comprobar(await pa.getByText(/Aprobada en la versión anterior/).isVisible(), 'la misma evaluación aprobada se reconoce');
  await pa.getByRole('button', { name: 'Obtener mi certificado' }).click({ noWaitAfter: true });
  await pa.getByText('Su certificado está listo').first().waitFor({ timeout: 20000 });
  comprobar(true, 'obtiene el certificado de la versión 2 sin rendir de nuevo');
  await pa.screenshot({ path: `${SALIDA}/recorrido-versiones-4-alumna-v2.png`, fullPage: true });
  verificacion = await (await contexto.request.get(`${BASE}/verificar/${CODIGO}`)).text();
  comprobar(verificacion.includes('Certificado válido') && verificacion.includes('versión 1'), 'el certificado anterior sigue válido y sigue diciendo versión 1');
  const sinVersion = await pa.goto(`${cursoAlumna}/version`, { waitUntil: 'networkidle' });
  comprobar(new URL(pa.url()).pathname === '/campus/cursos/demo-autonomia-0-3' && sinVersion.ok(), 'ya en la vigente, la página de cambio no ofrece nada');

  // 9. Revisión favorable en dos pasos, sobre la pregunta de c3 (la alumna tiene un intento con «Incorrecta»).
  await p.goto(`${BASE}/admin/cursos/${C3}/evaluacion/${PREGUNTA_C3}`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/forma parte de la versión publicada 1/).isVisible(), 'una pregunta publicada avisa que no se modifica');
  await Promise.all([p.waitForURL(/\/revision$/), p.getByRole('link', { name: 'Revisión favorable' }).click()]);
  await p.getByLabel('Incorrecta').check();
  await p.fill('#motivo', 'La consigna admitía las dos respuestas.');
  await Promise.all([p.waitForURL(/calculo=/), p.getByRole('button', { name: 'Calcular el impacto' }).click()]);
  comprobar(await p.getByText('1 intento mejora').isVisible() && await p.getByText(/Pasa a aprobado/).isVisible(), 'el cálculo muestra a quién beneficia, sin aplicar nada');
  await p.screenshot({ path: `${SALIDA}/recorrido-versiones-5-revision.png`, fullPage: true });
  await p.fill('#confirmar-revision', 'CORREGIR');
  await p.getByRole('button', { name: 'Aplicar la revisión favorable' }).click();
  comprobar(await ve(p, /confirmación no coincide/), 'sin la confirmación exacta no se aplica');
  await p.fill('#confirmar-revision', 'CORREGIR 1');
  await p.getByRole('button', { name: 'Aplicar la revisión favorable' }).click();
  comprobar(await ve(p, /Revisión favorable aplicada/), 'con CORREGIR 1 se aplica');
  comprobar(await p.getByText(/Revisiones aplicadas/).isVisible(), 'la revisión queda listada con su motivo');

  // 10. Bloqueo excepcional de una lección publicada (y desbloqueo), con motivo.
  await p.goto(`${BASE}/admin/cursos/${C1}/temario/${LECCION}`, { waitUntil: 'networkidle' });
  await confirmar(p, p.getByRole('button', { name: 'Bloquear la lección' }), { palabra: 'BLOQUEAR', campos: { motivo: 'Contenido con un error que confunde.' } });
  comprobar(await ve(p, /Contenido bloqueado/), 'se bloquea una lección con motivo');
  await pa.goto(`${BASE}/campus/cursos/demo-montessori-en-casa`, { waitUntil: 'networkidle' });
  comprobar((await pa.getByText('Un espacio a su altura').count()) === 0, 'la lección bloqueada no se muestra a la alumna');
  await p.goto(`${BASE}/admin/cursos/${C1}/temario/${LECCION}`, { waitUntil: 'networkidle' });
  await confirmar(p, p.getByRole('button', { name: 'Desbloquear' }), { palabra: 'DESBLOQUEAR', campos: { motivo: 'Se corrigió el contenido del video.' } });
  comprobar(await ve(p, /Contenido desbloqueado/), 'se desbloquea con motivo');

  await p.goto(`${BASE}/admin/cursos/${C2}/evaluacion`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/editando el borrador de la evaluación/).isVisible(), 'la evaluación avisa que se edita el borrador');
  comprobar((await p.locator('li', { hasText: 'Pregunta de ejemplo' }).getByRole('button', { name: 'Eliminar' }).count()) === 0, 'una pregunta respondida no se puede eliminar');
  await p.goto(`${BASE}/admin/cursos/${C2}/evaluacion/${PREGUNTA}`, { waitUntil: 'networkidle' });
  comprobar((await p.getByRole('button', { name: 'Quitar' }).count()) === 0, 'las opciones de una pregunta respondida no se pueden quitar');

  await p.goto(`${BASE}/admin/cursos/${C1}/publicacion`, { waitUntil: 'networkidle' });
  comprobar((await p.getByRole('button', { name: 'Volver a borrador' }).count()) === 0 && (await p.getByRole('button', { name: 'Eliminar el curso' }).count()) === 0,
    'un curso con alumnos no vuelve a borrador ni se elimina');

  // Archivar un curso con alumnos: sale del catálogo, la alumna lo conserva.
  await p.goto(`${BASE}/admin/cursos/${C3}/publicacion`, { waitUntil: 'networkidle' });
  await confirmar(p, p.getByRole('button', { name: 'Archivar' }), { palabra: 'ARCHIVAR' });
  comprobar(await ve(p, /archivado/i), 'se archiva un curso con alumnos tras escribir ARCHIVAR');
  const catalogo = await (await contexto.request.get(`${BASE}/cursos`)).text();
  comprobar(!catalogo.includes('El ambiente preparado de 3 a 6'), 'el curso archivado sale del catálogo');
  await pa.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
  comprobar(await pa.getByText('El ambiente preparado de 3 a 6').first().isVisible(), 'la alumna conserva el curso archivado en su campus');
  const editor = await alumna.request.get(`${BASE}/admin/cursos/${C1}/temario`);
  comprobar(editor.status() === 404, `la alumna no abre el editor de cursos (${editor.status()})`);
  await alumna.close();
  await p.screenshot({ path: `${SALIDA}/recorrido-cursos-2-archivado.png`, fullPage: true });

  // 11. Todo quedó en el registro de actividad.
  await p.goto(`${BASE}/admin/configuracion/actividad?grupo=cursos`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText('Creó un curso').first().isVisible() && await p.getByText('Cambió una lección').first().isVisible(),
    'el registro muestra la creación del curso y el retiro de la lección');
  comprobar(await p.getByText('Publicó una versión de un curso').first().isVisible() && await p.getByText('Bloqueó contenido en todas las versiones').first().isVisible(),
    'el registro muestra la versión publicada y el bloqueo');
  await p.goto(`${BASE}/admin/configuracion/actividad?grupo=evaluaciones`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText('Aplicó una revisión favorable').first().isVisible(), 'el registro muestra la revisión favorable aplicada');
  await p.screenshot({ path: `${SALIDA}/recorrido-versiones-6-actividad.png`, fullPage: true });
  for (const e of errores) console.log(`  error en consola: ${e}`);
  comprobar(errores.length === 0, 'sin errores en la consola');
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${p?.url()})`);
  await p?.screenshot({ path: `${SALIDA}/recorrido-cursos-error.png`, fullPage: true }).catch(() => {});
}
await navegador.close();
process.exit(fallas ? 1 : 0);
