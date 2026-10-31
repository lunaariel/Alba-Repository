/**
 * Textos legibles para el registro de actividad del panel.
 * La base guarda acciones técnicas (taller_actualizado, acceso_concedido…);
 * aquí se traducen a frases para la maestra, con el antes y el después de lo que cambió.
 */
import { formatearUSD } from './dinero';

export interface FilaActividad {
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

const ACCIONES: Record<string, string> = {
  curso_creado: 'Creó un curso',
  curso_actualizado: 'Cambió el precio o el estado de un curso',
  curso_eliminado: 'Eliminó un curso',
  modulo_eliminado: 'Eliminó un módulo',
  modulo_actualizado: 'Cambió un módulo',
  leccion_creado: 'Agregó una lección',
  leccion_actualizado: 'Cambió una lección',
  leccion_eliminado: 'Eliminó una lección',
  pregunta_creado: 'Agregó una pregunta',
  pregunta_actualizado: 'Cambió una pregunta',
  material_creado: 'Agregó un material PDF',
  material_eliminado: 'Quitó un material PDF',
  evaluacion_actualizado: 'Cambió los criterios de una evaluación',
  pregunta_eliminado: 'Eliminó una pregunta',
  opcion_actualizado: 'Cambió una respuesta correcta',
  taller_creado: 'Creó un taller',
  taller_actualizado: 'Modificó un taller',
  taller_eliminado: 'Eliminó un taller',
  acceso_concedido: 'Concedió acceso a un curso',
  acceso_actualizado: 'Cambió un acceso a un curso',
  rol_admin_creado: 'Asignó el rol de administración',
  rol_admin_eliminado: 'Quitó el rol de administración',
  rol_admin_asignado: 'Asignó el rol de administración',
  articulo_creado: 'Creó un artículo',
  articulo_actualizado: 'Cambió un artículo',
  articulo_eliminado: 'Eliminó un artículo',
  configuracion_actualizado: 'Cambió la configuración de la academia',
  plantilla_creado: 'Creó una plantilla de correo',
  plantilla_actualizado: 'Cambió una plantilla de correo',
  plantilla_eliminado: 'Eliminó una plantilla de correo',
  cupon_creado: 'Creó un cupón',
  cupon_actualizado: 'Cambió un cupón',
  cupon_eliminado: 'Eliminó un cupón',
  orden_reembolsado: 'Se registró un reembolso',
  orden_contracargo: 'Se registró un contracargo',
  inscriptos_exportados: 'Exportó la lista de inscriptos',
  version_publicada: 'Publicó una versión de un curso',
  version_cambiada_por_alumno: 'Un alumno pasó a la versión vigente de un curso',
  revision_calculada: 'Calculó una revisión favorable (sin aplicarla)',
  revision_favorable_aplicada: 'Aplicó una revisión favorable',
  contenido_bloqueado: 'Bloqueó contenido en todas las versiones',
  contenido_desbloqueado: 'Desbloqueó contenido',
  material_actualizado: 'Cambió un material PDF',
};

/** Grupos para filtrar el registro: cada uno reúne una o más tablas. */
export const GRUPOS_ACTIVIDAD = {
  cursos: { texto: 'Cursos y temario', entidades: ['cursos', 'modulos', 'lecciones', 'recursos_leccion', 'versiones_curso'] },
  evaluaciones: { texto: 'Evaluaciones', entidades: ['evaluaciones', 'preguntas', 'opciones', 'revisiones_evaluacion'] },
  talleres: { texto: 'Talleres', entidades: ['talleres'] },
  accesos: { texto: 'Accesos y roles', entidades: ['accesos_curso', 'roles_usuario'] },
  ventas: { texto: 'Ventas y cupones', entidades: ['ordenes', 'cupones'] },
  contenido: { texto: 'Contenido y correos', entidades: ['articulos', 'plantillas_correo'] },
  configuracion: { texto: 'Configuración', entidades: ['configuracion_academia'] },
} as const;
export type GrupoActividad = keyof typeof GRUPOS_ACTIVIDAD;

export function grupoDesdeUrl(valor: string | undefined): GrupoActividad | null {
  return valor && Object.hasOwn(GRUPOS_ACTIVIDAD, valor) ? (valor as GrupoActividad) : null;
}

const CAMPOS: Record<string, string> = {
  titulo: 'Título', slug: 'Dirección', precio_centavos: 'Precio', estado: 'Estado', cupo: 'Cupo',
  inicia_en: 'Inicio', termina_en: 'Fin', zona_horaria: 'Zona horaria', plataforma: 'Plataforma',
  puntaje_minimo: 'Puntaje mínimo', intentos_permitidos: 'Intentos permitidos', es_correcta: 'Correcta',
  nombre: 'Nombre', correo_contacto: 'Correo de contacto', whatsapp: 'WhatsApp', textos: 'Textos del sitio',
  asunto: 'Asunto', cuerpo: 'Texto', codigo: 'Código', tipo: 'Tipo', valor: 'Valor', activo: 'Activo',
  vigente_desde: 'Desde', vigente_hasta: 'Hasta', usos_maximos: 'Usos máximos', motivo: 'Motivo', retirada: 'Retirada', retirado: 'Retirado', enunciado: 'Pregunta',
  numero: 'Versión', resumen: 'Qué cambió', ajustados: 'Intentos mejorados', beneficiados: 'Intentos que mejorarían',
};

const ESTADOS: Record<string, string> = {
  borrador: 'Borrador', publicado: 'Publicado', archivado: 'Archivado', cancelado: 'Cancelado',
  finalizado: 'Finalizado', activo: 'Activo', revocado: 'Revocado',
};

// Campos que se registran pero no se muestran valor por valor (largos o técnicos).
const SOLO_MENCION = new Set(['textos', 'cuerpo']);
const OCULTOS = new Set(['perfil_id', 'curso_id', 'modulo_id', 'leccion_id', 'evaluacion_id', 'pregunta_id', 'ruta_almacenamiento', 'rol']);

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));

