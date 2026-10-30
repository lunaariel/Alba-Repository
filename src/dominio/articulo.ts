/**
 * Lector de artículos en un Markdown reducido. Devuelve una estructura de datos, no HTML:
 * la interfaz la dibuja con elementos de React, así que ningún texto cargado en el panel
 * puede inyectar código en la página.
 *
 * Admite: ## y ### títulos, párrafos, listas con "- ", **negrita** y [enlace](https://...).
 */

export type Linea =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'negrita'; valor: string }
  | { tipo: 'enlace'; valor: string; href: string };

export type Bloque =
  | { tipo: 'h2' | 'h3' | 'p'; contenido: Linea[] }
  | { tipo: 'lista'; items: Linea[][] };

/** Solo enlaces https o rutas internas; cualquier otro esquema (javascript:, data:) se descarta. */
export function hrefSeguro(href: string): string | null {
  const h = href.trim();
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  try {
    const u = new URL(h);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function leerLinea(texto: string): Linea[] {
  const salida: Linea[] = [];
  const patron = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    const i = m.index ?? 0;
    if (i > ultimo) salida.push({ tipo: 'texto', valor: texto.slice(ultimo, i) });
    if (m[1] !== undefined) {
      salida.push({ tipo: 'negrita', valor: m[1] });
    } else {
      const href = hrefSeguro(m[3] ?? '');
      salida.push(href ? { tipo: 'enlace', valor: m[2] ?? '', href } : { tipo: 'texto', valor: m[2] ?? '' });
    }
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) salida.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return salida;
}

export function leerArticulo(markdown: string): Bloque[] {
  const bloques: Bloque[] = [];
  let parrafo: string[] = [];
  let lista: string[] = [];

  const cerrar = () => {
    if (parrafo.length) bloques.push({ tipo: 'p', contenido: leerLinea(parrafo.join(' ')) });
    if (lista.length) bloques.push({ tipo: 'lista', items: lista.map(leerLinea) });
    parrafo = [];
    lista = [];
  };

  for (const cruda of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const l = cruda.trim();
    if (l === '') { cerrar(); continue; }
    if (l.startsWith('### ')) { cerrar(); bloques.push({ tipo: 'h3', contenido: leerLinea(l.slice(4)) }); continue; }
    if (l.startsWith('## ')) { cerrar(); bloques.push({ tipo: 'h2', contenido: leerLinea(l.slice(3)) }); continue; }
    if (l.startsWith('- ')) {
      if (parrafo.length) cerrar();
      lista.push(l.slice(2));
      continue;
    }
    if (lista.length) cerrar();
    parrafo.push(l);
  }
  cerrar();
  return bloques;
}

/** Primer párrafo en texto plano, para la descripción de buscadores. */
export function extracto(markdown: string, maximo = 160): string {
  const p = leerArticulo(markdown).find((b) => b.tipo === 'p');
  const texto = p && p.tipo === 'p' ? p.contenido.map((x) => x.valor).join('') : '';
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`;
}
