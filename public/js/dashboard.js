// El panel principal: tarjetas con totales, ingresos vs egresos, gráficos y movimientos recientes.
import { api } from './api.js';
import { moneda, fechaCorta, escaparHtml, ETIQUETA_TIPO } from './formato.js';
import { mostrarAviso } from './avisos.js';

const COLORES = { compra: '#3a6ea5', venta: '#2a9d68', gasto: '#d24b3e', otro: '#7c8a93' };

let graficoTipos = null;
let graficoMeses = null;

const $ = (id) => document.getElementById(id);

export async function cargarDashboard() {
  try {
    const resumen = await api.resumen();
    dibujarTarjetas(resumen);
    dibujarBalance(resumen);
    dibujarGraficos(resumen);
    dibujarRecientes(resumen.recientes);
  } catch (error) {
    mostrarAviso(error.message, 'error');
  }
}

function dibujarTarjetas({ totales }) {
  $('res-registros').textContent = totales.cantidad_registros;
  $('res-compras').textContent = moneda(totales.total_compras);
  $('res-ventas').textContent = moneda(totales.total_ventas);
  $('res-gastos').textContent = moneda(totales.total_gastos);
  $('res-total').textContent = moneda(totales.total_general);
}

function dibujarBalance({ ingresos, egresos, balance }) {
  $('bal-ingresos').textContent = moneda(ingresos);
  $('bal-egresos').textContent = moneda(egresos);

  // Las barras se comparan entre sí: la más grande ocupa el 100 %.
  const mayor = Math.max(ingresos, egresos, 1);
  $('barra-ingresos').style.width = `${(ingresos / mayor) * 100}%`;
  $('barra-egresos').style.width = `${(egresos / mayor) * 100}%`;

  const elementoBalance = $('bal-balance');
  elementoBalance.textContent = moneda(balance);
  elementoBalance.className = balance >= 0 ? 'positivo' : 'negativo';
}

function dibujarGraficos({ totales, porMes }) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  // --- Gráfico circular: cuánto suma cada tipo de movimiento ---
  const valoresTipos = [totales.total_compras, totales.total_ventas, totales.total_gastos, totales.total_otros];
  const hayDatosTipos = valoresTipos.some((valor) => valor > 0);
  $('tipos-vacio').hidden = hayDatosTipos;
  $('grafico-tipos').hidden = !hayDatosTipos;

  graficoTipos?.destroy(); // se destruye el anterior para no dibujar encima
  graficoTipos = null;
  if (hayDatosTipos) {
    graficoTipos = new Chart($('grafico-tipos'), {
      type: 'doughnut',
      data: {
        labels: ['Compras', 'Ventas', 'Gastos', 'Otros'],
        datasets: [{ data: valoresTipos, backgroundColor: Object.values(COLORES), borderWidth: 2, borderColor: '#fff' }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (item) => ` ${item.label}: ${moneda(item.parsed)}` } },
        },
      },
    });
  }

  // --- Gráfico de barras: ingresos y egresos de los últimos meses ---
  $('meses-vacio').hidden = porMes.length > 0;
  $('grafico-meses').hidden = porMes.length === 0;

  graficoMeses?.destroy();
  graficoMeses = null;
  if (porMes.length > 0) {
    graficoMeses = new Chart($('grafico-meses'), {
      type: 'bar',
      data: {
        labels: porMes.map((m) => nombreMes(m.mes)),
        datasets: [
          { label: 'Ingresos (ventas)', data: porMes.map((m) => m.ingresos), backgroundColor: COLORES.venta, borderRadius: 4 },
          { label: 'Egresos (compras y gastos)', data: porMes.map((m) => m.egresos), backgroundColor: COLORES.gasto, borderRadius: 4 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: ${moneda(item.parsed.y)}` } },
        },
        scales: { y: { beginAtZero: true, ticks: { callback: (valor) => moneda(valor) } } },
      },
    });
  }
}

// "2026-09" -> "sept 2026"
function nombreMes(mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
}

function dibujarRecientes(recientes) {
  const lista = $('lista-recientes');
  if (recientes.length === 0) {
    lista.innerHTML = '<li class="recientes__vacio">Todavía no hay movimientos. Ve a Registros y agrega el primero.</li>';
    return;
  }

  lista.innerHTML = recientes
    .map((r) => `
      <li class="recientes__item">
        <span class="etiqueta etiqueta--${r.tipo}">${ETIQUETA_TIPO[r.tipo]}</span>
        <div>
          <div class="recientes__nombre">${escaparHtml(r.nombre)}</div>
          <div class="recientes__detalle">${fechaCorta(r.fecha)}${r.proveedor ? ' · ' + escaparHtml(r.proveedor) : ''}</div>
        </div>
        <span class="recientes__valor">${moneda(r.valor_total)}</span>
      </li>`)
    .join('');
}
