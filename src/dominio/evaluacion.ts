/**
 * Modalidad de evaluación de un curso: textos y reglas que explican lo que la base decide
 * (estado_finalizacion_de, faltantes_publicacion, emitir_certificado). La base tiene la última palabra.
 */

export type Modalidad = 'sumativa' | 'formativa';

export interface ConfigEvaluacion {
  modalidad: Modalidad;
  requiereActividades: boolean;
  requiereValidacion: boolean;
  conCertificado: boolean;
  puntajeMinimo: number;
  intentosPermitidos: number | null;
}

/** Valores predeterminados decididos por la maestra para cursos nuevos. */
export const CONFIG_PREDETERMINADA: ConfigEvaluacion = {
  modalidad: 'sumativa', requiereActividades: false, requiereValidacion: false, conCertificado: true, puntajeMinimo: 70, intentosPermitidos: 2,
};

/** Normaliza lo que llega del formulario a una configuración coherente (la sumativa no usa requisitos formativos). */
export function configCoherente(c: ConfigEvaluacion): ConfigEvaluacion {
  return c.modalidad === 'sumativa' ? { ...c, requiereActividades: false, requiereValidacion: false, conCertificado: true } : c;
}

/** Si la formativa certifica, necesita al menos un criterio además de completar lecciones. */
export function faltaCriterioCertificacion(c: ConfigEvaluacion): boolean {
  return c.modalidad === 'formativa' && c.conCertificado && !c.requiereActividades && !c.requiereValidacion;
}

/** ¿La versión necesita preguntas? Sumativa siempre; formativa, solo si exige actividades. */
export function usaPreguntas(c: Pick<ConfigEvaluacion, 'modalidad' | 'requiereActividades'>): boolean {
  return c.modalidad === 'sumativa' || c.requiereActividades;
}

const intentosTexto = (n: number | null) => (n === null ? 'sin límite de intentos' : n === 1 ? '1 intento' : `${n} intentos`);

/** Lo que verá el alumno sobre cómo se termina el curso (vista previa en el panel y texto del campus). */
export function requisitosParaAlumno(c: ConfigEvaluacion): string[] {
  const lineas = ['Completar todas las lecciones del curso, marcándolas como completadas.'];
  if (c.modalidad === 'sumativa') {
    lineas.push(`Aprobar la evaluación final con al menos ${c.puntajeMinimo} puntos sobre 100 (${intentosTexto(c.intentosPermitidos)}).`);
  } else {
    if (c.requiereActividades) lineas.push('Responder todas las actividades formativas. No llevan nota: sirven para acompañar su aprendizaje y le sugieren temas para repasar.');
    if (c.requiereValidacion) lineas.push('Recibir la validación de la maestra, que acompaña su recorrido.');
  }
  lineas.push(c.conCertificado ? 'Al cumplir todo, puede descargar su certificado de finalización.' : 'Este curso no entrega certificado.');
  return lineas;
}

/** Nombre breve de la modalidad, para chips y listas. */
export function nombreModalidad(c: Pick<ConfigEvaluacion, 'modalidad'>): string {
  return c.modalidad === 'sumativa' ? 'Evaluación final con puntaje' : 'Evaluación formativa';
}

/**
 * Consecuencias de pasar de la configuración vigente a la del borrador, en palabras de la maestra.
 * vigente = null: el curso todavía no se publicó.
 */
