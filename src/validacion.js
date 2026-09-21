// Revisa los datos que llegan del formulario antes de guardarlos.
// Devuelve { errores, valores }: si "errores" está vacío, "valores" ya viene limpio y con el total calculado.

const TIPOS = ['compra', 'venta', 'gasto', 'otro'];

function esFechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

function aNumero(valor) {
  if (valor === '' || valor === null || valor === undefined) return NaN;
  return Number(valor);
}

function redondear(numero) {
  return Math.round(numero * 100) / 100;
}

function validarMovimiento(datos = {}) {
  const errores = {};

  const nombre = String(datos.nombre ?? '').trim();
  const proveedor = String(datos.proveedor ?? '').trim();
  const categoria = String(datos.categoria ?? '').trim();
  const observaciones = String(datos.observaciones ?? '').trim();
  const tipo = String(datos.tipo ?? '').trim();
  const fecha = String(datos.fecha ?? '').trim();
  const cantidad = aNumero(datos.cantidad);
  const valorUnitario = aNumero(datos.valor_unitario);

  if (!nombre) errores.nombre = 'Escribe el nombre del producto o elemento.';
  else if (nombre.length > 150) errores.nombre = 'El nombre no puede pasar de 150 caracteres.';

  if (!TIPOS.includes(tipo)) errores.tipo = 'Elige un tipo de movimiento.';

  if (proveedor.length > 150) errores.proveedor = 'El proveedor no puede pasar de 150 caracteres.';
  if (categoria.length > 80) errores.categoria = 'La categoría no puede pasar de 80 caracteres.';
  if (observaciones.length > 500) errores.observaciones = 'Las observaciones no pueden pasar de 500 caracteres.';

  if (Number.isNaN(cantidad)) errores.cantidad = 'La cantidad debe ser un número.';
  else if (cantidad <= 0) errores.cantidad = 'La cantidad debe ser mayor que cero.';

  if (Number.isNaN(valorUnitario)) errores.valor_unitario = 'El valor unitario debe ser un número.';
  else if (valorUnitario < 0) errores.valor_unitario = 'El valor unitario no puede ser negativo.';

  if (!fecha) errores.fecha = 'Elige la fecha del movimiento.';
  else if (!esFechaValida(fecha)) errores.fecha = 'La fecha no es válida.';

  const valores = {
    nombre,
    proveedor,
    categoria,
    cantidad,
    valor_unitario: valorUnitario,
    // Valor total = Cantidad × Valor unitario (siempre se calcula aquí, no se confía en el navegador).
    valor_total: redondear(cantidad * valorUnitario),
    fecha,
    tipo,
    observaciones,
  };

  return { errores, valores };
}

module.exports = { TIPOS, validarMovimiento };
