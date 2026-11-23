// Datos que comparten las distintas pantallas: filtros, registros e inventario cargados.

export const filtrosVacios = () => ({
  buscar: '',
  tipo: '',
  categoria: '',
  desde: '',
  hasta: '',
  orden: 'fecha',
  dir: 'desc',
});

export const filtrosInventarioVacios = () => ({
  buscar: '',
  categoria: '',
  proveedor: '',
  estado: '',
  orden: 'nombre',
  dir: 'asc',
});

export const estado = {
  filtros: filtrosVacios(),
  registros: [],
  totales: null,
  categorias: [],

  filtrosInventario: filtrosInventarioVacios(),
  productos: [],
  catalogoProductos: [],
  resumenInventario: null,
  totalesInventario: null,
  opcionesInventario: { categorias: [], proveedores: [] },
};
