# Libro Contable

Aplicación de contabilidad sencilla para registrar compras, ventas, gastos y otros movimientos, verlos en una tabla tipo Excel, consultar un dashboard y exportar todo a **Excel (.xlsx)** o **PDF**.

- **Servidor:** Node.js + Express
- **Base de datos:** SQLite (un solo archivo, sin instalar nada extra)
- **Interfaz:** HTML + CSS + JavaScript puro (sin frameworks)
- **Librerías:** ExcelJS (Excel), jsPDF + AutoTable (PDF), Chart.js (gráficos)

---

## 1. Cómo ejecutar la aplicación

Necesitas tener instalado [Node.js](https://nodejs.org) versión 20 o superior (se recomienda la LTS).

```bash
npm install        # instala las dependencias (solo la primera vez)
npm start          # enciende el servidor
```

Abre el navegador en **http://localhost:3000**.

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm start` | Enciende la app |
| `npm run dev` | Enciende la app y la reinicia sola cuando cambias un archivo del servidor |
| `npm run ejemplo` | Carga 14 registros de ejemplo (solo si la base de datos está vacía) |

**Verla desde el celular:** con el computador y el celular en la misma red WiFi, abre `http://IP-DEL-COMPUTADOR:3000` en el celular.

**Copia de seguridad:** todos tus datos están en `data/contabilidad.db`. Copia ese archivo y ya tienes un respaldo.

---

## 2. Cómo está organizada la aplicación

Piensa en la app como un restaurante: el **navegador** es el comedor (lo que ve el cliente), el **servidor** es la cocina y la **base de datos** es la despensa. El cliente nunca entra a la despensa: le pide al mesero (la **API**) y este va a la cocina.

```
libro-contable/
├── server.js                  Enciende el servidor y conecta todo
├── package.json               Lista de dependencias y comandos
├── data/contabilidad.db       La base de datos (se crea sola)
├── scripts/
│   └── datosEjemplo.js        Carga datos de prueba
├── src/                       ── COCINA (servidor) ──
│   ├── db.js                  Abre la base de datos y crea la tabla
│   ├── validacion.js          Revisa los datos y calcula el valor total
│   ├── filtros.js             Convierte búsqueda/filtros/orden en SQL
│   ├── rutas/                 Las "puertas" de la API
│   │   ├── movimientosRutas.js   Agregar, consultar, editar, eliminar
│   │   ├── resumenRutas.js       Datos del dashboard
│   │   └── exportarRutas.js      Descarga del Excel
│   └── servicios/             La lógica real
│       ├── movimientosServicio.js  Consultas a la base de datos
│       ├── resumenServicio.js      Cálculos del dashboard
│       └── excelServicio.js        Construcción del archivo .xlsx
└── public/                    ── COMEDOR (navegador) ──
    ├── index.html             Estructura de la pantalla
    ├── css/estilos.css        Colores, tamaños y diseño responsive
    └── js/
        ├── main.js            Arranque y cambio entre Dashboard/Registros
        ├── api.js             Único lugar que habla con el servidor
        ├── estado.js          Filtros y datos actuales
        ├── formato.js         Formato de dinero, fechas y texto seguro
        ├── tabla.js           Tabla, búsqueda, filtros, orden, editar, eliminar
        ├── formulario.js      Ventana de agregar/editar con validación
        ├── dashboard.js       Tarjetas, gráficos y movimientos recientes
        ├── exportar.js        Botones de exportación y alcance elegido
        ├── exportarExcel.js   Descarga del Excel
        ├── exportarPdf.js     Generación del PDF
        └── avisos.js          Mensajes breves y confirmación de borrado
```

**Regla de oro para no perderse:** las *rutas* solo reciben y responden; los *servicios* hacen el trabajo; `db.js` es el único que abre la base de datos.

---

## 3. Cómo funciona la base de datos

Usa **SQLite**: toda la base de datos es un archivo (`data/contabilidad.db`). Se crea automáticamente la primera vez que enciendes la app.

Tiene una tabla, `movimientos`. Imagínala como una hoja de Excel donde cada fila es un movimiento:

| Columna | Qué guarda |
|---|---|
| `id` | Número único de cada registro (se asigna solo) |
| `nombre` | Producto o elemento |
| `proveedor`, `categoria` | Opcionales |
| `cantidad`, `valor_unitario` | Números (cantidad > 0, valor ≥ 0) |
| `valor_total` | Cantidad × valor unitario, calculado por el servidor |
| `fecha` | Texto `AAAA-MM-DD` (así se ordena correctamente) |
| `tipo` | `compra`, `venta`, `gasto` u `otro` |
| `observaciones` | Notas libres |
| `creado_en`, `actualizado_en` | Cuándo se creó y modificó (para funciones futuras) |

La propia tabla también se protege: las reglas `CHECK` impiden guardar un tipo inválido o una cantidad menor o igual a cero, aunque alguien se saltara la validación.

---

## 4. Cómo se agregan, modifican y eliminan registros

Cada acción sigue el mismo camino: **botón → función del navegador → API → servicio → base de datos**.

| Acción | Navegador | API | Servicio |
|---|---|---|---|
| Agregar | `formulario.js` → `guardar()` | `POST /api/movimientos` | `crear()` |
| Editar | `tabla.js` → `editarRegistro()` abre el formulario lleno | `PUT /api/movimientos/:id` | `actualizar()` |
| Eliminar | `tabla.js` → `eliminarRegistro()` pide confirmación | `DELETE /api/movimientos/:id` | `eliminar()` |

**Validación en dos capas** (como un portero en la entrada y otro en la caja):
1. El navegador (`formulario.js`) avisa de inmediato: nombre vacío, cantidad no numérica, valores negativos.
2. El servidor (`validacion.js`) vuelve a revisar todo, porque nunca se debe confiar solo en el navegador. Aquí también se calcula `valor_total = cantidad × valor_unitario`.

**Eliminar** siempre muestra una ventana de confirmación; si cancelas, no pasa nada.

---

## 5. Cómo funcionan los filtros y la búsqueda

Los filtros viven en `estado.filtros` (navegador). Cuando cambias uno, `tabla.js` pide de nuevo la lista al servidor:

```
GET /api/movimientos?buscar=camiseta&tipo=venta&desde=2026-09-01&orden=valor_total&dir=desc
```

En el servidor, `filtros.js` traduce esos parámetros a SQL:

- **Buscar** → busca el texto en nombre, proveedor, categoría y observaciones (`LIKE`). Espera 300 ms después de que dejas de escribir para no consultar en cada letra.
- **Tipo, categoría, desde, hasta** → condiciones `WHERE` que se combinan con `AND`.
- **Ordenar** → clic en el encabezado de una columna; otro clic invierte el orden. Solo se permiten las columnas de una lista blanca (`COLUMNAS_ORDENABLES`) para evitar inyección de SQL.

Los totales (compras, ventas, gastos, total general) se calculan con SQL sobre **el mismo filtro**, así que siempre coinciden con lo que ves en la tabla.

> Nota: SQLite ignora mayúsculas/minúsculas solo en letras sin tilde. Buscar "camisa" encuentra "Camisa", pero "ÁRBOL" y "árbol" cuentan como distintas.

---

## 6. Cómo se genera el archivo Excel

El Excel se construye **en el servidor** con ExcelJS (`src/servicios/excelServicio.js`):

1. El botón "Exportar a Excel" llama a `GET /api/exportar/excel` con los filtros elegidos.
2. El servidor usa la misma función `listar()` que la tabla, así que los datos son idénticos.
3. Se crea un libro con dos hojas:
   - **Movimientos:** encabezados con estilo, fechas reales de Excel, valores con formato de dinero, filtros automáticos, primera fila fija y una fila **TOTAL** con fórmula `SUM`.
   - **Resumen:** totales por tipo con fórmulas `SUMIF` y el balance.
4. El navegador recibe el archivo y lo descarga (`exportarExcel.js`).

**Alcance:** el selector "Exportar" junto a los botones permite elegir entre *solo los registros filtrados* o *todos los registros*.

---

## 7. Cómo se genera el PDF

El PDF se construye **en el navegador** con jsPDF y su complemento AutoTable (`public/js/exportarPdf.js`):

1. Pide al servidor los registros (con los filtros elegidos en el selector de alcance).
2. Dibuja el encabezado: nombre de la app, fecha de generación y los filtros aplicados.
3. Agrega un cuadro resumen (compras, ventas, gastos, otros, total general).
4. Dibuja la tabla con todas las columnas. AutoTable **pasa a otra página automáticamente**, repite los encabezados y pone la fila de totales en la última página.
5. Al final numera cada página ("Página 1 de 3") y descarga el archivo.

---

## 8. Cómo modificarla después

**Cambiar colores:** edita las variables al inicio de `public/css/estilos.css` (`--primario`, `--venta`, `--gasto`...).

**Cambiar la moneda:** en `public/js/formato.js` cambia `'COP'` y `'es-CO'`. En Excel, cambia `FORMATO_DINERO` en `excelServicio.js`.

**Agregar un tipo de movimiento nuevo** (por ejemplo, `devolucion`): agrégalo en `TIPOS` (`validacion.js`), en el `CHECK` de `db.js`, en los `<select>` de `index.html`, en `ETIQUETA_TIPO` (`formato.js`) y dale color en `estilos.css`.

**Agregar un campo nuevo** (por ejemplo, `numero_factura`), en este orden:
1. `src/db.js`: agrega la columna. Si ya tienes datos, ejecuta un `ALTER TABLE movimientos ADD COLUMN ...` (o borra `data/contabilidad.db` si solo tienes datos de prueba).
2. `src/validacion.js`: léelo, valídalo y devuélvelo en `valores`.
3. `src/servicios/movimientosServicio.js`: agrégalo al `INSERT` y al `UPDATE`.
4. `public/index.html`: campo del formulario (y encabezado de la tabla si quieres mostrarlo).
5. `public/js/formulario.js`: agrégalo a la lista `CAMPOS`.
6. `public/js/tabla.js`: agrega la celda en `dibujarTabla()`.
7. `excelServicio.js` y `exportarPdf.js`: agrega la columna a las exportaciones.

**Ideas para seguir creciendo:** paginación de la tabla, inicio de sesión de usuarios, gestión de inventario (una segunda tabla `productos`), adjuntar facturas o importar datos desde Excel. Como la base de datos y la interfaz están separadas por la API, puedes agregarlas sin rehacer lo que ya funciona.

---

## Solución de problemas

- **`npm install` falla al instalar `better-sqlite3`:** usa Node.js LTS (20 o superior). Con otras versiones puede intentar compilar el módulo y requerir herramientas de C++.
- **"No se pudo conectar con el servidor":** el servidor está apagado; ejecuta `npm start`.
- **El puerto 3000 está ocupado:** usa otro puerto. En Windows PowerShell: `$env:PORT=3001; npm start`; en Mac/Linux: `PORT=3001 npm start`.
- **Sin internet:** la app funciona igual; solo cambia la tipografía por la del sistema.
