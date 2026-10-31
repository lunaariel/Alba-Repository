// Recorrido de la entrega 3 (talleres) en CI, con la admin y la alumna de ejemplo.
// Crear, publicar, inscripción gratuita, cupo, enlace desde la confirmación, participantes y CSV,
// reprogramar con respuesta de la alumna, duplicar, cancelar la inscripción (24 h), talleres pagos sin
// cancelación ordinaria, cortesías nuevas retiradas, grabación (estados), cancelar el taller, pago tardío
// con incidencia, procesos programados, permisos y capturas en escritorio (1440) y celular (390).
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = process.env.SALIDA ?? 'capturas';
const DB = process.env.DB ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const { CORREO, CLAVE, ADMIN_CORREO, ADMIN_CLAVE, PROCESOS_CLAVE } = process.env;
const sql = (q) => execFileSync('psql', [DB, '-q', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8' }).trim();

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
let fallas = 0;
const comprobar = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}`); if (!ok) fallas++; };
const errores = [];

async function sesion(correo, clave, viewport = { width: 1440, height: 900 }) {
  const contexto = await navegador.newContext({ viewport });
  const p = await contexto.newPage();
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  if (correo) {
    await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
    await p.fill('#correo', correo);
    await p.fill('#contrasena', clave);
    await Promise.all([p.waitForURL((u) => u.pathname === '/campus'), p.click('button[type=submit]')]);
  }
  return { contexto, p };
}
async function confirmar(p, boton, { palabra, campos = {}, textoConfirmar } = {}) {
  const texto = (await boton.first().textContent()).trim();
  await boton.first().click();
  const dialogo = p.locator('dialog[open]');
  for (const [nombre, valor] of Object.entries(campos)) await dialogo.locator(`[name=${nombre}]`).fill(valor);
  if (palabra) await dialogo.locator('input[name=confirmacion]').fill(palabra);
  await dialogo.getByRole('button', { name: textoConfirmar ?? texto, exact: true }).click();
  await p.waitForLoadState('networkidle');
}
const ve = async (p, re) => {
  const ok = await p.locator('[role=status], [role=alert]').filter({ hasText: re }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!ok) {
    console.log(`      (en ${p.url()} se ve: ${JSON.stringify(await p.locator('[role=status], [role=alert]').allTextContents())})`);
    await p.screenshot({ path: `${SALIDA}/recorrido-talleres-sin-aviso-${Date.now()}.png`, fullPage: true });
  }
  return ok;
};
const sinDesborde = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// Fecha en Guatemala (UTC−6, sin horario de verano) a N días de hoy.
const enDias = (n) => new Date(Date.now() - 6 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);

const { p: a } = await sesion(ADMIN_CORREO, ADMIN_CLAVE);
const { contexto: ctxAlumna, p: al } = await sesion(CORREO, CLAVE);
const { contexto: ctxPublico, p: pub } = await sesion(null);
let id;
try {
  // 1. Crear un taller: nace en borrador.
  await a.goto(`${BASE}/admin/talleres`, { waitUntil: 'networkidle' });
  await a.fill('#titulo', 'Taller de prueba del recorrido');
  await a.fill('#fecha', enDias(3));
  await a.fill('#hora', '18:00');
  await a.fill('#duracion', '90');
  await Promise.all([a.waitForURL(/\/admin\/talleres\/[0-9a-f-]{36}\?ok=creado/), a.getByRole('button', { name: 'Crear taller' }).click()]);
  id = new URL(a.url()).pathname.split('/').pop();
  comprobar(await ve(a, /creado como borrador/), 'se crea el taller como borrador');
  comprobar(await a.getByText(/18:00 \(hora de Guatemala\)/).first().isVisible(), 'la hora se muestra en la zona del taller');
  comprobar(await a.getByText(/19:00 en Bogotá/).isVisible(), 'con vista previa en otras zonas');

  // 3. Publicación incompleta: sin descripción no aparece el botón.
  await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  comprobar((await a.getByRole('button', { name: 'Publicar el taller' }).count()) === 0, 'sin descripción no se puede publicar');
  // 1 y 2. Editar y publicar.
  await a.goto(`${BASE}/admin/talleres/${id}`, { waitUntil: 'networkidle' });
  await a.fill('#descripcion', 'Un encuentro en vivo para conversar sobre rutinas y autonomía.');
  await a.getByLabel('Gratuito').check();
  await a.getByLabel('Cupo limitado').check();
  await a.fill('#cupo', '1');
  await a.getByRole('button', { name: 'Guardar cambios' }).click();
  await a.getByText('Cambios guardados.').waitFor({ timeout: 15000 });
  comprobar(await a.getByLabel('Cupo limitado').isChecked() && await a.getByLabel('Gratuito').isChecked() && (await a.inputValue('#cupo')) === '1',
    'se guardan descripción, precio gratuito y cupo, y el formulario muestra lo guardado');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-1-datos.png`, fullPage: true });
  await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Publicar el taller' }));
  comprobar(await ve(a, /Taller publicado/), 'el taller se publica');
  const slug = sql(`select slug from public.talleres where id = '${id}'`);

  // Videollamada y recordatorios.
  await a.goto(`${BASE}/admin/talleres/${id}/videollamada`, { waitUntil: 'networkidle' });
  comprobar(await a.getByLabel('24 horas antes').isChecked() && await a.getByLabel('1 hora antes').isChecked(), 'recordatorios por defecto: 24 h y 1 h');
  await a.fill('#participante', 'https://meet.example.invalid/recorrido');
  await a.fill('#anfitrion', 'https://meet.example.invalid/anfitrion-secreto');
  await a.getByRole('button', { name: 'Guardar enlace' }).click();
  comprobar(await ve(a, /Enlace de la videollamada guardado/), 'se carga el enlace a mano');
  await a.getByLabel('15 minutos antes').check();
  await a.getByRole('button', { name: 'Guardar recordatorios' }).click();
  comprobar(await ve(a, /Recordatorios guardados/), 'se configuran los recordatorios');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-2-videollamada.png`, fullPage: true });

  // 5. Inscripción gratuita de la alumna desde el sitio; confirmación visible en la plataforma.
  await pub.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  comprobar(await pub.getByRole('link', { name: 'Ingresar para inscribirme' }).isVisible(), 'sin sesión, se pide ingresar para inscribirse');
  await al.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  await Promise.all([al.waitForURL(/\/campus\/talleres\?aviso=inscripcion/), al.getByRole('button', { name: 'Inscribirme gratis' }).click()]);
  comprobar(await al.getByText(/su inscripción está confirmada/).isVisible() && await al.getByText(/no enviamos correos/).isVisible(),
    'la confirmación se ve en la plataforma y dice que no se envió correo');
  comprobar(sql(`select count(*) from public.notificaciones n join public.inscripciones_taller i on i.id = n.inscripcion_id where i.taller_id = '${id}' and n.tipo = 'inscripcion_taller' and n.estado = 'pendiente'`) === '1',
    'la confirmación queda registrada como notificación pendiente, no como enviada');
  // 6 y 7. Sin duplicados; el último lugar.
  await al.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  comprobar(await al.getByText(/Ya está inscripta o inscripto/).isVisible() && (await al.getByRole('button', { name: 'Inscribirme gratis' }).count()) === 0,
    'quien ya está inscripta no puede volver a inscribirse');
  await pub.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  comprobar(await pub.getByText('Cupo completo').isVisible() && (await pub.getByRole('link', { name: 'Ingresar para inscribirme' }).count()) === 0, 'con el único lugar ocupado: «Cupo completo»');
  await pub.screenshot({ path: `${SALIDA}/recorrido-talleres-3-sitio-completo.png`, fullPage: true });

  // 15. Enlace: visible desde la inscripción confirmada. El de anfitrión, nunca.
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  const filaTaller = al.locator('li', { hasText: 'Taller de prueba del recorrido' });
  const html = await al.content();
  comprobar(await filaTaller.getByRole('link', { name: 'Entrar a la videollamada' }).isVisible() && !html.includes('anfitrion-secreto'),
    'con la inscripción confirmada se muestra el enlace de participante, nunca el de anfitrión');
  comprobar(await filaTaller.getByText('Cancelar mi inscripción').isVisible(), 'gratuito a más de 24 h: se ofrece cancelar');
  // Ya no hay formulario para inscribir por cortesía.
  await a.goto(`${BASE}/admin/talleres/${id}/participantes`, { waitUntil: 'networkidle' });
  comprobar((await a.getByRole('button', { name: /cortesía/i }).count()) === 0
    && await a.getByText(/cupones/).first().isVisible(), 'el panel no ofrece inscribir por cortesía (las invitaciones serán cupones, Fase 6)');
  await al.screenshot({ path: `${SALIDA}/recorrido-talleres-4-mis-talleres.png`, fullPage: true });

  // Participantes y exportación.
  await a.goto(`${BASE}/admin/talleres/${id}/participantes`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(CORREO).isVisible() && await a.getByText('Gratuita').first().isVisible(), 'la admin ve a la alumna inscripta');
  const csv = await a.context().request.get(`${BASE}/admin/talleres/${id}/participantes/csv`);
  comprobar(csv.status() === 200 && (await csv.text()).includes(CORREO), 'la lista se exporta en CSV');
  comprobar(sql(`select count(*) from public.auditoria where accion = 'inscriptos_exportados' and entidad_id = '${id}'`) === '1', 'la exportación queda registrada');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-5-participantes.png`, fullPage: true });

  // El cupo no baja de los ocupados; la fecha no se edita directo con inscriptos.
  await a.goto(`${BASE}/admin/talleres/${id}`, { waitUntil: 'networkidle' });
  comprobar((await a.locator('#fecha').count()) === 0 && await a.getByText(/la fecha se cambia con/).isVisible(), 'con inscriptos, la fecha se cambia solo con «Reprogramar»');

  // 13. Reprogramar con motivo y palabra.
  await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Reprogramar' }), { palabra: 'REPROGRAMAR', campos: { fecha: enDias(5), hora: '17:00', motivo: 'La maestra tiene un viaje ese día.' } });
  comprobar(await ve(a, /Taller reprogramado/), 'se reprograma con motivo');
  comprobar(sql(`select count(*) from public.notificaciones n where n.taller_id = '${id}' and n.tipo = 'taller_reprogramado' and n.estado = 'pendiente'`) === '1',
    'el aviso de reprogramación queda registrado (pendiente, sin correo)');
  comprobar(sql(`select estado || ':' || respuesta_reprogramacion from public.inscripciones_taller where taller_id = '${id}' and estado <> 'cancelada'`) === 'confirmada:pendiente',
    'la inscripción queda pendiente de respuesta: ni aceptada ni cancelada, con su lugar');
  await a.goto(`${BASE}/admin/talleres/${id}/participantes`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/1 sin responder a la reprogramación/).isVisible() && await a.getByText('Pendiente de respuesta').first().isVisible(),
    'la admin identifica a quien no respondió');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-5b-pendiente.png`, fullPage: true });
  await a.goto(`${BASE}/admin/talleres`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/sin responder/).first().isVisible(), 'la lista de talleres señala respuestas pendientes');
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  comprobar(await filaTaller.getByText(/falta su respuesta/).isVisible() && await filaTaller.getByText(/Fecha original/).isVisible()
    && await filaTaller.getByText(/17:00/).first().isVisible(), 'la alumna ve la fecha original y la nueva, y que falta su respuesta');
  comprobar((await filaTaller.getByText(/Inscripción confirmada/).count()) === 0 && (await filaTaller.getByRole('link', { name: 'Entrar a la videollamada' }).count()) === 0,
    'mientras está pendiente no se le confirma la asistencia a la fecha nueva');
  comprobar(await al.getByRole('heading', { name: 'Avisos' }).isVisible() && await al.getByText(/cambió de fecha/).first().isVisible(), 'el aviso aparece en el campus');
  await al.screenshot({ path: `${SALIDA}/recorrido-talleres-4b-responder.png`, fullPage: true });
  // Sin la casilla no se registra nada (el navegador lo exige; el servidor también).
  await filaTaller.getByText('Acepto la nueva fecha', { exact: true }).first().click();
  await filaTaller.getByLabel(/Confirmo que asistiré/).check();
  await Promise.all([al.waitForURL(/aviso=respuesta_aceptada/), filaTaller.getByRole('button', { name: 'Acepto la nueva fecha' }).click()]);
  comprobar(await al.getByText(/acepta la nueva fecha/).isVisible() && await filaTaller.getByText(/Nueva fecha aceptada/).isVisible(), 'la alumna acepta la nueva fecha');
  comprobar(sql(`select count(*) from public.respuestas_reprogramacion r join public.inscripciones_taller i on i.id = r.inscripcion_id where i.taller_id = '${id}' and r.respuesta = 'aceptada'`) === '1'
    && sql(`select count(*) from public.auditoria where accion = 'reprogramacion_respondida'`) !== '0', 'la decisión queda registrada y auditada');
  await al.getByRole('button', { name: 'Marcar como leídos' }).click();
  comprobar(await al.getByRole('heading', { name: 'Avisos' }).waitFor({ state: 'detached', timeout: 15000 }).then(() => true, () => false), 'los avisos se marcan como leídos');

  // 16 y 17. Procesos programados: recordatorios con la fecha vigente, una sola vez.
  const sinClave = await ctxPublico.request.post(`${BASE}/api/procesos`);
  comprobar([401, 503].includes(sinClave.status()), `los procesos programados no corren sin clave (${sinClave.status()})`);
  if (PROCESOS_CLAVE) {
    // Un recordatorio que ya venció: 14 días antes del taller de ejemplo en el que la alumna está inscripta.
    sql(`insert into public.recordatorios (taller_id, minutos_antes) select id, 20160 from public.talleres where slug = 'demo-taller-limites' on conflict do nothing`);
    const llamar = () => ctxPublico.request.post(`${BASE}/api/procesos`, { headers: { Authorization: `Bearer ${PROCESOS_CLAVE}` } });
    const r1 = await llamar();
    const j1 = await r1.json();
    const r2 = await llamar();
    const j2 = await r2.json();
    comprobar(r1.status() === 200 && r2.status() === 200 && j1.recordatorios_registrados >= 1 && j2.recordatorios_registrados === 0,
      `procesos programados: ${JSON.stringify(j1)}; la segunda corrida no repite (${JSON.stringify(j2)})`);
  }
  comprobar(sql(`select count(*) from public.notificaciones where estado = 'enviada'`) === '0', 'ninguna notificación figura como enviada');

  // 4. Duplicar: borrador nuevo sin participantes.
  await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Duplicar el taller' }), { textoConfirmar: 'Crear la copia', campos: { fecha: enDias(30), hora: '18:00' } });
  comprobar(await ve(a, /Copia creada como borrador/), 'se duplica como borrador');
  const copia = new URL(a.url()).pathname.split('/').pop();
  comprobar(copia !== id && sql(`select estado || ':' || (select count(*) from public.inscripciones_taller where taller_id = '${copia}') || ':' || (select count(*) from public.reuniones where taller_id = '${copia}') from public.talleres where id = '${copia}'`) === 'borrador:0:0',
    'la copia no tiene inscriptos ni enlace de reunión');

  // 9. La alumna cancela su inscripción: el lugar se libera.
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  await filaTaller.getByText('Cancelar mi inscripción').click();
  await al.getByLabel(/Entiendo que libero mi lugar/).check();
  await Promise.all([al.waitForURL(/aviso=cancelada/), al.getByRole('button', { name: 'Cancelar inscripción' }).click()]);
  comprobar(await al.getByText(/el lugar quedó libre/).isVisible(), 'la alumna cancela su inscripción gratuita');
  await pub.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  comprobar(await pub.getByText('Queda 1 lugar').isVisible(), 'el lugar vuelve a estar disponible');
  await al.goto(`${BASE}/talleres/${slug}`, { waitUntil: 'networkidle' });
  await Promise.all([al.waitForURL(/aviso=inscripcion/), al.getByRole('button', { name: 'Inscribirme gratis' }).click()]);
  comprobar(true, 'la alumna puede volver a inscribirse');

  // 24 h: un taller gratuito que empieza en 12 horas ya no se cancela desde el campus.
  const alumna = sql(`select id from auth.users where email = '${CORREO}'`);
  const pronto = sql(`insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, estado)
    values ('recorrido-pronto', '[Ejemplo] Taller en 12 horas', 'Gratuito que empieza pronto.', now() + interval '12 hours', now() + interval '13 hours', 'publicado') returning id`).split('\n').pop();
  sql(`insert into public.inscripciones_taller (taller_id, perfil_id, origen) values ('${pronto}', '${alumna}', 'gratuita')`);
  // Pago: inscripción confirmada por un pago simulado aprobado.
  const pago = sql(`insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, precio_centavos, estado)
    values ('recorrido-pago', '[Ejemplo] Taller pago', 'Taller pago de prueba.', now() + interval '6 days', now() + interval '6 days 1 hour', 2500, 'publicado') returning id`).split('\n').pop();
  const ordenPago = sql(`select public.crear_orden('${alumna}', 'taller', '${pago}')`);
  sql(`select public.procesar_evento_pago('simulado', 'rec-pago-ok', 'pago', '{}', '${ordenPago}', 'rec-pago-ok', 'aprobado', 2500)`);
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  const filaPronto = al.locator('li', { hasText: 'Taller en 12 horas' });
  comprobar((await filaPronto.getByText('Cancelar mi inscripción').count()) === 0 && await filaPronto.getByText(/hasta 24 horas antes/).isVisible(),
    'gratuito a menos de 24 h: no se ofrece cancelar');
  const filaPago = al.locator('li', { hasText: '[Ejemplo] Taller pago' });
  comprobar((await filaPago.getByText('Cancelar mi inscripción').count()) === 0 && await filaPago.getByRole('link', { name: 'escriba a la academia' }).isVisible(),
    'pago: sin botón de cancelación, con el contacto de la academia');
  await al.screenshot({ path: `${SALIDA}/recorrido-talleres-4c-pago-y-24h.png`, fullPage: true });
  // Reprogramar el pago: la alumna puede pedir el reembolso (sin calcular montos ni ejecutar nada).
  await a.goto(`${BASE}/admin/talleres/${pago}/estado`, { waitUntil: 'networkidle' });
  await confirmar(a, a.getByRole('button', { name: 'Reprogramar' }), { palabra: 'REPROGRAMAR', campos: { fecha: enDias(9), hora: '10:00', motivo: 'Cambio de agenda de la maestra.' } });
  comprobar(await ve(a, /Taller reprogramado/), 'se reprograma el taller pago');
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  comprobar(await filaPago.locator('summary', { hasText: 'Prefiero el reembolso' }).isVisible() && (await filaPago.getByText('No puedo asistir').count()) === 0, 'pago reprogramado: se ofrece pedir el reembolso');
  await filaPago.getByText('Prefiero el reembolso', { exact: true }).first().click();
  await filaPago.getByLabel(/gestionará el reembolso/).check();
  await Promise.all([al.waitForURL(/aviso=respuesta_reembolso_solicitado/), filaPago.getByRole('button', { name: 'Prefiero el reembolso' }).click()]);
  comprobar(await filaPago.getByText(/Reembolso solicitado/).isVisible()
    && sql(`select estado from public.ordenes where id = '${ordenPago}'`) === 'aprobada'
    && sql(`select count(*) from public.incidencias where taller_id = '${pago}' and tipo = 'reembolso_por_reprogramacion'`) === '1',
    'el pedido de reembolso crea una incidencia; la orden no se toca y nada figura reembolsado');

  // Grabación: estados con revisión (un taller ya realizado con la alumna inscripta).
  const realizado = sql(`insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, estado)
    values ('recorrido-realizado', '[Ejemplo] Taller realizado', 'Taller ya realizado.', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'finalizado') returning id`).split('\n').pop();
  sql(`insert into public.inscripciones_taller (taller_id, perfil_id, origen, asistio) values ('${realizado}', '${alumna}', 'gratuita', false)`);
  await a.goto(`${BASE}/admin/talleres/${realizado}/grabacion`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Prevista').first().isVisible() && await a.getByText(/nunca se publica/).isVisible(), 'la grabación nace prevista y explica la regla de privacidad');
  comprobar((await a.getByRole('button', { name: 'Publicar la grabación' }).count()) === 0, 'sin verificar no se ofrece publicar');
  await confirmar(a, a.getByRole('button', { name: 'Marcar original recibida' }));
  comprobar(await ve(a, /marcada como recibida/i), 'original recibida');
  await confirmar(a, a.getByRole('button', { name: 'Pasar a revisión' }));
  comprobar(await ve(a, /Grabación en revisión/), 'en revisión');
  for (const t of [/Sin imagen de participantes/, /Sin voces/, /Sin nombres/, /Contenido final verificado/]) await a.getByLabel(t).check();
  await a.getByRole('button', { name: 'Guardar revisión' }).click();
  comprobar(await ve(a, /Revisión guardada/), 'se registra la revisión');
  await confirmar(a, a.getByRole('button', { name: 'Marcar verificada' }));
  comprobar(await ve(a, /Grabación verificada/), 'verificada');
  await a.getByLabel('Durante una cantidad de días').check();
  await a.locator('input[name=incluidoDias]').fill('30');
  await a.getByRole('button', { name: 'Guardar condiciones' }).click();
  comprobar(await ve(a, /Condiciones guardadas/), 'se guardan las condiciones de acceso');
  await confirmar(a, a.getByRole('button', { name: 'Publicar la grabación' }), { palabra: 'PUBLICAR' });
  comprobar(await ve(a, /Grabación publicada/) && sql(`select count(*) from public.accesos_grabacion g join public.grabaciones_taller t on t.id = g.grabacion_id where t.taller_id = '${realizado}' and g.perfil_id = '${alumna}'`) === '1',
    'al publicar, la alumna inscripta (aunque no asistió) recibe el acceso, con sus condiciones');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-8-grabacion.png`, fullPage: true });
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  comprobar(await al.locator('li', { hasText: 'Taller realizado' }).getByText(/Grabación publicada, disponible hasta/).isVisible(), 'la alumna ve la grabación publicada con su vencimiento');

  // 14. Cancelar el taller con motivo y palabra.
  await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  comprobar((await a.locator('dialog').getByText(/Afecta a 1 persona/).count()) > 0, 'la confirmación de cancelar informa a cuántas personas afecta');
  await confirmar(a, a.getByRole('button', { name: 'Cancelar el taller' }), { palabra: 'CANCELAR', campos: { motivo: 'La maestra está enferma ese día.' } });
  comprobar(await ve(a, /Taller cancelado/), 'se cancela el taller con motivo');
  await al.goto(`${BASE}/campus/talleres`, { waitUntil: 'networkidle' });
  comprobar(await al.getByText(/Este taller fue cancelado: La maestra está enferma ese día/).isVisible()
    && (await filaTaller.getByRole('link', { name: 'Entrar a la videollamada' }).count()) === 0, 'la alumna ve la cancelación y el enlace desaparece');
  const borrar = await a.goto(`${BASE}/admin/talleres/${id}/estado`, { waitUntil: 'networkidle' });
  comprobar(borrar.ok() && (await a.getByRole('button', { name: 'Eliminar el taller' }).count()) === 0, 'un taller con inscriptos no ofrece eliminarse');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-6-cancelado.png`, fullPage: true });

  // 11 y 12. Pago tardío (simulado): la reserva venció y otra persona tomó el lugar.
  const pagado = sql(`
    insert into auth.users (id, email, raw_user_meta_data) values ('0e000000-0000-0000-0000-000000000001', 'otra.persona@albor.invalid',
      '{"nombre_completo": "Otra persona (ejemplo)", "confirma_mayoria_edad": true}') on conflict do nothing;
    insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
      values ('pago-tardio', '[Ejemplo] Taller pago con un lugar', 'Taller pago de prueba para el pago tardío.', now() + interval '4 days', now() + interval '4 days 1 hour', 1, 1500) returning id;`).split('\n').pop();
  sql(`update public.talleres set estado = 'publicado' where id = '${pagado}'`);
  const alumnaId = sql(`select id from auth.users where email = '${CORREO}'`);
  const orden = sql(`select public.crear_orden('${alumnaId}', 'taller', '${pagado}')`);
  sql(`update public.reservas_cupo set vence_en = now() - interval '1 minute' where orden_id = '${orden}'; select public.vencer_reservas();`);
  const otra = sql(`select public.crear_orden('0e000000-0000-0000-0000-000000000001', 'taller', '${pagado}')`);
  sql(`select public.procesar_evento_pago('simulado', 'rec-otra', 'pago', '{}', '${otra}', 'rec-pago-otra', 'aprobado', 1500)`);
  const resultado = sql(`select public.procesar_evento_pago('simulado', 'rec-tarde', 'pago', '{}', '${orden}', 'rec-pago-tarde', 'aprobado', 1500)`);
  comprobar(resultado === 'requiere_reembolso' && sql(`select estado from public.ordenes where id = '${orden}'`) === 'requiere_reembolso',
    'el pago tardío sin lugar deja la orden en «requiere reembolso» (no pendiente)');
  comprobar(sql(`select count(*) from public.inscripciones_taller where taller_id = '${pagado}' and estado = 'confirmada'`) === '1', 'sin sobreventa: una sola inscripción');
  await a.goto(`${BASE}/admin/talleres/incidencias`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText(/Pago recibido sin lugar disponible/).first().isVisible() && await a.getByText(/la reserva había vencido y el cupo ya estaba completo/).first().isVisible(),
    'la incidencia se ve en el panel con su motivo');
  await a.getByLabel('Nota interna').first().fill('Contactar a la alumna para el reembolso.');
  await a.getByRole('button', { name: 'Guardar nota' }).first().click();
  comprobar(await ve(a, /en revisión hasta que la pasarela confirme/), 'la nota pasa la incidencia a revisión, sin declarar el reembolso hecho');
  await a.screenshot({ path: `${SALIDA}/recorrido-talleres-7-incidencias.png`, fullPage: true });

  // 18. La alumna no abre ni usa el panel de talleres.
  for (const ruta of ['/admin/talleres', `/admin/talleres/${id}`, `/admin/talleres/${id}/participantes/csv`, '/admin/talleres/incidencias', `/admin/talleres/${realizado}/grabacion`]) {
    const r = await ctxAlumna.request.get(`${BASE}${ruta}`);
    comprobar(r.status() === 404, `alumna en ${ruta}: ${r.status()}`);
  }

  // 19. Registro de actividad.
  await a.goto(`${BASE}/admin/configuracion/actividad?grupo=talleres`, { waitUntil: 'networkidle' });
  comprobar(await a.getByText('Reprogramó un taller').first().isVisible() && await a.getByText('Canceló un taller').first().isVisible()
    && await a.getByText('Duplicó un taller como borrador').first().isVisible(), 'el registro muestra reprogramar, cancelar y duplicar');

  // 20. Celular (390 px): sin desbordes en las pantallas de talleres.
  const { p: m } = await sesion(ADMIN_CORREO, ADMIN_CLAVE, { width: 390, height: 844 });
  for (const [ruta, nombre] of [['/admin/talleres', 'lista'], [`/admin/talleres/${copia}`, 'datos'], [`/admin/talleres/${id}/participantes`, 'participantes'],
    [`/admin/talleres/${id}/estado`, 'estado'], [`/admin/talleres/${copia}/videollamada`, 'videollamada'], ['/admin/talleres/incidencias', 'incidencias'],
    [`/admin/talleres/${realizado}/grabacion`, 'grabacion'], [`/admin/talleres/${pago}/participantes`, 'participantes-pago']]) {
    await m.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    comprobar(await sinDesborde(m), `celular, panel ${nombre}: sin desborde horizontal`);
    await m.screenshot({ path: `${SALIDA}/movil-talleres-${nombre}.png`, fullPage: true });
  }
  const { p: mal } = await sesion(CORREO, CLAVE, { width: 390, height: 844 });
  for (const [ruta, nombre] of [['/campus/talleres', 'mis-talleres'], ['/talleres', 'sitio-lista'], ['/talleres/demo-taller-limites', 'sitio-ficha']]) {
    await mal.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    comprobar(await sinDesborde(mal), `celular, ${nombre}: sin desborde horizontal`);
    await mal.screenshot({ path: `${SALIDA}/movil-talleres-${nombre}.png`, fullPage: true });
  }
} catch (e) {
  comprobar(false, `${String(e.message).split('\n').slice(0, 6).join(' | ')} (en ${a?.url()})`);
  await a?.screenshot({ path: `${SALIDA}/recorrido-talleres-error.png`, fullPage: true }).catch(() => {});
  await al?.screenshot({ path: `${SALIDA}/recorrido-talleres-error-alumna.png`, fullPage: true }).catch(() => {});
}
for (const e of errores) console.log(`  error en consola: ${e}`);
comprobar(errores.length === 0, 'sin errores en la consola');
await navegador.close();
process.exit(fallas ? 1 : 0);
