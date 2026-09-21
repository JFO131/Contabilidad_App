// Rutas para agregar, consultar, editar y eliminar movimientos.
const express = require('express');
const { validarMovimiento } = require('../validacion');
const servicio = require('../servicios/movimientosServicio');

const router = express.Router();

const respuestaErrores = (errores) => ({ mensaje: 'Revisa los campos marcados.', errores });

function leerId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ mensaje: 'El identificador no es válido.' });
    return null;
  }
  return id;
}

// Consultar (con búsqueda, filtros y orden): GET /api/movimientos?buscar=...&tipo=venta&orden=fecha&dir=desc
router.get('/', (req, res) => {
  res.json(servicio.listar(req.query));
});

// Categorías ya usadas (para el filtro y las sugerencias del formulario).
router.get('/categorias', (req, res) => {
  res.json(servicio.listarCategorias());
});

// Agregar
router.post('/', (req, res) => {
  const { errores, valores } = validarMovimiento(req.body);
  if (Object.keys(errores).length) return res.status(400).json(respuestaErrores(errores));
  res.status(201).json(servicio.crear(valores));
});

// Editar
router.put('/:id', (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;

  const { errores, valores } = validarMovimiento(req.body);
  if (Object.keys(errores).length) return res.status(400).json(respuestaErrores(errores));

  const actualizado = servicio.actualizar(id, valores);
  if (!actualizado) return res.status(404).json({ mensaje: 'El registro no existe.' });
  res.json(actualizado);
});

// Eliminar
router.delete('/:id', (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;

  if (!servicio.eliminar(id)) return res.status(404).json({ mensaje: 'El registro no existe.' });
  res.status(204).end();
});

module.exports = router;
