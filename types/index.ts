export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  status: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  company_name: string | null;
  bank_account: string | null;
  alt_bank_account: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  balance: number;
  previous_due: number;
  father_name: string | null;
  referral_note: string | null;
  nid_number: string | null;
  date_of_birth: string | null;
  note: string | null;
  image_url: string | null;
  total_buy: number;
  total_paid: number;
  total_due: number;
  total_return: number;
  status: string;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  barcode_format: string;
  product_code: string | null;
  product_type: string;
  brand_id: string | null;
  category_id: string | null;
  description: string | null;
  short_description: string | null;
  product_notes: string | null;
  cost_price: number;
  selling_price: number;
  wholesale_price: number;
  discount_price: number | null;
  unit: string;
  tax_rate: number;
  tax_type: string;
  stock: number;
  damage_stock: number;
  min_stock: number;
  warehouse: string | null;
  rack_shelf: string | null;
  image_url: string | null;
  online_sale: boolean;
  is_deleted: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  brands?: Brand | null;
  categories?: Category | null;
  product_variants?: ProductVariant[];
};

export type ProductVariant = {
  id: string;
  product_id: string;
  variant_sku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  weight: string | null;
  design: string | null;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  alert_limit: number;
  image_url: string | null;
  status: string;
  created_at: string;
};

export type Unit = {
  id: string;
  name: string;
  short_name: string;
  description: string | null;
  status: string;
  created_at: string;
};

export type CustomerGroup = {
  id: string;
  name: string;
  description: string | null;
  discount_percent: number;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  alt_phone: string | null;
  address: string | null;
  reward_points: number;
  wallet_balance: number;
  membership: string;
  previous_due: number;
  due_limit: number;
  father_name: string | null;
  referral_note: string | null;
  nid_number: string | null;
  date_of_birth: string | null;
  note: string | null;
  image_url: string | null;
  total_buy: number;
  total_paid: number;
  total_due: number;
  total_return: number;
  group_id: string | null;
  status: string;
  created_at: string;
  customer_groups?: CustomerGroup | null;
};

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  salary: number;
  status: string;
  created_at: string;
};

export type Sale = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  employee_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  due_amount: number;
  payment_method: string;
  payment_status: string;
  branch: string;
  salesman: string | null;
  cashier: string | null;
  status: string;
  sale_date: string;
  created_at: string;
  customers?: Customer | null;
  employees?: Employee | null;
  sale_items?: SaleItem[];
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  unit_price: number;
  final_unit_price: number;
  created_at: string;
};

export type Purchase = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  payment_method: string;
  notes: string | null;
  branch: string;
  status: string;
  payment_status: string;
  purchase_date: string;
  created_at: string;
  suppliers?: Supplier | null;
  purchase_items?: PurchaseItem[];
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  cost_price: number;
  total: number;
  created_at: string;
  products?: Product | null;
};

export type Expense = {
  id: string;
  category_id: string | null;
  description: string | null;
  amount: number;
  date: string;
  created_at: string;
  expense_categories?: { name: string } | null;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
  reference: string | null;
  note: string | null;
  created_at: string;
  products?: Product | null;
};

export type Settings = {
  id: string;
  store_name: string;
  store_email: string;
  store_phone: string;
  store_address: string;
  currency: string;
  currency_symbol: string;
  tax_rate: number;
  logo_url: string | null;
  receipt_footer: string;
};

export type SaleReturn = {
  id: string;
  invoice_number: string;
  original_sale_id: string | null;
  customer_id: string | null;
  return_date: string;
  reason: string | null;
  total: number;
  status: string;
  created_at: string;
  customers?: Customer | null;
  sale_return_items?: SaleReturnItem[];
};

export type SaleReturnItem = {
  id: string;
  return_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
  created_at: string;
};

export type PurchaseReturn = {
  id: string;
  po_number: string;
  original_purchase_id: string | null;
  supplier_id: string | null;
  return_date: string;
  reason: string | null;
  total: number;
  status: string;
  created_at: string;
  suppliers?: Supplier | null;
  purchase_return_items?: PurchaseReturnItem[];
};

export type PurchaseReturnItem = {
  id: string;
  return_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  cost_price: number;
  total: number;
  created_at: string;
};

export type CustomerPayment = {
  id: string;
  customer_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  note: string | null;
  created_at: string;
};

export type SupplierPayment = {
  id: string;
  supplier_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  note: string | null;
  created_at: string;
};

export type BankAccount = {
  id: string;
  bank_name: string;
  branch: string | null;
  account_number: string | null;
  account_name: string | null;
  balance: number;
  status: string;
  created_at: string;
};

export type BankTransaction = {
  id: string;
  account_id: string;
  type: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  created_at: string;
  bank_accounts?: BankAccount | null;
};

export type CashTransaction = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  counter_name: string;
  created_at: string;
};

export type HeldOrder = {
  id: string;
  order_data: any;
  customer_name: string | null;
  hold_time: string;
  status: string;
  created_at: string;
};

export type SystemUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type Role = {
  id: string;
  name: string;
  permissions: any;
  description: string | null;
  created_at: string;
};

export type BarcodeHistory = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  barcode: string;
  barcode_format: string;
  quantity_printed: number;
  branch: string;
  generated_by: string | null;
  generated_date: string;
  created_at: string;
  products?: Product | null;
};

export type CartItem = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  image_url?: string | null;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
};

export type StockReconciliation = {
  id: string;
  product_id: string;
  variant_id: string | null;
  system_quantity: number;
  physical_quantity: number;
  difference: number;
  status: 'NOT_CHECKED' | 'CHECKED' | 'DIFFERENCE_FOUND';
  reason: string | null;
  reason_details: string | null;
  checked_by: string | null;
  checked_at: string | null;
  adjustment_applied: boolean;
  adjustment_applied_at: string | null;
  adjustment_applied_by: string | null;
  created_at: string;
  updated_at: string;
  products?: Product | null;
  product_variants?: ProductVariant | null;
};

export type StockAdjustment = {
  id: string;
  product_id: string;
  reconciliation_id: string | null;
  previous_quantity: number;
  new_quantity: number;
  difference: number;
  reason: string | null;
  reason_details: string | null;
  adjusted_by: string | null;
  adjusted_at: string;
  created_at: string;
  products?: Product | null;
};
