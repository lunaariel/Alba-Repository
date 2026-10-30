/** Importes en centavos de USD. Nunca se usan decimales flotantes para dinero. */
export type Centavos = number;

export function validarCentavos(valor: Centavos): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`Importe inválido: ${valor}. Debe ser un entero de centavos mayor o igual a 0.`);
  }
}

/** "USD 49" o "USD 49.50": la moneda siempre escrita, como pide el sistema de diseño. */
export function formatearUSD(valor: Centavos): string {
  validarCentavos(valor);
  const dolares = Math.floor(valor / 100);
  const resto = valor % 100;
  const entero = dolares.toLocaleString('en-US');
  return resto === 0 ? `USD ${entero}` : `USD ${entero}.${String(resto).padStart(2, '0')}`;
}

/** Aplica un cupón con la misma regla que la base de datos (crear_orden). */
export function aplicarCupon(
  precio: Centavos,
  cupon: { tipo: 'porcentaje' | 'monto'; valor: number } | null,
): { descuento: Centavos; total: Centavos } {
  validarCentavos(precio);
  if (!cupon) return { descuento: 0, total: precio };
  const bruto = cupon.tipo === 'porcentaje' ? Math.floor((precio * cupon.valor) / 100) : cupon.valor;
  const descuento = Math.min(precio, bruto);
  return { descuento, total: precio - descuento };
}
