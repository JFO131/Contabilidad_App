// Descarga el archivo Excel que genera el servidor.
import { api } from './api.js';
import { hoyISO } from './formato.js';

export async function descargarExcel(filtros) {
  const respuesta = await fetch(api.urlExcel(filtros));
  if (!respuesta.ok) throw new Error('No se pudo generar el archivo de Excel.');

  const archivo = await respuesta.blob();

  // Truco estándar: se crea un enlace invisible y se "hace clic" en él para iniciar la descarga.
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `contabilidad-${hoyISO()}.xlsx`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(enlace.href);
}
