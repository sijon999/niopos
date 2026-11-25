export const permissionModules = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pos', label: 'POS' },
  { key: 'products', label: 'Products' },
  { key: 'brands', label: 'Brands' },
  { key: 'categories', label: 'Categories' },
  { key: 'units', label: 'Units' },
  { key: 'sales', label: 'Sales' },
  { key: 'sale_returns', label: 'Sales Returns' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'stock_reconciliation', label: 'Stock Reconciliation' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'customers', label: 'Customers' },
  { key: 'discount_offers', label: 'Discount Offers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'employees', label: 'Employees' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'purchase_returns', label: 'Purchase Returns' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
] as const;

export const permissionActions = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'export', label: 'Export' },
  { key: 'print', label: 'Print' },
] as const;

export const actionPermissions = [
  { key: 'actions.apply_discount', label: 'Apply Discount' },
  { key: 'actions.change_selling_price', label: 'Change Product Selling Price' },
  { key: 'actions.view_purchase_price', label: 'View Purchase Price' },
  { key: 'actions.view_stock_value', label: 'View Stock Value' },
  { key: 'actions.view_profit', label: 'View Profit' },
  { key: 'actions.view_financial_reports', label: 'View Business Financial Reports' },
  { key: 'actions.view_customer_due', label: 'View Customer Due' },
  { key: 'actions.process_sale_return', label: 'Process Sales Return' },
  { key: 'actions.process_purchase_return', label: 'Process Purchase Return' },
  { key: 'actions.adjust_stock_increase', label: 'Adjust Stock Increase' },
  { key: 'actions.adjust_stock_decrease', label: 'Adjust Stock Decrease' },
  { key: 'actions.manage_employees', label: 'Manage Employees' },
  { key: 'actions.manage_roles', label: 'Manage Roles' },
  { key: 'actions.manage_permissions', label: 'Manage Permissions' },
  { key: 'actions.manage_store_settings', label: 'Manage Store Settings' },
] as const;

export const permissionKeys = [
  ...permissionModules.flatMap(({ key: module }) =>
    permissionActions.map(({ key: action }) => `${module}.${action}`)
  ),
  ...actionPermissions.map(({ key }) => key),
];

export const permissionTemplates: Record<string, string[]> = {
  'Store Owner': permissionKeys,
  Admin: permissionKeys.filter((key) =>
    !key.startsWith('employees.') &&
    !key.startsWith('settings.') &&
    !key.startsWith('actions.manage_')
  ),
  Manager: [
    'dashboard.view',
    'pos.view', 'pos.create', 'pos.print',
    'sales.view', 'sales.create', 'sales.edit', 'sales.print',
    'sale_returns.view', 'sale_returns.create', 'sale_returns.edit', 'sale_returns.print',
    'customers.view', 'customers.create', 'customers.edit',
    'inventory.view', 'inventory.create', 'inventory.edit',
    'stock_reconciliation.view', 'stock_reconciliation.create', 'stock_reconciliation.edit',
    'products.view', 'products.create', 'products.edit',
    'purchases.view', 'purchases.create', 'purchases.edit',
    'suppliers.view', 'suppliers.create', 'suppliers.edit',
    'reports.view', 'reports.export',
    'actions.process_sale_return', 'actions.process_purchase_return',
    'actions.adjust_stock_increase', 'actions.adjust_stock_decrease',
  ],
  Cashier: [
    'pos.view', 'pos.create', 'pos.print',
    'sales.view', 'sales.create', 'sales.print',
    'customers.view', 'customers.create',
    'actions.apply_discount',
  ],
  'Inventory Staff': [
    'products.view', 'products.create', 'products.edit',
    'brands.view', 'categories.view', 'units.view',
    'barcode.view', 'barcode.create', 'barcode.print',
    'inventory.view', 'inventory.edit',
    'stock_reconciliation.view', 'stock_reconciliation.create',
    'actions.adjust_stock_increase', 'actions.adjust_stock_decrease',
  ],
  Accountant: [
    'dashboard.view',
    'sales.view', 'sales.export', 'sales.print',
    'purchases.view', 'purchases.export',
    'purchase_returns.view',
    'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.export', 'expenses.print',
    'reports.view', 'reports.export',
    'actions.view_purchase_price', 'actions.view_profit',
    'actions.view_stock_value',
    'actions.view_financial_reports', 'actions.view_customer_due',
  ],
  'Custom Role': [],
};

export type PermissionMap = Record<string, boolean>;

export function permissionsToMap(permissions: string[]): PermissionMap {
  return Object.fromEntries(permissions.map((permission) => [permission, true]));
}
