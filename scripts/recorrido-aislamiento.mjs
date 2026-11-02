// Aislamiento entre personas (cierre de la Fase 6A; CI y local, SOLO con el Supabase local).
// Perfiles: administradora, alumna A, alumna B y visitante. Se prueba en tres niveles:
//   1. la base, por la API de datos con el token de cada persona (RLS y permisos);
//   2. las respuestas del servidor (HTML del campus, PDF de certificados, detalle de compras);
//   3. las acciones rechazadas, comparando una huella de la base antes y después.
// Datos de prueba propios de cada persona (curso, compra, certificado y aviso) se agregan al empezar.
import { BASE, sql, crearInforme, navegadorNuevo, tokenPorClave } from './lib/recorrido.mjs';

const { CORREO, CLAVE, CORREO2, CLAVE2, ADMIN_CORREO, ADMIN_CLAVE, API_URL, ANON_KEY } = process.env;
const { comprobar, vigilar, estado } = crearInforme();
const C1 = 'c1000000-0000-0000-0000-000000000001';
const C2 = 'c1000000-0000-0000-0000-000000000002';
const C3 = 'c1000000-0000-0000-0000-000000000003';
const id = (correo) => sql(`select id from auth.users where email = '${correo}'`);
const A = id(CORREO), B = id(CORREO2), ADMIN = id(ADMIN_CORREO);
const PERSONAS = { A, B, ADMIN };

// ------------------------------------------------------------ datos propios de cada persona
// B: una compra pagada propia y su aviso; A ya tiene compra de C1, certificado de C2 y talleres (campus.sh); A recibe
// un aviso. La admin: una beca propia de C2 (para su propio campus). Nada de esto cambia cuentas de otras personas.
sql(`do $$ declare o uuid; curso uuid; begin
  -- Un curso publicado que B todavía no tiene (los recorridos anteriores archivan o cambian algunos).
  select c.id into curso from public.cursos c where c.estado = 'publicado'
     and not exists (select 1 from public.accesos_curso a where a.perfil_id = '${B}' and a.curso_id = c.id and a.estado = 'activo')
   order by c.slug limit 1;
  if curso is not null and not exists (select 1 from public.ordenes where perfil_id = '${B}' and estado = 'aprobada') then
    update public.cursos set duracion_comercial_meses = 6 where id = curso and duracion_comercial_meses is null;
    o := public.crear_orden('${B}', 'curso', curso);
    perform public.procesar_evento_pago('simulado', 'aislamiento-evt-b', 'pago', '{}'::jsonb, o, 'aislamiento-pago-b', 'aprobado',
      (select precio_centavos from public.cursos where id = curso));
  end if;
  if not exists (select 1 from public.accesos_curso where perfil_id = '${ADMIN}' and curso_id = '${C2}' and estado = 'activo') then
    insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values ('${ADMIN}', '${C2}', 'concesion', 'Prueba de aislamiento: acceso propio de la admin');
  end if;
  insert into public.notificaciones (perfil_id, tipo, clave, estado, detalle) values
    ('${A}', 'inscripcion_taller', 'aislamiento-a-' || gen_random_uuid(), 'pendiente', '{"prueba": "aviso de A"}'),
    ('${B}', 'inscripcion_taller', 'aislamiento-b-' || gen_random_uuid(), 'pendiente', '{"prueba": "aviso de B"}');
end $$;`);

const tokens = {
  A: await tokenPorClave(API_URL, ANON_KEY, CORREO, CLAVE),
  B: await tokenPorClave(API_URL, ANON_KEY, CORREO2, CLAVE2),
  ADMIN: await tokenPorClave(API_URL, ANON_KEY, ADMIN_CORREO, ADMIN_CLAVE),
};
async function api(quien, ruta, init = {}) {
  const auth = quien ? { Authorization: `Bearer ${tokens[quien]}` } : {};
  const r = await fetch(`${API_URL}/rest/v1/${ruta}`, { ...init, headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...auth, ...(init.headers ?? {}) } });
  const cuerpo = await r.text();
  try { return { estado: r.status, filas: JSON.parse(cuerpo) }; } catch { return { estado: r.status, filas: cuerpo }; }
}
const lista = (r) => (Array.isArray(r.filas) ? r.filas : []);

