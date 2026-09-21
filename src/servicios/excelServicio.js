// Construye el archivo Excel (.xlsx) con la librería ExcelJS.
const ExcelJS = require('exceljs');

const ETIQUETAS_TIPO = { compra: 'Compra', venta: 'Venta', gasto: 'Gasto', otro: 'Otro' };
const FORMATO_DINERO = '"$"#,##0.00';
const COLOR_ENCABEZADO = 'FF17694F';

async function generarLibroExcel(registros, totales) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Libro Contable';
  libro.created = new Date();

  // ---------- Hoja 1: Movimientos ----------
  const hoja = libro.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1 }] });

  hoja.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 11 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Proveedor', key: 'proveedor', width: 24 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'Cantidad', key: 'cantidad', width: 11 },
    { header: 'Valor unitario', key: 'valor_unitario', width: 16 },
    { header: 'Valor total', key: 'valor_total', width: 16 },
    { header: 'Observaciones', key: 'observaciones', width: 40 },
  ];

  for (const registro of registros) {
    hoja.addRow({
      // Se guarda como fecha real de Excel (no como texto) para poder ordenar y filtrar.
      fecha: new Date(`${registro.fecha}T00:00:00Z`),
      tipo: ETIQUETAS_TIPO[registro.tipo] ?? registro.tipo,
      nombre: registro.nombre,
      proveedor: registro.proveedor,
      categoria: registro.categoria,
      cantidad: registro.cantidad,
      valor_unitario: registro.valor_unitario,
      valor_total: registro.valor_total,
      observaciones: registro.observaciones,
    });
  }

  const ultimaFilaDatos = registros.length + 1; // +1 por la fila de encabezados

  hoja.getColumn('fecha').numFmt = 'dd/mm/yyyy';
  hoja.getColumn('cantidad').numFmt = '#,##0.##';
  hoja.getColumn('valor_unitario').numFmt = FORMATO_DINERO;
  hoja.getColumn('valor_total').numFmt = FORMATO_DINERO;

  // Encabezados con estilo.
  const encabezado = hoja.getRow(1);
  encabezado.height = 22;
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  ['cantidad', 'valor_unitario', 'valor_total'].forEach((clave) => {
    encabezado.getCell(clave).alignment = { vertical: 'middle', horizontal: 'right' };
  });

  // Fila de totales (con fórmula de Excel: si el usuario edita valores, el total se recalcula).
  const filaTotales = hoja.addRow({ nombre: 'TOTAL' });
  filaTotales.getCell('valor_total').value = {
    formula: registros.length ? `SUM(H2:H${ultimaFilaDatos})` : '0',
    result: totales.total_general,
  };
  filaTotales.eachCell({ includeEmpty: true }, (celda) => {
    celda.font = { bold: true };
    celda.border = { top: { style: 'medium', color: { argb: COLOR_ENCABEZADO } } };
  });

  if (registros.length) {
    hoja.autoFilter = { from: 'A1', to: `I${ultimaFilaDatos}` };
  }

  // ---------- Hoja 2: Resumen ----------
  const resumen = libro.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Valor', key: 'valor', width: 20 },
  ];

  const referencia = (tipo) => `SUMIF(Movimientos!B:B,"${tipo}",Movimientos!H:H)`;
  const balance = totales.total_ventas - totales.total_compras - totales.total_gastos;

  const filasResumen = [
    ['Total de compras', { formula: referencia('Compra'), result: totales.total_compras }],
    ['Total de ventas', { formula: referencia('Venta'), result: totales.total_ventas }],
    ['Total de gastos', { formula: referencia('Gasto'), result: totales.total_gastos }],
    ['Total de otros movimientos', { formula: referencia('Otro'), result: totales.total_otros }],
    ['Total general', { formula: registros.length ? `SUM(Movimientos!H2:H${ultimaFilaDatos})` : '0', result: totales.total_general }],
    ['Balance (ventas - compras - gastos)', { formula: 'B3-B2-B4', result: Math.round(balance * 100) / 100 }],
  ];
  filasResumen.forEach(([concepto, valor]) => resumen.addRow({ concepto, valor }));

  resumen.getRow(1).eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
  });
  resumen.getColumn('valor').numFmt = FORMATO_DINERO;
  resumen.getRow(6).font = { bold: true };
  resumen.getRow(7).font = { bold: true };

  return libro;
}

module.exports = { generarLibroExcel };
