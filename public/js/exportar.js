// Conecta los botones "Exportar a Excel" y "Exportar a PDF" con la opción de alcance elegida.
import { estado } from './estado.js';
import { descargarExcel } from './exportarExcel.js';
import { generarPdf } from './exportarPdf.js';
import { mostrarAviso } from './avisos.js';

const selectorAlcance = document.getElementById('alcance-exportacion');
const botonExcel = document.getElementById('boton-excel');
const botonPdf = document.getElementById('boton-pdf');

// "todos" -> sin filtros (solo se conserva el orden). "filtrados" -> los filtros que se ven en pantalla.
function filtrosParaExportar() {
  if (selectorAlcance.value === 'todos') {
    return { orden: estado.filtros.orden, dir: estado.filtros.dir };
  }
  return { ...estado.filtros };
}

// Deshabilita el botón mientras trabaja y muestra el error si algo falla.
async function ejecutar(boton, tarea, mensajeExito) {
  boton.disabled = true;
  try {
    await tarea();
    mostrarAviso(mensajeExito);
  } catch (error) {
    mostrarAviso(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

export function iniciarExportacion() {
  botonExcel.addEventListener('click', () =>
    ejecutar(botonExcel, () => descargarExcel(filtrosParaExportar()), 'Archivo de Excel generado.'));

  botonPdf.addEventListener('click', () =>
    ejecutar(botonPdf, () => generarPdf(filtrosParaExportar()), 'Reporte en PDF generado.'));
}
