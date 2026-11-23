// Construye el archivo Excel (.xlsx) con la librería ExcelJS.
const ExcelJS = require('exceljs');

const ETIQUETAS_TIPO = { compra: 'Compra', venta: 'Venta', gasto: 'Gasto', otro: 'Otro' };
const ETIQUETAS_ESTADO_STOCK = { disponible: 'Disponible', stock_bajo: 'Stock bajo', agotado: 'Agotado' };
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

async function generarInventarioExcel(productos, resumen, totalesFiltrados) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Libro Contable';
  libro.created = new Date();

  const hoja = libro.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 1 }] });

  hoja.columns = [
    { header: 'Producto', key: 'nombre', width: 30 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'Proveedor', key: 'proveedor', width: 24 },
    { header: 'Cantidad inicial', key: 'cantidad_inicial', width: 16 },
    { header: 'Disponible actual', key: 'cantidad_actual', width: 16 },
    { header: 'Stock mínimo', key: 'stock_minimo', width: 14 },
    { header: 'Valor unitario', key: 'valor_unitario', width: 16 },
    { header: 'Valor total', key: 'valor_total', width: 18 },
    { header: 'Estado del stock', key: 'estado_stock', width: 16 },
  ];

  productos.forEach((p, idx) => {
    const filaNum = idx + 2;
    hoja.addRow({
      nombre: p.nombre,
      categoria: p.categoria,
      proveedor: p.proveedor,
      cantidad_inicial: p.cantidad_inicial,
      cantidad_actual: p.cantidad_actual,
      stock_minimo: p.stock_minimo,
      valor_unitario: p.valor_unitario,
      valor_total: { formula: `E${filaNum}*G${filaNum}`, result: p.valor_total },
      estado_stock: ETIQUETAS_ESTADO_STOCK[p.estado_stock] ?? p.estado_stock,
    });
  });

  const ultimaFila = productos.length + 1;
  ['cantidad_inicial', 'cantidad_actual', 'stock_minimo'].forEach((k) => {
    hoja.getColumn(k).numFmt = '#,##0.##';
  });
  hoja.getColumn('valor_unitario').numFmt = FORMATO_DINERO;
  hoja.getColumn('valor_total').numFmt = FORMATO_DINERO;

  const encabezado = hoja.getRow(1);
  encabezado.height = 22;
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  ['cantidad_inicial', 'cantidad_actual', 'stock_minimo', 'valor_unitario', 'valor_total'].forEach((k) => {
    encabezado.getCell(k).alignment = { vertical: 'middle', horizontal: 'right' };
  });

  const filaTotales = hoja.addRow({ nombre: 'TOTAL' });
  filaTotales.getCell('cantidad_actual').value = {
    formula: productos.length ? `SUM(E2:E${ultimaFila})` : '0',
    result: totalesFiltrados.total_unidades,
  };
  filaTotales.getCell('valor_total').value = {
    formula: productos.length ? `SUM(H2:H${ultimaFila})` : '0',
    result: totalesFiltrados.valor_total,
  };
  filaTotales.eachCell({ includeEmpty: true }, (celda) => {
    celda.font = { bold: true };
    celda.border = { top: { style: 'medium', color: { argb: COLOR_ENCABEZADO } } };
  });

  if (productos.length) {
    hoja.autoFilter = { from: 'A1', to: `I${ultimaFila}` };
  }

  const hojaResumen = libro.addWorksheet('Resumen Inventario');
  hojaResumen.columns = [
    { header: 'Indicador', key: 'indicador', width: 32 },
    { header: 'Valor', key: 'valor', width: 20 },
  ];
  [
    ['Total de productos registrados', resumen.total_productos],
    ['Total de unidades disponibles', resumen.total_unidades],
    ['Productos disponibles', resumen.disponibles],
    ['Productos con stock bajo', resumen.stock_bajo],
    ['Productos agotados', resumen.agotados],
    ['Valor total del inventario', resumen.valor_total_inventario],
  ].forEach(([indicador, valor]) => hojaResumen.addRow({ indicador, valor }));

  hojaResumen.getRow(1).eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
  });
  hojaResumen.getRow(7).getCell('valor').numFmt = FORMATO_DINERO;
  hojaResumen.getRow(7).font = { bold: true };

  return libro;
}

module.exports = { generarLibroExcel, generarInventarioExcel };
