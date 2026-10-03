import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Tipo = 'compra' | 'venta' | 'gasto' | 'otro';
type Estado = 'pendiente' | 'pagado';
type Periodo = 'diario' | 'semanal' | 'mensual' | 'anual' | 'total';

type Libro = { id: number; nombre: string; descripcion: string; creado: string };

type Movimiento = {
  id: number;
  libro_id: number;
  nombre: string;
  proveedor: string;
  categoria: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
  valor_registro: number;
  fecha: string;
  tipo: Tipo;
  observaciones: string;
  estado: Estado;
  productos?: Producto[] | string;
};

type Producto = { id: number; nombre: string; cantidad: string; valor_unitario: string };
type ProductoGuardado = { id: number; nombre: string; precio: number; categoria: string };
type Categoria = { id: number; nombre: string };

type MovimientoImportado = {
  nombre: string;
  proveedor: string;
  categoria: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
  valor_registro: number;
  fecha: string;
  tipo: Tipo;
  observaciones: string;
  estado: Estado;
};

// Paleta oscura moderna con acentos morados
const COLORES = {
  fondo: '#0B0C16',
  superficie: '#131424',
  tarjeta: '#191B2F',
  tarjetaElevada: '#20223A',
  borde: '#292B45',
  bordeActivo: '#8B5CF6',

  morado: '#8B5CF6',
  moradoOscuro: '#6D28D9',
  moradoClaro: '#A78BFA',
  moradoFondo: '#2A1F4E',
  moradoBorde: '#4C358A',

  blanco: '#FFFFFF',
  textoSecundario: '#94A3B8',
  textoMuted: '#64748B',

  verde: '#10B981',
  verdeFondo: '#064E3B44',
  verdeBorde: '#059669',

  rojo: '#F43F5E',
  rojoFondo: '#88133744',
  rojoBorde: '#E11D48',

  amarillo: '#F59E0B',
  amarilloFondo: '#78350F44',
  amarilloBorde: '#D97706',

  azul: '#38BDF8',
  azulFondo: '#0C4A6E44',

  inputFondo: '#141628',
  inputBorde: '#272A47',
};

