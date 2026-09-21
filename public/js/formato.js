// Funciones pequeñas para mostrar dinero, números y fechas de forma legible.

export const ETIQUETA_TIPO = { compra: 'Compra', venta: 'Venta', gasto: 'Gasto', otro: 'Otro' };

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatoNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

// 1500000 -> "$ 1.500.000"
export const moneda = (valor) => formatoMoneda.format(valor ?? 0);

// 1500.5 -> "1.500,5"
export const numero = (valor) => formatoNumero.format(valor ?? 0);

// "2026-09-20" -> "20/09/2026"
export function fechaCorta(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}/${anio}`;
}

// Fecha de hoy en formato AAAA-MM-DD (usando la hora local del computador).
export function hoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

// Evita que texto escrito por el usuario se interprete como HTML.
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
