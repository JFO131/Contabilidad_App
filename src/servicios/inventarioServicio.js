// Lógica de negocio y acceso transaccional para el módulo de Inventario de productos.
const db = require('../db');
const { ESTADOS_STOCK } = require('../validacion');

const redondear = (numero) => Math.round((numero ?? 0) * 100) / 100;

const COLUMNAS_ORDENABLES = {
  nombre: 'p.nombre COLLATE NOCASE',
  categoria: 'p.categoria COLLATE NOCASE',
  proveedor: 'p.proveedor COLLATE NOCASE',
  cantidad_inicial: 'p.cantidad_inicial',
  cantidad_actual: 'p.cantidad_actual',
  stock_minimo: 'p.stock_minimo',
  valor_unitario: 'p.valor_unitario',
  valor_total: '(p.cantidad_actual * p.valor_unitario)',
  estado_stock: `CASE
    WHEN p.cantidad_actual <= 0 THEN 0
    WHEN p.stock_minimo > 0 AND p.cantidad_actual <= p.stock_minimo THEN 1
    ELSE 2
  END`,
};

const SELECT_PRODUCTO = `
  SELECT
    p.*,
    ROUND(p.cantidad_actual * p.valor_unitario, 2) AS valor_total,
    CASE
      WHEN p.cantidad_actual <= 0 THEN 'agotado'
      WHEN p.stock_minimo > 0 AND p.cantidad_actual <= p.stock_minimo THEN 'stock_bajo'
      ELSE 'disponible'
    END AS estado_stock
  FROM productos p
`;

function crearError(mensaje, status = 400, errores = null) {
  const error = new Error(mensaje);
  error.status = status;
  if (errores) error.errores = errores;
  return error;
}

function construirFiltrosInventario(consulta = {}) {
  const condiciones = [];
  const parametros = {};

  const buscar = String(consulta.buscar ?? '').trim();
  if (buscar) {
    condiciones.push('(p.nombre LIKE @buscar OR p.categoria LIKE @buscar OR p.proveedor LIKE @buscar)');
    parametros.buscar = `%${buscar}%`;
  }

  if (consulta.categoria) {
    condiciones.push('p.categoria = @categoria');
    parametros.categoria = String(consulta.categoria);
  }

  if (consulta.proveedor) {
    condiciones.push('p.proveedor = @proveedor');
    parametros.proveedor = String(consulta.proveedor);
  }

  if (ESTADOS_STOCK.includes(consulta.estado)) {
    if (consulta.estado === 'agotado') {
      condiciones.push('p.cantidad_actual <= 0');
    } else if (consulta.estado === 'stock_bajo') {
      condiciones.push('p.cantidad_actual > 0 AND p.stock_minimo > 0 AND p.cantidad_actual <= p.stock_minimo');
    } else if (consulta.estado === 'disponible') {
      condiciones.push('p.cantidad_actual > 0 AND (p.stock_minimo = 0 OR p.cantidad_actual > p.stock_minimo)');
    }
  }

  const exprOrden = COLUMNAS_ORDENABLES[consulta.orden] || COLUMNAS_ORDENABLES.nombre;
  const direccion = consulta.dir === 'desc' ? 'DESC' : 'ASC';

  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    parametros,
    orderBy: `ORDER BY ${exprOrden} ${direccion}, p.id ASC`,
  };
}

