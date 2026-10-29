import type { Category, Brand, Unit } from '@/types';

export type ImportField =
  | 'name' | 'product_code' | 'barcode' | 'sku' | 'product_type'
  | 'brand' | 'category' | 'unit' | 'cost_price' | 'selling_price'
  | 'wholesale_price' | 'stock' | 'min_stock' | 'description' | 'status'
  | 'short_description' | 'warehouse' | 'rack_shelf' | 'tax_rate' | 'discount_price';

export type FieldDef = {
  key: ImportField;
  label: string;
  required: boolean;
  numeric?: boolean;
  aliases: string[];
};

export const FIELD_DEFINITIONS: FieldDef[] = [
  { key: 'name', label: 'Product Name', required: true, aliases: ['name', 'product_name', 'product name', 'পণ্যের নাম', 'নাম'] },
  { key: 'product_code', label: 'Product Code', required: false, aliases: ['code', 'product_code', 'product code', 'কোড', 'পণ্য কোড'] },
  { key: 'barcode', label: 'Barcode', required: false, aliases: ['barcode', 'bar_code', 'bar code', 'বারকোড'] },
  { key: 'sku', label: 'SKU', required: false, aliases: ['sku', 'item_sku'] },
  { key: 'product_type', label: 'Product Type', required: false, aliases: ['type', 'product_type', 'product type', 'টাইপ'] },
  { key: 'brand', label: 'Brand', required: false, aliases: ['brand', 'brand_name', 'brand name', 'ব্র্যান্ড'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category', 'category_name', 'category name', 'ক্যাটাগরি'] },
  { key: 'unit', label: 'Unit', required: false, aliases: ['unit', 'unit_name', 'unit name', 'ইউনিট', 'পরিমাণ'] },
  { key: 'cost_price', label: 'Purchase Price', required: false, numeric: true, aliases: ['purchase_price', 'cost_price', 'purchase price', 'ক্রয় মূল্য'] },
  { key: 'selling_price', label: 'Selling Price', required: true, numeric: true, aliases: ['selling_price', 'sale_price', 'price', 'selling price', 'বিক্রয় মূল্য'] },
  { key: 'wholesale_price', label: 'Wholesale Price', required: false, numeric: true, aliases: ['wholesale_price', 'wholesale price', 'পাইকারি মূল্য'] },
  { key: 'discount_price', label: 'Discount Price', required: false, numeric: true, aliases: ['discount_price', 'discount price'] },
  { key: 'stock', label: 'Stock', required: false, numeric: true, aliases: ['stock', 'quantity', 'qty', 'opening_stock', 'স্টক'] },
  { key: 'min_stock', label: 'Minimum Stock', required: false, numeric: true, aliases: ['min_stock', 'minimum_stock', 'alert_limit', 'minimum stock', 'অ্যালার্ট লিমিট'] },
  { key: 'tax_rate', label: 'Tax Rate', required: false, numeric: true, aliases: ['tax_rate', 'tax', 'vat', 'ট্যাক্স'] },
  { key: 'warehouse', label: 'Warehouse', required: false, aliases: ['warehouse', 'store', 'ওয়্যারহাউস'] },
  { key: 'rack_shelf', label: 'Rack/Shelf', required: false, aliases: ['rack_shelf', 'rack', 'shelf', 'র্যাক'] },
  { key: 'short_description', label: 'Short Description', required: false, aliases: ['short_description', 'short description'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'বর্ণনা'] },
  { key: 'status', label: 'Status', required: false, aliases: ['status', 'স্ট্যাটাস'] },
];

export type ColumnMapping = Record<number, ImportField | null>;

export type ParsedRow = {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Partial<Record<ImportField, string>>;
};

export type ValidationError = {
  row: number;
  field?: string;
  message: string;
  productName?: string;
  productCode?: string;
};

export type ValidationResult = {
  validRows: ParsedRow[];
  errors: ValidationError[];
  duplicates: Array<{ row: number; name: string; code: string; reason: string }>;
  totalRows: number;
};

export type ImportMode = 'skip' | 'update' | 'stop';

export type ImportProgress = {
  total: number;
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
};

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"') {
      if (inQuotes && cleaned[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && cleaned[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields.map((f) => f.trim());
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(splitLine);
  return { headers, rows };
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  headers.forEach((header, idx) => {
    const normalized = header.toLowerCase().trim();
    const match = FIELD_DEFINITIONS.find((f) =>
      f.aliases.some((a) => a.toLowerCase() === normalized)
    );
    mapping[idx] = match ? match.key : null;
  });
  return mapping;
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): ParsedRow[] {
  return rows.map((row, idx) => {
    const raw: Record<string, string> = {};
    const mapped: Partial<Record<ImportField, string>> = {};
    headers.forEach((header, colIdx) => {
      raw[header] = row[colIdx] || '';
      const fieldKey = mapping[colIdx];
      if (fieldKey && row[colIdx]) {
        mapped[fieldKey] = row[colIdx];
      }
    });
    return { rowIndex: idx + 2, raw, mapped };
  });
}

function isNumeric(val: string): boolean {
  if (val === '' || val === null || val === undefined) return true;
  const n = Number(val);
  return !isNaN(n) && isFinite(n);
}

export function validateRows(
  parsed: ParsedRow[],
  existingProducts: { product_code: string | null; barcode: string | null; sku: string | null }[],
  mode: ImportMode
): ValidationResult {
  const errors: ValidationError[] = [];
  const duplicates: Array<{ row: number; name: string; code: string; reason: string }> = [];
  const validRows: ParsedRow[] = [];

  const existingCodes = new Set(existingProducts.filter((p) => p.product_code).map((p) => p.product_code!.toLowerCase()));
  const existingBarcodes = new Set(existingProducts.filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase()));
  const existingSkus = new Set(existingProducts.filter((p) => p.sku).map((p) => p.sku!.toLowerCase()));

  const seenCodes = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const seenSkus = new Map<string, number>();

  for (const row of parsed) {
    const m = row.mapped;
    let hasError = false;

    if (!m.name || !m.name.trim()) {
      errors.push({ row: row.rowIndex, field: 'name', message: 'Product name is required', productCode: m.product_code });
      hasError = true;
    }

    if (!m.selling_price || !m.selling_price.trim()) {
      errors.push({ row: row.rowIndex, field: 'selling_price', message: 'Selling price is required', productName: m.name, productCode: m.product_code });
      hasError = true;
    } else if (!isNumeric(m.selling_price)) {
      errors.push({ row: row.rowIndex, field: 'selling_price', message: 'Invalid selling price', productName: m.name, productCode: m.product_code });
      hasError = true;
    } else if (Number(m.selling_price) < 0) {
      errors.push({ row: row.rowIndex, field: 'selling_price', message: 'Selling price cannot be negative', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.cost_price && !isNumeric(m.cost_price)) {
      errors.push({ row: row.rowIndex, field: 'cost_price', message: 'Invalid purchase price', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.wholesale_price && !isNumeric(m.wholesale_price)) {
      errors.push({ row: row.rowIndex, field: 'wholesale_price', message: 'Invalid wholesale price', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.discount_price && !isNumeric(m.discount_price)) {
      errors.push({ row: row.rowIndex, field: 'discount_price', message: 'Invalid discount price', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.stock && !isNumeric(m.stock)) {
      errors.push({ row: row.rowIndex, field: 'stock', message: 'Invalid stock value', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.min_stock && !isNumeric(m.min_stock)) {
      errors.push({ row: row.rowIndex, field: 'min_stock', message: 'Invalid minimum stock value', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (m.tax_rate && !isNumeric(m.tax_rate)) {
      errors.push({ row: row.rowIndex, field: 'tax_rate', message: 'Invalid tax rate', productName: m.name, productCode: m.product_code });
      hasError = true;
    }

    if (hasError) continue;

    let isDuplicate = false;
    let dupReason = '';

    if (m.product_code) {
      const lc = m.product_code.toLowerCase();
      if (existingCodes.has(lc)) {
        isDuplicate = true;
        dupReason = 'Product code already exists';
      } else if (seenCodes.has(lc)) {
        isDuplicate = true;
        dupReason = 'Duplicate product code in CSV';
      } else {
        seenCodes.set(lc, row.rowIndex);
      }
    }

    if (m.barcode && !isDuplicate) {
      const lc = m.barcode.toLowerCase();
      if (existingBarcodes.has(lc)) {
        isDuplicate = true;
        dupReason = 'Barcode already exists';
      } else if (seenBarcodes.has(lc)) {
        isDuplicate = true;
        dupReason = 'Duplicate barcode in CSV';
      } else {
        seenBarcodes.set(lc, row.rowIndex);
      }
    }

    if (m.sku && !isDuplicate) {
      const lc = m.sku.toLowerCase();
      if (existingSkus.has(lc)) {
        isDuplicate = true;
        dupReason = 'SKU already exists';
      } else if (seenSkus.has(lc)) {
        isDuplicate = true;
        dupReason = 'Duplicate SKU in CSV';
      } else {
        seenSkus.set(lc, row.rowIndex);
      }
    }

    if (isDuplicate) {
      if (mode === 'update') {
        validRows.push(row);
      } else if (mode === 'skip') {
        duplicates.push({ row: row.rowIndex, name: m.name || '', code: m.product_code || '', reason: dupReason });
      } else {
        duplicates.push({ row: row.rowIndex, name: m.name || '', code: m.product_code || '', reason: dupReason });
      }
      continue;
    }

    validRows.push(row);
  }

  return { validRows, errors, duplicates, totalRows: parsed.length };
}

export function generateTemplateCSV(): string {
  const headers = FIELD_DEFINITIONS.map((f) => f.label);
  const sampleRow = [
    'T-Shirt', 'TS001', '8901234500011', 'SKU-TS001', 'simple',
    'Gucci', 'T-Shirt', 'Pc(s)', '300', '500', '450', '', '20', '5', 'Premium cotton t-shirt', 'active',
    '', '', '', '0',
  ];
  const lines = [headers, sampleRow];
  return '\uFEFF' + lines.map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
}

export function generateErrorReportCSV(
  errors: ValidationError[],
  duplicates: Array<{ row: number; name: string; code: string; reason: string }>
): string {
  const headers = ['Row Number', 'Product Name', 'Product Code', 'Error Type', 'Reason'];
  const lines = [headers];

  for (const e of errors) {
    lines.push([String(e.row), e.productName || '', e.productCode || '', 'Validation Error', e.message]);
  }
  for (const d of duplicates) {
    lines.push([String(d.row), d.name, d.code, 'Duplicate', d.reason]);
  }

  return '\uFEFF' + lines.map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
}

export type ResolvedRefs = {
  categories: Map<string, string>;
  brands: Map<string, string>;
  units: Map<string, string>;
};

export function buildRefMaps(
  categories: Category[],
  brands: Brand[],
  units: Unit[]
): ResolvedRefs {
  const catMap = new Map<string, string>();
  const brandMap = new Map<string, string>();
  const unitMap = new Map<string, string>();

  categories.forEach((c) => catMap.set(c.name.toLowerCase().trim(), c.id));
  brands.forEach((b) => brandMap.set(b.name.toLowerCase().trim(), b.id));
  units.forEach((u) => {
    unitMap.set(u.name.toLowerCase().trim(), u.short_name);
    unitMap.set(u.short_name.toLowerCase().trim(), u.short_name);
  });

  return { categories: catMap, brands: brandMap, units: unitMap };
}

export function rowToProductData(
  row: ParsedRow,
  refs: ResolvedRefs
): Record<string, any> {
  const m = row.mapped;
  const data: Record<string, any> = {
    name: (m.name || '').trim(),
    product_code: m.product_code?.trim() || null,
    sku: m.sku?.trim() || null,
    barcode: m.barcode?.trim() || null,
    barcode_format: 'CODE128',
    product_type: (m.product_type?.trim() || 'simple').toLowerCase() === 'variant' ? 'variant' : 'simple',
    brand_id: m.brand ? refs.brands.get(m.brand.toLowerCase().trim()) || null : null,
    category_id: m.category ? refs.categories.get(m.category.toLowerCase().trim()) || null : null,
    unit: m.unit ? refs.units.get(m.unit.toLowerCase().trim()) || 'Pc(s)' : 'Pc(s)',
    description: m.description?.trim() || null,
    short_description: m.short_description?.trim() || null,
    product_notes: null,
    cost_price: m.cost_price ? Number(m.cost_price) || 0 : 0,
    selling_price: m.selling_price ? Number(m.selling_price) || 0 : 0,
    wholesale_price: m.wholesale_price ? Number(m.wholesale_price) || 0 : 0,
    discount_price: m.discount_price ? Number(m.discount_price) || null : null,
    tax_rate: m.tax_rate ? Number(m.tax_rate) || 0 : 0,
    tax_type: 'exclusive',
    stock: m.stock ? Number(m.stock) || 0 : 0,
    min_stock: m.min_stock ? Number(m.min_stock) || 5 : 5,
    warehouse: m.warehouse?.trim() || null,
    rack_shelf: m.rack_shelf?.trim() || null,
    image_url: null,
    status: (m.status?.trim() || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
  };
  return data;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