export function formatearValor(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '(vacío)';
  if (campo === 'precio_centavos' && typeof valor === 'number' && Number.isInteger(valor) && valor >= 0) return formatearUSD(valor);
  if (campo === 'estado' && typeof valor === 'string') return ESTADOS[valor] ?? valor;
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor) && !Number.isNaN(Date.parse(valor))) return fechaHora(valor);
  if (typeof valor === 'object') return '(datos)';
  return String(valor);
}

export interface DescripcionActividad {
  titulo: string;
  nombre: string | null;                       // título o código del elemento, si se conoce
  cambios: { campo: string; antes: string | null; despues: string | null }[];
}

export function describirActividad(f: FilaActividad): DescripcionActividad {
  const antes = f.antes ?? {};
  const despues = f.despues ?? {};
  const titulo = ACCIONES[f.accion] ?? `Acción: ${f.accion.replace(/_/g, ' ')}`;
  const nombre = (despues.titulo ?? antes.titulo ?? despues.enunciado ?? antes.enunciado ?? despues.codigo ?? antes.codigo ?? despues.correo ?? null) as string | null;

  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => !OCULTOS.has(k));
  const esAlta = f.accion.endsWith('_creado') || f.antes === null;
  const esBaja = f.accion.endsWith('_eliminado');
  const cambios: DescripcionActividad['cambios'] = [];
  for (const k of claves) {
    if ((k === 'titulo' || k === 'enunciado') && !(k in antes && k in despues && antes[k] !== despues[k])) continue; // ya figura como nombre
    const a = k in antes ? antes[k] : undefined;
    const d = k in despues ? despues[k] : undefined;
    if (!esAlta && !esBaja && JSON.stringify(a) === JSON.stringify(d)) continue;
    // En un alta o una baja, los campos vacíos no aportan nada.
    if ((esAlta && (d === null || d === undefined || d === '')) || (esBaja && (a === null || a === undefined || a === ''))) continue;
    const campo = CAMPOS[k] ?? k;
    if (SOLO_MENCION.has(k)) {
      cambios.push({ campo, antes: null, despues: 'modificado' });
    } else {
      cambios.push({
        campo,
        antes: esAlta ? null : formatearValor(k, a),
        despues: esBaja ? null : formatearValor(k, d),
      });
    }
  }
  return { titulo, nombre, cambios };
}
