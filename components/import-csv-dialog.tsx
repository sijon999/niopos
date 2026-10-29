'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Download, FileText, CheckCircle2, XCircle, AlertTriangle,
  Loader2, X, FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Category, Brand, Unit, Product } from '@/types';
import {
  parseCSV, autoMapColumns, applyMapping, validateRows,
  generateTemplateCSV, generateErrorReportCSV, downloadFile,
  buildRefMaps, rowToProductData,
  FIELD_DEFINITIONS, type ColumnMapping, type ParsedRow,
  type ValidationResult, type ImportMode, type ImportProgress, type ImportField,
} from '@/lib/csv-import';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  brands: Brand[];
  units: Unit[];
  existingProducts: Product[];
  onComplete: () => void;
};

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'result';

export function ImportCSVDialog({
  open, onOpenChange, categories, brands, units, existingProducts, onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip');
  const [progress, setProgress] = useState<ImportProgress>({ total: 0, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 });
  const [errorRows, setErrorRows] = useState<Array<{ row: number; name: string; code: string; error: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setParsedRows([]);
    setValidation(null);
    setImportMode('skip');
    setProgress({ total: 0, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 });
    setErrorRows([]);
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) { toast.error('Could not read file'); return; }
      const { headers: hdrs, rows } = parseCSV(text);
      if (hdrs.length === 0) { toast.error('CSV file appears empty'); return; }
      setHeaders(hdrs);
      setRawRows(rows);
      const autoMapping = autoMapColumns(hdrs);
      setMapping(autoMapping);
      const parsed = applyMapping(hdrs, rows, autoMapping);
      setParsedRows(parsed);

      const existing = existingProducts.map((p) => ({
        product_code: p.product_code, barcode: p.barcode, sku: p.sku,
      }));
      const result = validateRows(parsed, existing, importMode);
      setValidation(result);

      const unmapped = hdrs.filter((_, i) => !autoMapping[i]);
      if (unmapped.length > 0) {
        setStep('mapping');
      } else {
        setStep('preview');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const revalidate = (newMapping: ColumnMapping, mode: ImportMode) => {
    const parsed = applyMapping(headers, rawRows, newMapping);
    setParsedRows(parsed);
    const existing = existingProducts.map((p) => ({
      product_code: p.product_code, barcode: p.barcode, sku: p.sku,
    }));
    const result = validateRows(parsed, existing, mode);
    setValidation(result);
  };

  const handleMappingChange = (colIdx: number, fieldKey: string) => {
    const newMapping = { ...mapping, [colIdx]: (fieldKey || null) as ImportField | null };
    setMapping(newMapping);
    revalidate(newMapping, importMode);
  };

  const handleModeChange = (mode: ImportMode) => {
    setImportMode(mode);
    revalidate(mapping, mode);
  };

  const downloadTemplate = () => {
    downloadFile(generateTemplateCSV(), 'product-import-template.csv', 'text/csv;charset=utf-8');
    toast.success('Template downloaded');
  };

  const downloadErrors = () => {
    if (!validation) return;
    downloadFile(
      generateErrorReportCSV(validation.errors, validation.duplicates),
      'import-error-report.csv',
      'text/csv;charset=utf-8'
    );
    toast.success('Error report downloaded');
  };

  const runImport = async () => {
    if (!validation || validation.validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setStep('importing');
    const refs = buildRefMaps(categories, brands, units);
    const validRows = validation.validRows;
    const total = validRows.length;
    setProgress({ total, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 });

    const batchSize = 50;
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failedRows: Array<{ row: number; name: string; code: string; error: string }> = [];

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      const toInsert: Record<string, any>[] = [];
      const toUpdate: Array<{ row: ParsedRow; existingId: string }> = [];

      for (const row of batch) {
        const data = rowToProductData(row, refs);
        if (importMode === 'update') {
          const matchField = data.product_code ? 'product_code' : data.barcode ? 'barcode' : data.sku ? 'sku' : null;
          if (matchField) {
            const matchVal = data[matchField];
            const existing = existingProducts.find((p) => {
              if (matchField === 'product_code') return p.product_code?.toLowerCase() === String(matchVal).toLowerCase();
              if (matchField === 'barcode') return p.barcode?.toLowerCase() === String(matchVal).toLowerCase();
              if (matchField === 'sku') return p.sku?.toLowerCase() === String(matchVal).toLowerCase();
              return false;
            });
            if (existing) {
              toUpdate.push({ row, existingId: existing.id });
              continue;
            }
          }
        }
        toInsert.push({ ...data, rowRef: row.rowIndex });
      }

      if (toInsert.length > 0) {
        const insertData = toInsert.map(({ rowRef, ...rest }) => rest);
        const { data: inserted, error } = await supabase.from('products').insert(insertData).select('id, stock, name');
        if (error) {
          failed += toInsert.length;
          for (const item of toInsert) {
            failedRows.push({ row: item.rowRef, name: item.name, code: item.product_code || '', error: error.message });
          }
        } else if (inserted) {
          imported += inserted.length;
          const movements = inserted
            .filter((p: any) => Number(p.stock) > 0)
            .map((p: any) => ({
              product_id: p.id,
              type: 'opening',
              quantity: Number(p.stock),
              reference: 'CSV Import',
              note: 'Bulk import opening stock',
            }));
          if (movements.length > 0) {
            await supabase.from('stock_movements').insert(movements);
          }
        }
      }

      for (const { row, existingId } of toUpdate) {
        const data = rowToProductData(row, refs);
        const { product_code, sku, barcode, ...updateData } = data;
        const { error } = await supabase.from('products').update(updateData).eq('id', existingId);
        if (error) {
          failed++;
          failedRows.push({ row: row.rowIndex, name: data.name, code: product_code || '', error: error.message });
        } else {
          updated++;
        }
      }

      const processed = Math.min(i + batchSize, total);
      setProgress({ total, processed, imported, updated, skipped, failed });
    }

    setErrorRows(failedRows);
    setStep('result');
    if (imported > 0 || updated > 0) {
      toast.success(`Imported ${imported} products${updated > 0 ? `, updated ${updated}` : ''}`);
    }
  };

  const unmappedCount = headers.filter((_, i) => !mapping[i]).length;
  const previewRows = parsedRows.slice(0, 15);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Import Products from CSV
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-4">
            {/* Instructions */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              Upload a CSV file containing your product information. Make sure the column names match the template.
            </div>

            {/* Step: Upload */}
            {step === 'upload' && (
              <div className="space-y-4">
                <Button variant="outline" onClick={downloadTemplate} className="w-full border-dashed">
                  <Download className="w-4 h-4 mr-2" /> Download CSV Template
                </Button>
                <Separator />
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium">Choose CSV File</p>
                  <p className="text-sm text-muted-foreground mt-1">Click to browse or drag a .csv file here</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  />
                </div>
              </div>
            )}

            {/* Step: Mapping */}
            {step === 'mapping' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium">Review Column Mapping</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Some CSV columns could not be automatically matched. Please verify the mapping below.
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">CSV Column</TableHead>
                        <TableHead className="text-xs">Application Field</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {headers.map((header, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-mono">{header}</TableCell>
                          <TableCell>
                            <select
                              value={mapping[idx] || ''}
                              onChange={(e) => handleMappingChange(idx, e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-sm w-full"
                            >
                              <option value="">-- Skip --</option>
                              {FIELD_DEFINITIONS.map((f) => (
                                <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={() => setStep('preview')} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Continue to Preview
                </Button>
              </div>
            )}

            {/* Step: Preview */}
            {step === 'preview' && validation && (
              <div className="space-y-4">
                {/* File info */}
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{fileName}</span>
                  <Badge variant="outline">{validation.totalRows} rows</Badge>
                </div>

                {/* Validation summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium">Valid Rows</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{validation.validRows.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-medium">Invalid Rows</span>
                    </div>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{validation.errors.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium">Duplicates</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{validation.duplicates.length}</p>
                  </div>
                </div>

                {/* Import mode */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Import Behavior</Label>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { key: 'skip', label: 'Skip duplicates' },
                      { key: 'update', label: 'Update existing products' },
                      { key: 'stop', label: 'Stop on duplicate' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => handleModeChange(opt.key)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${importMode === opt.key ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'border-border hover:bg-muted/50'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview table */}
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-10">#</TableHead>
                        <TableHead className="text-xs">Product Name</TableHead>
                        <TableHead className="text-xs">Code</TableHead>
                        <TableHead className="text-xs">Barcode</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Unit</TableHead>
                        <TableHead className="text-xs text-right">Purchase</TableHead>
                        <TableHead className="text-xs text-right">Selling</TableHead>
                        <TableHead className="text-xs text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow key={row.rowIndex}>
                          <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                          <TableCell className="text-sm font-medium">{row.mapped.name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.mapped.product_code || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.mapped.barcode || '-'}</TableCell>
                          <TableCell className="text-xs">{row.mapped.category || '-'}</TableCell>
                          <TableCell className="text-xs">{row.mapped.unit || '-'}</TableCell>
                          <TableCell className="text-xs text-right">{row.mapped.cost_price || '-'}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{row.mapped.selling_price || '-'}</TableCell>
                          <TableCell className="text-xs text-right">{row.mapped.stock || '0'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {validation.totalRows > 15 && (
                  <p className="text-xs text-muted-foreground text-center">Showing first 15 of {validation.totalRows} rows</p>
                )}

                {/* Errors list */}
                {validation.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-rose-600">Validation Errors ({validation.errors.length})</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {validation.errors.slice(0, 50).map((err, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <span className="font-mono">Row {err.row}</span>
                            <span>{err.message}</span>
                          </div>
                        ))}
                        {validation.errors.length > 50 && <p className="text-xs text-muted-foreground">...and {validation.errors.length - 50} more</p>}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Duplicates list */}
                {validation.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600">Duplicates ({validation.duplicates.length})</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {validation.duplicates.slice(0, 50).map((dup, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <span className="font-mono">Row {dup.row}</span>
                            <span>{dup.name}</span>
                            <span className="text-muted-foreground">- {dup.reason}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {/* Step: Importing */}
            {step === 'importing' && (
              <div className="space-y-6 py-8">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-3 text-indigo-600 animate-spin" />
                  <p className="font-medium">Importing products...</p>
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} className="h-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%</span>
                    <span>{progress.processed} / {progress.total}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">Imported</p>
                      <p className="font-bold text-emerald-600">{progress.imported}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">Updated</p>
                      <p className="font-bold text-indigo-600">{progress.updated}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">Skipped</p>
                      <p className="font-bold text-amber-600">{progress.skipped}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">Failed</p>
                      <p className="font-bold text-rose-600">{progress.failed}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Result */}
            {step === 'result' && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-3 text-emerald-500" />
                  <p className="text-lg font-bold">Import Completed</p>
                </div>
                <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                    <p className="text-xl font-bold">{progress.total}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <p className="text-xs text-muted-foreground">Imported</p>
                    <p className="text-xl font-bold text-emerald-600">{progress.imported}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-muted-foreground">Updated</p>
                    <p className="text-xl font-bold text-indigo-600">{progress.updated}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-xl font-bold text-rose-600">{progress.failed}</p>
                  </div>
                </div>

                {errorRows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-rose-600">Failed Rows ({errorRows.length})</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {errorRows.slice(0, 50).map((err, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <span className="font-mono">Row {err.row}</span>
                            <span>{err.name}</span>
                            <span className="text-muted-foreground">- {err.error}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>


        <DialogFooter className="flex-shrink-0">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back to Mapping
              </Button>
              <Button
                onClick={runImport}
                disabled={!validation || validation.validRows.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import {validation?.validRows.length || 0} Products
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              {errorRows.length > 0 && (
                <Button variant="outline" onClick={downloadErrors}>
                  <Download className="w-4 h-4 mr-2" /> Download Error Report
                </Button>
              )}
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => { onComplete(); handleClose(false); }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> View Imported Products
              </Button>
            </>
          )}
          {(step === 'upload' || step === 'mapping') && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
