// Ruta con los datos del dashboard.
const express = require('express');
const { obtenerResumen } = require('../servicios/resumenServicio');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(obtenerResumen());
});

module.exports = router;
