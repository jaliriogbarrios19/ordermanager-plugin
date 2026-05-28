# OrderManager

Plugin de contabilidad para Obsidian. Gestioná clientes, proveedores, inventario, transacciones y deudas con soporte multi-moneda, tasas de cambio en tiempo real y múltiples libros contables.

Accounting plugin for Obsidian. Manage clients, suppliers, inventory, transactions, and debts with multi-currency support, real-time exchange rates, and multiple accounting books.

## Características / Features

- **Dashboard** con KPIs, gráfico de barras mensual, top 5 productos, alertas de stock y próximos vencimientos
- **Transacciones** (ingresos/egresos) con filtros, búsqueda, exportación CSV y soporte recurrente (mensual, semanal, etc.)
- **Clientes y Proveedores** con CRUD completo y exportación CSV
- **Inventario** con precio de costo, precio de venta, margen y alertas de stock bajo configurables
- **Deudas** (a favor/en contra) con conciliación rápida de pagos
- **Tasas de cambio**: Dólar BCV, USDT y 20+ monedas fiat. Actualización desde APIs.
- **Multi-libro**: Contabilidad separada para distintos emprendimientos, finanzas personales, etc.
- **12 idiomas**: Español, English, Português, Français, Deutsch, Italiano, 中文, 日本語, Русский, العربية, 한국어, हिन्दी
- **Datos en Markdown nativo**: Todo se guarda como notas `.md` con YAML frontmatter

## Instalación / Installation

### Desde GitHub

1. Descargá `main.js`, `manifest.json` y `styles.css` del último release
2. Copialos a `{vault}/.obsidian/plugins/ordermanager/`
3. Activá el plugin en Settings → Community plugins

### Desde Community Plugins (próximamente)

Buscá "OrderManager" en la lista de plugins comunitarios de Obsidian.

## Uso / Usage

1. Abrí el dashboard desde el ícono `landmark` en el ribbon izquierdo
2. Creá un **Libro** en Settings → OrderManager (ej: "Mi Negocio", "Personal")
3. Agregá **tasas de cambio** (Dólar BCV, USDT) y actualizalas
4. Empezá a registrar transacciones, clientes, productos y deudas

### Comandos

| Comando | Descripción |
|---------|-------------|
| `Abrir dashboard` | Abre el panel principal |
| `Nueva transacción` | Crea ingreso o egreso |
| `Nuevo cliente` | Agrega un cliente |
| `Buscar en todo OrderManager` | Búsqueda global |

## Desarrollo / Development

```bash
git clone https://github.com/tuusuario/ordermanager-plugin
cd ordermanager-plugin
npm install
npm run build
```

## Licencia / License

MIT
