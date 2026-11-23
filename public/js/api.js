// Todas las llamadas al servidor están aquí. El resto de la app nunca usa "fetch" directamente.

// Convierte { tipo: 'venta', buscar: '' } en "tipo=venta" (ignora los valores vacíos).
export function construirParametros(filtros = {}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) parametros.set(clave, valor);
  }
  return parametros.toString();
}

async function pedir(url, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. ¿Está encendido?');
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    const error = new Error(cuerpo.mensaje || 'Ocurrió un error inesperado.');
    error.errores = cuerpo.errores; // errores por campo, si el servidor los envió
    throw error;
  }

  return respuesta.status === 204 ? null : respuesta.json();
}

export const api = {
  // Movimientos
  listar: (filtros) => pedir(`/api/movimientos?${construirParametros(filtros)}`),
  categorias: () => pedir('/api/movimientos/categorias'),
  crear: (datos) => pedir('/api/movimientos', { method: 'POST', body: JSON.stringify(datos) }),
  actualizar: (id, datos) => pedir(`/api/movimientos/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminar: (id) => pedir(`/api/movimientos/${id}`, { method: 'DELETE' }),
  resumen: () => pedir('/api/resumen'),
  urlExcel: (filtros) => `/api/exportar/excel?${construirParametros(filtros)}`,

  // Inventario
  listarInventario: (filtros) => pedir(`/api/inventario?${construirParametros(filtros)}`),
  catalogoProductos: () => pedir('/api/inventario/productos'),
  crearProducto: (datos) => pedir('/api/inventario', { method: 'POST', body: JSON.stringify(datos) }),
  actualizarProducto: (id, datos) => pedir(`/api/inventario/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminarProducto: (id) => pedir(`/api/inventario/${id}`, { method: 'DELETE' }),
  registrarAjuste: (id, datos) => pedir(`/api/inventario/${id}/ajuste`, { method: 'POST', body: JSON.stringify(datos) }),
  historialProducto: (id) => pedir(`/api/inventario/${id}/historial`),
  urlExcelInventario: (filtros) => `/api/exportar/inventario/excel?${construirParametros(filtros)}`,
};
