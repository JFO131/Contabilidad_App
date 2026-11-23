// Módulo de Inventario: resumen, alertas visuales, tabla tipo Excel, CRUD de productos,
// entradas/salidas manuales e historial de movimientos por producto.
import { api } from './api.js';
import { estado, filtrosInventarioVacios } from './estado.js';
import {
  moneda,
  numero,
  fechaCorta,
  hoyISO,
  escaparHtml,
  ETIQUETA_ESTADO_STOCK,
  ETIQUETA_ORIGEN_INV,
} from './formato.js';
import { mostrarAviso, confirmar } from './avisos.js';

const $ = (id) => document.getElementById(id);

// Elementos de la vista de Inventario
const cuerpo = $('inv-tabla-cuerpo');
const pie = $('inv-tabla-pie');
const contador = $('contador-inventario');
const contenedorAlertas = $('inv-alertas');
const navBadge = $('nav-badge-inventario');
const encabezados = document.querySelectorAll('th[data-orden-inv]');

const filtrosDom = {
  buscar: $('inv-filtro-buscar'),
  categoria: $('inv-filtro-categoria'),
  proveedor: $('inv-filtro-proveedor'),
  estado: $('inv-filtro-estado'),
};

// Diálogo: Crear / Editar producto
const dialogoProducto = $('dialogo-producto');
const formProducto = $('formulario-producto');
const tituloProducto = $('titulo-producto');
const botonGuardarProducto = $('boton-guardar-producto');
const previewProducto = $('prod-valor-preview');
const listaCategoriasInv = $('lista-categorias-inv');
const CAMPOS_PROD = ['nombre', 'categoria', 'proveedor', 'cantidad_inicial', 'stock_minimo', 'valor_unitario'];

// Diálogo: Entrada / Salida manual
const dialogoAjuste = $('dialogo-ajuste');
const formAjuste = $('formulario-ajuste');
const infoAjuste = $('ajuste-producto-info');
const previewAjuste = $('ajuste-stock-preview');
const botonGuardarAjuste = $('boton-guardar-ajuste');
const CAMPOS_AJUSTE = ['tipo', 'cantidad', 'fecha', 'motivo'];

// Diálogo: Historial de movimientos
const dialogoHistorial = $('dialogo-historial');
const tituloHistorial = $('titulo-historial');
const resumenHistorial = $('historial-resumen');
const contenidoHistorial = $('historial-contenido');

let temporizadorBusqueda = null;
let productoEditandoId = null;
let productoEnAjuste = null;
let alCambiarInventario = () => {};

// Actualiza el globo rojo del menú lateral con el total de productos agotados + stock bajo.
export function actualizarBadgeInventario(resumen) {
  if (!resumen) return;
  const totalAlertas = (resumen.agotados || 0) + (resumen.stock_bajo || 0);
  navBadge.hidden = totalAlertas === 0;
  navBadge.textContent = String(totalAlertas);
}

export async function cargarCatalogoProductos() {
  try {
    estado.catalogoProductos = await api.catalogoProductos();
  } catch {
    // Se ignora aquí; la pantalla activa mostrará el aviso si falla.
  }
  return estado.catalogoProductos;
}

