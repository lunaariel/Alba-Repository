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
}

export interface Requisito { clave: string; texto: string; cumplido: boolean; donde: 'datos' | 'temario' | 'evaluacion' }

/** La misma lista que exige la base para publicar (validar_publicacion_curso). */
export function requisitosPublicacion(e: EstadoContenido): Requisito[] {
  return [
    { clave: 'precio', texto: 'Precio en USD mayor que cero', cumplido: e.precioCentavos > 0, donde: 'datos' },
    { clave: 'lecciones', texto: 'Al menos una lección vigente', cumplido: e.leccionesVigentes > 0, donde: 'temario' },
    { clave: 'evaluacion', texto: 'Evaluación final con al menos una pregunta', cumplido: e.preguntasVigentes > 0, donde: 'evaluacion' },
    { clave: 'respuesta_correcta', texto: 'Cada pregunta con su respuesta correcta', cumplido: e.preguntasVigentes > 0 && e.preguntasSinCorrecta === 0, donde: 'evaluacion' },
  ];
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
