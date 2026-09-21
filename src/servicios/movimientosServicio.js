// Aquí vive todo el acceso a la base de datos para los movimientos.
// Las rutas (carpeta "rutas") solo llaman a estas funciones.
const db = require('../db');
const { construirFiltros } = require('../filtros');

const redondear = (numero) => Math.round((numero ?? 0) * 100) / 100;

// Suma los valores por tipo. Si se pasa un "where", solo cuenta los registros filtrados.
function calcularTotales(where = '', parametros = {}) {
  const fila = db.prepare(`
    SELECT
      COUNT(*) AS cantidad_registros,
      COALESCE(SUM(CASE WHEN tipo = 'compra' THEN valor_total END), 0) AS total_compras,
      COALESCE(SUM(CASE WHEN tipo = 'venta'  THEN valor_total END), 0) AS total_ventas,
      COALESCE(SUM(CASE WHEN tipo = 'gasto'  THEN valor_total END), 0) AS total_gastos,
      COALESCE(SUM(CASE WHEN tipo = 'otro'   THEN valor_total END), 0) AS total_otros,
      COALESCE(SUM(valor_total), 0) AS total_general
    FROM movimientos ${where}
  `).get(parametros);

  return {
    cantidad_registros: fila.cantidad_registros,
    total_compras: redondear(fila.total_compras),
    total_ventas: redondear(fila.total_ventas),
    total_gastos: redondear(fila.total_gastos),
    total_otros: redondear(fila.total_otros),
    total_general: redondear(fila.total_general),
  };
}

function listar(consulta) {
  const { where, parametros, orderBy } = construirFiltros(consulta);
  const registros = db.prepare(`SELECT * FROM movimientos ${where} ${orderBy}`).all(parametros);
  const totales = calcularTotales(where, parametros);
  return { registros, totales };
}

function obtener(id) {
  return db.prepare('SELECT * FROM movimientos WHERE id = ?').get(id) ?? null;
}

function crear(valores) {
  const resultado = db.prepare(`
    INSERT INTO movimientos (nombre, proveedor, categoria, cantidad, valor_unitario, valor_total, fecha, tipo, observaciones)
    VALUES (@nombre, @proveedor, @categoria, @cantidad, @valor_unitario, @valor_total, @fecha, @tipo, @observaciones)
  `).run(valores);
  return obtener(resultado.lastInsertRowid);
}

function actualizar(id, valores) {
  const resultado = db.prepare(`
    UPDATE movimientos SET
      nombre = @nombre, proveedor = @proveedor, categoria = @categoria,
      cantidad = @cantidad, valor_unitario = @valor_unitario, valor_total = @valor_total,
      fecha = @fecha, tipo = @tipo, observaciones = @observaciones,
      actualizado_en = datetime('now')
    WHERE id = @id
  `).run({ ...valores, id });
  return resultado.changes ? obtener(id) : null;
}

function eliminar(id) {
  return db.prepare('DELETE FROM movimientos WHERE id = ?').run(id).changes > 0;
}

function listarCategorias() {
  return db.prepare(`SELECT DISTINCT categoria FROM movimientos WHERE categoria <> '' ORDER BY categoria COLLATE NOCASE`)
    .all()
    .map((fila) => fila.categoria);
}

module.exports = { calcularTotales, listar, obtener, crear, actualizar, eliminar, listarCategorias };