// ------------------------------------------------------------ 1. La base, por la API, con cada token
const TABLAS = [
  ['accesos_curso', 'cursos'], ['ordenes', 'compras'], ['certificados', 'certificados'], ['notificaciones', 'avisos'],
  ['progreso_leccion', 'avance'], ['intentos_evaluacion', 'intentos'], ['inscripciones_taller', 'inscripciones'],
];
for (const quien of ['A', 'B']) {
  for (const [tabla, texto] of TABLAS) {
    const r = await api(quien, `${tabla}?select=perfil_id`);
    const ajenas = lista(r).filter((f) => f.perfil_id !== PERSONAS[quien]).length;
    const propias = Number(sql(`select count(*) from public.${tabla} where perfil_id = '${PERSONAS[quien]}'${tabla === 'intentos_evaluacion' ? ' and not formativo' : ''}`));
    comprobar(r.estado === 200 && ajenas === 0 && lista(r).length === propias, `alumna ${quien}: por la API ve solo sus ${texto} (${propias}) y ninguna ajena`);
  }
  const pagos = await api(quien, 'pagos?select=orden_id,ordenes(perfil_id)');
  comprobar(lista(pagos).every((p) => p.ordenes?.perfil_id === PERSONAS[quien]), `alumna ${quien}: solo ve pagos de sus propias órdenes`);
  const periodos = await api(quien, 'periodos_acceso?select=perfil_id');
  comprobar(lista(periodos).length === 0, `alumna ${quien}: no consulta períodos de acceso (ni propios ni ajenos) por la API`);
  const perfiles = await api(quien, 'perfiles?select=id');
  comprobar(lista(perfiles).length === 1 && lista(perfiles)[0].id === PERSONAS[quien], `alumna ${quien}: solo lee su propio perfil`);
}
const otra = await api('B', `certificados?select=id&perfil_id=eq.${A}`);
comprobar(lista(otra).length === 0, 'alumna B: pidiendo expresamente los certificados de A, no recibe ninguno');
for (const [tabla] of [...TABLAS, ['periodos_acceso'], ['pagos'], ['perfiles'], ['auditoria']]) {
  const r = await api(null, `${tabla}?select=*&limit=1`);
  comprobar(lista(r).length === 0, `visitante: no lee ${tabla}`);
}
// La admin conserva por la API las vistas de gestión (lee lo de todas las alumnas).
const gestion = await api('ADMIN', `accesos_curso?select=perfil_id&perfil_id=in.(${A},${B})`);
comprobar(new Set(lista(gestion).map((f) => f.perfil_id)).size === 2, 'administradora: la gestión sigue viendo los accesos de las alumnas');

// ------------------------------------------------------------ 2. Respuestas del servidor
const navegador = await navegadorNuevo();
async function sesion(correo, clave) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  vigilar(p);
  await p.goto(`${BASE}/ingresar`, { waitUntil: 'networkidle' });
  await p.fill('#correo', correo);
  await p.fill('#contrasena', clave);
  await Promise.all([p.waitForURL((u) => u.pathname !== '/ingresar', { timeout: 20000 }), p.click('button[type=submit]')]);
  return { ctx, p };
}
const cursosEsperados = (perfil) => sql(`select string_agg(c.slug, ',' order by c.slug) from public.accesos_curso a join public.cursos c on c.id = a.curso_id
  where a.perfil_id = '${perfil}' and a.estado = 'activo' and public.acceso_cubierto(a.id)`).split(',').filter(Boolean);
const tarjetas = (html) => [...html.matchAll(/<h2[^>]*><a[^>]*href="\/campus\/cursos\/([a-z0-9-]+)"/g)].map((m) => m[1]);
const ordenesDe = (perfil) => sql(`select string_agg(id::text, ',') from public.ordenes where perfil_id = '${perfil}' and estado in ('aprobada', 'reembolsada', 'contracargo')`).split(',').filter(Boolean);
const certsDe = (perfil) => sql(`select string_agg(id::text || ':' || codigo_verificacion, ',') from public.certificados where perfil_id = '${perfil}'`).split(',').filter(Boolean);
const nombreDe = (perfil) => sql(`select nombre_completo from public.perfiles where id = '${perfil}'`);