export function consecuenciasCambio(vigente: ConfigEvaluacion | null, borrador: ConfigEvaluacion): string[] {
  const c: string[] = [];
  if (!vigente) {
    c.push('Estos criterios quedan fijados al publicar la primera versión.');
    return c;
  }
  const cambioModalidad = vigente.modalidad !== borrador.modalidad;
  if (cambioModalidad) {
    c.push(borrador.modalidad === 'formativa'
      ? 'Pasa a evaluación formativa: los alumnos nuevos no rendirán un examen con puntaje.'
      : 'Pasa a evaluación final con puntaje: los alumnos nuevos deberán aprobarla para certificar.');
    c.push('Las aprobaciones de la versión anterior no se reconocen en la nueva, porque los requisitos cambian.');
  } else if (borrador.modalidad === 'sumativa' && (vigente.puntajeMinimo !== borrador.puntajeMinimo || vigente.intentosPermitidos !== borrador.intentosPermitidos)) {
    c.push(`Puntaje mínimo ${vigente.puntajeMinimo} → ${borrador.puntajeMinimo}; ${intentosTexto(vigente.intentosPermitidos)} → ${intentosTexto(borrador.intentosPermitidos)}.`);
    if (vigente.puntajeMinimo !== borrador.puntajeMinimo) c.push('Con otro puntaje mínimo, la aprobación anterior no se reconoce en la versión nueva.');
  }
  if (borrador.modalidad === 'formativa' && !cambioModalidad) {
    if (vigente.requiereActividades !== borrador.requiereActividades) c.push(borrador.requiereActividades ? 'Se empezarán a exigir las actividades formativas.' : 'Las actividades formativas dejan de ser obligatorias.');
    if (vigente.requiereValidacion !== borrador.requiereValidacion) c.push(borrador.requiereValidacion ? 'Se empezará a exigir su validación docente.' : 'Su validación docente deja de ser obligatoria.');
    if (vigente.conCertificado !== borrador.conCertificado) c.push(borrador.conCertificado ? 'El curso empezará a entregar certificado.' : 'El curso dejará de entregar certificado a los alumnos nuevos.');
  }
  if (c.length) {
    c.push('Rige desde la próxima versión que publique. Quienes ya tienen el curso conservan sus requisitos, intentos y certificados; pueden pasar a la versión nueva solo si lo eligen.');
  }
  return c;
}

/** Estado de finalización que devuelve la base (mi_finalizacion / estado_finalizacion_de). */
export interface Finalizacion {
  modalidad: Modalidad;
  leccionesPendientes: number;
  requiereActividades: boolean;
  actividadesCompletas: boolean;
  requiereValidacion: boolean;
  validada: boolean;
  evaluacionAprobada: boolean;
  conCertificado: boolean;
  finalizado: boolean;
  elegibleCertificado: boolean;
}

export function aFinalizacion(j: Record<string, unknown> | null | undefined): Finalizacion | null {
  if (!j || typeof j !== 'object') return null;
  return {
    modalidad: j.modalidad === 'formativa' ? 'formativa' : 'sumativa',
    leccionesPendientes: Number(j.lecciones_pendientes ?? 0),
    requiereActividades: j.requiere_actividades === true,
    actividadesCompletas: j.actividades_completas === true,
    requiereValidacion: j.requiere_validacion === true,
    validada: j.validada === true,
    evaluacionAprobada: j.evaluacion_aprobada === true,
    conCertificado: j.con_certificado !== false,
    finalizado: j.finalizado === true,
    elegibleCertificado: j.elegible_certificado === true,
  };
}

/** Lo que falta, en orden, para terminar el curso (vacío si está finalizado). */
export function pendientesFinalizacion(f: Finalizacion): string[] {
  const p: string[] = [];
  if (f.leccionesPendientes > 0) p.push(f.leccionesPendientes === 1 ? 'Completar 1 lección.' : `Completar ${f.leccionesPendientes} lecciones.`);
  if (f.modalidad === 'sumativa' && !f.evaluacionAprobada) p.push('Aprobar la evaluación final.');
  if (f.modalidad === 'formativa' && f.requiereActividades && !f.actividadesCompletas) p.push('Responder todas las actividades formativas.');
  if (f.modalidad === 'formativa' && f.requiereValidacion && !f.validada) p.push('Recibir la validación de la maestra.');
  return p;
}

/** «Falta completar 2 lecciones y aprobar la evaluación final.» (vacío si no falta nada). */
export function textoPendientes(f: Finalizacion): string {
  const p = pendientesFinalizacion(f).map((x) => x.replace(/\.$/, '')).map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  if (!p.length) return '';
  const lista = p.length === 1 ? p[0]! : `${p.slice(0, -1).join(', ')} y ${p.at(-1)}`;
  return `Falta ${lista}.`;
}
