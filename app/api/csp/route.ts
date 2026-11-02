import { NextResponse } from 'next/server';

/**
 * Recibe los informes de violación de la CSP (report-uri). Registra solo lo necesario para ajustar la
 * política: directiva, origen bloqueado y ruta de la página, sin consulta ni datos personales. Siempre
 * responde 204; un informe inválido o demasiado grande se descarta.
 */
export async function POST(solicitud: Request) {
  const texto = await solicitud.text();
  if (texto.length > 10_000) return new NextResponse(null, { status: 204 });
  try {
    const cuerpo = JSON.parse(texto) as Record<string, unknown> | Record<string, unknown>[];
    const lista = Array.isArray(cuerpo) ? cuerpo.map((r) => (r.body ?? r) as Record<string, unknown>) : [(cuerpo['csp-report'] ?? cuerpo) as Record<string, unknown>];
    for (const r of lista.slice(0, 5)) {
      const directiva = String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '').slice(0, 60);
      const bloqueado = String(r['blocked-uri'] ?? r.blockedURL ?? '');
      const pagina = String(r['document-uri'] ?? r.documentURL ?? '');
      console.warn(`csp: ${directiva} bloqueó ${soloOrigen(bloqueado)} en ${soloRuta(pagina)}`);
    }
  } catch {
    // Informe ilegible: se ignora.
  }
  return new NextResponse(null, { status: 204 });
}

function soloOrigen(u: string): string {
  if (!u || /^(inline|eval|data|blob|self)$/.test(u)) return u || '(sin dato)';
  try { return new URL(u).origin; } catch { return u.slice(0, 40); }
}
function soloRuta(u: string): string {
  try { return new URL(u).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id'); } catch { return '(sin dato)'; }
}