const sesiones = { A: await sesion(CORREO, CLAVE), B: await sesion(CORREO2, CLAVE2), ADMIN: await sesion(ADMIN_CORREO, ADMIN_CLAVE) };
try {
  for (const quien of ['A', 'B', 'ADMIN']) {
    const { p } = sesiones[quien];
    const yo = PERSONAS[quien];
    const otras = Object.entries(PERSONAS).filter(([k]) => k !== quien).map(([, v]) => v);
    const etiqueta = quien === 'ADMIN' ? 'administradora en su propio campus' : `alumna ${quien}`;
    await p.goto(`${BASE}/campus`, { waitUntil: 'networkidle' });
    const html = await p.content();
    const vistas = tarjetas(html);
    const esperadas = cursosEsperados(yo);
    comprobar(vistas.length === new Set(vistas).size, `${etiqueta}: «Mis cursos» sin tarjetas repetidas`);
    comprobar([...vistas].sort().join(',') === [...esperadas].sort().join(','), `${etiqueta}: «Mis cursos» muestra exactamente sus cursos (${esperadas.join(', ') || 'ninguno'})`);
    await p.goto(`${BASE}/campus/compras`, { waitUntil: 'networkidle' });
    const compras = await p.content();
    const propias = ordenesDe(yo);
    const ajenas = otras.flatMap(ordenesDe);
    comprobar(propias.every((o) => compras.includes(o)) && ajenas.every((o) => !compras.includes(o)), `${etiqueta}: «Mis compras» muestra solo sus compras (${propias.length})`);
    // Certificados y compras ajenas, pedidos directamente al servidor.
    for (const c of otras.flatMap(certsDe)) {
      const [certId, codigo] = c.split(':');
      if (quien === 'ADMIN') continue; // la admin puede abrir certificados por su rol (gestión); no se prueba aquí
      const r = await p.request.get(`${BASE}/campus/certificados/${certId}`);
      comprobar(r.status() === 404 && !(await r.text()).includes(codigo), `${etiqueta}: el PDF de un certificado ajeno responde 404`);
      comprobar(!html.includes(codigo), `${etiqueta}: su campus no contiene códigos de certificados ajenos`);
    }
    if (quien !== 'ADMIN') {
      for (const o of ajenas) {
        const r = await p.request.get(`${BASE}/campus/compras/${o}`);
        comprobar(r.status() === 404, `${etiqueta}: el detalle de una compra ajena responde 404`);
      }
    }
    for (const otraPersona of otras) {
      const n = nombreDe(otraPersona);
      comprobar(!html.includes(n) && !compras.includes(n), `${etiqueta}: las respuestas del campus no incluyen el nombre de otra persona`);
    }
  }

  // ------------------------------------------------------------ 3. El panel conserva la gestión
  const { p: admin } = sesiones.ADMIN;
  await admin.goto(`${BASE}/admin/cursos/${C1}/alumnos`, { waitUntil: 'networkidle' });
  const panel = await admin.content();
  comprobar(panel.includes(nombreDe(A)), 'panel: la lista de alumnos del curso sigue mostrando a las alumnas (gestión autorizada)');
  const rB = await sesiones.B.p.goto(`${BASE}/admin/cursos/${C1}/alumnos`, { waitUntil: 'networkidle' });
  comprobar(rB?.status() === 404 && !(await sesiones.B.p.content()).includes(nombreDe(A)), 'panel: la alumna B recibe 404 sin datos de otras alumnas');

  // ------------------------------------------------------------ 4. Acciones rechazadas: nada cambia
  const HUELLA = `select md5(string_agg(t, '|' order by t)) from (
    select 'n'||id||coalesce(leida_en::text,'')||estado t from public.notificaciones
    union all select 'p'||id||nombre_completo||coalesce(area_laboral,'') from public.perfiles
    union all select 'g'||id||coalesce(completada_en::text,'') from public.progreso_leccion
    union all select 'o'||id||estado||total_centavos from public.ordenes
    union all select 'a'||id||estado||coalesce(vence_en::text,'') from public.accesos_curso
    union all select 'c'||id||codigo_verificacion from public.certificados
    union all select 'r'||perfil_id||rol from public.roles_usuario) x`;
  const antes = sql(HUELLA);
  const intentos = [
    ['B marca leído un aviso de A', 'B', `notificaciones?perfil_id=eq.${A}`, 'PATCH', { leida_en: new Date().toISOString() }],
    ['B cambia el nombre de A', 'B', `perfiles?id=eq.${A}`, 'PATCH', { nombre_completo: 'Cambio indebido' }],
    ['B registra avance a nombre de A', 'B', 'progreso_leccion', 'POST', { perfil_id: A, leccion_id: sql(`select l.id from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = '${C1}' limit 1`), completada_en: new Date().toISOString() }],
    ['B se crea un acceso', 'B', 'accesos_curso', 'POST', { perfil_id: B, curso_id: C2, origen: 'concesion', motivo: 'indebido' }],
    ['B anula una compra de A', 'B', `ordenes?perfil_id=eq.${A}`, 'PATCH', { estado: 'cancelada' }],
    ['B se asigna el rol admin', 'B', 'roles_usuario', 'POST', { perfil_id: B, rol: 'admin' }],
    ['A borra un certificado propio', 'A', `certificados?perfil_id=eq.${A}`, 'DELETE', null],
    ['visitante crea una orden', null, 'ordenes', 'POST', { perfil_id: A, subtotal_centavos: 0, total_centavos: 0, clave_producto: 'x' }],
    ['visitante cambia un perfil', null, `perfiles?id=eq.${A}`, 'PATCH', { nombre_completo: 'Visitante' }],
  ];
  for (const [texto, quien, ruta, metodo, cuerpo] of intentos) {
    await api(quien, ruta, { method: metodo, body: cuerpo ? JSON.stringify(cuerpo) : undefined, headers: { Prefer: 'return=minimal' } });
    comprobar(sql(HUELLA) === antes, `rechazado sin cambios en la base: ${texto}`);
  }
  // El panel de la admin conserva sus permisos de gestión por la API (lee las órdenes de A).
  comprobar(lista(await api('ADMIN', `ordenes?select=id&perfil_id=eq.${A}`)).length === ordenesDe(A).length + Number(sql(`select count(*) from public.ordenes where perfil_id = '${A}' and estado not in ('aprobada', 'reembolsada', 'contracargo')`)),
    'administradora: la gestión sigue leyendo las órdenes de las alumnas');
} finally {
  await navegador.close();
}
for (const e of estado.errores) console.log(`  error en consola: ${e}`);
comprobar(estado.errores.length === 0, 'sin errores en la consola');
process.exit(estado.fallas ? 1 : 0);
