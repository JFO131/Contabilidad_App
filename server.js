// Punto de entrada: crea el servidor web y conecta todas las piezas.
const path = require('path');
const express = require('express');

require('./src/db'); // Al importarlo se crea la base de datos y la tabla si no existen.
const movimientosRutas = require('./src/rutas/movimientosRutas');
const resumenRutas = require('./src/rutas/resumenRutas');
const exportarRutas = require('./src/rutas/exportarRutas');

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(express.json());

// API: cada grupo de rutas vive en su propio archivo.
app.use('/api/movimientos', movimientosRutas);
app.use('/api/resumen', resumenRutas);
app.use('/api/exportar', exportarRutas);
app.use('/api', (req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }));

// Librerías del navegador (se sirven desde node_modules, así la app funciona sin internet).
const modulos = path.join(__dirname, 'node_modules');
app.use('/libs/chart', express.static(path.join(modulos, 'chart.js', 'dist')));
app.use('/libs/jspdf', express.static(path.join(modulos, 'jspdf', 'dist')));
app.use('/libs/jspdf-autotable', express.static(path.join(modulos, 'jspdf-autotable', 'dist')));

// Interfaz (HTML, CSS y JavaScript del navegador).
app.use(express.static(path.join(__dirname, 'public')));

// Si algo falla en el servidor, respondemos con un mensaje claro en vez de romper la app.
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ mensaje: 'Ocurrió un error en el servidor.' });
});

app.listen(PUERTO, () => {
  console.log(`Libro Contable funcionando en http://localhost:${PUERTO}`);
});
