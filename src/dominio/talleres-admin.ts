/** Textos del panel de talleres: códigos de la base → mensajes para la maestra (solo códigos conocidos). */

const ERRORES: Record<string, string> = {
  taller_incompleto: 'Todavía no se puede publicar: revise la lista de requisitos (título, descripción, fecha futura y duración).',
  taller_nace_borrador: 'Un taller nuevo se crea como borrador.',
  transicion_invalida: 'Ese cambio de estado no está permitido para este taller.',
  usar_cancelar_taller: 'Para cancelar use «Cancelar el taller»: pide motivo y avisa a cada persona.',
  usar_reprogramar: 'Este taller tiene inscriptos o reservas: para cambiar la fecha use «Reprogramar».',
  archivar_taller_vigente: 'Solo se archiva un taller que ya terminó, se canceló o nunca se publicó.',
  taller_con_inscriptos: 'El taller ya tiene inscripciones u órdenes: no vuelve a borrador.',
  taller_con_historial: 'El taller tiene inscripciones, reservas u órdenes: no se puede eliminar. Puede cancelarlo o archivarlo.',
  taller_cerrado: 'Un taller cancelado, finalizado o archivado no cambia de fecha, cupo ni precio.',
  cupo_menor_que_ocupados: 'El cupo no puede ser menor que los lugares ya ocupados.',
  zona_invalida: 'Elija una zona horaria de la lista.',
  motivo_requerido: 'Escriba el motivo (al menos 10 caracteres). Queda registrado.',
  fecha_invalida: 'Revise la fecha, la hora y la duración: tienen que ser futuras y válidas en la zona del taller.',
  sin_cambios: 'La fecha y la hora son las mismas que ya tenía.',
  taller_no_publicado: 'Solo se reprograma un taller publicado. Un borrador se edita directamente.',
  sin_cupo: 'No quedan lugares: el cupo está completo.',
  ya_inscripto: 'Esa persona ya está inscripta.',
  persona_no_registrada: 'No hay ninguna cuenta con ese correo. La persona tiene que registrarse primero.',
  taller_no_disponible: 'El taller no admite inscripciones (no está publicado o ya empezó).',
  taller_no_empezo: 'La asistencia se marca cuando el taller ya empezó.',
  enlace_invalido: 'Pegue un enlace completo que empiece con https://.',
  correo_invalido: 'Escriba un correo válido y el motivo de la cortesía.',
  nota_requerida: 'Escriba una nota (al menos 5 caracteres).',
  resolucion_requerida: 'Escriba la resolución (al menos 20 caracteres): queda registrada.',
  incidencia_resuelta: 'Esa incidencia ya estaba resuelta.',
  confirmacion: 'Para confirmar, escriba la palabra que se pide.',
  slug_repetido: 'Ya existe otro taller con esa dirección web.',
  invalido: 'No se pudo completar la acción. Recargue la página e intente de nuevo.',
  no_autorizado: 'No tiene permiso para esta acción.',
  taller_no_realizado: 'El taller todavía no se realizó: no puede haber grabación recibida.',
  revision_incompleta: 'Para verificarla, confirme los cuatro puntos de la revisión: sin imagen ni voces de participantes, sin nombres ni datos en pantalla y contenido verificado.',
  revision_fuera_de_estado: 'La revisión se registra con la grabación «En revisión».',
  condiciones_sin_definir: 'Antes de publicar, defina cuánto dura el acceso incluido en la inscripción (días o sin vencimiento).',
  condiciones_invalidas: 'Revise las condiciones: los días van de 1 a 3650 y el precio en USD, por ejemplo 15 o 15.50.',
  venta_sin_condiciones: 'Para ponerla a la venta, indique el precio y la duración del acceso comprado.',
};
const CLAVES = Object.keys(ERRORES).sort((a, b) => b.length - a.length);

export function codigoErrorTaller(mensaje: string | null | undefined): string {
  const m = mensaje ?? '';
  if (m.includes('duplicate key') && m.includes('slug')) return 'slug_repetido';
  return CLAVES.find((k) => m === k || m.startsWith(`${k}:`) || m.startsWith(k)) ?? 'desconocido';
}
export function mensajeErrorTaller(codigo: string | null | undefined): string {
  return ERRORES[codigoErrorTaller(codigo)] ?? 'No se pudo completar. Intente de nuevo; si sigue fallando, avísenos.';
}

