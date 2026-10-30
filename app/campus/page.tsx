import { exigirSesion } from '@/datos/sesion';
import { salir } from '../(auth)/acciones';

// Fase 4 construye el campus. Por ahora solo comprueba que la sesión y la protección funcionan.
export default async function Campus() {
  const usuario = await exigirSesion('/campus');
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px]">Mis cursos</h1>
      <p className="m-0">Ingresó como {usuario.email}. El campus se construye en la Fase 4.</p>
      <form action={salir}>
        <button type="submit" className="min-h-[44px] rounded-md border-2 border-oliva-profundo px-5 font-bold text-oliva-profundo">Salir</button>
      </form>
    </main>
  );
}
