// Punto de entrada del navegador: cambia entre pantallas y conecta los módulos entre sí.
import { iniciarTabla, cargarRegistros, cargarCategorias } from './tabla.js';
import { iniciarFormulario, abrirFormulario } from './formulario.js';
import { iniciarExportacion } from './exportar.js';
import { cargarDashboard } from './dashboard.js';

const botonesMenu = document.querySelectorAll('.navegacion__boton');
const vistas = {
  dashboard: document.getElementById('vista-dashboard'),
  registros: document.getElementById('vista-registros'),
};

// Vuelve a pedir al servidor los datos de la tabla y sus categorías.
async function refrescarRegistros() {
  await cargarCategorias(); // primero las categorías, porque pueden cambiar el filtro
  await cargarRegistros();
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
  else refrescarRegistros();
}

// ---------- Arranque ----------
iniciarTabla({ alEditar: abrirFormulario, alCambiar: refrescarRegistros });
iniciarFormulario({ alGuardar: refrescarRegistros });
iniciarExportacion();

document.getElementById('boton-agregar').addEventListener('click', () => abrirFormulario());
for (const boton of botonesMenu) {
  boton.addEventListener('click', () => mostrarVista(boton.dataset.vista));
}

const vistaInicial = location.hash.slice(1);
mostrarVista(vistas[vistaInicial] ? vistaInicial : 'dashboard');
