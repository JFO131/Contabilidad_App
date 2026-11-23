// Aquí vive todo el acceso a la base de datos para los movimientos.
// Las rutas (carpeta "rutas") solo llaman a estas funciones.
const db = require('../db');
const { construirFiltros } = require('../filtros');
const {
  crearError,
  recalcularStockProducto,
  buscarPorNombreExacto,
} = require('./inventarioServicio');

const redondear = (numero) => Math.round((numero ?? 0) * 100) / 100;

function resolverEfectoInventario(valores) {
  let producto = null;

  if (valores.producto_id) {
    producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(valores.producto_id);
    if (!producto) {
      throw crearError('El producto seleccionado no existe en el inventario.', 400, {
        producto_id: 'El producto seleccionado no existe.',
      });
    }
  } else if (valores.tipo === 'compra' || valores.tipo === 'venta') {
    // Si el nombre coincide exactamente con un producto del inventario, se sincroniza automáticamente.
    producto = buscarPorNombreExacto(valores.nombre);
  }

  if (!producto) {
    return { productoId: null, afectaInventario: 0, tipoInventario: null, motivo: '' };
  }

  if (valores.tipo === 'compra') {
    return {
      productoId: producto.id,
      afectaInventario: 1,
      tipoInventario: 'entrada',
      motivo: valores.observaciones || `Compra: ${valores.nombre}`,
    };
  }

  if (valores.tipo === 'venta') {
    return {
      productoId: producto.id,
      afectaInventario: 1,
      tipoInventario: 'salida',
      motivo: valores.observaciones || `Venta: ${valores.nombre}`,
    };
  }

  // Gasto u Otro: solo modifica el inventario si el usuario indicó que corresponde a una salida de productos.
  if (valores.afecta_inventario === 1) {
    return {
      productoId: producto.id,
      afectaInventario: 1,
      tipoInventario: 'salida',
      motivo: valores.observaciones || `Salida (${valores.tipo}): ${valores.nombre}`,
    };
  }

  return {
    productoId: producto.id,
    afectaInventario: 0,
    tipoInventario: null,
    motivo: '',
  };
}

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
  const { where, parametros, orderBy } = construirFiltros(consulta, 'm');
  const registros = db.prepare(`
    SELECT m.*, p.nombre AS producto_nombre
    FROM movimientos m
    LEFT JOIN productos p ON p.id = m.producto_id
    ${where}
    ${orderBy}
  `).all(parametros);
  const { where: whereTotales, parametros: paramsTotales } = construirFiltros(consulta);
  const totales = calcularTotales(whereTotales, paramsTotales);
  return { registros, totales };
}

function obtener(id) {
  return db.prepare(`
    SELECT m.*, p.nombre AS producto_nombre
    FROM movimientos m
    LEFT JOIN productos p ON p.id = m.producto_id
    WHERE m.id = ?
  `).get(id) ?? null;
}

const crearTx = db.transaction((valores) => {
  const efecto = resolverEfectoInventario(valores);

  const resultado = db.prepare(`
    INSERT INTO movimientos (
      nombre, proveedor, categoria, cantidad, valor_unitario, valor_total,
      fecha, tipo, observaciones, producto_id, afecta_inventario
    )
    VALUES (
      @nombre, @proveedor, @categoria, @cantidad, @valor_unitario, @valor_total,
      @fecha, @tipo, @observaciones, @producto_id, @afecta_inventario
    )
  `).run({
    ...valores,
    producto_id: efecto.productoId,
    afecta_inventario: efecto.afectaInventario,
  });

  const movimientoId = resultado.lastInsertRowid;

  if (efecto.afectaInventario === 1 && efecto.tipoInventario) {
    db.prepare(`
      INSERT INTO inventario_movimientos (producto_id, movimiento_id, tipo, origen, cantidad, motivo, fecha)
      VALUES (@producto_id, @movimiento_id, @tipo, @origen, @cantidad, @motivo, @fecha)
    `).run({
      producto_id: efecto.productoId,
      movimiento_id: movimientoId,
      tipo: efecto.tipoInventario,
      origen: valores.tipo,
      cantidad: valores.cantidad,
      motivo: efecto.motivo,
      fecha: valores.fecha,
    });

    recalcularStockProducto(
      efecto.productoId,
      efecto.tipoInventario === 'salida' ? { cantidadSolicitada: valores.cantidad } : {}
    );
  }

  return obtener(movimientoId);
});

function crear(valores) {
  return crearTx(valores);
}

const actualizarTx = db.transaction((id, valores) => {
  const anterior = db.prepare('SELECT * FROM movimientos WHERE id = ?').get(id);
  if (!anterior) return null;

  const efecto = resolverEfectoInventario(valores);
  const productosAfectados = new Set();
  if (anterior.producto_id) productosAfectados.add(anterior.producto_id);
  if (efecto.productoId) productosAfectados.add(efecto.productoId);

  db.prepare(`
    UPDATE movimientos SET
      nombre = @nombre, proveedor = @proveedor, categoria = @categoria,
      cantidad = @cantidad, valor_unitario = @valor_unitario, valor_total = @valor_total,
      fecha = @fecha, tipo = @tipo, observaciones = @observaciones,
      producto_id = @producto_id, afecta_inventario = @afecta_inventario,
      actualizado_en = datetime('now')
    WHERE id = @id
  `).run({
    ...valores,
    producto_id: efecto.productoId,
    afecta_inventario: efecto.afectaInventario,
    id,
  });

  db.prepare('DELETE FROM inventario_movimientos WHERE movimiento_id = ?').run(id);

  if (efecto.afectaInventario === 1 && efecto.tipoInventario) {
    db.prepare(`
      INSERT INTO inventario_movimientos (producto_id, movimiento_id, tipo, origen, cantidad, motivo, fecha)
      VALUES (@producto_id, @movimiento_id, @tipo, @origen, @cantidad, @motivo, @fecha)
    `).run({
      producto_id: efecto.productoId,
      movimiento_id: id,
      tipo: efecto.tipoInventario,
      origen: valores.tipo,
      cantidad: valores.cantidad,
      motivo: efecto.motivo,
      fecha: valores.fecha,
    });
  }

  for (const productoId of productosAfectados) {
    const esNuevaSalida = productoId === efecto.productoId && efecto.tipoInventario === 'salida';
    recalcularStockProducto(
      productoId,
      esNuevaSalida ? { cantidadSolicitada: valores.cantidad } : {}
    );
  }

  return obtener(id);
});

function actualizar(id, valores) {
  return actualizarTx(id, valores);
}

const eliminarTx = db.transaction((id) => {
  const anterior = db.prepare('SELECT * FROM movimientos WHERE id = ?').get(id);
  if (!anterior) return false;

  db.prepare('DELETE FROM inventario_movimientos WHERE movimiento_id = ?').run(id);
  const borrado = db.prepare('DELETE FROM movimientos WHERE id = ?').run(id).changes > 0;

  if (borrado && anterior.producto_id) {
    recalcularStockProducto(anterior.producto_id);
  }

  return borrado;
});

function eliminar(id) {
  return eliminarTx(id);
}

function listarCategorias() {
  return db.prepare(`
    SELECT categoria FROM (
      SELECT DISTINCT categoria FROM movimientos WHERE categoria <> ''
      UNION
      SELECT DISTINCT categoria FROM productos WHERE categoria <> ''
    )
    ORDER BY categoria COLLATE NOCASE
  `)
    .all()
    .map((fila) => fila.categoria);
}

module.exports = { calcularTotales, listar, obtener, crear, actualizar, eliminar, listarCategorias };