const OKS: Record<string, string> = {
  creado: 'Taller creado como borrador. Complete la descripción y publíquelo cuando esté listo.',
  publicado: 'Taller publicado: ya aparece en el sitio.',
  archivado: 'Taller archivado. Las inscripciones y su historial se conservan.',
  borrador: 'El taller volvió a borrador.',
  eliminado: 'Taller eliminado.',
  duplicado: 'Copia creada como borrador, con fecha nueva. No se copiaron inscriptos, pagos, enlaces ni asistencia.',
  reprogramado: 'Taller reprogramado. El cambio quedó registrado; los avisos a cada inscripto quedaron registrados como pendientes (todavía no hay servicio de correo).',
  cancelado: 'Taller cancelado. Los avisos quedaron registrados como pendientes; los reembolsos, en Incidencias.',
  reunion_guardada: 'Enlace de la videollamada guardado.',
  recordatorios_guardados: 'Recordatorios guardados. Se calculan siempre con la fecha vigente del taller.',
  cortesia: 'Inscripción de cortesía registrada.',
  asistencia: 'Asistencia registrada.',
  revision_guardada: 'Revisión guardada.',
  condiciones_guardadas: 'Condiciones guardadas. Los accesos ya otorgados conservan las condiciones con que se otorgaron.',
  grabacion_recibida: 'Grabación marcada como recibida.',
  grabacion_en_revision: 'Grabación en revisión. La revisión empieza de cero.',
  grabacion_en_edicion: 'Grabación en edición.',
  grabacion_verificada: 'Grabación verificada.',
  grabacion_publicada: 'Grabación publicada: las personas con derecho la ven en su campus.',
  grabacion_no_publicable: 'Marcada como no publicable: queda sin publicar.',
  grabacion_fallida: 'Grabación marcada como fallida.',
  grabacion_faltante: 'Grabación marcada como faltante.',
  grabacion_retirada: 'Grabación retirada: nadie la ve. Los derechos se conservan.',
  incidencia_anotada: 'Nota guardada. La incidencia queda en revisión hasta que la pasarela confirme el reembolso (Fase 6).',
  reembolso_parcial_resuelto: 'Resolución registrada. El acceso de la persona no cambió.',
  otorgamiento_recuperado: 'Acceso otorgado. La incidencia quedó resuelta y registrada.',
  otorgamiento_pendiente: 'Todavía no se pudo otorgar el acceso. La incidencia sigue abierta con el detalle del error.',
};
export function mensajeOkTaller(codigo: string | undefined): string | undefined {
  return codigo && Object.hasOwn(OKS, codigo) ? OKS[codigo] : undefined;
}

export const OPCIONES_RECORDATORIO = [
  { minutos: 10080, texto: '7 días antes' }, { minutos: 2880, texto: '2 días antes' }, { minutos: 1440, texto: '24 horas antes' },
  { minutos: 180, texto: '3 horas antes' }, { minutos: 60, texto: '1 hora antes' }, { minutos: 15, texto: '15 minutos antes' },
] as const;

export function textoRecordatorio(minutos: number): string {
  return OPCIONES_RECORDATORIO.find((o) => o.minutos === minutos)?.texto
    ?? (minutos % 1440 === 0 ? `${minutos / 1440} días antes` : minutos % 60 === 0 ? `${minutos / 60} horas antes` : `${minutos} minutos antes`);
}

/** Lo que falta para publicar (misma regla que la base). */
export function requisitosTaller(t: { titulo: string; descripcion: string | null; iniciaEn: Date; terminaEn: Date }) {
  const dur = t.terminaEn.getTime() - t.iniciaEn.getTime();
  return [
    { clave: 'titulo', texto: 'Título de al menos 3 letras', cumplido: t.titulo.trim().length >= 3 },
    { clave: 'descripcion', texto: 'Descripción para el sitio (al menos 10 caracteres)', cumplido: (t.descripcion ?? '').trim().length >= 10 },
    { clave: 'fecha', texto: 'Fecha y hora futuras', cumplido: t.iniciaEn.getTime() > Date.now() },
    { clave: 'duracion', texto: 'Duración de hasta 12 horas', cumplido: dur > 0 && dur <= 12 * 3600 * 1000 },
  ];
}

/** Estados de la grabación, en palabras, para el panel. */
export const ESTADOS_GRABACION_TEXTO: Record<string, string> = {
  prevista: 'Prevista', recibida: 'Original recibida', en_revision: 'En revisión', en_edicion: 'En edición', verificada: 'Verificada',
  publicada: 'Publicada', no_publicable: 'No publicable', fallida: 'Fallida', faltante: 'Faltante', retirada: 'Retirada', no_corresponde: 'No corresponde',
};
/** Próximos pasos que ofrece el panel desde cada estado (la base valida las mismas transiciones). */
export const SIGUIENTES_GRABACION: Record<string, { estado: string; texto: string; motivo?: boolean }[]> = {
  prevista: [{ estado: 'recibida', texto: 'Marcar original recibida' }, { estado: 'fallida', texto: 'Marcar fallida', motivo: true }, { estado: 'faltante', texto: 'Marcar faltante', motivo: true }],
  fallida: [{ estado: 'recibida', texto: 'Marcar original recibida' }],
  faltante: [{ estado: 'recibida', texto: 'Marcar original recibida' }],
  recibida: [{ estado: 'en_revision', texto: 'Pasar a revisión' }],
  en_revision: [{ estado: 'en_edicion', texto: 'Enviar a edición' }, { estado: 'verificada', texto: 'Marcar verificada' }, { estado: 'no_publicable', texto: 'No se puede publicar', motivo: true }],
  en_edicion: [{ estado: 'en_revision', texto: 'Volver a revisión' }, { estado: 'no_publicable', texto: 'No se puede publicar', motivo: true }],
  verificada: [{ estado: 'en_edicion', texto: 'Enviar a edición' }, { estado: 'no_publicable', texto: 'No se puede publicar', motivo: true }],
  no_publicable: [{ estado: 'en_edicion', texto: 'Enviar a edición' }],
  publicada: [{ estado: 'retirada', texto: 'Retirar', motivo: true }],
  retirada: [{ estado: 'en_revision', texto: 'Volver a revisión' }],
};
export const RESPUESTAS_TEXTO: Record<string, string> = {
  pendiente: 'Pendiente de respuesta a la reprogramación', aceptada: 'Aceptó la nueva fecha', reembolso_solicitado: 'Pidió reembolso por la reprogramación',
  no_asiste: 'No puede asistir a la nueva fecha',
};
