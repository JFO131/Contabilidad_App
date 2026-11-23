// Revisa los datos que llegan del formulario antes de guardarlos.
// Devuelve { errores, valores }: si "errores" está vacío, "valores" ya viene limpio y con el total calculado.

const TIPOS = ['compra', 'venta', 'gasto', 'otro'];
const TIPOS_AJUSTE = ['entrada', 'salida'];
const ESTADOS_STOCK = ['disponible', 'stock_bajo', 'agotado'];

function esFechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

function aNumero(valor) {
  if (valor === '' || valor === null || valor === undefined) return NaN;
  return Number(valor);
}

function aEnteroOpcional(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const num = Number.parseInt(valor, 10);
  return Number.isInteger(num) && num > 0 ? num : NaN;
}

function aBooleano(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true' || valor === 'on';
}

function redondear(numero) {
  return Math.round(numero * 100) / 100;
}

function hoyISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
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
  const productoId = aEnteroOpcional(datos.producto_id);
  const afectaInventario = aBooleano(datos.afecta_inventario) ? 1 : 0;

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

  if (Number.isNaN(productoId)) errores.producto_id = 'El producto seleccionado no es válido.';

  if ((tipo === 'gasto' || tipo === 'otro') && afectaInventario === 1 && !productoId) {
    errores.producto_id = 'Selecciona el producto del inventario que saldrá con este movimiento.';
  }

  const valores = {
    nombre,
    proveedor,
    categoria,
    cantidad: redondear(cantidad),
    valor_unitario: redondear(valorUnitario),
    // Valor total = Cantidad × Valor unitario (siempre se calcula aquí, no se confía en el navegador).
    valor_total: redondear(cantidad * valorUnitario),
    fecha,
    tipo,
    observaciones,
    producto_id: Number.isNaN(productoId) ? null : productoId,
    afecta_inventario: afectaInventario,
  };

  return { errores, valores };
}

function validarProducto(datos = {}) {
  const errores = {};

  const nombre = String(datos.nombre ?? '').trim();
  const categoria = String(datos.categoria ?? '').trim();
  const proveedor = String(datos.proveedor ?? '').trim();
  const cantidadInicial = aNumero(datos.cantidad_inicial ?? 0);
  const stockMinimo = aNumero(datos.stock_minimo ?? 5);
  const valorUnitario = aNumero(datos.valor_unitario ?? 0);

  if (!nombre) errores.nombre = 'Escribe el nombre del producto.';
  else if (nombre.length > 150) errores.nombre = 'El nombre no puede pasar de 150 caracteres.';

  if (categoria.length > 80) errores.categoria = 'La categoría no puede pasar de 80 caracteres.';
  if (proveedor.length > 150) errores.proveedor = 'El proveedor no puede pasar de 150 caracteres.';

  if (Number.isNaN(cantidadInicial)) errores.cantidad_inicial = 'La cantidad inicial debe ser un número.';
  else if (cantidadInicial < 0) errores.cantidad_inicial = 'La cantidad inicial no puede ser negativa.';

  if (Number.isNaN(stockMinimo)) errores.stock_minimo = 'El stock mínimo debe ser un número.';
  else if (stockMinimo < 0) errores.stock_minimo = 'El stock mínimo no puede ser negativo.';

  if (Number.isNaN(valorUnitario)) errores.valor_unitario = 'El valor unitario debe ser un número.';
  else if (valorUnitario < 0) errores.valor_unitario = 'El valor unitario no puede ser negativo.';

  const valores = {
    nombre,
    categoria,
    proveedor,
    cantidad_inicial: redondear(cantidadInicial),
    stock_minimo: redondear(stockMinimo),
    valor_unitario: redondear(valorUnitario),
  };

  return { errores, valores };
}

function validarAjusteInventario(datos = {}) {
  const errores = {};

  const tipo = String(datos.tipo ?? '').trim();
  const cantidad = aNumero(datos.cantidad);
  const motivo = String(datos.motivo ?? '').trim();
  const fecha = String(datos.fecha ?? hoyISO()).trim() || hoyISO();

  if (!TIPOS_AJUSTE.includes(tipo)) errores.tipo = 'Elige si es una entrada o salida de inventario.';

  if (Number.isNaN(cantidad)) errores.cantidad = 'La cantidad debe ser un número.';
  else if (cantidad <= 0) errores.cantidad = 'La cantidad debe ser mayor que cero.';

  if (!motivo) errores.motivo = 'Indica el motivo de la entrada o salida manual.';
  else if (motivo.length > 300) errores.motivo = 'El motivo no puede pasar de 300 caracteres.';

  if (!esFechaValida(fecha)) errores.fecha = 'La fecha no es válida.';

  const valores = {
    tipo,
    cantidad: redondear(cantidad),
    motivo,
    fecha,
  };

  return { errores, valores };
}

module.exports = {
  TIPOS,
  TIPOS_AJUSTE,
  ESTADOS_STOCK,
  validarMovimiento,
  validarProducto,
  validarAjusteInventario,
};
