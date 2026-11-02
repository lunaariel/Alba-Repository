import { NextResponse, type NextRequest } from 'next/server';
import { verificarVideoSimulado } from '@/servicios/video/simulado';

/**
 * Reproductor simulado (desarrollo y pruebas). No existe en producción: responde 404. Verifica firma y vencimiento
 * igual que lo haría Bunny con su token: un enlace manipulado responde 403 y uno vencido, 410.
 */
export async function GET(solicitud: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const secreto = process.env.VIDEO_SIMULADO_SECRETO;
  if (process.env.APP_ENTORNO === 'produccion' || process.env.VIDEO_PROVEEDOR !== 'simulado' || !secreto) {
    return new NextResponse('No encontrado', { status: 404 });
  }
  const { id } = await params;
  const u = solicitud.nextUrl;
  const r = verificarVideoSimulado(secreto, decodeURIComponent(id), u.searchParams.get('vence'), u.searchParams.get('firma'));
  if (r === 'firma_invalida') return new NextResponse('Enlace inválido', { status: 403 });
  if (r === 'vencido') return new NextResponse('Enlace vencido: recargue la lección', { status: 410 });
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Video simulado</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#3F4F3B;color:#FBF7EF;font-family:system-ui">
<p data-video-simulado>Video simulado: ninguna imagen real (entorno de prueba).</p></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
