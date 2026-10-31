/**
 * Textos del sitio. Los valores por defecto vienen de la propuesta B; la administradora los
 * reemplaza desde el panel (Fase 5) y se guardan en configuracion_academia.textos.
 * Lo que todavía no existe (biografía, legales) se marca entre corchetes, nunca se inventa.
 */

export interface PreguntaFrecuente { pregunta: string; respuesta: string }

export interface Textos {
  heroTitulo: string;
  heroBajada: string;
  maestraNombre: string;
  maestraResumen: string;
  maestraFrase: string;
  maestraHistoria: string;
  /** Frase que la presenta (informada por la titular; se publica solo con la presentación aprobada). */
  maestraLema: string;
  /** Formación y trayectoria, una por línea, tal como la informó la titular. Sin instituciones ni fechas inventadas. */
  maestraTrayectoria: string[];
  /** La maestra revisó y aprobó la presentación: recién entonces se muestran lema y trayectoria en el sitio. */
  presentacionAprobada: boolean;
  preguntas: PreguntaFrecuente[];
  terminos: string | null;
  privacidad: string | null;
  reembolsos: string | null;
}

export const TEXTOS_POR_DEFECTO: Textos = {
  heroTitulo: 'Todo lo que un niño necesita, al alcance de su mano',
  heroBajada: 'Cursos de una maestra para preparar la casa y el aula, y acompañar los primeros seis años con más autonomía y menos prisa.',
  maestraNombre: '[Nombre de la maestra]',
  maestraResumen: '[Formación, años de experiencia y lugares donde trabajó, tal como ella los cuente.]',
  maestraFrase: '[Una frase suya sobre por qué enseña.]',
  maestraHistoria: '[Su historia en primera persona: cómo llegó a la educación, qué aprendió en el aula y por qué creó Albor.]',
  maestraLema: 'Una educadora que vela por las infancias',
  maestraTrayectoria: [
    'Profesorado en Educación Inicial y Preprimaria',
    'Licenciatura en Educación y Aprendizaje',
    'Diplomado de Guía Montessori',
    'Diplomado en Psicopedagogía',
    'Participación en el Congreso Latinoamericano de Educación en Derechos Humanos',
    'Experiencia en educación preescolar',
    'Acompañamiento en educación popular',
  ],
  presentacionAprobada: false,
  preguntas: [
    { pregunta: '¿Necesito saber de Montessori para empezar?', respuesta: 'No. Los cursos empiezan desde lo básico.' },
    { pregunta: '¿Por cuánto tiempo tendré acceso?', respuesta: 'Cada curso indica su período de acceso antes de comprarlo: la duración del curso más 5 meses adicionales, contados desde la compra. Su certificado no vence.' },
    { pregunta: '¿El certificado es una acreditación oficial?', respuesta: 'No. Es un certificado de finalización emitido por Albor. Se obtiene al cumplir los requisitos de cada curso, que se informan en su página.' },
    { pregunta: '¿Cómo puedo pagar?', respuesta: '[Medios de pago a confirmar.]' },
  ],
  terminos: null,
  privacidad: null,
  reembolsos: null,
};

const CLAVES_TEXTO = ['heroTitulo', 'heroBajada', 'maestraNombre', 'maestraResumen', 'maestraFrase', 'maestraHistoria', 'maestraLema',
  'terminos', 'privacidad', 'reembolsos'] as const;

/** Combina lo guardado con los valores por defecto, aceptando solo claves y tipos conocidos. */
export function combinarTextos(guardados: unknown): Textos {
  const t: Textos = { ...TEXTOS_POR_DEFECTO, preguntas: [...TEXTOS_POR_DEFECTO.preguntas], maestraTrayectoria: [...TEXTOS_POR_DEFECTO.maestraTrayectoria] };
  if (!guardados || typeof guardados !== 'object') return t;
  const g = guardados as Record<string, unknown>;
  for (const clave of CLAVES_TEXTO) {
    const v = g[clave];
    if (typeof v === 'string' && v.trim() !== '') (t as unknown as Record<string, unknown>)[clave] = v.trim();
  }
  if (Array.isArray(g.maestraTrayectoria)) {
    const items = g.maestraTrayectoria.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, 20);
    t.maestraTrayectoria = items;
  }
  if (typeof g.presentacionAprobada === 'boolean') t.presentacionAprobada = g.presentacionAprobada;
  if (Array.isArray(g.preguntas)) {
    const validas = g.preguntas.filter(
      (p): p is PreguntaFrecuente =>
        !!p && typeof p === 'object' && typeof (p as PreguntaFrecuente).pregunta === 'string'
        && typeof (p as PreguntaFrecuente).respuesta === 'string' && (p as PreguntaFrecuente).pregunta.trim() !== '',
    );
    if (validas.length) t.preguntas = validas;
  }
  return t;
}

/** ¿El texto todavía es un marcador pendiente? Sirve para no indexar páginas sin contenido real. */
export function esPendiente(texto: string | null): boolean {
  return texto === null || /^\s*\[.*\]\s*$/s.test(texto);
}

/** Enlace de WhatsApp a partir de un número con código de país (Guatemala: 502). */
export function enlaceWhatsApp(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos.length >= 8 ? `https://wa.me/${digitos}` : null;
}
