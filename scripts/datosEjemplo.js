// Carga datos de ejemplo para probar la app (inventario + movimientos conectados). Uso: npm run ejemplo
// Solo funciona si la base de datos está vacía, para no mezclar con tus datos reales.
const db = require('../src/db');
const { calcularTotales, crear } = require('../src/servicios/movimientosServicio');
const inventario = require('../src/servicios/inventarioServicio');

if (calcularTotales().cantidad_registros > 0 || inventario.obtenerResumenInventario().total_productos > 0) {
  console.log('La base de datos ya tiene datos. No se agregó nada.');
  process.exit(0);
}

function fechaHaceDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

// 1. Productos iniciales en inventario
const productosEjemplo = [
  { nombre: 'Camiseta básica blanca', categoria: 'Ropa', proveedor: 'Textiles Andina', cantidad_inicial: 30, stock_minimo: 10, valor_unitario: 35000 },
  { nombre: 'Jeans clásicos', categoria: 'Ropa', proveedor: 'Textiles Andina', cantidad_inicial: 12, stock_minimo: 5, valor_unitario: 89000 },
  { nombre: 'Chaqueta de invierno', categoria: 'Ropa', proveedor: 'Textiles Andina', cantidad_inicial: 6, stock_minimo: 5, valor_unitario: 149000 },
  { nombre: 'Bolsas de empaque', categoria: 'Insumos', proveedor: 'Empaques del Sur', cantidad_inicial: 50, stock_minimo: 40, valor_unitario: 450 },
  { nombre: 'Cajas de cartón', categoria: 'Insumos', proveedor: 'Empaques del Sur', cantidad_inicial: 10, stock_minimo: 15, valor_unitario: 1800 },
  { nombre: 'Pantalón de dril', categoria: 'Ropa', proveedor: 'Confecciones Norte', cantidad_inicial: 10, stock_minimo: 4, valor_unitario: 99000 },
];

const mapaProductos = {};
for (const p of productosEjemplo) {
  const creado = inventario.crear(p);
  mapaProductos[creado.nombre] = creado.id;
}

// 2. Movimientos conectados al inventario (en orden cronológico para mantener stock válido)
const ejemplos = [
  ['Camiseta básica blanca', 'Textiles Andina', 'Ropa', 20, 18000, 35, 'compra', 'Lote para la temporada', mapaProductos['Camiseta básica blanca'], 1],
  ['Camiseta básica blanca', '', 'Ropa', 12, 35000, 28, 'venta', 'Venta en tienda', mapaProductos['Camiseta básica blanca'], 1],
  ['Arriendo del local', 'Inmobiliaria Centro', 'Servicios', 1, 1200000, 36, 'gasto', '', null, 0],
  ['Bolsas de empaque', 'Empaques del Sur', 'Insumos', 200, 450, 25, 'compra', 'Reposición de bolsas', mapaProductos['Bolsas de empaque'], 1],
  ['Jeans clásicos', '', 'Ropa', 8, 89000, 20, 'venta', 'Pago en efectivo (queda stock bajo)', mapaProductos['Jeans clásicos'], 1],
  ['Servicio de internet', 'Claro', 'Servicios', 1, 95000, 18, 'gasto', '', null, 0],
  ['Chaqueta de invierno', 'Textiles Andina', 'Ropa', 10, 72000, 16, 'compra', 'Pedido de invierno', mapaProductos['Chaqueta de invierno'], 1],
  ['Chaqueta de invierno', '', 'Ropa', 6, 149000, 12, 'venta', 'Venta mayorista', mapaProductos['Chaqueta de invierno'], 1],
  ['Publicidad en redes', 'Meta Ads', 'Marketing', 1, 250000, 10, 'gasto', 'Campaña del mes', null, 0],
  ['Aporte del socio', '', 'Capital', 1, 2000000, 40, 'otro', 'Inversión inicial', null, 0],
  ['Pantalón de dril', '', 'Ropa', 10, 99000, 8, 'venta', 'Últimas unidades vendidas (agotado)', mapaProductos['Pantalón de dril'], 1],
  ['Cajas de cartón', 'Empaques del Sur', 'Insumos', 5, 1800, 5, 'compra', 'Reposición parcial', mapaProductos['Cajas de cartón'], 1],
  ['Arriendo del local', 'Inmobiliaria Centro', 'Servicios', 1, 1200000, 4, 'gasto', '', null, 0],
  ['Bolsas de empaque', '', 'Insumos', 20, 450, 2, 'gasto', 'Uso interno para entregas', mapaProductos['Bolsas de empaque'], 1],
];

for (const [nombre, proveedor, categoria, cantidad, valorUnitario, dias, tipo, observaciones, producto_id, afecta_inventario] of ejemplos) {
  crear({
    nombre,
    proveedor,
    categoria,
    cantidad,
    valor_unitario: valorUnitario,
    valor_total: Math.round(cantidad * valorUnitario * 100) / 100,
    fecha: fechaHaceDias(dias),
    tipo,
    observaciones,
    producto_id,
    afecta_inventario,
  });
}

console.log(`Listo: se agregaron ${productosEjemplo.length} productos y ${ejemplos.length} registros de ejemplo.`);
db.close();
