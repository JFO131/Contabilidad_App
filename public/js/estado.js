// Datos que comparten las distintas pantallas: los filtros actuales y los registros cargados.

export const filtrosVacios = () => ({
  buscar: '',
  tipo: '',
  categoria: '',
  desde: '',
  hasta: '',
  orden: 'fecha',
  dir: 'desc',
});

export const estado = {
  filtros: filtrosVacios(),
  registros: [],
  totales: null,
  categorias: [],
};
