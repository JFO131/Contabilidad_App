// Rutas para gestionar productos del inventario, ajustes manuales e historial.
const express = require('express');
const { validarProducto, validarAjusteInventario } = require('../validacion');
const servicio = require('../servicios/inventarioServicio');

const router = express.Router();

const respuestaErrores = (errores) => ({ mensaje: 'Revisa los campos marcados.', errores });

function leerId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ mensaje: 'El identificador del producto no es válido.' });
    return null;
  }
  return id;
}

// Listar inventario con búsqueda, filtros, orden y resumen: GET /api/inventario
router.get('/', (req, res) => {
  res.json(servicio.listar(req.query));
});

// Lista liviana para selectores del formulario de movimientos: GET /api/inventario/productos
router.get('/productos', (req, res) => {
  res.json(servicio.listarCatalogoSimple());
});

// Obtener un producto: GET /api/inventario/:id
router.get('/:id', (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;

  const producto = servicio.obtener(id);
  if (!producto) return res.status(404).json({ mensaje: 'El producto no existe.' });
  res.json(producto);
});

// Historial de entradas y salidas de un producto: GET /api/inventario/:id/historial
router.get('/:id/historial', (req, res) => {
  const id = leerId(req, res);
  if (id === null) return;

  const historial = servicio.obtenerHistorial(id);
  if (!historial) return res.status(404).json({ mensaje: 'El producto no existe.' });
  res.json(historial);
});

// Crear producto: POST /api/inventario
router.post('/', (req, res, next) => {
  const { errores, valores } = validarProducto(req.body);
  if (Object.keys(errores).length) return res.status(400).json(respuestaErrores(errores));

  try {
    res.status(201).json(servicio.crear(valores));
  } catch (error) {
    next(error);
  }
});

// Actualizar producto: PUT /api/inventario/:id
router.put('/:id', (req, res, next) => {
  const id = leerId(req, res);
  if (id === null) return;

  const { errores, valores } = validarProducto(req.body);
  if (Object.keys(errores).length) return res.status(400).json(respuestaErrores(errores));

  try {
    const actualizado = servicio.actualizar(id, valores);
    if (!actualizado) return res.status(404).json({ mensaje: 'El producto no existe.' });
    res.json(actualizado);
  } catch (error) {
    next(error);
  }
});

// Eliminar producto: DELETE /api/inventario/:id
router.delete('/:id', (req, res, next) => {
  const id = leerId(req, res);
  if (id === null) return;

  try {
    if (!servicio.eliminar(id)) return res.status(404).json({ mensaje: 'El producto no existe.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Registrar entrada o salida manual: POST /api/inventario/:id/ajuste
router.post('/:id/ajuste', (req, res, next) => {
  const id = leerId(req, res);
  if (id === null) return;

  const { errores, valores } = validarAjusteInventario(req.body);
  if (Object.keys(errores).length) return res.status(400).json(respuestaErrores(errores));

  try {
    const resultado = servicio.registrarAjuste(id, valores);
    if (!resultado) return res.status(404).json({ mensaje: 'El producto no existe.' });
    res.status(201).json(resultado);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
