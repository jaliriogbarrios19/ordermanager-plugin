# Spec: OrderManager Plugin

## Problem
Emprendedores necesitan llevar contabilidad básica dentro de Obsidian sin depender de herramientas externas. Datos deben vivir en markdown nativo.

## Desired Outcome
Plugin de Obsidian que permita gestionar clientes, proveedores, inventario, transacciones (ingresos/egresos) y deudas (a favor/en contra), con dashboard de KPIs y reportes.

## Scope
- CRUD de clientes, proveedores, productos (inventario), transacciones, deudas
- Dashboard con KPIs financieros
- Vistas filtrables y buscables
- Exportación CSV
- Categorías y medios de pago editables desde settings
- Moneda default: USD

## Constraints
- Datos persistentes como notas .md con YAML frontmatter (nativo Obsidian)
- Sin dependencias externas fuera de la Obsidian API
- Compatible con desktop y mobile (isDesktopOnly: false)

## Acceptance Criteria
- [ ] Ribbon icon abre dashboard
- [ ] 6 vistas: Dashboard, Transacciones, Clientes, Proveedores, Inventario, Deudas
- [ ] Modales CRUD para cada entidad
- [ ] Dashboard muestra balance, ingresos/egresos del mes, deudas pendientes
- [ ] Filtros por fecha, tipo, categoría en transacciones
- [ ] Inventario con precio_costo (0 para producción propia) y precio_venta
- [ ] Settings tab funcional
- [ ] Export CSV desde vista de transacciones
