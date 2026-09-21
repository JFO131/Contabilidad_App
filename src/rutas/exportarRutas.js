// Ruta que genera y descarga el archivo Excel.
const express = require('express');
const { listar } = require('../servicios/movimientosServicio');
const { generarLibroExcel } = require('../servicios/excelServicio');

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

module.exports = router;
