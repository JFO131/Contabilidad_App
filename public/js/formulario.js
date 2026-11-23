// La ventana para agregar o editar un registro, conectada al inventario con validación de stock.
import { api } from './api.js';
import { estado } from './estado.js';
import { hoyISO, moneda, numero, escaparHtml, ETIQUETA_ESTADO_STOCK } from './formato.js';
import { mostrarAviso } from './avisos.js';
import { cargarCatalogoProductos } from './inventario.js';

const dialogo = document.getElementById('dialogo-formulario');
const formulario = document.getElementById('formulario-registro');
const titulo = document.getElementById('titulo-formulario');
const total = document.getElementById('campo-total');
const botonGuardar = document.getElementById('boton-guardar');
const listaCategorias = document.getElementById('lista-categorias');
const selectProducto = document.getElementById('campo-producto');
const infoStock = document.getElementById('info-stock-movimiento');
const wrapAfectaInv = document.getElementById('campo-afecta-inventario-wrap');
const checkAfectaInv = document.getElementById('campo-afecta-inventario');

const CAMPOS = ['producto_id', 'nombre', 'tipo', 'proveedor', 'categoria', 'cantidad', 'valor_unitario', 'fecha', 'observaciones'];

let registroEnEdicion = null; // null = creando un registro nuevo
let alGuardar = () => {};

export function iniciarFormulario(opciones) {
  alGuardar = opciones.alGuardar;

  formulario.addEventListener('submit', guardar);
  formulario.addEventListener('input', () => {
    actualizarTotal();
    actualizarInfoStock();
  });

  selectProducto.addEventListener('change', alCambiarProducto);
  formulario.elements.tipo.addEventListener('change', () => {
    actualizarVisibilidadSalida();
    actualizarInfoStock();
  });
  checkAfectaInv.addEventListener('change', actualizarInfoStock);

  document.getElementById('boton-cancelar-formulario').addEventListener('click', () => dialogo.close());
}

// Sin argumento abre el formulario vacío (agregar). Con un registro lo abre lleno (editar).
export async function abrirFormulario(registro = null) {
  registroEnEdicion = registro;
  formulario.reset();
  limpiarErrores();

  await cargarCatalogoProductos();
  poblarSelectorProductos();

  titulo.textContent = registro ? 'Editar registro' : 'Agregar registro';
  botonGuardar.textContent = registro ? 'Guardar cambios' : 'Guardar registro';

  listaCategorias.innerHTML = estado.categorias.map((c) => `<option value="${escaparHtml(c)}"></option>`).join('');

  if (registro) {
    for (const campo of CAMPOS) {
      if (campo === 'producto_id') {
        selectProducto.value = registro.producto_id ? String(registro.producto_id) : '';
      } else {
        formulario.elements[campo].value = registro[campo] ?? '';
      }
    }
    checkAfectaInv.checked = Boolean(registro.afecta_inventario);
  } else {
    formulario.elements.fecha.value = hoyISO();
    formulario.elements.cantidad.value = 1;
    checkAfectaInv.checked = false;
  }

  actualizarVisibilidadSalida();
  actualizarTotal();
  actualizarInfoStock();
  dialogo.showModal();
  formulario.elements.nombre.focus();
}

function poblarSelectorProductos() {
  const opciones = estado.catalogoProductos
    .map(
      (p) =>
        `<option value="${p.id}">${escaparHtml(p.nombre)} (Disponible: ${numero(p.cantidad_actual)} · ${ETIQUETA_ESTADO_STOCK[p.estado_stock]})</option>`
    )
    .join('');
  selectProducto.innerHTML = '<option value="">Sin vincular a un producto de inventario</option>' + opciones;
}

function obtenerProductoSeleccionado() {
  const id = Number(selectProducto.value);
  if (id) return estado.catalogoProductos.find((p) => p.id === id) || null;
  const nombre = formulario.elements.nombre.value.trim().toLowerCase();
  const tipo = formulario.elements.tipo.value;
  if (nombre && (tipo === 'compra' || tipo === 'venta')) {
    return estado.catalogoProductos.find((p) => p.nombre.trim().toLowerCase() === nombre) || null;
  }
  return null;
}

function alCambiarProducto() {
  const id = Number(selectProducto.value);
  const prod = estado.catalogoProductos.find((p) => p.id === id);
  if (prod) {
    formulario.elements.nombre.value = prod.nombre;
    if (prod.proveedor) formulario.elements.proveedor.value = prod.proveedor;
    if (prod.categoria) formulario.elements.categoria.value = prod.categoria;
    if (!formulario.elements.valor_unitario.value || !registroEnEdicion) {
      formulario.elements.valor_unitario.value = prod.valor_unitario;
    }
  }
  actualizarVisibilidadSalida();
  actualizarTotal();
  actualizarInfoStock();
}

function actualizarVisibilidadSalida() {
  const tipo = formulario.elements.tipo.value;
  const mostrar = tipo === 'gasto' || tipo === 'otro';
  wrapAfectaInv.hidden = !mostrar;
  if (!mostrar) checkAfectaInv.checked = false;
}

// Calcula el stock efectivamente disponible considerando si estamos editando un movimiento previo del mismo producto.
function calcularDisponibleParaFormulario(producto) {
  let disponible = producto.cantidad_actual;
  if (registroEnEdicion && registroEnEdicion.producto_id === producto.id && registroEnEdicion.afecta_inventario) {
    if (registroEnEdicion.tipo === 'compra') {
      disponible -= registroEnEdicion.cantidad;
    } else {
      disponible += registroEnEdicion.cantidad;
    }
  }
  return Math.round(disponible * 100) / 100;
}