// Recalcula cantidad_actual desde cantidad_inicial + entradas - salidas.
// Debe ejecutarse siempre dentro de una transacción para garantizar reversión en caso de error.
function recalcularStockProducto(productoId, contexto = {}) {
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId);
  if (!producto) return null;

  const fila = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END), 0) AS neto
    FROM inventario_movimientos
    WHERE producto_id = ?
  `).get(productoId);

  const nuevaCantidad = redondear(producto.cantidad_inicial + fila.neto);

  if (nuevaCantidad < 0) {
    if (contexto.cantidadSolicitada !== undefined) {
      const disponible = redondear(nuevaCantidad + contexto.cantidadSolicitada);
      throw crearError(
        `No hay suficiente stock para "${producto.nombre}". Disponible: ${disponible}, solicitado: ${contexto.cantidadSolicitada}.`,
        400,
        { cantidad: `Stock insuficiente. Disponible: ${disponible} unidades.` }
      );
    }
    throw crearError(
      `No se puede completar la operación porque el stock de "${producto.nombre}" quedaría en negativo (${nuevaCantidad}).`,
      400,
      { cantidad: `La operación dejaría "${producto.nombre}" con stock negativo (${nuevaCantidad}).` }
    );
  }

  db.prepare(`
    UPDATE productos
    SET cantidad_actual = ?, actualizado_en = datetime('now')
    WHERE id = ?
  `).run(nuevaCantidad, productoId);

  return nuevaCantidad;
}

function obtenerResumenInventario() {
  const fila = db.prepare(`
    SELECT
      COUNT(*) AS total_productos,
      COALESCE(SUM(cantidad_actual), 0) AS total_unidades,
      COALESCE(SUM(CASE WHEN cantidad_actual <= 0 THEN 1 ELSE 0 END), 0) AS agotados,
      COALESCE(SUM(CASE WHEN cantidad_actual > 0 AND stock_minimo > 0 AND cantidad_actual <= stock_minimo THEN 1 ELSE 0 END), 0) AS stock_bajo,
      COALESCE(SUM(CASE WHEN cantidad_actual > 0 AND (stock_minimo = 0 OR cantidad_actual > stock_minimo) THEN 1 ELSE 0 END), 0) AS disponibles,
      COALESCE(SUM(cantidad_actual * valor_unitario), 0) AS valor_total_inventario
    FROM productos
  `).get();

  const alertas = db.prepare(`
    ${SELECT_PRODUCTO}
    WHERE p.cantidad_actual <= 0 OR (p.stock_minimo > 0 AND p.cantidad_actual <= p.stock_minimo)
    ORDER BY p.cantidad_actual ASC, p.nombre COLLATE NOCASE ASC
  `).all();

  return {
    total_productos: fila.total_productos,
    total_unidades: redondear(fila.total_unidades),
    disponibles: fila.disponibles,
    stock_bajo: fila.stock_bajo,
    agotados: fila.agotados,
    valor_total_inventario: redondear(fila.valor_total_inventario),
    alertas,
  };
}

function obtenerOpcionesFiltros() {
  const categorias = db.prepare(`
    SELECT DISTINCT categoria FROM productos WHERE categoria <> '' ORDER BY categoria COLLATE NOCASE
  `).all().map((r) => r.categoria);

  const proveedores = db.prepare(`
    SELECT DISTINCT proveedor FROM productos WHERE proveedor <> '' ORDER BY proveedor COLLATE NOCASE
  `).all().map((r) => r.proveedor);

  return { categorias, proveedores };
}

function listar(consulta = {}) {
  const { where, parametros, orderBy } = construirFiltrosInventario(consulta);
  const productos = db.prepare(`${SELECT_PRODUCTO} ${where} ${orderBy}`).all(parametros);
  const resumen = obtenerResumenInventario();
  const opciones = obtenerOpcionesFiltros();

  const totalFiltrado = redondear(productos.reduce((s, p) => s + p.valor_total, 0));
  const unidadesFiltradas = redondear(productos.reduce((s, p) => s + p.cantidad_actual, 0));

  return {
    productos,
    resumen,
    opciones,
    totales_filtrados: {
      cantidad_productos: productos.length,
      total_unidades: unidadesFiltradas,
      valor_total: totalFiltrado,
    },
  };
}

function listarCatalogoSimple() {
  return db.prepare(`${SELECT_PRODUCTO} ORDER BY p.nombre COLLATE NOCASE ASC`).all();
}

function obtener(id) {
  return db.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(id) ?? null;
}

function buscarPorNombreExacto(nombre) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) return null;
  return db.prepare(`${SELECT_PRODUCTO} WHERE LOWER(TRIM(p.nombre)) = LOWER(?)`).get(limpio) ?? null;
}

const crearTx = db.transaction((valores) => {
  try {
    const resultado = db.prepare(`
      INSERT INTO productos (nombre, categoria, proveedor, cantidad_inicial, cantidad_actual, stock_minimo, valor_unitario)
      VALUES (@nombre, @categoria, @proveedor, @cantidad_inicial, @cantidad_inicial, @stock_minimo, @valor_unitario)
    `).run(valores);
    return obtener(resultado.lastInsertRowid);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      throw crearError(`Ya existe un producto llamado "${valores.nombre}".`, 409, {
        nombre: 'Ya existe un producto con este nombre.',
      });
    }
    throw error;
  }
});

function crear(valores) {
  return crearTx(valores);
}

const actualizarTx = db.transaction((id, valores) => {
  const existente = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!existente) return null;

  try {
    db.prepare(`
      UPDATE productos SET
        nombre = @nombre,
        categoria = @categoria,
        proveedor = @proveedor,
        cantidad_inicial = @cantidad_inicial,
        stock_minimo = @stock_minimo,
        valor_unitario = @valor_unitario,
        actualizado_en = datetime('now')
      WHERE id = @id
    `).run({ ...valores, id });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      throw crearError(`Ya existe otro producto llamado "${valores.nombre}".`, 409, {
        nombre: 'Ya existe un producto con este nombre.',
      });
    }
    throw error;
  }

  // Recalcula existencias en caso de que la cantidad inicial haya cambiado.
  recalcularStockProducto(id);
  return obtener(id);
});

function actualizar(id, valores) {
  return actualizarTx(id, valores);
}

const eliminarTx = db.transaction((id) => {
  return db.prepare('DELETE FROM productos WHERE id = ?').run(id).changes > 0;
});

function eliminar(id) {
  return eliminarTx(id);
}

const registrarAjusteTx = db.transaction((productoId, ajuste) => {
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId);
  if (!producto) return null;

  const resultado = db.prepare(`
    INSERT INTO inventario_movimientos (producto_id, movimiento_id, tipo, origen, cantidad, motivo, fecha)
    VALUES (@producto_id, NULL, @tipo, 'ajuste_manual', @cantidad, @motivo, @fecha)
  `).run({
    producto_id: productoId,
    tipo: ajuste.tipo,
    cantidad: ajuste.cantidad,
    motivo: ajuste.motivo,
    fecha: ajuste.fecha,
  });

  recalcularStockProducto(
    productoId,
    ajuste.tipo === 'salida' ? { cantidadSolicitada: ajuste.cantidad } : {}
  );

  return {
    producto: obtener(productoId),
    movimiento: db.prepare('SELECT * FROM inventario_movimientos WHERE id = ?').get(resultado.lastInsertRowid),
  };
});

function registrarAjuste(productoId, ajuste) {
  return registrarAjusteTx(productoId, ajuste);
}

function obtenerHistorial(productoId) {
  const producto = obtener(productoId);
  if (!producto) return null;

  const movimientos = db.prepare(`
    SELECT
      im.*,
      m.nombre AS movimiento_nombre,
      m.valor_unitario AS movimiento_valor_unitario,
      m.valor_total AS movimiento_valor_total
    FROM inventario_movimientos im
    LEFT JOIN movimientos m ON m.id = im.movimiento_id
    WHERE im.producto_id = ?
    ORDER BY im.fecha DESC, im.id DESC
  `).all(productoId);

  return { producto, movimientos };
}

module.exports = {
  crearError,
  recalcularStockProducto,
  obtenerResumenInventario,
  listar,
  listarCatalogoSimple,
  obtener,
  buscarPorNombreExacto,
  crear,
  actualizar,
  eliminar,
  registrarAjuste,
  obtenerHistorial,
};
