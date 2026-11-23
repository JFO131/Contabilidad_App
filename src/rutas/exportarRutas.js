// Ruta que genera y descarga archivos Excel.
const express = require('express');
const { listar } = require('../servicios/movimientosServicio');
const inventarioServicio = require('../servicios/inventarioServicio');
const { generarLibroExcel, generarInventarioExcel } = require('../servicios/excelServicio');

const router = express.Router();

// GET /api/exportar/excel            -> todos los registros
// GET /api/exportar/excel?tipo=venta -> solo los que cumplan los filtros (mismos parámetros que la tabla)
router.get('/excel', async (req, res, next) => {
  try {
    const { registros, totales } = listar(req.query);
    const libro = await generarLibroExcel(registros, totales);

    const hoy = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contabilidad-${hoy}.xlsx"`);

    await libro.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// GET /api/exportar/inventario/excel -> inventario completo o filtrado
router.get('/inventario/excel', async (req, res, next) => {
  try {
    const { productos, resumen, totales_filtrados } = inventarioServicio.listar(req.query);
    const libro = await generarInventarioExcel(productos, resumen, totales_filtrados);

    const hoy = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventario-${hoy}.xlsx"`);

    await libro.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