function actualizarInfoStock() {
  const prod = obtenerProductoSeleccionado();
  if (!prod) {
    infoStock.hidden = true;
    infoStock.innerHTML = '';
    return;
  }

  const tipo = formulario.elements.tipo.value;
  const cantidad = Number(formulario.elements.cantidad.value) || 0;
  const esSalida = tipo === 'venta' || ((tipo === 'gasto' || tipo === 'otro') && checkAfectaInv.checked);
  const esEntrada = tipo === 'compra';
  const disponible = calcularDisponibleParaFormulario(prod);

  let clase = 'info-stock';
  let mensaje = `Stock actual de <strong>${escaparHtml(prod.nombre)}</strong>: <strong>${numero(prod.cantidad_actual)}</strong> uds.`;

  if (esEntrada && cantidad > 0) {
    mensaje += ` Tras esta compra quedará en <strong>${numero(disponible + cantidad)}</strong> uds.`;
  } else if (esSalida && cantidad > 0) {
    const restante = Math.round((disponible - cantidad) * 100) / 100;
    if (restante < 0) {
      clase += ' info-stock--peligro';
      mensaje = `⚠️ <strong>Stock insuficiente:</strong> solo hay <strong>${numero(disponible)}</strong> uds disponibles de "${escaparHtml(prod.nombre)}" y estás intentando sacar ${numero(cantidad)}.`;
    } else {
      if (restante === 0) clase += ' info-stock--peligro';
      else if (prod.stock_minimo > 0 && restante <= prod.stock_minimo) clase += ' info-stock--alerta';
      mensaje += ` Tras esta salida quedará en <strong>${numero(restante)}</strong> uds.`;
    }
  } else if (tipo === 'gasto' || tipo === 'otro') {
    mensaje += ' (No modificará el inventario a menos que marques la salida de productos).';
  }

  infoStock.className = clase;
  infoStock.hidden = false;
  infoStock.innerHTML = `
    <span>${mensaje}</span>
    <span class="etiqueta etiqueta--${prod.estado_stock}">${ETIQUETA_ESTADO_STOCK[prod.estado_stock]}</span>
  `;
}

// Valor total = cantidad × valor unitario (se muestra en vivo mientras se escribe).
function actualizarTotal() {
  const cantidad = Number(formulario.elements.cantidad.value);
  const valorUnitario = Number(formulario.elements.valor_unitario.value);
  const completo = formulario.elements.cantidad.value !== '' && formulario.elements.valor_unitario.value !== '';
  total.value = completo && cantidad >= 0 && valorUnitario >= 0 ? moneda(cantidad * valorUnitario) : '—';
}

// ---------- Validación ----------
function validar(valores) {
  const errores = {};
  const esNumero = (texto) => texto !== '' && !Number.isNaN(Number(texto));

  if (!valores.nombre.trim()) errores.nombre = 'Escribe el nombre del producto o elemento.';
  if (!valores.tipo) errores.tipo = 'Elige un tipo de movimiento.';
  if (!valores.fecha) errores.fecha = 'Elige la fecha del movimiento.';

  if (!esNumero(valores.cantidad)) errores.cantidad = 'La cantidad debe ser un número.';
  else if (Number(valores.cantidad) <= 0) errores.cantidad = 'La cantidad debe ser mayor que cero.';

  if (!esNumero(valores.valor_unitario)) errores.valor_unitario = 'El valor unitario debe ser un número.';
  else if (Number(valores.valor_unitario) < 0) errores.valor_unitario = 'El valor unitario no puede ser negativo.';

  const esSalidaGastoOtro = (valores.tipo === 'gasto' || valores.tipo === 'otro') && checkAfectaInv.checked;
  if (esSalidaGastoOtro && !valores.producto_id) {
    errores.producto_id = 'Selecciona el producto del inventario que saldrá con este movimiento.';
  }

  // Validación previa de stock disponible
  const prod = obtenerProductoSeleccionado();
  const esSalida = valores.tipo === 'venta' || esSalidaGastoOtro;
  if (prod && esSalida && !errores.cantidad) {
    const disponible = calcularDisponibleParaFormulario(prod);
    if (Number(valores.cantidad) > disponible) {
      errores.cantidad = `No hay suficiente stock. Disponible: ${numero(disponible)} unidades.`;
    }
  }

  return errores;
}

function limpiarErrores() {
  for (const campo of CAMPOS) {
    formulario.elements[campo]?.removeAttribute('aria-invalid');
    const el = formulario.querySelector(`[data-error-de="${campo}"]`);
    if (el) el.textContent = '';
  }
}

function mostrarErrores(errores) {
  limpiarErrores();
  let primerCampo = null;
  for (const campo of CAMPOS) {
    if (!errores[campo]) continue;
    formulario.elements[campo]?.setAttribute('aria-invalid', 'true');
    const el = formulario.querySelector(`[data-error-de="${campo}"]`);
    if (el) el.textContent = errores[campo];
    primerCampo ??= formulario.elements[campo];
  }
  primerCampo?.focus();
}

// ---------- Guardar ----------
async function guardar(evento) {
  evento.preventDefault();

  const valores = Object.fromEntries(new FormData(formulario));
  valores.afecta_inventario = checkAfectaInv.checked ? 1 : 0;

  const errores = validar(valores);
  if (Object.keys(errores).length) {
    mostrarErrores(errores);
    return;
  }

  botonGuardar.disabled = true;
  try {
    if (registroEnEdicion) await api.actualizar(registroEnEdicion.id, valores);
    else await api.crear(valores);

    dialogo.close();
    mostrarAviso(registroEnEdicion ? 'Cambios guardados y stock actualizado.' : 'Registro agregado.');
    await alGuardar();
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores); // el servidor también valida
    mostrarAviso(error.message, 'error');
  } finally {
    botonGuardar.disabled = false;
  }
}