async function crearTablas(db: any) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS libros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT NOT NULL DEFAULT '',
      creado TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      libro_id INTEGER NOT NULL DEFAULT 1,
      nombre TEXT NOT NULL,
      proveedor TEXT NOT NULL DEFAULT '',
      categoria TEXT NOT NULL DEFAULT '',
      cantidad REAL NOT NULL,
      valor_unitario REAL NOT NULL,
      valor_total REAL NOT NULL,
      valor_registro REAL NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      observaciones TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'pendiente'
    );
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      precio REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE
    );
  `);
  // Migraciones seguras
  try { await db.execAsync("ALTER TABLE movimientos ADD COLUMN productos TEXT NOT NULL DEFAULT '[]';"); } catch {}
  try { await db.execAsync("ALTER TABLE movimientos ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente';"); } catch {}
  try { await db.execAsync('ALTER TABLE movimientos ADD COLUMN valor_registro REAL NOT NULL DEFAULT 0;'); } catch {}
  try { await db.execAsync('ALTER TABLE movimientos ADD COLUMN libro_id INTEGER NOT NULL DEFAULT 1;'); } catch {}

  // Crear libro "Principal" por defecto si no existe ninguno
  const count = (await db.getFirstAsync('SELECT COUNT(*) as n FROM libros')) as { n: number } | null;
  if (!count || count.n === 0) {
    await db.runAsync(
      "INSERT INTO libros (nombre, descripcion, creado) VALUES (?, ?, ?)",
      'Principal', 'Libro contable principal', hoy()
    );
  }
}

function dinero(valor: number) {
  return valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function htmlSeguro(valor: string | number) {
  return String(valor).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));
}

// ── Compartir archivo (PDF o Excel) via share sheet del sistema ──────────────
async function compartirArchivo(
  nombreArchivo: string,
  contenidoBase64: string,
  mimeType: string
) {
  try {
    const localUri = `${FileSystem.cacheDirectory}${nombreArchivo}`;
    await FileSystem.writeAsStringAsync(localUri, contenidoBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri, { mimeType, dialogTitle: `Compartir ${nombreArchivo}` });
    } else {
      Alert.alert('Compartir no disponible', 'Tu dispositivo no soporta la función de compartir archivos.');
    }
  } catch (error: any) {
    Alert.alert('Error al compartir', `No se pudo generar el archivo: ${error?.message || error}`);
  }
}

// ── Descripción legible de los filtros activos ───────────────────────────────
function describirFiltros(
  busqueda: string,
  tipoFiltro: Tipo | '',
  estadoFiltro: Estado | '',
  fechaDesde: string,
  fechaHasta: string
): string {
  const partes: string[] = [];
  if (busqueda) partes.push(`Búsqueda: "${busqueda}"`);
  if (tipoFiltro) partes.push(`Tipo: ${tipoFiltro}`);
  if (estadoFiltro) partes.push(`Estado: ${estadoFiltro}`);
  if (fechaDesde) partes.push(`Desde: ${fechaDesde}`);
  if (fechaHasta) partes.push(`Hasta: ${fechaHasta}`);
  return partes.length ? partes.join(' · ') : 'Sin filtros (todos los registros del libro)';
}

function AppContenido() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  // ── Estado general ────────────────────────────────────────────────────────
  const [pantalla, setPantalla] = useState<'resumen' | 'movimientos' | 'tabla' | 'productos' | 'libros'>('resumen');
  const [registros, setRegistros] = useState<Movimiento[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<Tipo | ''>('');
  const [estadoFiltro, setEstadoFiltro] = useState<Estado | ''>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<Periodo>('total');
  const [editando, setEditando] = useState<number | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [registroNombre, setRegistroNombre] = useState('');
  const [detalleAbierto, setDetalleAbierto] = useState<number | null>(null);
  const [productosGuardados, setProductosGuardados] = useState<ProductoGuardado[]>([]);
  const [productoSeleccionando, setProductoSeleccionando] = useState<number | null>(null);
  const [productoCatalogo, setProductoCatalogo] = useState({ nombre: '', precio: '', categoria: '' });
  const [productoEditando, setProductoEditando] = useState<number | null>(null);
  const [registroValor, setRegistroValor] = useState('');
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [formulario, setFormulario] = useState({
    nombre: '', proveedor: '', categoria: '', cantidad: '', valor_unitario: '', fecha: hoy(), tipo: 'compra' as Tipo, observaciones: '',
  });

  // ── Estado de Libros ──────────────────────────────────────────────────────
  const [libros, setLibros] = useState<Libro[]>([]);
  const [libroActivo, setLibroActivo] = useState<Libro | null>(null);
  const [modalLibros, setModalLibros] = useState(false);
  const [libroNombre, setLibroNombre] = useState('');
  const [libroDescripcion, setLibroDescripcion] = useState('');
  const [libroEditandoId, setLibroEditandoId] = useState<number | null>(null);
  const [modalConfirmarElimLibro, setModalConfirmarElimLibro] = useState<Libro | null>(null);

  // ── Estado de importación ─────────────────────────────────────────────────
  const [importacionModal, setImportacionModal] = useState(false);
  const [importacionDatos, setImportacionDatos] = useState<{ nombre: string; items: MovimientoImportado[] }>({ nombre: '', items: [] });
  const [cargandoImportacion, setCargandoImportacion] = useState(false);

  // ── Carga de datos ────────────────────────────────────────────────────────
  async function cargarLibros() {
    const rows = await db.getAllAsync<Libro>('SELECT * FROM libros ORDER BY creado ASC, id ASC');
    setLibros(rows);
    if (rows.length && !libroActivo) {
      setLibroActivo(rows[0]);
    } else if (libroActivo) {
      // Refrescar el libro activo por si cambió el nombre
      const updated = rows.find((l) => l.id === libroActivo.id);
      if (updated) setLibroActivo(updated);
    }
    return rows;
  }

  async function cargar() {
    const rows = await db.getAllAsync<Libro>('SELECT * FROM libros ORDER BY creado ASC, id ASC');
    setLibros(rows);
    let activeId = libroActivo?.id;
    if (!activeId && rows.length) {
      setLibroActivo(rows[0]);
      activeId = rows[0].id;
    } else if (libroActivo) {
      const updated = rows.find((l) => l.id === libroActivo.id);
      if (updated) setLibroActivo(updated);
    }
    if (activeId) {
      const filas = await db.getAllAsync<Movimiento>(
        'SELECT * FROM movimientos WHERE libro_id=? ORDER BY fecha DESC, id DESC', activeId
      );
      setRegistros(filas.map((fila) => ({ ...fila, estado: fila.estado === 'pagado' ? 'pagado' : 'pendiente', productos: leerProductos(fila) })));
    } else {
      setRegistros([]);
    }
    setProductosGuardados(await db.getAllAsync<ProductoGuardado>('SELECT id, nombre, precio, categoria FROM productos ORDER BY nombre COLLATE NOCASE'));
    setCategorias(await db.getAllAsync<Categoria>('SELECT * FROM categorias ORDER BY nombre COLLATE NOCASE'));
  }

  useEffect(() => { cargar(); }, []);

  // Recargar registros cuando cambia el libro activo
  useEffect(() => {
    if (libroActivo) {
      db.getAllAsync<Movimiento>(
        'SELECT * FROM movimientos WHERE libro_id=? ORDER BY fecha DESC, id DESC', libroActivo.id
      ).then((filas) => {
        setRegistros(filas.map((fila) => ({ ...fila, estado: fila.estado === 'pagado' ? 'pagado' : 'pendiente', productos: leerProductos(fila) })));
      });
    }
  }, [libroActivo?.id]);

  // ── Filtros aplicados ─────────────────────────────────────────────────────
  const filtrados = registros.filter((registro) => {
    const texto = `${registro.nombre} ${registro.proveedor} ${registro.categoria} ${registro.observaciones}`.toLowerCase();
    return (
      texto.includes(busqueda.toLowerCase()) &&
      (!tipoFiltro || registro.tipo === tipoFiltro) &&
      (!estadoFiltro || registro.estado === estadoFiltro) &&
      (!fechaDesde || registro.fecha >= fechaDesde) &&
      (!fechaHasta || registro.fecha <= fechaHasta)
    );
  });

  const hayFiltros = !!(busqueda || tipoFiltro || estadoFiltro || fechaDesde || fechaHasta);

  // ── Métricas generales (todos los registros del libro) ────────────────────
  const ventas = registros.filter((r) => r.tipo === 'venta').reduce((s, r) => s + r.valor_total, 0);
  const compras = registros.filter((r) => r.tipo === 'compra').reduce((s, r) => s + r.valor_total, 0);
  const gastos = registros.filter((r) => r.tipo === 'gasto').reduce((s, r) => s + r.valor_total, 0);
  const balance = ventas - compras - gastos;
  const cantidadTotal = productos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const valorTotal = productos.reduce((s, p) => s + ((Number(p.cantidad) || 0) * (Number(p.valor_unitario) || 0)), 0);

  // ── Períodos ──────────────────────────────────────────────────────────────
  const hoyFecha = hoy();
  const fechaActual = new Date(`${hoyFecha}T12:00:00`);
  const inicioSemana = new Date(fechaActual);
  inicioSemana.setDate(fechaActual.getDate() - ((fechaActual.getDay() + 6) % 7));
  const periodos = {
    diario: registros.filter((r) => r.fecha === hoyFecha),
    semanal: registros.filter((r) => r.fecha >= inicioSemana.toISOString().slice(0, 10) && r.fecha <= hoyFecha),
    mensual: registros.filter((r) => r.fecha.startsWith(hoyFecha.slice(0, 7))),
    anual: registros.filter((r) => r.fecha.startsWith(hoyFecha.slice(0, 4))),
    total: registros,
  };
  const totalPorTipo = (lista: Movimiento[], tipo: Tipo) => lista.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor_total, 0);
  const listaPeriodo = periodos[periodoSeleccionado];
  const ventasPeriodo = totalPorTipo(listaPeriodo, 'venta');
  const comprasPeriodo = totalPorTipo(listaPeriodo, 'compra');
  const gastosPeriodo = totalPorTipo(listaPeriodo, 'gasto');
  const otrosPeriodo = totalPorTipo(listaPeriodo, 'otro');
  const totalSeleccionado = listaPeriodo.reduce((s, r) => s + r.valor_total, 0);

  // ── Helpers de formulario ────────────────────────────────────────────────
  function cambiar(campo: string, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function abrirNuevo() {
    setEditando(null);
    setRegistroNombre('');
    setRegistroValor('');
    setEstado('pendiente');
    setProductos([]);
    setFormulario({ nombre: '', proveedor: '', categoria: '', cantidad: '', valor_unitario: '', fecha: hoy(), tipo: 'compra', observaciones: '' });
    setPantalla('movimientos');
  }

  function abrirEdicion(registro: Movimiento) {
    setEditando(registro.id);
    setRegistroNombre(registro.nombre);
    const productosEditables = leerProductos(registro);
    setRegistroValor(String(registro.valor_registro || (productosEditables.length ? 0 : registro.valor_total)));
    setEstado(registro.estado || 'pendiente');
    setProductos(productosEditables);
    setFormulario({ ...registro, cantidad: String(registro.cantidad), valor_unitario: String(registro.valor_unitario) });
    setPantalla('movimientos');
  }

  function cambiarProducto(id: number, campo: keyof Omit<Producto, 'id'>, valor: string) {
    setProductos((actuales) => actuales.map((p) => p.id === id ? { ...p, [campo]: valor } : p));
  }

  function usarProductoGuardado(producto: ProductoGuardado) {
    if (productoSeleccionando === null) return;
    cambiarProducto(productoSeleccionando, 'nombre', producto.nombre);
    cambiarProducto(productoSeleccionando, 'valor_unitario', String(producto.precio));
    setProductoSeleccionando(null);
  }

  async function guardarProductoCatalogo() {
    const precio = Number(productoCatalogo.precio);
    if (!productoCatalogo.nombre.trim() || Number.isNaN(precio) || precio < 0) {
      Alert.alert('Revisa el producto', 'Escribe un nombre y un precio válido.');
      return;
    }
    try {
      if (productoEditando) {
        await db.runAsync('UPDATE productos SET nombre=?, precio=?, categoria=? WHERE id=?', productoCatalogo.nombre.trim(), precio, productoCatalogo.categoria.trim(), productoEditando);
      } else {
        await db.runAsync('INSERT INTO productos (nombre, precio, categoria) VALUES (?, ?, ?)', productoCatalogo.nombre.trim(), precio, productoCatalogo.categoria.trim());
      }
      setProductoCatalogo({ nombre: '', precio: '', categoria: '' });
      setProductoEditando(null);
      await cargar();
    } catch {
      Alert.alert('Producto repetido', 'Ya existe un producto con ese nombre.');
    }
  }

  function editarProductoCatalogo(producto: ProductoGuardado) {
    setProductoEditando(producto.id);
    setProductoCatalogo({ nombre: producto.nombre, precio: String(producto.precio), categoria: producto.categoria });
  }

  async function guardarCategoria() {
    const nombre = nuevaCategoria.trim();
    if (!nombre) return;
    try {
      await db.runAsync('INSERT INTO categorias (nombre) VALUES (?)', nombre);
      setNuevaCategoria('');
      await cargar();
    } catch {
      Alert.alert('Categoría repetida', 'Ya existe una categoría con ese nombre.');
    }
  }

  function eliminarCategoria(id: number) {
    Alert.alert('Eliminar categoría', 'Los productos existentes conservarán su categoría.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await db.runAsync('DELETE FROM categorias WHERE id=?', id); await cargar(); } },
    ]);
  }

  function eliminarProductoCatalogo(id: number) {
    Alert.alert('Eliminar producto', 'Se quitará del catálogo, pero no de los movimientos ya guardados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await db.runAsync('DELETE FROM productos WHERE id=?', id); await cargar(); } },
    ]);
  }

  function agregarProducto() {
    setProductos((actuales) => [...actuales, { id: Date.now(), nombre: '', cantidad: '', valor_unitario: '' }]);
  }

  function quitarProducto(id: number) {
    setProductos((actuales) => actuales.length === 1 ? actuales : actuales.filter((p) => p.id !== id));
  }

  async function guardar() {
    if (!libroActivo) {
      Alert.alert('Sin libro activo', 'Selecciona o crea un libro contable primero.');
      return;
    }
    const productosValidos = productos.filter((p) => p.nombre.trim() && Number(p.cantidad) > 0 && Number(p.valor_unitario) >= 0);
    const valorRegistro = Number(registroValor);
    if (!formulario.fecha || !registroNombre.trim() || Number.isNaN(valorRegistro) || valorRegistro < 0 || productosValidos.length !== productos.length) {
      Alert.alert('Revisa el registro', 'Escribe nombre y valor. Si agregas productos, completa cada cantidad y precio.');
      return;
    }
    const total = valorRegistro + valorTotal;
    const cantidad = productos.length ? cantidadTotal : 1;
    const unitario = productos.length ? valorTotal / cantidadTotal : valorRegistro;
    const datos = [libroActivo.id, registroNombre.trim(), '', '', cantidad, unitario, total, valorRegistro, formulario.fecha, formulario.tipo, formulario.observaciones.trim(), JSON.stringify(productosValidos), estado];
    if (editando) {
      await db.runAsync(
        'UPDATE movimientos SET libro_id=?, nombre=?, proveedor=?, categoria=?, cantidad=?, valor_unitario=?, valor_total=?, valor_registro=?, fecha=?, tipo=?, observaciones=?, productos=?, estado=? WHERE id=?',
        ...datos, editando
      );
    } else {
      await db.runAsync(
        'INSERT INTO movimientos (libro_id, nombre, proveedor, categoria, cantidad, valor_unitario, valor_total, valor_registro, fecha, tipo, observaciones, productos, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ...datos
      );
    }
    await cargar();
    setEditando(null);
    setRegistroNombre('');
    setRegistroValor('');
    setEstado('pendiente');
    setProductos([]);
    setFormulario({ nombre: '', proveedor: '', categoria: '', cantidad: '', valor_unitario: '', fecha: hoy(), tipo: 'compra', observaciones: '' });
    Alert.alert('¡Guardado!', 'El movimiento se ha registrado correctamente.');
  }

  function leerProductos(registro: Movimiento): Producto[] {
    if (Array.isArray(registro.productos)) return registro.productos;
    try {
      const guardados = JSON.parse(typeof registro.productos === 'string' ? registro.productos : '[]');
      return Array.isArray(guardados) ? guardados : [];
    } catch {
      return [];
    }
  }

  function eliminar(id: number) {
    Alert.alert('Eliminar movimiento', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await db.runAsync('DELETE FROM movimientos WHERE id=?', id); await cargar(); } },
    ]);
  }

  async function actualizarEstado(id: number, nuevoEstado: Estado) {
    await db.runAsync('UPDATE movimientos SET estado=? WHERE id=?', nuevoEstado, id);
    await cargar();
  }

  // ── LIBROS CONTABLES ─────────────────────────────────────────────────────
  async function guardarLibro() {
    const nombre = libroNombre.trim();
    if (!nombre) { Alert.alert('Nombre requerido', 'Escribe un nombre para el libro.'); return; }
    try {
      if (libroEditandoId) {
        await db.runAsync('UPDATE libros SET nombre=?, descripcion=? WHERE id=?', nombre, libroDescripcion.trim(), libroEditandoId);
      } else {
        await db.runAsync('INSERT INTO libros (nombre, descripcion, creado) VALUES (?, ?, ?)', nombre, libroDescripcion.trim(), hoy());
      }
      setLibroNombre('');
      setLibroDescripcion('');
      setLibroEditandoId(null);
      await cargar();
    } catch {
      Alert.alert('Nombre duplicado', 'Ya existe un libro con ese nombre.');
    }
  }

  function editarLibro(libro: Libro) {
    setLibroEditandoId(libro.id);
    setLibroNombre(libro.nombre);
    setLibroDescripcion(libro.descripcion);
  }

  async function confirmarEliminarLibro(libro: Libro) {
    setModalConfirmarElimLibro(null);
    const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM movimientos WHERE libro_id=?', libro.id);
    const movCount = count?.n ?? 0;
    await db.runAsync('DELETE FROM movimientos WHERE libro_id=?', libro.id);
    await db.runAsync('DELETE FROM libros WHERE id=?', libro.id);
    if (libroActivo?.id === libro.id) {
      const rows = await db.getAllAsync<Libro>('SELECT * FROM libros ORDER BY creado ASC, id ASC');
      setLibros(rows);
      setLibroActivo(rows[0] ?? null);
    }
    await cargar();
    Alert.alert('Libro eliminado', `Se eliminó "${libro.nombre}" junto con ${movCount} movimiento(s).`);
  }

  function seleccionarLibro(libro: Libro) {
    setLibroActivo(libro);
    setBusqueda('');
    setTipoFiltro('');
    setEstadoFiltro('');
    setFechaDesde('');
    setFechaHasta('');
    setModalLibros(false);
  }

  // ── EXPORTAR PDF – basado en los filtros activos ─────────────────────────
  async function exportarPdf() {
    const lista = hayFiltros ? filtrados : registros;
    if (!lista.length) {
      Alert.alert('Sin movimientos', 'No hay movimientos que coincidan con los filtros actuales.');
      return;
    }
    const ventasL = lista.filter((r) => r.tipo === 'venta').reduce((s, r) => s + r.valor_total, 0);
    const comprasL = lista.filter((r) => r.tipo === 'compra').reduce((s, r) => s + r.valor_total, 0);
    const gastosL = lista.filter((r) => r.tipo === 'gasto').reduce((s, r) => s + r.valor_total, 0);
    const otrosL = lista.filter((r) => r.tipo === 'otro').reduce((s, r) => s + r.valor_total, 0);
    const balanceL = ventasL - comprasL - gastosL;
    const descFiltros = describirFiltros(busqueda, tipoFiltro, estadoFiltro, fechaDesde, fechaHasta);
    const libroNombreStr = libroActivo?.nombre ?? 'General';

    const filas = lista.map((r) => `<tr>
      <td>${htmlSeguro(r.fecha)}</td>
      <td><strong>${htmlSeguro(r.nombre)}</strong></td>
      <td><span class="tipo ${r.tipo}">${htmlSeguro(r.tipo)}</span></td>
      <td><span class="estado ${r.estado}">${r.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></td>
      <td style="text-align:center">${htmlSeguro(r.cantidad)}</td>
      <td style="text-align:right">${htmlSeguro(dinero(r.valor_unitario))}</td>
      <td style="text-align:right"><strong>${htmlSeguro(dinero(r.valor_total))}</strong></td>
    </tr>`).join('');

    const html = `<html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e1e2f; padding: 28px; background: #fff; }
          .header { border-bottom: 2px solid #8b5cf6; padding-bottom: 14px; margin-bottom: 20px; }
          h1 { color: #6d28d9; margin: 0 0 4px 0; font-size: 26px; }
          .libro-badge { display: inline-block; background: #f5f3ff; color: #6d28d9; border: 1px solid #c4b5fd; border-radius: 6px; padding: 2px 10px; font-size: 12px; font-weight: bold; margin-bottom: 6px; }
          p { color: #64748b; margin: 0; font-size: 12px; }
          .filtros-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin: 10px 0; font-size: 11px; color: #475569; }
          .resumen { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; min-width: 130px; flex: 1; }
          .card span { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .card b { display: block; font-size: 16px; margin-top: 4px; color: #0f172a; }
          .card.balance { background: #f5f3ff; border-color: #c4b5fd; }
          .card.balance b { color: #6d28d9; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th { background: #6d28d9; color: #ffffff; text-align: left; padding: 10px 8px; font-weight: 600; }
          td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) td { background: #fbfbfe; }
          .tipo { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
          .tipo.venta { background: #d1fae5; color: #065f46; }
          .tipo.compra { background: #fee2e2; color: #991b1b; }
          .tipo.gasto { background: #fef3c7; color: #92400e; }
          .tipo.otro { background: #e0e7ff; color: #3730a3; }
          .estado { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
          .estado.pagado { color: #047857; }
          .estado.pendiente { color: #b45309; }
          .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="libro-badge">📒 ${htmlSeguro(libroNombreStr)}</div>
          <h1>LIBRO CONTABLE</h1>
          <p>Generado el ${hoy()} · ${lista.length} movimiento(s)</p>
          <div class="filtros-box">📊 Filtros aplicados: ${htmlSeguro(descFiltros)}</div>
        </div>
        <div class="resumen">
          <div class="card"><span>Ventas</span><b>${htmlSeguro(dinero(ventasL))}</b></div>
          <div class="card"><span>Compras</span><b>${htmlSeguro(dinero(comprasL))}</b></div>
          <div class="card"><span>Gastos</span><b>${htmlSeguro(dinero(gastosL))}</b></div>
          <div class="card"><span>Otros</span><b>${htmlSeguro(dinero(otrosL))}</b></div>
          <div class="card balance"><span>Balance neto</span><b>${htmlSeguro(dinero(balanceL))}</b></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Nombre</th><th>Tipo</th><th>Estado</th>
              <th style="text-align:center">Cant</th>
              <th style="text-align:right">Valor unitario</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="footer">Libro Contable · ${libroNombreStr} · ${hoy()}</div>
      </body>
    </html>`;

    try {
      const archivo = await Print.printToFileAsync({ html });
      const base64Pdf = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      const nombre = `libro-${libroNombreStr.replace(/\s+/g, '-').toLowerCase()}-${hoy()}.pdf`;
      await compartirArchivo(nombre, base64Pdf, 'application/pdf');
    } catch {
      Alert.alert('No se pudo generar el PDF', 'Intenta nuevamente desde el dispositivo.');
    }
  }

  // ── EXPORTAR EXCEL – basado en los filtros activos ───────────────────────
  async function exportarExcel() {
    const lista = hayFiltros ? filtrados : registros;
    if (!lista.length) {
      Alert.alert('Sin movimientos', 'No hay movimientos que coincidan con los filtros actuales.');
      return;
    }
    const libroNombreStr = libroActivo?.nombre ?? 'General';
    const ventasL = lista.filter((r) => r.tipo === 'venta').reduce((s, r) => s + r.valor_total, 0);
    const comprasL = lista.filter((r) => r.tipo === 'compra').reduce((s, r) => s + r.valor_total, 0);
    const gastosL = lista.filter((r) => r.tipo === 'gasto').reduce((s, r) => s + r.valor_total, 0);
    const otrosL = lista.filter((r) => r.tipo === 'otro').reduce((s, r) => s + r.valor_total, 0);

    const filasMovimientos = lista.map((r) => ({
      Fecha: r.fecha,
      Nombre: r.nombre,
      Proveedor: r.proveedor,
      'Categoría': r.categoria,
      Tipo: r.tipo,
      Estado: r.estado === 'pagado' ? 'Pagado' : 'Pendiente',
      Cantidad: r.cantidad,
      'Valor unitario': r.valor_unitario,
      Total: r.valor_total,
      Observaciones: r.observaciones,
    }));

    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(filasMovimientos);
    XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos');

    const resumen = XLSX.utils.json_to_sheet([
      { Concepto: 'Libro', Valor: libroNombreStr },
      { Concepto: 'Filtros aplicados', Valor: describirFiltros(busqueda, tipoFiltro, estadoFiltro, fechaDesde, fechaHasta) },
      { Concepto: 'Total movimientos', Valor: lista.length },
      { Concepto: 'Ventas', Valor: ventasL },
      { Concepto: 'Compras', Valor: comprasL },
      { Concepto: 'Gastos', Valor: gastosL },
      { Concepto: 'Otros', Valor: otrosL },
      { Concepto: 'Balance neto', Valor: ventasL - comprasL - gastosL },
      { Concepto: 'Fecha de exportación', Valor: hoy() },
    ]);
    XLSX.utils.book_append_sheet(libro, resumen, 'Resumen');

    const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' });
    const nombre = `libro-${libroNombreStr.replace(/\s+/g, '-').toLowerCase()}-${hoy()}.xlsx`;
    await compartirArchivo(nombre, base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  // ── IMPORTAR EXCEL ────────────────────────────────────────────────────────
  async function seleccionarEImportarExcel() {
    if (!libroActivo) {
      Alert.alert('Sin libro activo', 'Selecciona o crea un libro contable primero.');
      return;
    }
    try {
      setCargandoImportacion(true);
      const resultado = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (resultado.canceled || !resultado.assets || !resultado.assets.length) {
        setCargandoImportacion(false);
        return;
      }

      const archivo = resultado.assets[0];
      const base64 = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      const libroXLSX = XLSX.read(base64, { type: 'base64' });
      const nombreHoja = libroXLSX.SheetNames.includes('Movimientos') ? 'Movimientos' : libroXLSX.SheetNames[0];
      const hoja = libroXLSX.Sheets[nombreHoja];
      const filasCrudas = XLSX.utils.sheet_to_json<Record<string, any>>(hoja);

      if (!filasCrudas || !filasCrudas.length) {
        Alert.alert('Archivo vacío', 'No se encontraron filas con datos en este archivo de Excel.');
        setCargandoImportacion(false);
        return;
      }

      const normalizados: MovimientoImportado[] = [];
      for (const fila of filasCrudas) {
        const item = normalizarFilaExcel(fila);
        if (item) normalizados.push(item);
      }

      if (!normalizados.length) {
        Alert.alert('Formato no reconocido', 'No se pudieron identificar movimientos válidos. Asegúrate de que el Excel contenga columnas como: Nombre (o Concepto), Fecha, Tipo, Total (o Valor).');
        setCargandoImportacion(false);
        return;
      }

      setImportacionDatos({ nombre: archivo.name || 'archivo.xlsx', items: normalizados });
      setImportacionModal(true);
      setCargandoImportacion(false);
    } catch (error: any) {
      setCargandoImportacion(false);
      Alert.alert('Error al leer Excel', `Hubo un inconveniente al abrir el archivo: ${error?.message || error}`);
    }
  }

  function normalizarFilaExcel(fila: Record<string, any>): MovimientoImportado | null {
    const buscarCol = (claves: string[]) => {
      for (const [k, v] of Object.entries(fila)) {
        const limpio = k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (claves.includes(limpio) && v !== undefined && v !== null && v !== '') return v;
      }
      return null;
    };

    const nombre = String(buscarCol(['nombre', 'concepto', 'descripcion', 'item', 'titulo']) || '').trim();
    if (!nombre) return null;

    const fechaRaw = buscarCol(['fecha', 'date', 'dia']);
    let fecha = hoy();
    if (fechaRaw) {
      if (typeof fechaRaw === 'number') {
        fecha = new Date(Math.round((fechaRaw - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
      } else {
        const str = String(fechaRaw).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) fecha = str;
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
          const p = str.split('/');
          fecha = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
      }
    }

    const tipoRaw = String(buscarCol(['tipo', 'type', 'clasificacion']) || 'gasto').toLowerCase();
    let tipo: Tipo = 'gasto';
    if (tipoRaw.includes('vent') || tipoRaw.includes('ingres')) tipo = 'venta';
    else if (tipoRaw.includes('comp')) tipo = 'compra';
    else if (tipoRaw.includes('gast')) tipo = 'gasto';
    else tipo = 'otro';

    const estadoRaw = String(buscarCol(['estado', 'status']) || 'pagado').toLowerCase();
    const estadoVal: Estado = estadoRaw.includes('pend') ? 'pendiente' : 'pagado';

    const cantidad = Number(buscarCol(['cantidad', 'cant', 'qty']) || 1) || 1;
    const unitarioRaw = buscarCol(['valor unitario', 'unitario', 'precio unitario', 'precio_unitario', 'costo unitario']);
    const totalRaw = buscarCol(['total', 'valor', 'monto', 'valor_total', 'precio', 'importe']);

    let valor_total = 0, valor_unitario = 0;
    if (totalRaw !== null) {
      valor_total = Math.abs(Number(String(totalRaw).replace(/[^0-9.-]+/g, '')) || 0);
      valor_unitario = unitarioRaw !== null ? Math.abs(Number(String(unitarioRaw).replace(/[^0-9.-]+/g, '')) || 0) : (cantidad > 0 ? valor_total / cantidad : valor_total);
    } else if (unitarioRaw !== null) {
      valor_unitario = Math.abs(Number(String(unitarioRaw).replace(/[^0-9.-]+/g, '')) || 0);
      valor_total = valor_unitario * cantidad;
    }

    return {
      nombre,
      proveedor: String(buscarCol(['proveedor', 'cliente', 'tercero']) || '').trim(),
      categoria: String(buscarCol(['categoria', 'rubro', 'grupo']) || '').trim(),
      cantidad, valor_unitario, valor_total, valor_registro: valor_total,
      fecha, tipo, observaciones: String(buscarCol(['observaciones', 'notas', 'nota', 'detalle']) || '').trim(),
      estado: estadoVal,
    };
  }

  async function confirmarImportacion() {
    if (!libroActivo) return;
    try {
      const items = importacionDatos.items;
      for (const m of items) {
        await db.runAsync(
          'INSERT INTO movimientos (libro_id, nombre, proveedor, categoria, cantidad, valor_unitario, valor_total, valor_registro, fecha, tipo, observaciones, productos, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          libroActivo.id, m.nombre, m.proveedor, m.categoria, m.cantidad, m.valor_unitario, m.valor_total, m.valor_registro, m.fecha, m.tipo, m.observaciones, '[]', m.estado
        );
        if (m.categoria) {
          try { await db.runAsync('INSERT INTO categorias (nombre) VALUES (?)', m.categoria); } catch {}
        }
      }
      setImportacionModal(false);
      setImportacionDatos({ nombre: '', items: [] });
      await cargar();
      Alert.alert('¡Importación completada!', `Se agregaron ${items.length} movimientos al libro "${libroActivo.nombre}".`);
    } catch (e: any) {
      Alert.alert('Error', `No se pudieron guardar los registros importados: ${e?.message || e}`);
    }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.contenedor}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">

        {/* ── TopBar ───────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.marcaContainer}>
            <View style={styles.marcaIcono}>
              <Text style={styles.marcaIconoTexto}>❖</Text>
            </View>
            <View>
              <Text style={styles.marcaTitulo}>Libro Contable</Text>
              <Text style={styles.marcaSubtitulo}>{registros.length} movimientos</Text>
            </View>
          </View>
          {/* Selector de libro activo */}
          <Pressable style={styles.botonLibroActivo} onPress={() => setModalLibros(true)}>
            <Text style={styles.botonLibroActivoIcono}>📒</Text>
            <View>
              <Text style={styles.botonLibroActivoNombre} numberOfLines={1}>{libroActivo?.nombre ?? 'Sin libro'}</Text>
              <Text style={styles.botonLibroActivoCambiar}>Cambiar ›</Text>
            </View>
          </Pressable>
        </View>

        {/* ── RESUMEN ──────────────────────────────────────────────────── */}
        {pantalla === 'resumen' ? (
          <>
            {/* Tarjeta de Balance */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <View style={styles.pillBalance}>
                  <View style={styles.puntoMorado} />
                  <Text style={styles.pillBalanceTexto}>BALANCE DISPONIBLE</Text>
                </View>
                <Text style={styles.balanceFecha}>{hoy()}</Text>
              </View>
              <Text style={styles.balanceMonto}>{dinero(balance)}</Text>
              <Text style={styles.balanceDetalle}>📒 {libroActivo?.nombre ?? '—'}  ·  Total neto: Ventas − Compras − Gastos</Text>
              <View style={styles.balanceIndicadores}>
                <View style={styles.balanceIndicadorItem}>
                  <Text style={styles.balanceIndicadorLabel}>Ingresos</Text>
                  <Text style={styles.balanceIndicadorValorVentas}>+{dinero(ventas)}</Text>
                </View>
                <View style={styles.divisorVertical} />
                <View style={styles.balanceIndicadorItem}>
                  <Text style={styles.balanceIndicadorLabel}>Gastos & Compras</Text>
                  <Text style={styles.balanceIndicadorValorGastos}>-{dinero(compras + gastos)}</Text>
                </View>
              </View>
            </View>

            {/* Acciones rápidas */}
            <View style={styles.botonesAccionFila}>
              <Pressable style={[styles.botonAccionRapida, styles.botonAccionMorado]} onPress={abrirNuevo}>
                <Text style={styles.botonAccionIcono}>＋</Text>
                <Text style={styles.botonAccionTextoBlanco}>Nuevo</Text>
              </Pressable>
              <Pressable style={styles.botonAccionRapida} onPress={seleccionarEImportarExcel}>
                <Text style={styles.botonAccionIcono}>📥</Text>
                <Text style={styles.botonAccionTexto}>Importar</Text>
              </Pressable>
              <Pressable style={styles.botonAccionRapida} onPress={exportarPdf}>
                <Text style={styles.botonAccionIcono}>📄</Text>
                <Text style={styles.botonAccionTexto}>PDF</Text>
              </Pressable>
              <Pressable style={styles.botonAccionRapida} onPress={exportarExcel}>
                <Text style={styles.botonAccionIcono}>📊</Text>
                <Text style={styles.botonAccionTexto}>Excel</Text>
              </Pressable>
            </View>

            {/* Métricas generales */}
            <Text style={styles.seccionTitulo}>Métricas Totales</Text>
            <View style={styles.grid}>
              <TarjetaMetrica titulo="Ventas" valor={ventas} color={COLORES.verde} badge="+" />
              <TarjetaMetrica titulo="Compras" valor={compras} color="#F97316" badge="-" />
              <TarjetaMetrica titulo="Gastos" valor={gastos} color={COLORES.rojo} badge="-" />
              <TarjetaMetrica titulo="Movimiento Bruto" valor={ventas + compras + gastos} color={COLORES.moradoClaro} />
            </View>

            {/* Selector período */}
            <View style={styles.seccionHeader}>
              <Text style={styles.seccionTitulo}>Resumen por periodo</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
              {(['diario', 'semanal', 'mensual', 'anual', 'total'] as Periodo[]).map((periodo) => (
                <Pressable
                  key={periodo}
                  onPress={() => setPeriodoSeleccionado(periodo)}
                  style={[styles.pill, periodoSeleccionado === periodo && styles.pillActivo]}
                >
                  <Text style={periodoSeleccionado === periodo ? styles.textoPillActivo : styles.textoPill}>
                    {periodo === 'diario' ? 'Hoy' : periodo === 'semanal' ? 'Esta Semana' : periodo === 'mensual' ? 'Este Mes' : periodo === 'anual' ? 'Este Año' : 'Histórico'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.grid}>
              <TarjetaMetrica titulo="Ventas" valor={ventasPeriodo} color={COLORES.verde} />
              <TarjetaMetrica titulo="Compras" valor={comprasPeriodo} color="#F97316" />
              <TarjetaMetrica titulo="Gastos" valor={gastosPeriodo} color={COLORES.rojo} />
              <TarjetaMetrica titulo="Otros" valor={otrosPeriodo} color={COLORES.azul} />
              <TarjetaMetrica titulo="Total Periodo" valor={totalSeleccionado} color={COLORES.moradoClaro} />
            </View>

            {/* Últimos movimientos */}
            <View style={styles.seccionHeader}>
              <Text style={styles.seccionTitulo}>Últimos movimientos</Text>
              <Pressable onPress={() => setPantalla('tabla')}>
                <Text style={styles.linkVerTodos}>Ver todos ›</Text>
              </Pressable>
            </View>
            {registros.slice(0, 5).map((registro) => (
              <MovimientoCard key={registro.id} registro={registro} onEdit={abrirEdicion} onDelete={eliminar} onStatus={actualizarEstado} />
            ))}
            {!registros.length && <Vacio texto="Aún no tienes movimientos en este libro. Comienza agregando uno o importa un Excel." />}

            {/* Info exportación */}
            <View style={styles.contenedorExportInfo}>
              <Text style={styles.exportInfoTitulo}>📤 Exportar libro</Text>
              <Text style={styles.exportInfoSub}>
                Desde la pantalla <Text style={{ color: COLORES.moradoClaro }}>Tabla</Text> puedes aplicar filtros (tipo, estado, fechas, búsqueda) y el PDF/Excel se generará solo con esos registros.
              </Text>
              <View style={styles.dosColumnas}>
                <Boton texto="📄 Exportar PDF" onPress={exportarPdf} principal />
                <Boton texto="📊 Exportar Excel" onPress={exportarExcel} secundario />
              </View>
            </View>
          </>
        ) : pantalla === 'tabla' ? (
          /* ── TABLA Y FILTROS ─────────────────────────────────────────── */
          <>
            <Text style={styles.pantallaTitulo}>Movimientos</Text>
            <Text style={styles.subtituloTabla}>Filtra registros y exporta solo lo que necesitas.</Text>

            {/* Búsqueda */}
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nombre, observaciones..."
                placeholderTextColor={COLORES.textoMuted}
                value={busqueda}
                onChangeText={setBusqueda}
              />
              {!!busqueda && (
                <Pressable onPress={() => setBusqueda('')} style={styles.clearSearch}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              )}
            </View>

            {/* Fechas */}
            <View style={styles.dosColumnas}>
              <View style={styles.columna}><Campo etiqueta="Desde (AAAA-MM-DD)" valor={fechaDesde} cambiar={setFechaDesde} /></View>
              <View style={styles.columna}><Campo etiqueta="Hasta (AAAA-MM-DD)" valor={fechaHasta} cambiar={setFechaHasta} /></View>
            </View>

            {/* Tipo */}
            <Text style={styles.filtroTitulo}>Tipo de transacción</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
              {(['', 'compra', 'venta', 'gasto', 'otro'] as const).map((tipo) => (
                <Pressable key={tipo || 'todos'} onPress={() => setTipoFiltro(tipo)} style={[styles.pill, tipoFiltro === tipo && styles.pillActivo]}>
                  <Text style={tipoFiltro === tipo ? styles.textoPillActivo : styles.textoPill}>{tipo ? tipo.toUpperCase() : 'TODOS'}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Estado */}
            <Text style={styles.filtroTitulo}>Estado de pago</Text>
            <View style={styles.pillsFila}>
              {(['', 'pendiente', 'pagado'] as const).map((est) => (
                <Pressable key={est || 'todos-est'} onPress={() => setEstadoFiltro(est)} style={[styles.pill, estadoFiltro === est && styles.pillActivo]}>
                  <Text style={estadoFiltro === est ? styles.textoPillActivo : styles.textoPill}>{est ? est.toUpperCase() : 'TODOS'}</Text>
                </Pressable>
              ))}
            </View>

            {/* Acciones de filtro */}
            <View style={styles.dosColumnas}>
              <Boton texto="Limpiar filtros" onPress={() => { setBusqueda(''); setTipoFiltro(''); setEstadoFiltro(''); setFechaDesde(''); setFechaHasta(''); }} secundario />
              <Boton texto="📥 Importar Excel" onPress={seleccionarEImportarExcel} principal />
            </View>

            {/* Indicador de exportación filtrada */}
            {hayFiltros && (
              <View style={styles.filtroExportBanner}>
                <Text style={styles.filtroExportTexto}>
                  📤 El PDF/Excel se exportará con los <Text style={{ color: COLORES.moradoClaro, fontWeight: '800' }}>{filtrados.length}</Text> registros filtrados
                </Text>
                <View style={styles.dosColumnas}>
                  <Boton texto="📄 PDF filtrado" onPress={exportarPdf} principal />
                  <Boton texto="📊 Excel filtrado" onPress={exportarExcel} secundario />
                </View>
              </View>
            )}

            <Text style={styles.contadorResultados}>{filtrados.length} movimientos encontrados</Text>

            {filtrados.map((registro) => (
              <MovimientoCard
                key={registro.id}
                registro={registro}
                onEdit={abrirEdicion}
                onDelete={eliminar}
                onStatus={actualizarEstado}
                mostrarDetalles
                detalleAbierto={detalleAbierto === registro.id}
                onToggleDetalle={() => setDetalleAbierto(detalleAbierto === registro.id ? null : registro.id)}
              />
            ))}
            {!filtrados.length && <Vacio texto="No se encontraron movimientos con los filtros seleccionados." />}
          </>
        ) : pantalla === 'libros' ? (
          /* ── LIBROS CONTABLES ────────────────────────────────────────── */
          <>
            <Text style={styles.pantallaTitulo}>Libros Contables</Text>
            <Text style={styles.subtituloTabla}>Organiza tus registros en diferentes libros separados.</Text>

            {/* Formulario nuevo/editar libro */}
            <View style={styles.tarjetaFormulario}>
              <Text style={styles.tarjetaFormularioTitulo}>{libroEditandoId ? 'Editar Libro' : 'Nuevo Libro'}</Text>
              <Campo etiqueta="Nombre del libro" valor={libroNombre} cambiar={setLibroNombre} />
              <Campo etiqueta="Descripción (opcional)" valor={libroDescripcion} cambiar={setLibroDescripcion} multiline />
              <View style={styles.dosColumnas}>
                <Boton texto={libroEditandoId ? 'Guardar Cambios' : 'Crear Libro'} onPress={guardarLibro} principal />
                <Boton texto="Limpiar" onPress={() => { setLibroNombre(''); setLibroDescripcion(''); setLibroEditandoId(null); }} secundario />
              </View>
            </View>

            {/* Lista de libros */}
            <Text style={styles.seccionTitulo}>Mis Libros ({libros.length})</Text>
            {libros.map((libro) => (
              <View key={libro.id} style={[styles.libroCard, libroActivo?.id === libro.id && styles.libroCardActivo]}>
                <View style={styles.libroCardTop}>
                  <View style={styles.libroIconoWrap}>
                    <Text style={styles.libroIcono}>📒</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.libroCardNombre}>{libro.nombre}</Text>
                      {libroActivo?.id === libro.id && (
                        <View style={styles.libroActivoBadge}><Text style={styles.libroActivoBadgeTexto}>ACTIVO</Text></View>
                      )}
                    </View>
                    {!!libro.descripcion && <Text style={styles.libroCardDesc} numberOfLines={1}>{libro.descripcion}</Text>}
                    <Text style={styles.libroCardFecha}>Creado: {libro.creado}</Text>
                  </View>
                </View>
                <View style={styles.libroAcciones}>
                  <Pressable style={styles.libroBotonSeleccionar} onPress={() => seleccionarLibro(libro)}>
                    <Text style={styles.libroBotonSeleccionarTexto}>{libroActivo?.id === libro.id ? '✓ Activo' : 'Seleccionar'}</Text>
                  </Pressable>
                  <Pressable style={styles.botonEditarPill} onPress={() => editarLibro(libro)}>
                    <Text style={styles.botonEditarPillTexto}>Editar</Text>
                  </Pressable>
                  {libros.length > 1 && (
                    <Pressable style={styles.botonBorrarPill} onPress={() => setModalConfirmarElimLibro(libro)}>
                      <Text style={styles.botonBorrarPillTexto}>Eliminar</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
            {!libros.length && <Vacio texto="No tienes libros contables. Crea el primero." />}
          </>
        ) : pantalla === 'productos' ? (
          /* ── PRODUCTOS Y CATÁLOGO ────────────────────────────────────── */
          <>
            <Text style={styles.pantallaTitulo}>Catálogo de Productos</Text>
            <Text style={styles.subtituloTabla}>Guarda productos frecuentes para agregarlos rápido a tus registros.</Text>

            <View style={styles.tarjetaFormulario}>
              <Text style={styles.tarjetaFormularioTitulo}>{productoEditando ? 'Editar Producto' : 'Nuevo Producto'}</Text>
              <Campo etiqueta="Nombre del producto" valor={productoCatalogo.nombre} cambiar={(v) => setProductoCatalogo((a) => ({ ...a, nombre: v }))} />
              <Campo etiqueta="Precio unitario" valor={productoCatalogo.precio} cambiar={(v) => setProductoCatalogo((a) => ({ ...a, precio: v }))} teclado="decimal-pad" />
              <Campo etiqueta="Categoría del producto" valor={productoCatalogo.categoria} cambiar={(v) => setProductoCatalogo((a) => ({ ...a, categoria: v }))} />
              {!!categorias.length && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
                  {categorias.map((cat) => (
                    <Pressable key={cat.id} onPress={() => setProductoCatalogo((a) => ({ ...a, categoria: cat.nombre }))} style={[styles.pill, productoCatalogo.categoria === cat.nombre && styles.pillActivo]}>
                      <Text style={productoCatalogo.categoria === cat.nombre ? styles.textoPillActivo : styles.textoPill}>{cat.nombre}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <View style={styles.dosColumnas}>
                <Boton texto={productoEditando ? 'Guardar Cambios' : 'Guardar Producto'} onPress={guardarProductoCatalogo} principal />
                <Boton texto="Limpiar" onPress={() => { setProductoEditando(null); setProductoCatalogo({ nombre: '', precio: '', categoria: '' }); }} secundario />
              </View>
            </View>

            <Text style={styles.seccionTitulo}>Gestionar Categorías</Text>
            <View style={styles.dosColumnas}>
              <View style={styles.columna}><Campo etiqueta="Nueva categoría" valor={nuevaCategoria} cambiar={setNuevaCategoria} /></View>
              <Boton texto="Agregar" onPress={guardarCategoria} principal />
            </View>
            <View style={styles.pillsFila}>
              {categorias.map((cat) => (
                <View key={cat.id} style={styles.categoriaBadge}>
                  <Text style={styles.categoriaBadgeTexto}>{cat.nombre}</Text>
                  <Pressable onPress={() => eliminarCategoria(cat.id)} style={styles.categoriaBadgeBorrar}>
                    <Text style={styles.categoriaBadgeBorrarTexto}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <Text style={styles.seccionTitulo}>Productos Guardados ({productosGuardados.length})</Text>
            {productosGuardados.map((prod) => (
              <View key={prod.id} style={styles.productoItemCard}>
                <View style={styles.productoItemInfo}>
                  <Text style={styles.productoItemNombre}>{prod.nombre}</Text>
                  <Text style={styles.productoItemCat}>{prod.categoria || 'Sin categoría'}</Text>
                </View>
                <View style={styles.productoItemDerecha}>
                  <Text style={styles.productoItemPrecio}>{dinero(prod.precio)}</Text>
                  <View style={styles.productoItemAcciones}>
                    <Pressable onPress={() => editarProductoCatalogo(prod)} style={styles.botonEditarPill}>
                      <Text style={styles.botonEditarPillTexto}>Editar</Text>
                    </Pressable>
                    <Pressable onPress={() => eliminarProductoCatalogo(prod.id)} style={styles.botonBorrarPill}>
                      <Text style={styles.botonBorrarPillTexto}>Borrar</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            {!productosGuardados.length && <Vacio texto="Aún no tienes productos en el catálogo." />}
          </>
        ) : (
          /* ── NUEVO / EDITAR MOVIMIENTO ───────────────────────────────── */
          <>
            <Text style={styles.pantallaTitulo}>{editando ? 'Editar Movimiento' : 'Nuevo Registro'}</Text>
            <Text style={styles.subtituloTabla}>Ingresa los datos para mantener tu contabilidad al día.</Text>

            <View style={styles.tarjetaFormulario}>
              <Campo etiqueta="Nombre o Concepto" valor={registroNombre} cambiar={setRegistroNombre} />
              <Campo etiqueta="Valor del registro o saldo" valor={registroValor} cambiar={setRegistroValor} teclado="decimal-pad" />
              <Campo etiqueta="Fecha (AAAA-MM-DD)" valor={formulario.fecha} cambiar={(v) => cambiar('fecha', v)} />

              <Text style={styles.etiquetaCampo}>Tipo de movimiento</Text>
              <View style={styles.pillsFila}>
                {(['compra', 'venta', 'gasto', 'otro'] as Tipo[]).map((tipo) => (
                  <Pressable key={tipo} onPress={() => setFormulario((a) => ({ ...a, tipo }))} style={[styles.pill, formulario.tipo === tipo && styles.pillActivo]}>
                    <Text style={formulario.tipo === tipo ? styles.textoPillActivo : styles.textoPill}>{tipo.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.etiquetaCampo}>Estado del pago</Text>
              <View style={styles.pillsFila}>
                {(['pendiente', 'pagado'] as Estado[]).map((est) => (
                  <Pressable key={est} onPress={() => setEstado(est)} style={[styles.pill, estado === est && styles.pillActivo]}>
                    <Text style={estado === est ? styles.textoPillActivo : styles.textoPill}>{est.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Campo etiqueta="Observaciones / Notas" valor={formulario.observaciones} cambiar={(v) => cambiar('observaciones', v)} multiline />

              <Text style={styles.seccionSubtitulo}>Productos secundarios (opcional)</Text>
              {productos.map((prod, index) => (
                <View key={prod.id} style={styles.subproductoCard}>
                  <View style={styles.subproductoHeader}>
                    <Text style={styles.subproductoTitulo}>Producto #{index + 1}</Text>
                    <Pressable onPress={() => quitarProducto(prod.id)}>
                      <Text style={styles.subproductoQuitar}>Quitar ✕</Text>
                    </Pressable>
                  </View>
                  <Campo etiqueta="Nombre" valor={prod.nombre} cambiar={(v) => cambiarProducto(prod.id, 'nombre', v)} />
                  <SelectorCatalogo productos={productosGuardados} onSelect={usarProductoGuardado} onOpen={() => setProductoSeleccionando(prod.id)} abierto={productoSeleccionando === prod.id} />
                  <View style={styles.dosColumnas}>
                    <View style={styles.columna}><Campo etiqueta="Cantidad" valor={prod.cantidad} cambiar={(v) => cambiarProducto(prod.id, 'cantidad', v)} teclado="decimal-pad" /></View>
                    <View style={styles.columna}><Campo etiqueta="Unitario" valor={prod.valor_unitario} cambiar={(v) => cambiarProducto(prod.id, 'valor_unitario', v)} teclado="decimal-pad" /></View>
                  </View>
                  <Text style={styles.subtotalTexto}>Subtotal: {dinero((Number(prod.cantidad) || 0) * (Number(prod.valor_unitario) || 0))}</Text>
                </View>
              ))}
              <Pressable style={styles.botonAgregarSecundario} onPress={agregarProducto}>
                <Text style={styles.botonAgregarSecundarioTexto}>＋ Agregar producto opcional</Text>
              </Pressable>
              {!!productos.length && (
                <View style={styles.totalCalculadoCard}>
                  <Text style={styles.totalCalculadoLabel}>Total acumulado:</Text>
                  <Text style={styles.totalCalculadoValor}>{dinero(Number(registroValor || 0) + valorTotal)}</Text>
                </View>
              )}
              <View style={styles.dosColumnas}>
                <Boton texto={editando ? 'Guardar Cambios' : 'Registrar Movimiento'} onPress={guardar} principal />
                <Boton texto="Limpiar" onPress={() => { setRegistroNombre(''); setRegistroValor(''); setProductos([]); setFormulario({ nombre: '', proveedor: '', categoria: '', cantidad: '', valor_unitario: '', fecha: hoy(), tipo: 'compra', observaciones: '' }); }} secundario />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Modal selector de libros ─────────────────────────────────── */}
      <Modal visible={modalLibros} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcono}><Text style={styles.modalIconoTexto}>📒</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Seleccionar Libro</Text>
                <Text style={styles.modalSubtitulo}>Toca un libro para activarlo</Text>
              </View>
              <Pressable onPress={() => setModalLibros(false)} style={styles.modalCerrar}>
                <Text style={styles.modalCerrarTexto}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340, marginBottom: 14 }}>
              {libros.map((libro) => (
                <Pressable key={libro.id} onPress={() => seleccionarLibro(libro)} style={[styles.libroSelectorItem, libroActivo?.id === libro.id && styles.libroSelectorActivo]}>
                  <Text style={styles.libroSelectorIcono}>📒</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.libroSelectorNombre}>{libro.nombre}</Text>
                    {!!libro.descripcion && <Text style={styles.libroSelectorDesc} numberOfLines={1}>{libro.descripcion}</Text>}
                  </View>
                  {libroActivo?.id === libro.id && <Text style={styles.libroSelectorCheck}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
            <Boton texto="Gestionar libros →" onPress={() => { setModalLibros(false); setPantalla('libros'); }} principal />
          </View>
        </View>
      </Modal>

      {/* ── Modal confirmación importación ───────────────────────────── */}
      <Modal visible={importacionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcono}><Text style={styles.modalIconoTexto}>📊</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Confirmar Importación</Text>
                <Text style={styles.modalSubtitulo} numberOfLines={1}>{importacionDatos.nombre}</Text>
              </View>
              <Pressable onPress={() => setImportacionModal(false)} style={styles.modalCerrar}>
                <Text style={styles.modalCerrarTexto}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.modalResumenFila}>
              <View style={styles.modalResumenBox}>
                <Text style={styles.modalResumenNumero}>{importacionDatos.items.length}</Text>
                <Text style={styles.modalResumenLabel}>Movimientos</Text>
              </View>
              <View style={styles.modalResumenBox}>
                <Text style={styles.modalResumenNumero}>{dinero(importacionDatos.items.reduce((s, it) => s + it.valor_total, 0))}</Text>
                <Text style={styles.modalResumenLabel}>Monto total</Text>
              </View>
            </View>
            {!!libroActivo && (
              <View style={styles.modalLibroDestino}>
                <Text style={styles.modalLibroDestinoTexto}>📒 Se importará al libro: <Text style={{ color: COLORES.moradoClaro, fontWeight: '800' }}>{libroActivo.nombre}</Text></Text>
              </View>
            )}
            <Text style={styles.modalPreviewTitulo}>Vista previa de registros:</Text>
            <ScrollView style={styles.modalPreviewScroll}>
              {importacionDatos.items.slice(0, 10).map((it, idx) => (
                <View key={idx} style={styles.modalPreviewFila}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalPreviewNombre} numberOfLines={1}>{it.nombre}</Text>
                    <Text style={styles.modalPreviewDetalle}>{it.fecha} · {it.tipo.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.modalPreviewValor}>{dinero(it.valor_total)}</Text>
                </View>
              ))}
              {importacionDatos.items.length > 10 && (
                <Text style={styles.modalPreviewMas}>Y {importacionDatos.items.length - 10} movimientos más...</Text>
              )}
            </ScrollView>
            <View style={styles.dosColumnas}>
              <Boton texto={`Importar ${importacionDatos.items.length}`} onPress={confirmarImportacion} principal />
              <Boton texto="Cancelar" onPress={() => setImportacionModal(false)} secundario />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal confirmación eliminar libro ────────────────────────── */}
      <Modal visible={!!modalConfirmarElimLibro} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: 280 }]}>
            <Text style={[styles.modalTitulo, { marginBottom: 10 }]}>⚠️ Eliminar libro</Text>
            <Text style={styles.modalSubtitulo}>
              ¿Estás seguro de eliminar <Text style={{ color: COLORES.blanco, fontWeight: '700' }}>"{modalConfirmarElimLibro?.nombre}"</Text>?{'\n'}
              Se eliminarán todos sus movimientos. Esta acción no se puede deshacer.
            </Text>
            <View style={[styles.dosColumnas, { marginTop: 20 }]}>
              <Boton texto="Cancelar" onPress={() => setModalConfirmarElimLibro(null)} secundario />
              <Boton texto="Eliminar" onPress={() => modalConfirmarElimLibro && confirmarEliminarLibro(modalConfirmarElimLibro)} principal />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Barra navegación inferior ────────────────────────────────── */}
      <View style={[styles.navegacion, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <NavItem icono="📊" etiqueta="Resumen" activo={pantalla === 'resumen'} onPress={() => setPantalla('resumen')} />
        <NavItem icono="＋" etiqueta="Nuevo" activo={pantalla === 'movimientos'} onPress={abrirNuevo} />
        <NavItem icono="📋" etiqueta="Tabla" activo={pantalla === 'tabla'} onPress={() => setPantalla('tabla')} />
        <NavItem icono="📒" etiqueta="Libros" activo={pantalla === 'libros'} onPress={() => setPantalla('libros')} />
        <NavItem icono="📦" etiqueta="Catálogo" activo={pantalla === 'productos'} onPress={() => setPantalla('productos')} />
      </View>
    </SafeAreaView>
  );
}

// ── Componentes modulares ─────────────────────────────────────────────────────

function TarjetaMetrica({ titulo, valor, color, badge }: { titulo: string; valor: number; color: string; badge?: string }) {
  return (
    <View style={styles.tarjetaMetrica}>
      <View style={styles.tarjetaMetricaHeader}>
        <View style={[styles.puntoColor, { backgroundColor: color }]} />
        <Text style={styles.tarjetaMetricaTitulo}>{titulo}</Text>
        {!!badge && <Text style={[styles.tarjetaMetricaBadge, { color }]}>{badge}</Text>}
      </View>
      <Text style={[styles.tarjetaMetricaValor, { color: COLORES.blanco }]}>{dinero(valor)}</Text>
    </View>
  );
}

function MovimientoCard({
  registro, onEdit, onDelete, onStatus, mostrarDetalles, detalleAbierto, onToggleDetalle,
}: {
  registro: Movimiento;
  onEdit: (r: Movimiento) => void;
  onDelete: (id: number) => void;
  onStatus: (id: number, estado: Estado) => void;
  mostrarDetalles?: boolean;
  detalleAbierto?: boolean;
  onToggleDetalle?: () => void;
}) {
  const pagado = registro.estado === 'pagado';
  const esVenta = registro.tipo === 'venta';
  const esGasto = registro.tipo === 'gasto' || registro.tipo === 'compra';

  return (
    <View style={styles.movimientoCard}>
      <View style={styles.movimientoCardTop}>
        <View style={styles.movimientoBadges}>
          <View style={[styles.badgeTipo, esVenta ? styles.badgeVenta : esGasto ? styles.badgeGasto : styles.badgeOtro]}>
            <Text style={[styles.badgeTipoTexto, esVenta ? styles.textVerde : esGasto ? styles.textRojo : styles.textMorado]}>
              {registro.tipo.toUpperCase()}
            </Text>
          </View>
          <Pressable style={[styles.badgeEstado, pagado ? styles.badgePagado : styles.badgePendiente]} onPress={() => onStatus(registro.id, pagado ? 'pendiente' : 'pagado')}>
            <Text style={[styles.badgeEstadoTexto, pagado ? styles.textVerde : styles.textAmarillo]}>
              {pagado ? '✓ PAGADO' : '⏳ PENDIENTE'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.movimientoValor, esVenta ? styles.textVerde : styles.textBlanco]}>{dinero(registro.valor_total)}</Text>
      </View>
      <Text style={styles.movimientoNombre}>{registro.nombre}</Text>
      <Text style={styles.movimientoDetalle}>{registro.fecha}{registro.proveedor ? ` · ${registro.proveedor}` : ''}{registro.categoria ? ` · ${registro.categoria}` : ''}</Text>
      {!!registro.observaciones && <Text style={styles.movimientoObservaciones} numberOfLines={2}>{registro.observaciones}</Text>}
      <View style={styles.movimientoAcciones}>
        {mostrarDetalles && (
          <Pressable onPress={onToggleDetalle} style={styles.botonInfoPill}>
            <Text style={styles.botonInfoPillTexto}>{detalleAbierto ? 'Ocultar info' : '+ Detalles'}</Text>
          </Pressable>
        )}
        <View style={styles.movimientoAccionesDerecha}>
          <Pressable onPress={() => onEdit(registro)} style={styles.botonEditarPill}>
            <Text style={styles.botonEditarPillTexto}>Editar</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(registro.id)} style={styles.botonBorrarPill}>
            <Text style={styles.botonBorrarPillTexto}>Borrar</Text>
          </Pressable>
        </View>
      </View>
      {detalleAbierto && (
        <View style={styles.movimientoDetalleBox}>
          <Text style={styles.movimientoDetalleBoxTitulo}>Detalle de productos:</Text>
          {Array.isArray(registro.productos) && (registro.productos as Producto[]).length ? (
            (registro.productos as Producto[]).map((p, idx) => (
              <Text key={p.id || idx} style={styles.movimientoDetalleItem}>
                • {p.nombre}: {p.cantidad} x {dinero(Number(p.valor_unitario))} = {dinero(Number(p.cantidad) * Number(p.valor_unitario))}
              </Text>
            ))
          ) : (
            <Text style={styles.movimientoDetalleItem}>Registro directo por {dinero(registro.valor_total)}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function Campo({ etiqueta, valor, cambiar, teclado, multiline }: { etiqueta: string; valor: string; cambiar: (v: string) => void; teclado?: any; multiline?: boolean }) {
  return (
    <View style={styles.campoContainer}>
      <Text style={styles.etiquetaCampo}>{etiqueta}</Text>
      <TextInput
        style={[styles.inputModerno, multiline && styles.inputMultilinea]}
        value={valor}
        onChangeText={cambiar}
        keyboardType={teclado}
        multiline={multiline}
        placeholderTextColor={COLORES.textoMuted}
      />
    </View>
  );
}

function Boton({ texto, onPress, principal, secundario }: { texto: string; onPress: () => void; principal?: boolean; secundario?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.boton, principal && styles.botonPrincipal, secundario && styles.botonSecundario]}>
      <Text style={[styles.textoBoton, principal && styles.textoBotonPrincipal, secundario && styles.textoBotonSecundario]}>{texto}</Text>
    </Pressable>
  );
}

function NavItem({ icono, etiqueta, activo, onPress }: { icono: string; etiqueta: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable hitSlop={12} onPress={onPress} style={styles.navItem}>
      <View style={[styles.navIconoCapsula, activo && styles.navIconoCapsulaActiva]}>
        <Text style={[styles.navIcono, activo && styles.navIconoActivo]}>{icono}</Text>
      </View>
      <Text style={[styles.navTexto, activo && styles.navTextoActivo]}>{etiqueta}</Text>
    </Pressable>
  );
}

function SelectorCatalogo({ productos, onSelect, onOpen, abierto }: { productos: ProductoGuardado[]; onSelect: (p: ProductoGuardado) => void; onOpen: () => void; abierto: boolean }) {
  return (
    <View style={styles.selectorContainer}>
      <Pressable onPress={onOpen} style={styles.selectorBoton}>
        <Text style={styles.selectorBotonTexto}>{abierto ? '▲ Ocultar catálogo rápido' : '▼ Seleccionar del catálogo'}</Text>
      </Pressable>
      {abierto && (
        <View style={styles.catalogoLista}>
          {productos.length ? productos.map((prod) => (
            <Pressable key={prod.id} onPress={() => onSelect(prod)} style={styles.catalogoItem}>
              <Text style={styles.catalogoItemNombre}>{prod.nombre}</Text>
              <Text style={styles.catalogoItemPrecio}>{dinero(prod.precio)}</Text>
            </Pressable>
          )) : <Text style={styles.catalogoVacio}>Crea productos desde la pestaña Catálogo.</Text>}
        </View>
      )}
    </View>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <View style={styles.vacioContainer}>
      <Text style={styles.vacioIcono}>📁</Text>
      <Text style={styles.vacioTexto}>{texto}</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="contabilidad.db" onInit={crearTablas}>
        <AppContenido />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORES.fondo },
  contenido: { padding: 18, paddingBottom: 130 },

  // TopBar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 6 },
  marcaContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marcaIcono: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORES.moradoFondo, borderWidth: 1, borderColor: COLORES.moradoBorde, alignItems: 'center', justifyContent: 'center' },
  marcaIconoTexto: { color: COLORES.moradoClaro, fontSize: 22, fontWeight: '900' },
  marcaTitulo: { color: COLORES.blanco, fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  marcaSubtitulo: { color: COLORES.textoSecundario, fontSize: 12, marginTop: 1 },

  // Selector libro activo en TopBar
  botonLibroActivo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORES.moradoFondo, borderWidth: 1, borderColor: COLORES.moradoBorde, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: 150 },
  botonLibroActivoIcono: { fontSize: 16 },
  botonLibroActivoNombre: { color: COLORES.blanco, fontSize: 12, fontWeight: '700', maxWidth: 90 },
  botonLibroActivoCambiar: { color: COLORES.moradoClaro, fontSize: 10, fontWeight: '600' },

  // Balance card
  balanceCard: { backgroundColor: '#1E1438', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#3D256D', marginBottom: 16, shadowColor: COLORES.morado, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pillBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(139, 92, 246, 0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  puntoMorado: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORES.moradoClaro },
  pillBalanceTexto: { color: COLORES.moradoClaro, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  balanceFecha: { color: COLORES.textoMuted, fontSize: 12 },
  balanceMonto: { color: COLORES.blanco, fontSize: 32, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
  balanceDetalle: { color: COLORES.textoSecundario, fontSize: 12, marginBottom: 16 },
  balanceIndicadores: { flexDirection: 'row', backgroundColor: 'rgba(11, 12, 22, 0.5)', borderRadius: 14, padding: 12, alignItems: 'center' },
  balanceIndicadorItem: { flex: 1, alignItems: 'center' },
  balanceIndicadorLabel: { color: COLORES.textoMuted, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  balanceIndicadorValorVentas: { color: COLORES.verde, fontSize: 15, fontWeight: '800' },
  balanceIndicadorValorGastos: { color: COLORES.rojo, fontSize: 15, fontWeight: '800' },
  divisorVertical: { width: 1, height: 26, backgroundColor: COLORES.borde },

  // Acciones rápidas
  botonesAccionFila: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  botonAccionRapida: { flex: 1, backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  botonAccionMorado: { backgroundColor: COLORES.morado, borderColor: COLORES.morado },
  botonAccionIcono: { fontSize: 16 },
  botonAccionTexto: { color: COLORES.textoSecundario, fontSize: 11, fontWeight: '700' },
  botonAccionTextoBlanco: { color: COLORES.blanco, fontSize: 11, fontWeight: '800' },

  // Secciones
  seccionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  seccionTitulo: { color: COLORES.blanco, fontSize: 18, fontWeight: '800', letterSpacing: 0.2, marginTop: 12, marginBottom: 12 },
  pantallaTitulo: { color: COLORES.blanco, fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subtituloTabla: { color: COLORES.textoSecundario, fontSize: 13, lineHeight: 18, marginBottom: 18 },
  linkVerTodos: { color: COLORES.moradoClaro, fontSize: 13, fontWeight: '700' },

  // Pills
  pillsScroll: { gap: 8, paddingBottom: 14 },
  pillsFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  pill: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  pillActivo: { backgroundColor: COLORES.morado, borderColor: COLORES.morado },
  textoPill: { color: COLORES.textoSecundario, fontSize: 12, fontWeight: '700' },
  textoPillActivo: { color: COLORES.blanco, fontSize: 12, fontWeight: '800' },

  // Grid métricas
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tarjetaMetrica: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 18, padding: 14, width: '48.5%', minHeight: 88, justifyContent: 'space-between' },
  tarjetaMetricaHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  puntoColor: { width: 8, height: 8, borderRadius: 4 },
  tarjetaMetricaTitulo: { color: COLORES.textoSecundario, fontSize: 12, fontWeight: '600', flex: 1 },
  tarjetaMetricaBadge: { fontSize: 12, fontWeight: '800' },
  tarjetaMetricaValor: { fontSize: 17, fontWeight: '800', marginTop: 8 },

  // Cards movimientos
  movimientoCard: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  movimientoCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  movimientoBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  badgeTipo: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  badgeVenta: { backgroundColor: COLORES.verdeFondo, borderWidth: 1, borderColor: COLORES.verdeBorde },
  badgeGasto: { backgroundColor: COLORES.rojoFondo, borderWidth: 1, borderColor: COLORES.rojoBorde },
  badgeOtro: { backgroundColor: COLORES.moradoFondo, borderWidth: 1, borderColor: COLORES.moradoBorde },
  badgeTipoTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeEstado: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  badgePagado: { backgroundColor: COLORES.verdeFondo },
  badgePendiente: { backgroundColor: COLORES.amarilloFondo },
  badgeEstadoTexto: { fontSize: 10, fontWeight: '800' },
  movimientoValor: { fontSize: 17, fontWeight: '900' },
  movimientoNombre: { color: COLORES.blanco, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  movimientoDetalle: { color: COLORES.textoMuted, fontSize: 12, marginBottom: 8 },
  movimientoObservaciones: { color: COLORES.textoSecundario, fontSize: 12, fontStyle: 'italic', marginBottom: 10 },
  movimientoAcciones: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  movimientoAccionesDerecha: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
  botonInfoPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: COLORES.superficie },
  botonInfoPillTexto: { color: COLORES.moradoClaro, fontSize: 11, fontWeight: '700' },
  botonEditarPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORES.moradoFondo },
  botonEditarPillTexto: { color: COLORES.moradoClaro, fontSize: 12, fontWeight: '700' },
  botonBorrarPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORES.rojoFondo, borderWidth: 1, borderColor: COLORES.rojoBorde },
  botonBorrarPillTexto: { color: COLORES.rojo, fontSize: 12, fontWeight: '700' },
  movimientoDetalleBox: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: COLORES.superficie },
  movimientoDetalleBoxTitulo: { color: COLORES.textoSecundario, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  movimientoDetalleItem: { color: COLORES.textoSecundario, fontSize: 12, paddingVertical: 2 },

  // Búsqueda
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORES.inputFondo, borderColor: COLORES.inputBorde, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, marginBottom: 14 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 46, color: COLORES.blanco, fontSize: 14 },
  clearSearch: { padding: 6 },
  clearSearchText: { color: COLORES.textoMuted, fontSize: 14, fontWeight: 'bold' },
  contadorResultados: { color: COLORES.textoMuted, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  filtroTitulo: { color: COLORES.textoSecundario, fontSize: 12, fontWeight: '700', marginBottom: 8 },

  // Banner exportación filtrada
  filtroExportBanner: { backgroundColor: COLORES.moradoFondo, borderWidth: 1, borderColor: COLORES.moradoBorde, borderRadius: 16, padding: 14, marginBottom: 14 },
  filtroExportTexto: { color: COLORES.textoSecundario, fontSize: 13, marginBottom: 10 },

  // Info exportación en resumen
  contenedorExportInfo: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 10 },
  exportInfoTitulo: { color: COLORES.blanco, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  exportInfoSub: { color: COLORES.textoSecundario, fontSize: 12, lineHeight: 18, marginBottom: 12 },

  // Formulario
  tarjetaFormulario: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 20 },
  tarjetaFormularioTitulo: { color: COLORES.blanco, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  campoContainer: { marginBottom: 14 },
  etiquetaCampo: { color: COLORES.textoSecundario, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputModerno: { backgroundColor: COLORES.inputFondo, borderColor: COLORES.inputBorde, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: COLORES.blanco, fontSize: 14 },
  inputMultilinea: { minHeight: 70, textAlignVertical: 'top' },
  dosColumnas: { flexDirection: 'row', gap: 10, marginVertical: 6 },
  columna: { flex: 1 },

  // Botones
  boton: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flex: 1 },
  botonPrincipal: { backgroundColor: COLORES.morado },
  botonSecundario: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.morado, borderWidth: 1 },
  textoBoton: { fontSize: 14, fontWeight: '700' },
  textoBotonPrincipal: { color: COLORES.blanco },
  textoBotonSecundario: { color: COLORES.moradoClaro },

  // Subproductos
  seccionSubtitulo: { color: COLORES.moradoClaro, fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  subproductoCard: { backgroundColor: COLORES.superficie, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  subproductoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subproductoTitulo: { color: COLORES.blanco, fontWeight: '700', fontSize: 13 },
  subproductoQuitar: { color: COLORES.rojo, fontSize: 12, fontWeight: '700' },
  subtotalTexto: { color: COLORES.moradoClaro, fontWeight: '700', fontSize: 12, textAlign: 'right', marginTop: 4 },
  botonAgregarSecundario: { borderColor: COLORES.moradoBorde, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  botonAgregarSecundarioTexto: { color: COLORES.moradoClaro, fontWeight: '700', fontSize: 13 },
  totalCalculadoCard: { backgroundColor: COLORES.moradoFondo, borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalCalculadoLabel: { color: COLORES.blanco, fontWeight: '700' },
  totalCalculadoValor: { color: COLORES.moradoClaro, fontWeight: '900', fontSize: 18 },

  // Selector catálogo
  selectorContainer: { marginBottom: 10 },
  selectorBoton: { borderColor: COLORES.moradoBorde, borderWidth: 1, borderRadius: 10, padding: 9, alignItems: 'center' },
  selectorBotonTexto: { color: COLORES.moradoClaro, fontSize: 12, fontWeight: '700' },
  catalogoLista: { backgroundColor: COLORES.superficie, borderRadius: 10, marginTop: 6, padding: 6 },
  catalogoItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: COLORES.borde },
  catalogoItemNombre: { color: COLORES.blanco, fontSize: 13, fontWeight: '600' },
  catalogoItemPrecio: { color: COLORES.verde, fontSize: 13, fontWeight: '700' },
  catalogoVacio: { color: COLORES.textoMuted, fontSize: 12, textAlign: 'center', padding: 8 },

  // Categorías
  categoriaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORES.moradoFondo, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, borderColor: COLORES.moradoBorde, borderWidth: 1 },
  categoriaBadgeTexto: { color: COLORES.moradoClaro, fontSize: 12, fontWeight: '700' },
  categoriaBadgeBorrar: { paddingHorizontal: 4 },
  categoriaBadgeBorrarTexto: { color: COLORES.rojo, fontSize: 16, fontWeight: '800' },

  // Productos catálogo
  productoItemCard: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productoItemInfo: { flex: 1 },
  productoItemNombre: { color: COLORES.blanco, fontSize: 15, fontWeight: '700' },
  productoItemCat: { color: COLORES.textoMuted, fontSize: 12, marginTop: 2 },
  productoItemDerecha: { alignItems: 'flex-end', gap: 6 },
  productoItemPrecio: { color: COLORES.moradoClaro, fontSize: 16, fontWeight: '800' },
  productoItemAcciones: { flexDirection: 'row', gap: 8 },

  // Cards de libros
  libroCard: { backgroundColor: COLORES.tarjeta, borderColor: COLORES.borde, borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 12 },
  libroCardActivo: { borderColor: COLORES.morado, borderWidth: 2 },
  libroCardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  libroIconoWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORES.moradoFondo, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORES.moradoBorde },
  libroIcono: { fontSize: 20 },
  libroCardNombre: { color: COLORES.blanco, fontSize: 16, fontWeight: '800' },
  libroCardDesc: { color: COLORES.textoMuted, fontSize: 12, marginTop: 2 },
  libroCardFecha: { color: COLORES.textoMuted, fontSize: 11, marginTop: 4 },
  libroActivoBadge: { backgroundColor: COLORES.morado, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  libroActivoBadgeTexto: { color: COLORES.blanco, fontSize: 10, fontWeight: '800' },
  libroAcciones: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  libroBotonSeleccionar: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, backgroundColor: COLORES.moradoFondo, borderWidth: 1, borderColor: COLORES.moradoBorde },
  libroBotonSeleccionarTexto: { color: COLORES.moradoClaro, fontSize: 12, fontWeight: '700' },

  // Modal selector libros items
  libroSelectorItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: COLORES.tarjeta, borderWidth: 1, borderColor: COLORES.borde },
  libroSelectorActivo: { borderColor: COLORES.morado, backgroundColor: COLORES.moradoFondo },
  libroSelectorIcono: { fontSize: 20 },
  libroSelectorNombre: { color: COLORES.blanco, fontSize: 15, fontWeight: '700' },
  libroSelectorDesc: { color: COLORES.textoMuted, fontSize: 12, marginTop: 2 },
  libroSelectorCheck: { color: COLORES.moradoClaro, fontSize: 18, fontWeight: '900' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORES.superficie, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, borderWidth: 1, borderColor: COLORES.borde, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalIcono: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORES.moradoFondo, alignItems: 'center', justifyContent: 'center' },
  modalIconoTexto: { fontSize: 20 },
  modalTitulo: { color: COLORES.blanco, fontSize: 18, fontWeight: '800' },
  modalSubtitulo: { color: COLORES.textoMuted, fontSize: 12 },
  modalCerrar: { padding: 8 },
  modalCerrarTexto: { color: COLORES.textoMuted, fontSize: 18, fontWeight: 'bold' },
  modalResumenFila: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modalResumenBox: { flex: 1, backgroundColor: COLORES.tarjeta, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORES.borde, alignItems: 'center' },
  modalResumenNumero: { color: COLORES.moradoClaro, fontSize: 17, fontWeight: '900' },
  modalResumenLabel: { color: COLORES.textoMuted, fontSize: 11, marginTop: 2 },
  modalLibroDestino: { backgroundColor: COLORES.moradoFondo, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORES.moradoBorde },
  modalLibroDestinoTexto: { color: COLORES.textoSecundario, fontSize: 13 },
  modalPreviewTitulo: { color: COLORES.textoSecundario, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  modalPreviewScroll: { maxHeight: 220, marginBottom: 16 },
  modalPreviewFila: { backgroundColor: COLORES.tarjeta, borderRadius: 12, padding: 10, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalPreviewNombre: { color: COLORES.blanco, fontSize: 13, fontWeight: '700' },
  modalPreviewDetalle: { color: COLORES.textoMuted, fontSize: 11, marginTop: 2 },
  modalPreviewValor: { color: COLORES.moradoClaro, fontSize: 13, fontWeight: '800' },
  modalPreviewMas: { color: COLORES.textoMuted, fontSize: 12, textAlign: 'center', marginVertical: 8, fontStyle: 'italic' },

  // NavBar
  navegacion: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORES.superficie, borderTopColor: COLORES.borde, borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'space-around', shadowColor: '#000', shadowOpacity: 0.3, shadowOffset: { width: 0, height: -4 }, shadowRadius: 10, elevation: 8 },
  navItem: { alignItems: 'center', minWidth: 56, gap: 2 },
  navIconoCapsula: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 14 },
  navIconoCapsulaActiva: { backgroundColor: COLORES.moradoFondo },
  navIcono: { fontSize: 18, color: COLORES.textoMuted },
  navIconoActivo: { color: COLORES.moradoClaro },
  navTexto: { color: COLORES.textoMuted, fontSize: 10, fontWeight: '600' },
  navTextoActivo: { color: COLORES.moradoClaro, fontWeight: '800' },

  // Estado vacío
  vacioContainer: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  vacioIcono: { fontSize: 36 },
  vacioTexto: { color: COLORES.textoMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },

  // Colores de texto
  textBlanco: { color: COLORES.blanco },
  textVerde: { color: COLORES.verde },
  textRojo: { color: COLORES.rojo },
  textMorado: { color: COLORES.moradoClaro },
  textAmarillo: { color: COLORES.amarillo },
});