export function iniciarInventario(opciones = {}) {
  alCambiarInventario = opciones.alCambiar || (() => {});

  // Búsqueda y filtros
  filtrosDom.buscar.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(aplicarFiltros, 300);
  });
  for (const nombre of ['categoria', 'proveedor', 'estado']) {
    filtrosDom[nombre].addEventListener('change', aplicarFiltros);
  }
  $('inv-boton-limpiar').addEventListener('click', limpiarFiltros);

  // Ordenar columnas
  for (const encabezado of encabezados) {
    encabezado.querySelector('button').addEventListener('click', () => cambiarOrden(encabezado.dataset.ordenInv));
  }

  // Botones del encabezado
  $('boton-agregar-producto').addEventListener('click', () => abrirDialogoProducto());
  $('boton-excel-inventario').addEventListener('click', exportarInventarioExcel);

  // Acciones en la tabla (delegación)
  cuerpo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion-inv]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    const accion = boton.dataset.accionInv;
    if (accion === 'ajuste') abrirDialogoAjuste(id);
    if (accion === 'historial') abrirHistorial(id);
    if (accion === 'editar') {
      const prod = estado.productos.find((p) => p.id === id);
      if (prod) abrirDialogoProducto(prod);
    }
    if (accion === 'eliminar') eliminarProducto(id);
  });

  // Acciones rápidas en el banner de alertas
  contenedorAlertas.addEventListener('click', (evento) => {
    const filtroBtn = evento.target.closest('button[data-filtrar-estado]');
    if (filtroBtn) {
      filtrosDom.estado.value = filtroBtn.dataset.filtrarEstado;
      aplicarFiltros();
      return;
    }
    const reabastecerBtn = evento.target.closest('button[data-reabastecer]');
    if (reabastecerBtn) {
      abrirDialogoAjuste(Number(reabastecerBtn.dataset.reabastecer), 'entrada');
    }
  });

  // Eventos diálogo producto
  formProducto.addEventListener('submit', guardarProducto);
  formProducto.addEventListener('input', actualizarPreviewProducto);
  $('boton-cancelar-producto').addEventListener('click', () => dialogoProducto.close());

  // Eventos diálogo ajuste manual
  formAjuste.addEventListener('submit', guardarAjuste);
  formAjuste.addEventListener('input', actualizarPreviewAjuste);
  $('ajuste-tipo').addEventListener('change', actualizarPreviewAjuste);
  $('boton-cancelar-ajuste').addEventListener('click', () => dialogoAjuste.close());

  // Eventos diálogo historial
  $('boton-cerrar-historial').addEventListener('click', () => dialogoHistorial.close());
}

function aplicarFiltros() {
  for (const nombre of Object.keys(filtrosDom)) {
    estado.filtrosInventario[nombre] = filtrosDom[nombre].value;
  }
  cargarInventario();
}

function limpiarFiltros() {
  const { orden, dir } = estado.filtrosInventario;
  estado.filtrosInventario = { ...filtrosInventarioVacios(), orden, dir };
  for (const nombre of Object.keys(filtrosDom)) {
    filtrosDom[nombre].value = estado.filtrosInventario[nombre];
  }
  cargarInventario();
}

export function aplicarFiltroEstadoInventario(estadoStock) {
  estado.filtrosInventario = { ...filtrosInventarioVacios(), estado: estadoStock };
  for (const nombre of Object.keys(filtrosDom)) {
    filtrosDom[nombre].value = estado.filtrosInventario[nombre];
  }
}

function cambiarOrden(columna) {
  if (estado.filtrosInventario.orden === columna) {
    estado.filtrosInventario.dir = estado.filtrosInventario.dir === 'asc' ? 'desc' : 'asc';
  } else {
    estado.filtrosInventario.orden = columna;
    estado.filtrosInventario.dir = 'asc';
  }
  cargarInventario();
}

