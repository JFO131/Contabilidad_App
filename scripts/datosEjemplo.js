// Carga datos de ejemplo para probar la app. Uso: npm run ejemplo
// Solo funciona si la tabla está vacía, para no mezclar con tus datos reales.
const db = require('../src/db');
const { calcularTotales, crear } = require('../src/servicios/movimientosServicio');

if (calcularTotales().cantidad_registros > 0) {
  console.log('La base de datos ya tiene registros. No se agregó nada.');
  process.exit(0);
}

function fechaHaceDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

const ejemplos = [
  ['Camisetas de algodón', 'Textiles Andina', 'Ropa', 40, 18000, 3, 'compra', 'Lote para la temporada'],
  ['Camiseta básica blanca', '', 'Ropa', 12, 35000, 5, 'venta', 'Venta en tienda'],
  ['Arriendo del local', 'Inmobiliaria Centro', 'Servicios', 1, 1200000, 6, 'gasto', ''],
  ['Bolsas de empaque', 'Empaques del Sur', 'Insumos', 200, 450, 9, 'compra', ''],
  ['Jeans clásicos', '', 'Ropa', 8, 89000, 12, 'venta', 'Pago en efectivo'],
  ['Servicio de internet', 'Claro', 'Servicios', 1, 95000, 14, 'gasto', ''],
  ['Chaquetas de invierno', 'Textiles Andina', 'Ropa', 15, 72000, 20, 'compra', ''],
  ['Chaqueta de invierno', '', 'Ropa', 6, 149000, 24, 'venta', ''],
  ['Publicidad en redes', 'Meta Ads', 'Marketing', 1, 250000, 30, 'gasto', 'Campaña del mes'],
  ['Aporte del socio', '', 'Capital', 1, 2000000, 38, 'otro', 'Inversión inicial'],
  ['Camiseta estampada', '', 'Ropa', 20, 42000, 45, 'venta', ''],
  ['Cajas de cartón', 'Empaques del Sur', 'Insumos', 50, 1800, 52, 'compra', ''],
  ['Arriendo del local', 'Inmobiliaria Centro', 'Servicios', 1, 1200000, 36, 'gasto', ''],
  ['Pantalón de dril', '', 'Ropa', 10, 99000, 58, 'venta', ''],
];

for (const [nombre, proveedor, categoria, cantidad, valorUnitario, dias, tipo, observaciones] of ejemplos) {
  crear({
    nombre, proveedor, categoria, cantidad,
    valor_unitario: valorUnitario,
    valor_total: Math.round(cantidad * valorUnitario * 100) / 100,
    fecha: fechaHaceDias(dias), tipo, observaciones,
  });
}

console.log(`Listo: se agregaron ${ejemplos.length} registros de ejemplo.`);
db.close();
