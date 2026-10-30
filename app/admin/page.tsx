import { exigirAdmin } from '@/datos/sesion';

// Fase 5 construye el panel. Por ahora solo comprueba que únicamente la admin entra.
export default async function Admin() {
  await exigirAdmin();
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-5 py-16">
      <h1 className="m-0 text-[40px]">Panel de administración</h1>
      <p className="m-0">El panel se construye en la Fase 5.</p>
    </main>
  );
}
