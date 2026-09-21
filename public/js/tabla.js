// La tabla de registros: dibujarla, buscar, filtrar, ordenar, editar y eliminar.
import { api } from './api.js';
import { estado, filtrosVacios } from './estado.js';
import { moneda, numero, fechaCorta, escaparHtml, ETIQUETA_TIPO } from './formato.js';
import { mostrarAviso, confirmar } from './avisos.js';

const cuerpo = document.getElementById('tabla-cuerpo');
const pie = document.getElementById('tabla-pie');
const barraTotales = document.getElementById('barra-totales');
const contador = document.getElementById('contador-registros');
const encabezados = document.querySelectorAll('th[data-orden]');

const campos = {
  buscar: document.getElementById('filtro-buscar'),
  tipo: document.getElementById('filtro-tipo'),
  categoria: document.getElementById('filtro-categoria'),
  desde: document.getElementById('filtro-desde'),
  hasta: document.getElementById('filtro-hasta'),
};

let temporizadorBusqueda = null;
let alEditar = () => {};
let alCambiar = () => {};

// ---------- Inicio: conecta los eventos ----------
export function iniciarTabla(opciones) {
  alEditar = opciones.alEditar;
  alCambiar = opciones.alCambiar;

  // Buscar mientras se escribe (espera 300 ms para no consultar en cada letra).
  campos.buscar.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(aplicarFiltros, 300);
  });
  for (const nombre of ['tipo', 'categoria', 'desde', 'hasta']) {
    campos[nombre].addEventListener('change', aplicarFiltros);
  }

  document.getElementById('boton-limpiar').addEventListener('click', limpiarFiltros);

  // Ordenar al hacer clic en un encabezado.
  for (const encabezado of encabezados) {
    encabezado.querySelector('button').addEventListener('click', () => cambiarOrden(encabezado.dataset.orden));
  }

  // Un solo "oyente" para todos los botones de editar y eliminar de la tabla.
  cuerpo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    if (boton.dataset.accion === 'editar') editarRegistro(id);
    if (boton.dataset.accion === 'eliminar') eliminarRegistro(id);
  });
}

// ---------- Filtros y orden ----------
function aplicarFiltros() {
  for (const nombre of Object.keys(campos)) {
    estado.filtros[nombre] = campos[nombre].value;
  }
  cargarRegistros();
}

function limpiarFiltros() {
  const { orden, dir } = estado.filtros; // se conserva el orden actual
  estado.filtros = { ...filtrosVacios(), orden, dir };
  sincronizarCampos();
  cargarRegistros();
}

function cambiarOrden(columna) {
  if (estado.filtros.orden === columna) {
    estado.filtros.dir = estado.filtros.dir === 'asc' ? 'desc' : 'asc';
  } else {
    estado.filtros.orden = columna;
    estado.filtros.dir = 'asc';
  }
  cargarRegistros();
}

function sincronizarCampos() {
  for (const nombre of Object.keys(campos)) {
    campos[nombre].value = estado.filtros[nombre];
  }
}

