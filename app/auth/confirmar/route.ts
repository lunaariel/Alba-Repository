import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { clienteSesion } from '@/datos/supabase';

/** Destino de los enlaces de confirmación de cuenta y de recuperación de contraseña. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  const siguiente = searchParams.get('siguiente') ?? '/campus';
  const destino = siguiente.startsWith('/') && !siguiente.startsWith('//') ? siguiente : '/campus';

  if (tokenHash && tipo) {
    const supabase = await clienteSesion();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  }
  return NextResponse.redirect(new URL('/ingresar?aviso=enlace_invalido', origin));
}
