import { CONFIG_PREDETERMINADA, faltaCriterioCertificacion, usaPreguntas, type ConfigEvaluacion } from './evaluacion';

/**
 * Reglas y textos del editor de cursos. La base de datos tiene la última palabra
 * (validar_publicacion_curso, proteger_historial…); esto solo explica y valida antes de enviar.
 */

/** "49", "49.50", "49,5", "USD 49" → 4900. Hasta USD 10.000. null si no es un precio válido. */
export function precioACentavos(texto: string): number | null {
  const limpio = texto.replace(/usd|\$|\s/gi, '').replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(limpio)) return null;
  const [entero, dec = ''] = limpio.split('.');
  const centavos = Number(entero) * 100 + Number(dec.padEnd(2, '0'));
  return centavos <= 1_000_000 ? centavos : null;
}

export function centavosATexto(c: number): string {
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

/** Dirección web a partir del título: minúsculas, sin acentos, con guiones, hasta 60 caracteres. */
export function slugDesde(titulo: string): string {
  return titulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
}

export const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EstadoContenido {
  precioCentavos: number;
  leccionesVigentes: number;
  preguntasVigentes: number;
  preguntasSinCorrecta: number;
  /** Modalidad del borrador. Sin ella se asume la sumativa (como la base cuando no hay evaluación configurada). */
  evaluacion?: Pick<ConfigEvaluacion, 'modalidad' | 'requiereActividades' | 'requiereValidacion' | 'conCertificado'>;
}

export interface Requisito { clave: string; texto: string; cumplido: boolean; donde: 'datos' | 'temario' | 'evaluacion' }

/** La misma lista que exige la base para publicar (faltantes_publicacion). */
export function requisitosPublicacion(e: EstadoContenido): Requisito[] {
  const ev = e.evaluacion ?? { modalidad: 'sumativa', requiereActividades: false, requiereValidacion: false, conCertificado: true };
  const r: Requisito[] = [
    { clave: 'precio', texto: 'Precio en USD mayor que cero', cumplido: e.precioCentavos > 0, donde: 'datos' },
    { clave: 'lecciones', texto: 'Al menos una lección vigente', cumplido: e.leccionesVigentes > 0, donde: 'temario' },
  ];
  if (usaPreguntas(ev)) {
    r.push(ev.modalidad === 'sumativa'
      ? { clave: 'evaluacion', texto: 'Evaluación final con al menos una pregunta', cumplido: e.preguntasVigentes > 0, donde: 'evaluacion' }
      : { clave: 'actividades', texto: 'Actividades formativas con al menos una pregunta', cumplido: e.preguntasVigentes > 0, donde: 'evaluacion' });
    r.push({ clave: 'respuesta_correcta', texto: 'Cada pregunta con su respuesta correcta', cumplido: e.preguntasVigentes > 0 && e.preguntasSinCorrecta === 0, donde: 'evaluacion' });
  }
  if (ev.modalidad === 'formativa' && ev.conCertificado) {
    r.push({ clave: 'criterios_certificacion', texto: 'Un criterio para certificar además de las lecciones (actividades o validación docente)',
      cumplido: !faltaCriterioCertificacion({ ...CONFIG_PREDETERMINADA, ...ev }), donde: 'evaluacion' });
  }
  return r;
}

/** Temas que tienen una sola pregunta vigente: informarlos revelaría cuál se falló. */
export function temasConUnaPregunta(preguntas: { tema: string | null; retirada: boolean }[]): string[] {
  const cuenta = new Map<string, number>();
  for (const p of preguntas) {
    if (p.retirada || !p.tema?.trim()) continue;
    const t = p.tema.trim();
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return [...cuenta].filter(([, n]) => n === 1).map(([t]) => t).sort((a, b) => a.localeCompare(b, 'es'));
}

const ERRORES: Record<string, string> = {
  curso_incompleto: 'Todavía no se puede publicar: revise la lista de requisitos.',
  curso_con_alumnos: 'Este curso ya tiene alumnos: no puede volver a borrador. Puede archivarlo; quienes lo compraron conservan el acceso.',
  curso_con_historial: 'Este curso tiene alumnos, compras o certificados: no se puede eliminar. Puede archivarlo.',
  leccion_con_historial: 'Hay alumnos que ya vieron esta lección: no se puede eliminar. Puede retirarla.',
  modulo_con_historial: 'Hay alumnos que ya vieron lecciones de este módulo: no se puede eliminar. Puede retirarlo.',
  pregunta_con_historial: 'Esta pregunta ya fue respondida: no se puede eliminar. Puede retirarla.',
  opcion_con_historial: 'Esta pregunta ya fue respondida: sus opciones se pueden editar, pero no eliminar.',
  ultima_leccion_vigente: 'Un curso publicado necesita al menos una lección vigente.',
  ultima_pregunta_vigente: 'Un curso publicado necesita al menos una pregunta vigente en su evaluación.',
  pregunta_sin_correcta: 'Cada pregunta de un curso publicado necesita una respuesta correcta.',
  sin_correcta: 'Marque al menos una respuesta correcta.',
  unica_una_correcta: 'En una pregunta de opción única, marque exactamente una respuesta correcta.',
  opciones_cantidad: 'Escriba entre 2 y 10 opciones.',
  opcion_vacia: 'Ninguna opción puede quedar vacía (máximo 300 caracteres).',
  enunciado_invalido: 'Escriba la pregunta (entre 3 y 1.000 caracteres).',
  slug_repetido: 'Ya existe otro curso con esa dirección web. Elija otra.',
  confirmacion: 'Para confirmar, escriba la palabra que se pide.',
  invalido: 'No se pudo completar la acción. Recargue la página e intente de nuevo.',
  titulo_vacio: 'Escriba un nombre (al menos 2 letras).',
  pregunta_publicada: 'Esta pregunta forma parte de una versión publicada: no se modifica. Guárdela desde el editor y se creará una nueva para el borrador.',
  leccion_en_version: 'Esta lección forma parte de una versión publicada: no se puede eliminar. Puede retirarla del borrador.',
  modulo_en_version: 'Este módulo forma parte de una versión publicada: no se puede eliminar. Puede retirarlo del borrador.',
  material_en_version: 'Este material forma parte de una versión publicada: no se puede eliminar.',
  version_inmutable: 'Una versión publicada no se modifica.',
  resumen_requerido: 'Explique en pocas palabras qué cambió (al menos 5 caracteres). Lo verán los alumnos antes de decidir si cambian.',
  motivo_requerido: 'Escriba el motivo (al menos 10 caracteres). Queda registrado.',
  opciones_invalidas: 'Elija qué opciones se aceptarán también como correctas (en opción única, exactamente una).',
  ya_es_correcta: 'Esa respuesta ya se considera correcta en esta versión: no hay nada que corregir.',
  pregunta_fuera_de_version: 'Esa pregunta no forma parte de la versión elegida.',
  confirmacion_incorrecta: 'La confirmación no coincide. Escriba exactamente lo que se pide.',
  revision_inexistente: 'No se encontró esa revisión. Vuelva a calcularla.',
  revision_descartada: 'Esa revisión ya no se puede aplicar. Vuelva a calcularla.',
  no_autorizado: 'No tiene permiso para esta acción.',
  leccion_publicada: 'Esta lección forma parte de una versión publicada: solo admite correcciones menores declaradas. Para un cambio de contenido, cree una lección de reemplazo.',
  modulo_publicado: 'Este módulo forma parte de una versión publicada: su nombre solo admite correcciones menores declaradas.',
  cambio_sustancial: 'El cambio altera buena parte del texto: no es una corrección menor. Cree una lección de reemplazo en el borrador y publique una versión nueva.',
  correccion_no_permitida: 'Ese tipo de corrección no permite cambiar el video ni la duración. Si es el mismo video con mejor calidad, elija «Video mejorado»; si es otro contenido, cree una lección de reemplazo.',
  tipo_correccion_invalido: 'Elija qué tipo de corrección menor está haciendo.',
  material_tipo_fijo: 'Este material ya está en uso como requisito o como complemento: su tipo no se puede cambiar.',
  material_no_complementario: 'Este material forma parte del programa: no se asocia a versiones como complemento.',
  version_sin_leccion: 'Solo se puede asociar a versiones que incluyen esta lección.',
  leccion_no_publicada: 'Esta lección todavía no está en ninguna versión: edítela directamente.',
  leccion_retirada: 'La lección está retirada del borrador.',
  nota_requerida: 'Escriba una nota (al menos 10 caracteres): queda registrada con la validación.',
  validacion_no_corresponde: 'La versión que sigue esta persona no pide validación docente.',
  ya_validada: 'Esta persona ya tiene una validación vigente en su versión.',
  certificado_emitido: 'Ya se emitió el certificado de esa versión: la validación no se puede anular.',
  sin_acceso: 'Esa persona no tiene acceso activo al curso.',
  revision_no_descartable: 'Solo se descartan revisiones calculadas que no se aplicaron.',
  no_encontrado: 'No se encontró. Recargue la página.',
};

// La clave más larga que coincide gana: «confirmacion_incorrecta» no debe leerse como «confirmacion».
const CLAVES_ERROR = Object.keys(ERRORES).sort((a, b) => b.length - a.length);
function claveDeError(m: string): string | undefined {
  return CLAVES_ERROR.find((k) => m === k || m.startsWith(`${k}:`) || m.startsWith(k));
}

/** Código corto para llevar un error por la dirección (nunca texto libre). */
export function codigoError(mensaje: string | null | undefined): string {
  const m = mensaje ?? '';
  if (m.includes('duplicate key') && m.includes('slug')) return 'slug_repetido';
  return claveDeError(m) ?? 'desconocido';
}

const OKS: Record<string, string> = {
  creado: 'Curso creado. Complete sus datos y su temario.',
  publicado: 'Curso publicado: ya aparece en el sitio.',
  archivado: 'Curso archivado. Quienes lo compraron conservan el acceso.',
  borrador: 'El curso volvió a borrador.',
  eliminado: 'Eliminado.',
  modulo_agregado: 'Módulo agregado.',
  modulo_renombrado: 'Módulo renombrado.',
  leccion_creada: 'Lección creada. Complete sus datos.',
  retirado: 'Retirado: ya no se ve ni cuenta para los alumnos. Su historial se conserva y se puede restaurar.',
  restaurado: 'Restaurado.',
  material_quitado: 'Material quitado.',
  pregunta_creada: 'Pregunta creada.',
  pregunta_reemplazada: 'Como la pregunta anterior ya estaba en una versión publicada, se creó esta nueva para el borrador. La anterior se conserva intacta en esa versión.',
  material_retirado: 'Material retirado del borrador. Se conserva para quienes siguen las versiones que lo incluyen.',
  version_publicada: 'Versión publicada. Los alumnos actuales siguen en su versión hasta que decidan cambiar.',
  revision_aplicada: 'Revisión favorable aplicada. Los resultados originales se conservan junto a los corregidos.',
  revision_ya_aplicada: 'Esa revisión ya estaba aplicada: no se volvió a aplicar.',
  bloqueado: 'Contenido bloqueado. Ya no se muestra a nadie y no cuenta como requisito. Queda registrado.',
  desbloqueado: 'Contenido desbloqueado. Queda registrado.',
  correccion_aplicada: 'Corrección menor aplicada en todas las versiones. Quedó registrada con su tipo y motivo.',
  leccion_reemplazada: 'Se creó la lección de reemplazo en el borrador. La original se conserva intacta para quienes siguen las versiones publicadas.',
  complemento_asociado: 'Material complementario actualizado: lo ven los alumnos de las versiones elegidas. No cambia avances ni requisitos.',
  revision_descartada: 'Revisión descartada. No cambió ningún resultado y quedó registrada con su motivo.',
  duplicado: 'Copia creada como borrador independiente: sin alumnos, compras, intentos ni certificados. Revise el título y la dirección web.',
  duplicado_sin_algunos_pdf: 'Copia creada como borrador. Algunos PDF no se pudieron copiar y quedaron fuera: súbalos de nuevo en el temario.',
  validada: 'Finalización validada. Quedó registrada con su nota; la persona ya puede obtener su certificado si cumplió lo demás.',
  validacion_anulada: 'Validación anulada. Quedó registrado el motivo.',
};

/** Mensaje de un aviso de éxito; un código desconocido no muestra nada. */
export function mensajeOk(codigo: string | undefined): string | undefined {
  return codigo && Object.hasOwn(OKS, codigo) ? OKS[codigo] : undefined;
}

/** Traduce el error de la base (o de la acción) a un mensaje para la maestra. */
export function mensajeError(codigoOMensaje: string | null | undefined): string {
  const m = codigoOMensaje ?? '';
  if (m.includes('duplicate key') && m.includes('slug')) return ERRORES.slug_repetido!;
  const clave = claveDeError(m);
  return clave ? ERRORES[clave]! : 'No se pudo guardar. Intente de nuevo; si sigue fallando, avísenos.';
}

/** Solo se vuelve a páginas del editor de cursos (evita redirecciones a otros sitios). */
export function volverSeguro(valor: unknown, porDefecto: string): string {
  return typeof valor === 'string' && /^\/admin\/cursos(\/[a-z0-9-]+)*$/i.test(valor) ? valor : porDefecto;
}

/** Correcciones menores admitidas sobre contenido publicado (la base valida la misma lista). */
export const TIPOS_CORRECCION = [
  { valor: 'ortografia', texto: 'Ortografía' },
  { valor: 'redaccion', texto: 'Redacción sin cambiar el sentido' },
  { valor: 'formato', texto: 'Formato' },
  { valor: 'accesibilidad', texto: 'Accesibilidad' },
  { valor: 'enlace', texto: 'Enlace roto' },
  { valor: 'video_mejorado', texto: 'Mismo video, versión técnicamente mejorada' },
  { valor: 'calidad_audio_video', texto: 'Calidad de sonido o imagen' },
] as const;

/** Elementos presentes en ambas listas que cambian de posición (comparando solo los comunes). */
export function cambiosDeOrden(antes: string[], despues: string[], titulos: Map<string, string>, tipo: string): string[] {
  const comunes = new Set(antes.filter((id) => despues.includes(id)));
  const a = antes.filter((id) => comunes.has(id));
  const d = despues.filter((id) => comunes.has(id));
  if (a.join() === d.join()) return [];
  return d.flatMap((id, i) => {
    const previo = a.indexOf(id);
    return previo === i ? [] : [`${tipo} «${titulos.get(id) ?? '…'}»: del lugar ${previo + 1} al ${i + 1}`];
  });
}

