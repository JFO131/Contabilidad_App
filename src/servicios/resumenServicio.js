// Datos para el dashboard: totales, ingresos vs egresos, movimientos recientes y resumen por mes.
const db = require('../db');
const { calcularTotales } = require('./movimientosServicio');

const redondear = (numero) => Math.round((numero ?? 0) * 100) / 100;

function obtenerResumen() {
  const totales = calcularTotales();

  // Ingresos = ventas. Egresos = compras + gastos. Los movimientos "otro" no cuentan en ninguno.
  const ingresos = totales.total_ventas;
  const egresos = redondear(totales.total_compras + totales.total_gastos);

  const recientes = db.prepare('SELECT * FROM movimientos ORDER BY fecha DESC, id DESC LIMIT 6').all();

  const porMes = db.prepare(`
    SELECT
      substr(fecha, 1, 7) AS mes,
      COALESCE(SUM(CASE WHEN tipo = 'venta' THEN valor_total END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN tipo IN ('compra', 'gasto') THEN valor_total END), 0) AS egresos
    FROM movimientos
    GROUP BY mes
    ORDER BY mes DESC
    LIMIT 6
  `).all().reverse();

  return {
    totales,
    ingresos,
    egresos,
    balance: redondear(ingresos - egresos),
    recientes,
    porMes: porMes.map((m) => ({ mes: m.mes, ingresos: redondear(m.ingresos), egresos: redondear(m.egresos) })),
  };
}

module.exports = { obtenerResumen };