// ---------- Cargar datos del servidor ----------
export async function cargarRegistros() {
  try {
    const datos = await api.listar(estado.filtros);
    estado.registros = datos.registros;
    estado.totales = datos.totales;
    dibujarTabla();
    dibujarTotales();
    marcarOrden();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// Rellena la lista de categorías del filtro con las que existen en la base de datos.
export async function cargarCategorias() {
  try {
    estado.categorias = await api.categorias();
  } catch (error) {
    mostrarAviso(error.message, 'error');
    return;
  }

  // Si la categoría filtrada ya no existe (por ejemplo, se eliminó su último registro), se quita el filtro.
  if (estado.filtros.categoria && !estado.categorias.includes(estado.filtros.categoria)) {
    estado.filtros.categoria = '';
  }

  campos.categoria.innerHTML =
    '<option value="">Todas</option>' +
    estado.categorias
      .map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`)
      .join('');
  campos.categoria.value = estado.filtros.categoria;
}

// ---------- Dibujar ----------
function dibujarTabla() {
  if (estado.registros.length === 0) {
    const hayFiltros = ['buscar', 'tipo', 'categoria', 'desde', 'hasta'].some((clave) => estado.filtros[clave]);
    cuerpo.innerHTML = `
      <tr><td class="tabla__vacio" colspan="11">
        <strong>${hayFiltros ? 'Ningún registro coincide con los filtros.' : 'Todavía no hay registros.'}</strong>
        ${hayFiltros ? 'Prueba con otra búsqueda o pulsa "Limpiar filtros".' : 'Pulsa "Agregar registro" para crear el primero.'}
      </td></tr>`;
    return;
  }

  cuerpo.innerHTML = estado.registros
    .map((registro, posicion) => `
      <tr>
        <td class="celda-indice" data-label="">${posicion + 1}</td>
        <td class="acciones" data-label="">
          <button type="button" class="boton-icono" data-accion="editar" data-id="${registro.id}" title="Editar" aria-label="Editar ${escaparHtml(registro.nombre)}">✏️</button>
          <button type="button" class="boton-icono boton-icono--peligro" data-accion="eliminar" data-id="${registro.id}" title="Eliminar" aria-label="Eliminar ${escaparHtml(registro.nombre)}">🗑️</button>
        </td>
        <td data-label="Fecha">${fechaCorta(registro.fecha)}</td>
        <td data-label="Tipo"><span class="etiqueta etiqueta--${registro.tipo}">${ETIQUETA_TIPO[registro.tipo]}</span></td>
        <td class="celda-nombre" data-label="Nombre">${escaparHtml(registro.nombre)}</td>
        <td class="celda-texto" data-label="Proveedor">${escaparHtml(registro.proveedor) || '—'}</td>
        <td class="celda-texto" data-label="Categoría">${escaparHtml(registro.categoria) || '—'}</td>
        <td class="num" data-label="Cantidad">${numero(registro.cantidad)}</td>
        <td class="num" data-label="Valor unitario">${moneda(registro.valor_unitario)}</td>
        <td class="num" data-label="Valor total"><strong>${moneda(registro.valor_total)}</strong></td>
        <td class="celda-observaciones" data-label="Observaciones" title="${escaparHtml(registro.observaciones)}">${escaparHtml(registro.observaciones) || '—'}</td>
      </tr>`)
    .join('');
}

function dibujarTotales() {
  const t = estado.totales;
  contador.textContent = `${t.cantidad_registros} ${t.cantidad_registros === 1 ? 'registro' : 'registros'}`;

  barraTotales.innerHTML = `
    <div class="total total--compra"><span>Compras</span><strong>${moneda(t.total_compras)}</strong></div>
    <div class="total total--venta"><span>Ventas</span><strong>${moneda(t.total_ventas)}</strong></div>
    <div class="total total--gasto"><span>Gastos</span><strong>${moneda(t.total_gastos)}</strong></div>
    <div class="total total--otro"><span>Otros</span><strong>${moneda(t.total_otros)}</strong></div>
    <div class="total total--general"><span>Total general</span><strong>${moneda(t.total_general)}</strong></div>`;

  pie.innerHTML = `
    <tr>
      <td colspan="9">Total general (${t.cantidad_registros} ${t.cantidad_registros === 1 ? 'registro' : 'registros'})</td>
      <td class="num">${moneda(t.total_general)}</td>
      <td></td>
    </tr>`;
}

// Muestra la flecha ▲ / ▼ en la columna por la que se está ordenando.
function marcarOrden() {
  for (const encabezado of encabezados) {
    const activo = encabezado.dataset.orden === estado.filtros.orden;
    if (activo) {
      encabezado.setAttribute('aria-sort', estado.filtros.dir === 'asc' ? 'ascending' : 'descending');
    } else {
      encabezado.removeAttribute('aria-sort');
    }
  }
}

// ---------- Editar y eliminar ----------
function editarRegistro(id) {
  const registro = estado.registros.find((r) => r.id === id);
  if (registro) alEditar(registro);
}

async function eliminarRegistro(id) {
  const registro = estado.registros.find((r) => r.id === id);
  if (!registro) return;

  const confirmado = await confirmar({
    titulo: 'Eliminar registro',
    mensaje: `¿Seguro que quieres eliminar "${registro.nombre}" del ${fechaCorta(registro.fecha)}? Esta acción no se puede deshacer.`,
    textoAceptar: '🗑️ Eliminar',
  });
  if (!confirmado) return;

  try {
    await api.eliminar(id);
    mostrarAviso('Registro eliminado.');
    await alCambiar();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}
