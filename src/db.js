// Conexión a la base de datos SQLite. Todo se guarda en un único archivo: data/contabilidad.db
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const carpetaDatos = path.join(__dirname, '..', 'data');
fs.mkdirSync(carpetaDatos, { recursive: true });

const db = new Database(path.join(carpetaDatos, 'contabilidad.db'));
db.pragma('journal_mode = WAL');

// "IF NOT EXISTS" hace que esto sea seguro de ejecutar cada vez que arranca la app.
db.exec(`
  CREATE TABLE IF NOT EXISTS movimientos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    proveedor       TEXT    NOT NULL DEFAULT '',
    categoria       TEXT    NOT NULL DEFAULT '',
    cantidad        REAL    NOT NULL CHECK (cantidad > 0),
    valor_unitario  REAL    NOT NULL CHECK (valor_unitario >= 0),
    valor_total     REAL    NOT NULL,
    fecha           TEXT    NOT NULL,  -- formato AAAA-MM-DD
    tipo            TEXT    NOT NULL CHECK (tipo IN ('compra', 'venta', 'gasto', 'otro')),
    observaciones   TEXT    NOT NULL DEFAULT '',
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos (fecha);
  CREATE INDEX IF NOT EXISTS idx_movimientos_tipo  ON movimientos (tipo);
`);

module.exports = db;
