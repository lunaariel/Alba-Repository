// Consultas del panel para la maestra (CI y local, SOLO con el Supabase local): Hoy, Alumnos (con el estado de cada
// acceso), Ventas y Certificados, en escritorio y celular. Y el campus personal: la admin no descarga desde su campus
// certificados ajenos (lo hace desde el panel); una alumna no entra a las consultas ni a la descarga del panel.
import { BASE, SALIDA, sql, crearInforme, navegadorNuevo, sinDesborde } from './lib/recorrido.mjs';

const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE } = process.env;
const { comprobar, vigilar, estado } = crearInforme();
const A = sql(`select id from auth.users where email = '${CORREO}'`);
const NOMBRE_A = sql(`select nombre_completo from public.perfiles where id = '${A}'`);
const CERT = sql(`select id || '|' || codigo_verificacion from public.certificados where perfil_id = '${A}' order by emitido_en limit 1`).split('|');

const navegador = await navegadorNuevo();
async function sesion(correo, clave, ancho = 1440) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
  const p = await ctx.newPage();
  vigilar(p);
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname !== '/ingresar', { timeout: 20000 }), p.click('button[type=submit]')]);
  return { ctx, p };
}

try {
  for (const ancho of [1440, 390]) {
    const { ctx, p } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, ancho);
    await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    comprobar(await p.getByRole('heading', { name: 'Incidencias sin resolver' }).isVisible() && await sinDesborde(p), `${ancho}px: Hoy muestra lo que pide atención, sin desborde`);
    await p.screenshot({ path: `${SALIDA}/panel-hoy-${ancho}.png`, fullPage: true });

    await p.goto(`${BASE}/admin/alumnos`, { waitUntil: 'networkidle' });
    comprobar(await p.getByText(NOMBRE_A).first().isVisible() && await sinDesborde(p), `${ancho}px: Alumnos lista a la alumna, sin desborde`);
    await p.screenshot({ path: `${SALIDA}/panel-alumnos-${ancho}.png`, fullPage: true });
    if (ancho === 1440) {
      const texto = await p.locator('main').innerText();
      comprobar(/Vigente|Sin vencimiento|Vence pronto/.test(texto), 'cada curso muestra el estado de su acceso');
      comprobar(!texto.includes(ADMIN_CORREO), 'la lista no incluye la cuenta administradora');
      await p.fill('input[name=q]', CORREO);
      await Promise.all([p.waitForURL(/q=/), p.getByRole('button', { name: 'Buscar' }).click()]);
      comprobar((await p.locator('main li >> text=' + NOMBRE_A).count()) >= 1 && /1 persona/.test(await p.locator('main').innerText()), 'la búsqueda por correo encuentra exactamente a la alumna');
      await p.goto(`${BASE}/admin/alumnos?filtro=vencidos`, { waitUntil: 'networkidle' });
      const vencidas = Number(sql(`select count(distinct a.perfil_id) from public.accesos_curso a where a.estado = 'activo' and not public.acceso_cubierto(a.id)
        and public.proximo_inicio_acceso(a.id) is null and not exists (select 1 from public.roles_usuario r where r.perfil_id = a.perfil_id and r.rol = 'admin')`));
      const enPagina = Number(((await p.locator('main').innerText()).match(/(\d+) persona/) ?? [0, -1])[1]);
      comprobar(enPagina === vencidas, `el filtro «vencidos» coincide con la base (${vencidas})`);
    }

    await p.goto(`${BASE}/admin/ventas`, { waitUntil: 'networkidle' });
    const ventas = await p.locator('main').innerText();
    comprobar(ventas.includes('Las ventas están cerradas') && /pago simulado/.test(ventas) && await sinDesborde(p), `${ancho}px: Ventas aclara que son simuladas y que la venta está cerrada`);
    await p.screenshot({ path: `${SALIDA}/panel-ventas-${ancho}.png`, fullPage: true });

    await p.goto(`${BASE}/admin/certificados?q=${CERT[1]}`, { waitUntil: 'networkidle' });
    comprobar(await p.getByText(`Código ${CERT[1]}`).isVisible() && await sinDesborde(p), `${ancho}px: Certificados busca por código`);
    await p.screenshot({ path: `${SALIDA}/panel-certificados-${ancho}.png`, fullPage: true });
    if (ancho === 1440) {
      const pdf = await p.request.get(`${BASE}/admin/certificados/${CERT[0]}/pdf`);
      comprobar(pdf.status() === 200 && (pdf.headers()['content-type'] ?? '').includes('application/pdf'), 'la admin descarga el certificado de una alumna desde el panel');
      const propio = await p.request.get(`${BASE}/campus/certificados/${CERT[0]}`);
      comprobar(propio.status() === 404, 'pero no desde su campus personal (404)');
    }
    await ctx.close();
  }

  // La alumna: su propio certificado desde el campus, nada del panel.
  const { p: al } = await sesion(CORREO, CLAVE);
  comprobar((await al.request.get(`${BASE}/campus/certificados/${CERT[0]}`)).status() === 200, 'la alumna descarga su certificado desde el campus');
  // Datos que la respuesta no debe traer (no figuran en la solicitud): título del curso del certificado, nombre de
  // otra alumna y acciones del panel. (El código buscado viaja en la propia URL de la solicitud.)
  const CURSO_CERT = sql(`select titulo_curso from public.certificados where id = '${CERT[0]}'`);
  const OTRA = sql(`select nombre_completo from public.perfiles p join auth.users u on u.id = p.id where u.email = '${process.env.CORREO2}'`);
  for (const ruta of ['/admin', '/admin/alumnos', '/admin/ventas', `/admin/certificados?q=${CERT[1]}`, `/admin/certificados/${CERT[0]}/pdf`]) {
    const r = await al.request.get(`${BASE}${ruta}`, { maxRedirects: 0 });
    const cuerpo = await r.text();
    comprobar(r.status() === 404 && !cuerpo.includes(CURSO_CERT) && !cuerpo.includes(OTRA) && !cuerpo.includes('Descargar PDF') && !cuerpo.includes('pago simulado'),
      `alumna: ${ruta.split('?')[0]} responde 404 sin datos`);
  }
  const visitante = await (await navegador.newContext()).newPage();
  const rv = await visitante.request.get(`${BASE}/admin/certificados/${CERT[0]}/pdf`, { maxRedirects: 0 });
  comprobar(rv.status() === 404, 'visitante: la descarga del panel responde 404');
} finally {
  await navegador.close();
}
for (const e of estado.errores) console.log(`  error en consola: ${e}`);
comprobar(estado.errores.length === 0, 'sin errores en la consola');
process.exit(estado.fallas ? 1 : 0);
