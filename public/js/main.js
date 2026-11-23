// Punto de entrada del navegador: cambia entre pantallas y conecta los módulos entre sí.
import { iniciarTabla, cargarRegistros, cargarCategorias } from './tabla.js';
import { iniciarFormulario, abrirFormulario } from './formulario.js';
import { iniciarExportacion } from './exportar.js';
import { iniciarDashboard, cargarDashboard } from './dashboard.js';
import {
  iniciarInventario,
  cargarInventario,
  cargarCatalogoProductos,
  aplicarFiltroEstadoInventario,
  actualizarBadgeInventario,
} from './inventario.js';
import { api } from './api.js';

const botonesMenu = document.querySelectorAll('.navegacion__boton');
const vistas = {
  dashboard: document.getElementById('vista-dashboard'),
  registros: document.getElementById('vista-registros'),
  inventario: document.getElementById('vista-inventario'),
};

// Vuelve a pedir al servidor los datos de la tabla, categorías y alertas de inventario.
async function refrescarRegistros() {
  await cargarCategorias(); // primero las categorías, porque pueden cambiar el filtro
  await cargarRegistros();
  await cargarCatalogoProductos();
  try {
    const inv = await api.listarInventario({});
    actualizarBadgeInventario(inv.resumen);
  } catch {
    // silencioso
  }
}

function mostrarVista(nombre) {
  for (const [clave, seccion] of Object.entries(vistas)) seccion.hidden = clave !== nombre;
  for (const boton of botonesMenu) {
    const activo = boton.dataset.vista === nombre;
    boton.classList.toggle('is-activo', activo);
    boton.setAttribute('aria-current', activo ? 'page' : 'false');
  }

  history.replaceState(null, '', `#${nombre}`);
  if (nombre === 'dashboard') cargarDashboard();
  else if (nombre === 'inventario') {
    cargarCategorias();
    cargarInventario();
  } else {
    refrescarRegistros();
  }
}

// ---------- Arranque ----------
iniciarDashboard({
  irAInventario: (filtroEstado) => {
    if (filtroEstado) aplicarFiltroEstadoInventario(filtroEstado);
    mostrarVista('inventario');
  },
});
iniciarTabla({ alEditar: abrirFormulario, alCambiar: refrescarRegistros });
iniciarFormulario({ alGuardar: refrescarRegistros });
iniciarExportacion();
iniciarInventario({ alCambiar: cargarCategorias });

document.getElementById('boton-agregar').addEventListener('click', () => abrirFormulario());
for (const boton of botonesMenu) {
  boton.addEventListener('click', () => mostrarVista(boton.dataset.vista));
}

const vistaInicial = location.hash.slice(1);
mostrarVista(vistas[vistaInicial] ? vistaInicial : 'dashboard');