export async function cargarInventario() {
  try {
    const datos = await api.listarInventario(estado.filtrosInventario);
    estado.productos = datos.productos;
    estado.resumenInventario = datos.resumen;
    estado.totalesInventario = datos.totales_filtrados;
    estado.opcionesInventario = datos.opciones;

    sincronizarOpcionesFiltros();
    dibujarResumen();
    dibujarAlertas();
    dibujarTabla();
    marcarOrden();
    actualizarBadgeInventario(datos.resumen);
    await cargarCatalogoProductos();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

function sincronizarOpcionesFiltros() {
  const { categorias, proveedores } = estado.opcionesInventario;

  if (estado.filtrosInventario.categoria && !categorias.includes(estado.filtrosInventario.categoria)) {
    estado.filtrosInventario.categoria = '';
  }
  if (estado.filtrosInventario.proveedor && !proveedores.includes(estado.filtrosInventario.proveedor)) {
    estado.filtrosInventario.proveedor = '';
  }

  filtrosDom.categoria.innerHTML =
    '<option value="">Todas</option>' +
    categorias.map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`).join('');
  filtrosDom.categoria.value = estado.filtrosInventario.categoria;

  filtrosDom.proveedor.innerHTML =
    '<option value="">Todos</option>' +
    proveedores.map((p) => `<option value="${escaparHtml(p)}">${escaparHtml(p)}</option>`).join('');
  filtrosDom.proveedor.value = estado.filtrosInventario.proveedor;
}

function dibujarResumen() {
  const r = estado.resumenInventario;
  const tf = estado.totalesInventario;

  $('inv-total-productos').textContent = numero(r.total_productos);
  $('inv-total-unidades').textContent = numero(r.total_unidades);
  $('inv-stock-bajo').textContent = numero(r.stock_bajo);
  $('inv-agotados').textContent = numero(r.agotados);
  $('inv-valor-total').textContent = moneda(r.valor_total_inventario);

  contador.textContent = `${tf.cantidad_productos} de ${r.total_productos} ${r.total_productos === 1 ? 'producto' : 'productos'} mostrados`;
}

function dibujarAlertas() {
  const r = estado.resumenInventario;
  if (!r || !r.alertas || r.alertas.length === 0) {
    contenedorAlertas.hidden = true;
    contenedorAlertas.innerHTML = '';
    return;
  }

  const hayAgotados = r.agotados > 0;
  contenedorAlertas.className = `alerta-stock ${hayAgotados ? 'alerta-stock--peligro' : ''}`;
  contenedorAlertas.hidden = false;

  const partes = [];
  if (r.agotados > 0) partes.push(`${r.agotados} ${r.agotados === 1 ? 'producto agotado' : 'productos agotados'}`);
  if (r.stock_bajo > 0) partes.push(`${r.stock_bajo} con stock bajo`);

  const chips = r.alertas
    .slice(0, 8)
    .map(
      (p) => `
      <span class="alerta-chip alerta-chip--${p.estado_stock}">
        ${p.estado_stock === 'agotado' ? '🔴' : '🟡'} ${escaparHtml(p.nombre)} (${numero(p.cantidad_actual)} uds)
        <button type="button" class="boton-icono" data-reabastecer="${p.id}" title="Registrar entrada manual">＋</button>
      </span>`
    )
    .join('');

  contenedorAlertas.innerHTML = `
    <div class="alerta-stock__cabecera">
      <span class="alerta-stock__titulo">⚠️ Alerta de inventario: ${partes.join(' y ')} necesitan atención.</span>
      <div class="alerta-stock__acciones">
        ${r.agotados > 0 ? '<button type="button" class="boton boton--suave boton--chico" data-filtrar-estado="agotado">Ver agotados</button>' : ''}
        ${r.stock_bajo > 0 ? '<button type="button" class="boton boton--suave boton--chico" data-filtrar-estado="stock_bajo">Ver stock bajo</button>' : ''}
      </div>
    </div>
    <div class="alerta-stock__chips">${chips}</div>
  `;
}

function dibujarTabla() {
  const productos = estado.productos;
  const tf = estado.totalesInventario;

  if (productos.length === 0) {
    const hayFiltros = ['buscar', 'categoria', 'proveedor', 'estado'].some((k) => estado.filtrosInventario[k]);
    cuerpo.innerHTML = `
      <tr><td class="tabla__vacio" colspan="11">
        <strong>${hayFiltros ? 'Ningún producto coincide con los filtros.' : 'Todavía no hay productos en el inventario.'}</strong>
        ${hayFiltros ? 'Prueba con otra búsqueda o pulsa "Limpiar filtros".' : 'Pulsa "Nuevo producto" para registrar el primero.'}
      </td></tr>`;
    pie.innerHTML = '';
    return;
  }

  cuerpo.innerHTML = productos
    .map((p, indice) => `
      <tr class="fila--${p.estado_stock}">
        <td class="celda-indice" data-label="">${indice + 1}</td>
        <td class="acciones" data-label="">
          <button type="button" class="boton-icono" data-accion-inv="ajuste" data-id="${p.id}" title="Entrada / Salida manual" aria-label="Ajustar stock de ${escaparHtml(p.nombre)}">⇄</button>
          <button type="button" class="boton-icono" data-accion-inv="historial" data-id="${p.id}" title="Ver historial" aria-label="Historial de ${escaparHtml(p.nombre)}">📜</button>
          <button type="button" class="boton-icono" data-accion-inv="editar" data-id="${p.id}" title="Editar producto" aria-label="Editar ${escaparHtml(p.nombre)}">✏️</button>
          <button type="button" class="boton-icono boton-icono--peligro" data-accion-inv="eliminar" data-id="${p.id}" title="Eliminar producto" aria-label="Eliminar ${escaparHtml(p.nombre)}">🗑️</button>
        </td>
        <td class="celda-nombre" data-label="Producto">${escaparHtml(p.nombre)}</td>
        <td class="celda-texto" data-label="Categoría">${escaparHtml(p.categoria) || '—'}</td>
        <td class="celda-texto" data-label="Proveedor">${escaparHtml(p.proveedor) || '—'}</td>
        <td class="num" data-label="Cant. inicial">${numero(p.cantidad_inicial)}</td>
        <td class="num" data-label="Disponible"><strong>${numero(p.cantidad_actual)}</strong></td>
        <td class="num" data-label="Stock mín.">${numero(p.stock_minimo)}</td>
        <td class="num" data-label="Valor unitario">${moneda(p.valor_unitario)}</td>
        <td class="num" data-label="Valor total"><strong>${moneda(p.valor_total)}</strong></td>
        <td data-label="Estado del stock"><span class="etiqueta etiqueta--${p.estado_stock}">${ETIQUETA_ESTADO_STOCK[p.estado_stock]}</span></td>
      </tr>`)
    .join('');

  pie.innerHTML = `
    <tr>
      <td colspan="6">Totales mostrados (${tf.cantidad_productos} ${tf.cantidad_productos === 1 ? 'producto' : 'productos'})</td>
      <td class="num">${numero(tf.total_unidades)}</td>
      <td colspan="2"></td>
      <td class="num">${moneda(tf.valor_total)}</td>
      <td></td>
    </tr>`;
}

function marcarOrden() {
  for (const encabezado of encabezados) {
    const activo = encabezado.dataset.ordenInv === estado.filtrosInventario.orden;
    if (activo) {
      encabezado.setAttribute('aria-sort', estado.filtrosInventario.dir === 'asc' ? 'ascending' : 'descending');
    } else {
      encabezado.removeAttribute('aria-sort');
    }
  }
}

// ---------- Diálogo: Crear / Editar Producto ----------
function abrirDialogoProducto(producto = null) {
  productoEditandoId = producto ? producto.id : null;
  formProducto.reset();
  limpiarErrores(formProducto, CAMPOS_PROD, 'data-error-prod');

  tituloProducto.textContent = producto ? 'Editar producto' : 'Nuevo producto';
  botonGuardarProducto.textContent = producto ? 'Guardar cambios' : 'Guardar producto';

  const categoriasUnicas = Array.from(new Set([...estado.categorias, ...estado.opcionesInventario.categorias])).sort();
  listaCategoriasInv.innerHTML = categoriasUnicas.map((c) => `<option value="${escaparHtml(c)}"></option>`).join('');

  if (producto) {
    for (const campo of CAMPOS_PROD) {
      formProducto.elements[campo].value = producto[campo];
    }
  } else {
    formProducto.elements.cantidad_inicial.value = 0;
    formProducto.elements.stock_minimo.value = 5;
    formProducto.elements.valor_unitario.value = 0;
  }

  actualizarPreviewProducto();
  dialogoProducto.showModal();
  formProducto.elements.nombre.focus();
}

function actualizarPreviewProducto() {
  const cant = Number(formProducto.elements.cantidad_inicial.value);
  const unit = Number(formProducto.elements.valor_unitario.value);
  const completo = formProducto.elements.cantidad_inicial.value !== '' && formProducto.elements.valor_unitario.value !== '';
  previewProducto.value = completo && cant >= 0 && unit >= 0 ? moneda(cant * unit) : '—';
}

function validarProductoCliente(valores) {
  const errores = {};
  const esNum = (v) => v !== '' && !Number.isNaN(Number(v));

  if (!valores.nombre.trim()) errores.nombre = 'Escribe el nombre del producto.';
  if (!esNum(valores.cantidad_inicial) || Number(valores.cantidad_inicial) < 0) {
    errores.cantidad_inicial = 'La cantidad inicial debe ser 0 o mayor.';
  }
  if (!esNum(valores.stock_minimo) || Number(valores.stock_minimo) < 0) {
    errores.stock_minimo = 'El stock mínimo debe ser 0 o mayor.';
  }
  if (!esNum(valores.valor_unitario) || Number(valores.valor_unitario) < 0) {
    errores.valor_unitario = 'El valor unitario debe ser 0 o mayor.';
  }
  return errores;
}

async function guardarProducto(evento) {
  evento.preventDefault();
  const valores = Object.fromEntries(new FormData(formProducto));
  const errores = validarProductoCliente(valores);
  if (Object.keys(errores).length) {
    mostrarErrores(formProducto, CAMPOS_PROD, 'data-error-prod', errores);
    return;
  }

  botonGuardarProducto.disabled = true;
  try {
    if (productoEditandoId) await api.actualizarProducto(productoEditandoId, valores);
    else await api.crearProducto(valores);

    dialogoProducto.close();
    mostrarAviso(productoEditandoId ? 'Producto actualizado.' : 'Producto agregado al inventario.');
    await cargarInventario();
    await alCambiarInventario();
  } catch (error) {
    if (error.errores) mostrarErrores(formProducto, CAMPOS_PROD, 'data-error-prod', error.errores);
    mostrarAviso(error.message, 'error');
  } finally {
    botonGuardarProducto.disabled = false;
  }
}

async function eliminarProducto(id) {
  const producto = estado.productos.find((p) => p.id === id);
  if (!producto) return;

  const confirmado = await confirmar({
    titulo: 'Eliminar producto',
    mensaje: `¿Seguro que quieres eliminar "${producto.nombre}" del inventario? Los registros contables históricos se conservarán, pero se eliminará su control de stock.`,
    textoAceptar: '🗑️ Eliminar',
  });
  if (!confirmado) return;

  try {
    await api.eliminarProducto(id);
    mostrarAviso('Producto eliminado del inventario.');
    await cargarInventario();
    await alCambiarInventario();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// ---------- Diálogo: Entrada / Salida Manual ----------
function abrirDialogoAjuste(productoId, tipoInicial = 'entrada') {
  const producto =
    estado.productos.find((p) => p.id === productoId) ||
    estado.catalogoProductos.find((p) => p.id === productoId) ||
    estado.resumenInventario?.alertas?.find((p) => p.id === productoId);
  if (!producto) return;

  productoEnAjuste = producto;
  formAjuste.reset();
  limpiarErrores(formAjuste, CAMPOS_AJUSTE, 'data-error-ajuste');

  formAjuste.elements.tipo.value = tipoInicial;
  formAjuste.elements.fecha.value = hoyISO();
  formAjuste.elements.cantidad.value = 1;

  infoAjuste.className = `info-stock ${producto.estado_stock === 'agotado' ? 'info-stock--peligro' : producto.estado_stock === 'stock_bajo' ? 'info-stock--alerta' : ''}`;
  infoAjuste.innerHTML = `
    <div>
      <strong>${escaparHtml(producto.nombre)}</strong>
      <div style="font-size:.82rem;color:var(--tinta-suave)">Stock disponible actual: <strong>${numero(producto.cantidad_actual)}</strong> uds · Mínimo: ${numero(producto.stock_minimo)}</div>
    </div>
    <span class="etiqueta etiqueta--${producto.estado_stock}">${ETIQUETA_ESTADO_STOCK[producto.estado_stock]}</span>
  `;

  actualizarPreviewAjuste();
  dialogoAjuste.showModal();
  formAjuste.elements.cantidad.focus();
}

function actualizarPreviewAjuste() {
  if (!productoEnAjuste) return;
  const tipo = formAjuste.elements.tipo.value;
  const cant = Number(formAjuste.elements.cantidad.value);
  if (formAjuste.elements.cantidad.value === '' || Number.isNaN(cant) || cant <= 0) {
    previewAjuste.value = '—';
    previewAjuste.style.color = '';
    return;
  }
  const resultante = tipo === 'entrada'
    ? productoEnAjuste.cantidad_actual + cant
    : productoEnAjuste.cantidad_actual - cant;

  if (resultante < 0) {
    previewAjuste.value = `Stock insuficiente (quedaría en ${numero(resultante)})`;
    previewAjuste.style.color = '#a8352a';
  } else {
    previewAjuste.value = `${numero(resultante)} unidades`;
    previewAjuste.style.color = tipo === 'entrada' ? '#14724a' : '#17251f';
  }
}

async function guardarAjuste(evento) {
  evento.preventDefault();
  if (!productoEnAjuste) return;

  const valores = Object.fromEntries(new FormData(formAjuste));
  const errores = {};
  const cant = Number(valores.cantidad);

  if (!valores.tipo) errores.tipo = 'Elige el tipo de ajuste.';
  if (valores.cantidad === '' || Number.isNaN(cant) || cant <= 0) errores.cantidad = 'La cantidad debe ser mayor que cero.';
  else if (valores.tipo === 'salida' && cant > productoEnAjuste.cantidad_actual) {
    errores.cantidad = `No hay suficiente stock. Disponible: ${numero(productoEnAjuste.cantidad_actual)} unidades.`;
  }
  if (!valores.fecha) errores.fecha = 'Elige la fecha.';
  if (!valores.motivo.trim()) errores.motivo = 'Indica el motivo de la entrada o salida.';

  if (Object.keys(errores).length) {
    mostrarErrores(formAjuste, CAMPOS_AJUSTE, 'data-error-ajuste', errores);
    return;
  }

  botonGuardarAjuste.disabled = true;
  try {
    await api.registrarAjuste(productoEnAjuste.id, valores);
    dialogoAjuste.close();
    mostrarAviso(valores.tipo === 'entrada' ? 'Entrada manual registrada.' : 'Salida manual registrada.');
    await cargarInventario();
    await alCambiarInventario();
  } catch (error) {
    if (error.errores) mostrarErrores(formAjuste, CAMPOS_AJUSTE, 'data-error-ajuste', error.errores);
    mostrarAviso(error.message, 'error');
  } finally {
    botonGuardarAjuste.disabled = false;
  }
}

// ---------- Diálogo: Historial del Producto ----------
async function abrirHistorial(productoId) {
  try {
    const { producto, movimientos } = await api.historialProducto(productoId);
    tituloHistorial.textContent = `Historial: ${producto.nombre}`;
    resumenHistorial.className = `info-stock ${producto.estado_stock === 'agotado' ? 'info-stock--peligro' : producto.estado_stock === 'stock_bajo' ? 'info-stock--alerta' : ''}`;
    resumenHistorial.innerHTML = `
      <div>
        <strong>Disponible: ${numero(producto.cantidad_actual)} uds</strong>
        <span style="margin-left:.6rem;color:var(--tinta-suave)">Inicial: ${numero(producto.cantidad_inicial)} · Mínimo: ${numero(producto.stock_minimo)} · Valor: ${moneda(producto.valor_total)}</span>
      </div>
      <span class="etiqueta etiqueta--${producto.estado_stock}">${ETIQUETA_ESTADO_STOCK[producto.estado_stock]}</span>
    `;

    if (movimientos.length === 0) {
      contenidoHistorial.innerHTML = '<p class="nota">Aún no hay entradas ni salidas registradas para este producto. El stock corresponde a su cantidad inicial.</p>';
    } else {
      contenidoHistorial.innerHTML = `
        <table class="historial-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th>Tipo</th>
              <th class="num">Cantidad</th>
              <th>Motivo / Detalle</th>
            </tr>
          </thead>
          <tbody>
            ${movimientos
              .map(
                (m) => `
              <tr>
                <td>${fechaCorta(m.fecha)}</td>
                <td>${escaparHtml(ETIQUETA_ORIGEN_INV[m.origen] || m.origen)}</td>
                <td><span class="etiqueta etiqueta--${m.tipo}">${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</span></td>
                <td class="num ${m.tipo === 'entrada' ? 'delta-entrada' : 'delta-salida'}">${m.tipo === 'entrada' ? '+' : '−'}${numero(m.cantidad)}</td>
                <td>${escaparHtml(m.motivo || m.movimiento_nombre || '—')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
    }

    dialogoHistorial.showModal();
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

// ---------- Exportar Inventario a Excel ----------
async function exportarInventarioExcel() {
  const boton = $('boton-excel-inventario');
  boton.disabled = true;
  try {
    const respuesta = await fetch(api.urlExcelInventario(estado.filtrosInventario));
    if (!respuesta.ok) throw new Error('No se pudo generar el archivo de Excel del inventario.');
    const archivo = await respuesta.blob();
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = `inventario-${hoyISO()}.xlsx`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(enlace.href);
    mostrarAviso('Excel de inventario generado.');
  } catch (error) {
    mostrarAviso(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

// ---------- Helpers de errores ----------
function limpiarErrores(form, campos, attr) {
  for (const campo of campos) {
    form.elements[campo]?.removeAttribute('aria-invalid');
    const el = form.querySelector(`[${attr}="${campo}"]`);
    if (el) el.textContent = '';
  }
}

function mostrarErrores(form, campos, attr, errores) {
  limpiarErrores(form, campos, attr);
  let primerCampo = null;
  for (const campo of campos) {
    if (!errores[campo]) continue;
    form.elements[campo]?.setAttribute('aria-invalid', 'true');
    const el = form.querySelector(`[${attr}="${campo}"]`);
    if (el) el.textContent = errores[campo];
    primerCampo ??= form.elements[campo];
  }
  primerCampo?.focus();
}
