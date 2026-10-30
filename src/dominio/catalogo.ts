/** Reglas del catálogo público: filtros, etiquetas de edad y metadatos de una bandeja. */

export const FILTROS = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'familias', etiqueta: 'Familias' },
  { id: 'docentes', etiqueta: 'Docentes' },
  { id: 'cuidadores', etiqueta: 'Cuidadores' },
  { id: '0-3', etiqueta: '0 a 3 años' },
  { id: '3-6', etiqueta: '3 a 6 años' },
] as const;

export type IdFiltro = (typeof FILTROS)[number]['id'];

export interface CursoResumen {
  slug: string;
  titulo: string;
  resumen: string | null;
  publico: string[];
  edadDesdeMeses: number | null;
  edadHastaMeses: number | null;
  duracionMinutos: number | null;
  precioCentavos: number;
  portadaRuta: string | null;
}

/** Un valor desconocido en la URL se trata como "todos", nunca como error. */
export function filtroDesdeUrl(valor: string | string[] | undefined): IdFiltro {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (FILTROS.find((f) => f.id === v)?.id ?? 'todos') as IdFiltro;
}

function cubreRango(c: CursoResumen, desde: number, hasta: number): boolean {
  const d = c.edadDesdeMeses ?? 0;
  const h = c.edadHastaMeses ?? 72;
  return d < hasta && h > desde;   // se superponen
}

export function filtrarCursos(cursos: CursoResumen[], filtro: IdFiltro): CursoResumen[] {
  switch (filtro) {
    case 'todos': return cursos;
    case '0-3': return cursos.filter((c) => cubreRango(c, 0, 36));
    case '3-6': return cursos.filter((c) => cubreRango(c, 36, 72));
    default: return cursos.filter((c) => c.publico.includes(filtro));
  }
}

const NOMBRE_PUBLICO: Record<string, string> = { familias: 'Familias', docentes: 'Docentes', cuidadores: 'Cuidadores' };

export function etiquetaPublico(publico: string[]): string {
  const nombres = publico.map((p) => NOMBRE_PUBLICO[p]).filter(Boolean) as string[];
  if (nombres.length === 0) return '';
  if (nombres.length === 1) return nombres[0]!;
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)!.toLowerCase()}`;
}

export function etiquetaEdad(desdeMeses: number | null, hastaMeses: number | null): string {
  if (desdeMeses === null && hastaMeses === null) return '';
  const d = desdeMeses ?? 0;
  const h = hastaMeses ?? 72;
  const anios = (m: number) => (m % 12 === 0 ? String(m / 12) : (m / 12).toFixed(1).replace('.', ','));
  if (h < 24 && d < 24) return `${d} a ${h} meses`;
  return `${anios(d)} a ${anios(h)} años`;
}

export function etiquetaDuracion(minutos: number | null): string {
  if (!minutos) return '';
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Familias y cuidadores · 0 a 3 años · 4 h" — se omite lo que no está cargado. */
export function metadatosCurso(c: CursoResumen): string {
  return [etiquetaPublico(c.publico), etiquetaEdad(c.edadDesdeMeses, c.edadHastaMeses), etiquetaDuracion(c.duracionMinutos)]
    .filter(Boolean)
    .join(' · ');
}
