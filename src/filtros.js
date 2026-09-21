// Convierte los filtros de la pantalla (búsqueda, tipo, fechas, orden...) en piezas de SQL.
// Se usa tanto para la tabla como para exportar a Excel, así ambos siempre coinciden.
const { TIPOS } = require('./validacion');

// Lista blanca: solo se puede ordenar por estas columnas (evita inyección de SQL).
const COLUMNAS_ORDENABLES = [
  'fecha', 'tipo', 'nombre', 'proveedor', 'categoria', 'cantidad', 'valor_unitario', 'valor_total',
];

function construirFiltros(consulta = {}) {
  const condiciones = [];
  const parametros = {};

  const buscar = String(consulta.buscar ?? '').trim();
  if (buscar) {
    condiciones.push(`(nombre LIKE @buscar OR proveedor LIKE @buscar OR categoria LIKE @buscar OR observaciones LIKE @buscar)`);
    parametros.buscar = `%${buscar}%`;
  }

  if (TIPOS.includes(consulta.tipo)) {
    condiciones.push('tipo = @tipo');
    parametros.tipo = consulta.tipo;
  }

  if (consulta.categoria) {
    condiciones.push('categoria = @categoria');
    parametros.categoria = String(consulta.categoria);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(consulta.desde ?? '')) {
    condiciones.push('fecha >= @desde');
    parametros.desde = consulta.desde;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(consulta.hasta ?? '')) {
    condiciones.push('fecha <= @hasta');
    parametros.hasta = consulta.hasta;
  }

  const columna = COLUMNAS_ORDENABLES.includes(consulta.orden) ? consulta.orden : 'fecha';
  const direccion = consulta.dir === 'asc' ? 'ASC' : 'DESC';

  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    parametros,
    orderBy: `ORDER BY ${columna} ${direccion}, id DESC`,
  };
}

module.exports = { construirFiltros };
