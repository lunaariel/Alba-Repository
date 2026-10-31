import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Cada acción de servidor del panel debe exigir el rol admin antes de hacer cualquier otra cosa.
// (RLS igual rechaza a quien no es admin, pero algunas acciones usan la clave de servicio.)
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /acciones\.ts$/.test(n) ? [p] : [];
  });
}

test('toda acción exportada del panel empieza con exigirAdminAccion()', () => {
  const lista = archivos('app/admin');
  assert.ok(lista.length > 0, 'hay archivos de acciones en el panel');
  let total = 0;
  for (const archivo of lista) {
    const codigo = readFileSync(archivo, 'utf8');
    assert.match(codigo, /^'use server';/, `${archivo} declara 'use server'`);
    const partes = codigo.split(/export async function (\w+)\s*\(/).slice(1);
    for (let i = 0; i < partes.length; i += 2) {
      const nombre = partes[i]!;
      const cuerpo = partes[i + 1]!;
      const primera = cuerpo.slice(cuerpo.indexOf('{\n') + 2).trim().split('\n')[0];
      assert.equal(primera, 'await exigirAdminAccion();', `${archivo} → ${nombre}: la primera línea debe ser await exigirAdminAccion();`);
      total++;
    }
  }
  assert.ok(total >= 10, `se revisaron ${total} acciones`);
});
