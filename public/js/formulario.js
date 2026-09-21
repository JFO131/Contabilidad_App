// La ventana para agregar o editar un registro, con validación antes de guardar.
import { api } from './api.js';
import { estado } from './estado.js';
import { hoyISO, moneda, escaparHtml } from './formato.js';
import { mostrarAviso } from './avisos.js';

const dialogo = document.getElementById('dialogo-formulario');
const formulario = document.getElementById('formulario-registro');
const titulo = document.getElementById('titulo-formulario');
const total = document.getElementById('campo-total');
const botonGuardar = document.getElementById('boton-guardar');
const listaCategorias = document.getElementById('lista-categorias');

const CAMPOS = ['nombre', 'tipo', 'proveedor', 'categoria', 'cantidad', 'valor_unitario', 'fecha', 'observaciones'];

let idEnEdicion = null; // null = se está creando un registro nuevo
let alGuardar = () => {};

export function iniciarFormulario(opciones) {
  alGuardar = opciones.alGuardar;

  formulario.addEventListener('submit', guardar);
  formulario.addEventListener('input', actualizarTotal);
  document.getElementById('boton-cancelar-formulario').addEventListener('click', () => dialogo.close());
}

// Sin argumento abre el formulario vacío (agregar). Con un registro lo abre lleno (editar).
export function abrirFormulario(registro = null) {
  idEnEdicion = registro ? registro.id : null;
  formulario.reset();
  limpiarErrores();

  titulo.textContent = registro ? 'Editar registro' : 'Agregar registro';
  botonGuardar.textContent = registro ? 'Guardar cambios' : 'Guardar registro';

  listaCategorias.innerHTML = estado.categorias.map((c) => `<option value="${escaparHtml(c)}"></option>`).join('');

  if (registro) {
    for (const campo of CAMPOS) formulario.elements[campo].value = registro[campo];
  } else {
    formulario.elements.fecha.value = hoyISO();
    formulario.elements.cantidad.value = 1;
  }

  actualizarTotal();
  dialogo.showModal();
  formulario.elements.nombre.focus();
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

  return errores;
}

function limpiarErrores() {
  for (const campo of CAMPOS) {
    formulario.elements[campo].removeAttribute('aria-invalid');
    formulario.querySelector(`[data-error-de="${campo}"]`).textContent = '';
  }
}

function mostrarErrores(errores) {
  limpiarErrores();
  let primerCampo = null;
  for (const campo of CAMPOS) {
    if (!errores[campo]) continue;
    formulario.elements[campo].setAttribute('aria-invalid', 'true');
    formulario.querySelector(`[data-error-de="${campo}"]`).textContent = errores[campo];
    primerCampo ??= formulario.elements[campo];
  }
  primerCampo?.focus();
}

// ---------- Guardar ----------
async function guardar(evento) {
  evento.preventDefault();

  const valores = Object.fromEntries(new FormData(formulario));
  const errores = validar(valores);
  if (Object.keys(errores).length) {
    mostrarErrores(errores);
    return;
  }

  botonGuardar.disabled = true;
  try {
    if (idEnEdicion) await api.actualizar(idEnEdicion, valores);
    else await api.crear(valores);

    dialogo.close();
    mostrarAviso(idEnEdicion ? 'Cambios guardados.' : 'Registro agregado.');
    await alGuardar();
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores); // el servidor también valida
    else mostrarAviso(error.message, 'error');
  } finally {
    botonGuardar.disabled = false;
  }
}
