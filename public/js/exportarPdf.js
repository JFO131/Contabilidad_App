// Genera el reporte en PDF directamente en el navegador con jsPDF + jsPDF-AutoTable.
import { api } from './api.js';
import { moneda, numero, fechaCorta, hoyISO, ETIQUETA_TIPO } from './formato.js';

const COLOR_PRINCIPAL = [23, 105, 79];
const COLOR_TIPO = { compra: [58, 110, 165], venta: [20, 114, 74], gasto: [168, 53, 42], otro: [90, 101, 108] };

// El navegador escribe un espacio "duro" entre el $ y el número; en el PDF lo cambiamos por uno normal.
const dinero = (valor) => moneda(valor).replace(/\u00a0/g, ' ');

// Texto que explica qué filtros tiene el reporte, por ejemplo: "Tipo: Venta - Desde 01/09/2026".
export function describirFiltros(filtros) {
  const partes = [];
  if (filtros.buscar) partes.push(`Búsqueda: "${filtros.buscar}"`);
  if (filtros.tipo) partes.push(`Tipo: ${ETIQUETA_TIPO[filtros.tipo]}`);
  if (filtros.categoria) partes.push(`Categoría: ${filtros.categoria}`);
  if (filtros.desde) partes.push(`Desde: ${fechaCorta(filtros.desde)}`);
  if (filtros.hasta) partes.push(`Hasta: ${fechaCorta(filtros.hasta)}`);
  return partes.length ? `Filtros aplicados: ${partes.join(' - ')}` : 'Incluye todos los registros';
}

export async function generarPdf(filtros) {
  const { registros, totales } = await api.listar(filtros);
  if (registros.length === 0) throw new Error('No hay registros para exportar con estos filtros.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margen = 40;
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();

  // ---------- Encabezado ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLOR_PRINCIPAL);
  doc.text('Libro Contable', margen, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(88, 106, 98);
  doc.text(`Reporte de movimientos - Generado el ${fechaCorta(hoyISO())}`, margen, 68);
  doc.text(doc.splitTextToSize(describirFiltros(filtros), anchoPagina - margen * 2), margen, 82);

  // ---------- Resumen de totales ----------
  doc.autoTable({
    startY: 100,
    margin: { left: margen, right: margen },
    tableWidth: 560,
    theme: 'grid',
    head: [['Compras', 'Ventas', 'Gastos', 'Otros', 'Total general']],
    body: [[
      dinero(totales.total_compras),
      dinero(totales.total_ventas),
      dinero(totales.total_gastos),
      dinero(totales.total_otros),
      dinero(totales.total_general),
    ]],
    styles: { fontSize: 10, halign: 'center', cellPadding: 6 },
    headStyles: { fillColor: COLOR_PRINCIPAL, textColor: 255 },
    bodyStyles: { fontStyle: 'bold' },
  });

  // ---------- Tabla de registros (si son muchos, sigue en varias páginas automáticamente) ----------
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18,
    margin: { left: margen, right: margen, bottom: 40 },
    theme: 'grid',
    head: [['Fecha', 'Tipo', 'Nombre', 'Proveedor', 'Categoría', 'Cant.', 'V. unitario', 'V. total', 'Observaciones']],
    body: registros.map((r) => [
      fechaCorta(r.fecha),
      ETIQUETA_TIPO[r.tipo],
      r.nombre,
      r.proveedor || '-',
      r.categoria || '-',
      numero(r.cantidad),
      dinero(r.valor_unitario),
      dinero(r.valor_total),
      r.observaciones || '',
    ]),
    foot: [[
      { content: `Totales generales (${totales.cantidad_registros} registros)`, colSpan: 7, styles: { halign: 'right' } },
      { content: dinero(totales.total_general), styles: { halign: 'right' } },
      '',
    ]],
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: COLOR_PRINCIPAL, textColor: 255 },
    footStyles: { fillColor: [227, 235, 231], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 250, 248] },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 46 },
      2: { cellWidth: 140 },
      3: { cellWidth: 100 },
      4: { cellWidth: 78 },
      5: { cellWidth: 40, halign: 'right' },
      6: { cellWidth: 68, halign: 'right' },
      7: { cellWidth: 74, halign: 'right' },
      8: { cellWidth: 'auto' },
    },
    // Pinta el texto del tipo de movimiento con su color.
    didParseCell: (datos) => {
      if (datos.section === 'body' && datos.column.index === 1) {
        datos.cell.styles.textColor = COLOR_TIPO[registros[datos.row.index].tipo];
        datos.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ---------- Pie de página con el número de página ----------
  const totalPaginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Libro Contable', margen, altoPagina - 20);
    doc.text(`Página ${pagina} de ${totalPaginas}`, anchoPagina - margen, altoPagina - 20, { align: 'right' });
  }

  doc.save(`reporte-contabilidad-${hoyISO()}.pdf`);
}
