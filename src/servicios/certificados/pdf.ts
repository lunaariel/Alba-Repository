import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

/**
 * Certificado de finalización en PDF (A4 apaisado). Se genera en cada descarga a partir
 * del registro congelado en la base (nombre, curso, fecha, código): regenerar nunca crea
 * otro certificado. No es una acreditación Montessori oficial y así lo dice.
 */
export interface DatosCertificado {
  nombre: string;
  curso: string;
  emitidoEn: Date;
  codigo: string;
  urlVerificacion: string;           // p. ej. https://albor.example/verificar/ABCD…
  academia?: string;
}

export const LEYENDA_CERTIFICADO =
  'Certificado de finalización emitido por Albor. No constituye una acreditación Montessori oficial.';

const OLIVA = rgb(0x4e / 255, 0x60 / 255, 0x49 / 255);
const ARENA = rgb(0xe9 / 255, 0xdf / 255, 0xc9 / 255);
const MARFIL = rgb(0xf8 / 255, 0xf5 / 255, 0xee / 255);
const MARRON = rgb(0x44 / 255, 0x3d / 255, 0x34 / 255);
const SUAVE = rgb(0x6b / 255, 0x62 / 255, 0x57 / 255);

const SIN_DESCOMPOSICION: Record<string, string> = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h' };

/** Las fuentes estándar del PDF usan WinAnsi: lo que no entra se aproxima sin acentos o con "?". */
export function aWinAnsi(texto: string, fuente: PDFFont): string {
  let salida = '';
  for (const c of texto.normalize('NFC')) {
    if (puedeCodificar(c, fuente)) { salida += c; continue; }
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    salida += base && [...base].every((b) => puedeCodificar(b, fuente)) ? base : '?';
  }
  return salida;
}
function puedeCodificar(c: string, fuente: PDFFont): boolean {
  try { fuente.encodeText(c); return true; } catch { return false; }
}

/** Reduce el tamaño hasta que el texto quepa en el ancho dado. */
function ajustar(texto: string, fuente: PDFFont, tamano: number, ancho: number, minimo = 14): number {
  let t = tamano;
  while (t > minimo && fuente.widthOfTextAtSize(texto, t) > ancho) t -= 1;
  return t;
}

// Emblema de Albor: rayos, disco, anillos, media luna (con máscara simulada) y estrella.
const RAYOS = 'M93.53 40.35 L100 3 L106.47 40.35 Z M116.85 42.42 L137.12 10.38 L128.8 47.36 Z M137.61 53.25 L168.59 31.41 L146.75 62.39 Z M152.64 71.2 L189.62 62.88 L157.58 83.15 Z M159.65 93.53 L197 100 L159.65 106.47 Z M157.58 116.85 L189.62 137.12 L152.64 128.8 Z M146.75 137.61 L168.59 168.59 L137.61 146.75 Z M128.8 152.64 L137.12 189.62 L116.85 157.58 Z M106.47 159.65 L100 197 L93.53 159.65 Z M83.15 157.58 L62.88 189.62 L71.2 152.64 Z M62.39 146.75 L31.41 168.59 L53.25 137.61 Z M47.36 128.8 L10.38 137.12 L42.42 116.85 Z M40.35 106.47 L3 100 L40.35 93.53 Z M42.42 83.15 L10.38 62.88 L47.36 71.2 Z M53.25 62.39 L31.41 31.41 L62.39 53.25 Z M71.2 47.36 L62.88 10.38 L83.15 42.42 Z';
const ESTRELLA = 'M112 79 L113.53 96.3 L119.07 92.93 L115.7 98.47 L133 100 L115.7 101.53 L119.07 107.07 L113.53 103.7 L112 121 L110.47 103.7 L104.93 107.07 L108.3 101.53 L91 100 L108.3 98.47 L104.93 92.93 L110.47 96.3 Z';

export async function generarCertificadoPdf(d: DatosCertificado): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificado: ${d.curso}`);
  doc.setAuthor(d.academia ?? 'Albor');
  doc.setSubject('Certificado de finalización');
  doc.setCreationDate(d.emitidoEn);
  const pagina = doc.addPage([841.89, 595.28]);
  const { width: W, height: H } = pagina.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifNegrita = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansNegrita = await doc.embedFont(StandardFonts.HelveticaBold);

  pagina.drawRectangle({ x: 0, y: 0, width: W, height: H, color: MARFIL });
  pagina.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: OLIVA, borderWidth: 1.5 });
  pagina.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: ARENA, borderWidth: 4 });

  // Emblema (200×200 en su sistema; se escala a 72 pt).
  const e = 72 / 200;
  const ex = W / 2 - 36;
  const ey = H - 60;
  pagina.drawSvgPath(RAYOS, { x: ex, y: ey, scale: e, color: OLIVA });
  pagina.drawCircle({ x: W / 2, y: ey - 100 * e, size: 62 * e, color: OLIVA });
  pagina.drawCircle({ x: W / 2, y: ey - 100 * e, size: 54 * e, borderColor: ARENA, borderWidth: 3.5 * e });
  pagina.drawCircle({ x: W / 2, y: ey - 100 * e, size: 42 * e, color: ARENA });
  pagina.drawCircle({ x: ex + 116 * e, y: ey - 94 * e, size: 35 * e, color: OLIVA });
  pagina.drawSvgPath(ESTRELLA, { x: ex, y: ey, scale: e, color: ARENA });

  const centrado = (texto: string, y: number, fuente: PDFFont, tamano: number, color = MARRON) => {
    const t = aWinAnsi(texto, fuente);
    const s = ajustar(t, fuente, tamano, W - 160);
    pagina.drawText(t, { x: (W - fuente.widthOfTextAtSize(t, s)) / 2, y, size: s, font: fuente, color });
  };

  centrado((d.academia ?? 'Albor').toUpperCase(), H - 160, sansNegrita, 12, OLIVA);
  centrado('Certificado de finalización', H - 200, serif, 34);
  centrado('Se deja constancia de que', H - 245, sans, 13, SUAVE);
  centrado(d.nombre, H - 290, serifNegrita, 36);
  pagina.drawLine({ start: { x: W / 2 - 170, y: H - 304 }, end: { x: W / 2 + 170, y: H - 304 }, thickness: 0.8, color: OLIVA });
  centrado('completó todas las lecciones y aprobó la evaluación final del curso', H - 334, sans, 13, SUAVE);
  centrado(d.curso, H - 370, serif, 24);

  const fecha = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' })
    .format(d.emitidoEn);
  centrado(`Emitido el ${fecha}`, 128, sans, 12);
  centrado(`Código de verificación: ${d.codigo}`, 108, sansNegrita, 12, OLIVA);
  centrado(`Verifíquelo en ${d.urlVerificacion}`, 90, sans, 10, SUAVE);
  centrado(LEYENDA_CERTIFICADO, 58, sans, 9, SUAVE);

  return doc.save();
}
