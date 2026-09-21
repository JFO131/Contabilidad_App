// Mensajes breves y ventana de confirmación.

const contenedor = document.getElementById('avisos');
const dialogo = document.getElementById('dialogo-confirmar');
const titulo = document.getElementById('confirmar-titulo');
const mensaje = document.getElementById('confirmar-mensaje');
const botonAceptar = document.getElementById('confirmar-aceptar');

// tipo: 'ok' o 'error'
export function mostrarAviso(texto, tipo = 'ok') {
  const aviso = document.createElement('div');
  aviso.className = `aviso ${tipo === 'error' ? 'aviso--error' : ''}`;
  aviso.textContent = texto;
  contenedor.append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'error' ? 6000 : 3500);
}

// Muestra una ventana con "Cancelar" y "Aceptar". Devuelve true si la persona confirma.
export function confirmar({ titulo: textoTitulo, mensaje: textoMensaje, textoAceptar = 'Aceptar' }) {
  titulo.textContent = textoTitulo;
  mensaje.textContent = textoMensaje;
  botonAceptar.textContent = textoAceptar;
  dialogo.returnValue = '';

  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'confirmar'), { once: true });
    dialogo.showModal();
  });
}
