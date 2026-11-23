// Conexión a la base de datos SQLite. Todo se guarda en un único archivo: data/contabilidad.db
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const carpetaDatos = path.join(__dirname, '..', 'data');
fs.mkdirSync(carpetaDatos, { recursive: true });

const db = new Database(path.join(carpetaDatos, 'contabilidad.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// "IF NOT EXISTS" hace que esto sea seguro de ejecutar cada vez que arranca la app.
db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    categoria         TEXT    NOT NULL DEFAULT '',
    proveedor         TEXT    NOT NULL DEFAULT '',
    cantidad_inicial  REAL    NOT NULL DEFAULT 0 CHECK (cantidad_inicial >= 0),
    cantidad_actual   REAL    NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
    stock_minimo      REAL    NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    valor_unitario    REAL    NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
    creado_en         TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movimientos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre            TEXT    NOT NULL,
    proveedor         TEXT    NOT NULL DEFAULT '',
    categoria         TEXT    NOT NULL DEFAULT '',
    cantidad          REAL    NOT NULL CHECK (cantidad > 0),
    valor_unitario    REAL    NOT NULL CHECK (valor_unitario >= 0),
    valor_total       REAL    NOT NULL,
    fecha             TEXT    NOT NULL,  -- formato AAAA-MM-DD
    tipo              TEXT    NOT NULL CHECK (tipo IN ('compra', 'venta', 'gasto', 'otro')),
    observaciones     TEXT    NOT NULL DEFAULT '',
    producto_id       INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    afecta_inventario INTEGER NOT NULL DEFAULT 0 CHECK (afecta_inventario IN (0, 1)),
    creado_en         TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    movimiento_id   INTEGER REFERENCES movimientos(id) ON DELETE CASCADE,
    tipo            TEXT    NOT NULL CHECK (tipo IN ('entrada', 'salida')),
    origen          TEXT    NOT NULL CHECK (origen IN ('compra', 'venta', 'gasto', 'otro', 'ajuste_manual')),
    cantidad        REAL    NOT NULL CHECK (cantidad > 0),
    motivo          TEXT    NOT NULL DEFAULT '',
    fecha           TEXT    NOT NULL,
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos (fecha);
  CREATE INDEX IF NOT EXISTS idx_movimientos_tipo  ON movimientos (tipo);
  CREATE INDEX IF NOT EXISTS idx_inv_mov_producto   ON inventario_movimientos (producto_id);
  CREATE INDEX IF NOT EXISTS idx_inv_mov_movimiento ON inventario_movimientos (movimiento_id);
  CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha      ON inventario_movimientos (fecha);
`);

// Migraciones seguras para bases de datos creadas antes del módulo de inventario.
const columnasMovimientos = db.prepare('PRAGMA table_info(movimientos)').all().map((c) => c.name);
if (!columnasMovimientos.includes('producto_id')) {
  db.exec('ALTER TABLE movimientos ADD COLUMN producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL');
}
if (!columnasMovimientos.includes('afecta_inventario')) {
  db.exec('ALTER TABLE movimientos ADD COLUMN afecta_inventario INTEGER NOT NULL DEFAULT 0 CHECK (afecta_inventario IN (0, 1))');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos (producto_id)');

module.exports = db;
