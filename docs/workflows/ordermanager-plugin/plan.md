# Plan: OrderManager Plugin

## Architecture

```
src/
├── main.ts              # Plugin entry: register views, commands, ribbon
├── settings.ts           # PluginSettingTab
├── types.ts              # Shared interfaces
├── data/
│   ├── manager.ts        # DataManager singleton: CRUD ops via vault
│   ├── parser.ts         # YAML frontmatter parse/stringify
│   └── templates.ts      # Default .md templates per entity
├── views/
│   ├── dashboard-view.ts
│   ├── transacciones-view.ts
│   ├── clientes-view.ts
│   ├── proveedores-view.ts
│   ├── inventario-view.ts
│   └── deudas-view.ts
├── modals/
│   ├── transaccion-modal.ts
│   ├── cliente-modal.ts
│   ├── proveedor-modal.ts
│   ├── producto-modal.ts
│   └── deuda-modal.ts
└── utils/
    ├── currency.ts
    ├── date.ts
    └── export.ts
```

## Data Model (YAML Frontmatter on .md notes)

All entities live under `OrderManager/` folder (configurable).

### Cliente / Proveedor
- nombre, ruc, email, telefono, direccion, categoria

### Transacción
- clase (ingreso|egreso), monto, moneda, fecha, categoria, cliente?, proveedor?, descripcion, medio_pago, estado

### Deuda
- clase (a_favor|en_contra), monto_total, monto_pagado, moneda, fecha_inicio, fecha_vencimiento, cliente?, proveedor?, descripcion, estado, cuotas, cuotas_pagadas

### Producto (Inventario)
- nombre, descripcion, precio_costo (0 for self-produced), precio_venta, stock, categoria, proveedor?
