// Recorrido del editor de cursos (Fase 5, entrega 2) en CI, con la admin de ejemplo.
// Crea un curso de punta a punta y comprueba las reglas de historial sobre los cursos de ejemplo
// que ya tienen alumnos (datos de tests/visual/campus.sh). Corre al final: modifica datos.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, CODIGO, PREGUNTA } = process.env;
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
async function confirmar(p, boton, { palabra, textoConfirmar } = {}) {
  const texto = (await boton.first().textContent()).trim();
  await boton.first().click();
  const dialogo = p.locator('dialog[open]');
  if (palabra) await dialogo.locator('input[name=confirmacion]').fill(palabra);
  await dialogo.getByRole('button', { name: textoConfirmar ?? texto, exact: true }).click();
  await p.waitForLoadState('networkidle');
}
// Espera a que aparezca un aviso con ese texto (hasta 15 s). Devuelve si apareció.
const ve = (p, re) => p.locator('[role=status], [role=alert]').filter({ hasText: re }).first()
  .waitFor({ timeout: 15000 }).then(() => true, () => false);

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
  await p.waitForLoadState('networkidle');
  comprobar(await p.getByText('Guía de prueba').first().isVisible(), 'el PDF se sube al almacenamiento privado y queda en la lección');
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

  // 7. Reglas de historial sobre cursos con alumnos.
  await p.goto(`${BASE}/admin/cursos/${C1}/temario`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/Este curso tiene alumnos/).isVisible(), 'el temario avisa que el curso tiene alumnos');
  const primera = p.locator('li', { hasText: 'Qué significa acompañar' }).first();
  comprobar((await primera.getByRole('button', { name: 'Eliminar' }).count()) === 0 && (await primera.getByRole('button', { name: 'Retirar' }).count()) === 1,
    'una lección ya vista solo se puede retirar, no eliminar');
  comprobar(await p.getByText(/deberá completar también la lección nueva|deberán completar también/).first().isVisible(), 'al agregar lecciones se avisa a cuántos alumnos afecta');

  await p.goto(`${BASE}/admin/cursos/${C2}/temario`, { waitUntil: 'networkidle' });
  const rutinas = p.locator('li', { hasText: 'Rutinas que dan autonomía' }).first();
  await confirmar(p, rutinas.getByRole('button', { name: 'Retirar' }));
  comprobar(await ve(p, /Retirado/), 'se retira una lección de un curso con certificados');
  const ficha = await (await contexto.request.get(`${BASE}/cursos/demo-autonomia-0-3`)).text();
  comprobar(!ficha.includes('Rutinas que dan autonomía'), 'la lección retirada ya no se ve en el sitio');
  const verificacion = await (await contexto.request.get(`${BASE}/verificar/${CODIGO}`)).text();
  comprobar(verificacion.includes('Certificado válido'), 'el certificado emitido sigue siendo válido');
  await p.goto(`${BASE}/admin/cursos/${C2}/temario`, { waitUntil: 'networkidle' });
  await confirmar(p, p.locator('li', { hasText: 'Rutinas que dan autonomía' }).first().getByRole('button', { name: 'Restaurar' }));
  comprobar(await ve(p, /Restaurado/), 'la lección se puede restaurar');

  await p.goto(`${BASE}/admin/cursos/${C2}/evaluacion`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText(/ya tiene \d+ intento/).isVisible(), 'la evaluación avisa que ya tiene intentos');
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
  const alumna = await navegador.newContext();
  const pa = await ingresar(alumna, CORREO, CLAVE);
  comprobar(await pa.getByText('El ambiente preparado de 3 a 6').first().isVisible(), 'la alumna conserva el curso archivado en su campus');
  const editor = await alumna.request.get(`${BASE}/admin/cursos/${C1}/temario`);
  comprobar(editor.status() === 404, `la alumna no abre el editor de cursos (${editor.status()})`);
  await alumna.close();
  await p.screenshot({ path: `${SALIDA}/recorrido-cursos-2-archivado.png`, fullPage: true });

  // 8. Todo quedó en el registro de actividad.
  await p.goto(`${BASE}/admin/configuracion/actividad?grupo=cursos`, { waitUntil: 'networkidle' });
  comprobar(await p.getByText('Creó un curso').first().isVisible() && await p.getByText('Cambió una lección').first().isVisible(),
    'el registro muestra la creación del curso y el retiro de la lección');
  for (const e of errores) console.log(`  error en consola: ${e}`);
  comprobar(errores.length === 0, 'sin errores en la consola');
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${p?.url()})`);
  await p?.screenshot({ path: `${SALIDA}/recorrido-cursos-error.png`, fullPage: true }).catch(() => {});
}
await navegador.close();
process.exit(fallas ? 1 : 0);
