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
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';
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
  const { t } = useTranslation();
  const { confirmUpdate, dialog: confirmationDialog } = useConfirmation();
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
  const fieldLabelKeys: Record<ImportField, string> = {
    name: 'products.productName',
    product_code: 'products.productCode',
    barcode: 'products.barcode',
    sku: 'products.sku',
    product_type: 'products.productType',
    brand: 'products.brand',
    category: 'products.category',
    unit: 'products.unit',
    cost_price: 'products.purchasePrice',
    selling_price: 'products.sellingPrice',
    wholesale_price: 'products.wholesalePrice',
    stock: 'products.stock',
    min_stock: 'products.minStock',
    description: 'common.description',
    status: 'common.status',
    short_description: 'products.shortDescription',
    warehouse: 'products.warehouse',
    rack_shelf: 'products.rackShelf',
    tax_rate: 'products.taxVat',
    discount_price: 'products.discount',
  };
  const fieldLabel = (field: ImportField) => t(fieldLabelKeys[field]);

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
      toast.error(t('csvImport.selectCsv'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('csvImport.fileTooLarge'));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) { toast.error(t('csvImport.readFailed')); return; }
      const { headers: hdrs, rows } = parseCSV(text);
      if (hdrs.length === 0) { toast.error(t('csvImport.emptyFile')); return; }
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
    downloadFile(generateTemplateCSV(FIELD_DEFINITIONS.map((field) => fieldLabel(field.key))), 'product-import-template.csv', 'text/csv;charset=utf-8');
    toast.success(t('csvImport.templateDownloaded'));
  };

  const downloadErrors = () => {
    if (!validation) return;
    downloadFile(
      generateErrorReportCSV(
        validation.errors.map((error) => ({ ...error, message: t(error.message) })),
        validation.duplicates.map((duplicate) => ({ ...duplicate, reason: t(duplicate.reason) })),
        [
          t('csvImport.errorReportHeaders.row'),
          t('products.productName'),
          t('products.productCode'),
          t('csvImport.errorReportHeaders.type'),
          t('csvImport.errorReportHeaders.reason'),
        ]
      ),
      'import-error-report.csv',
      'text/csv;charset=utf-8'
    );
    toast.success(t('csvImport.errorReportDownloaded'));
  };

  const runImport = async () => {
    if (!validation || validation.validRows.length === 0) {
      toast.error(t('csvImport.noValidRows'));
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
      toast.success(updated > 0
        ? t('csvImport.importSuccessWithUpdates', { imported, updated })
        : t('csvImport.importSuccess', { imported }));
    }
  };

  const handleImport = async () => {
    if (!validation || importMode !== 'update') {
      await runImport();
      return;
    }

    const refs = buildRefMaps(categories, brands, units);
    const hasExistingUpdates = validation.validRows.some((row) => {
      const data = rowToProductData(row, refs);
      const matchField = data.product_code ? 'product_code' : data.barcode ? 'barcode' : data.sku ? 'sku' : null;
      if (!matchField) return false;
      const matchValue = String(data[matchField]).toLowerCase();
      return existingProducts.some((product) => String(product[matchField] || '').toLowerCase() === matchValue);
    });

    if (!hasExistingUpdates) {
      await runImport();
      return;
    }
    await confirmUpdate({ action: runImport, successMessage: null });
  };

  const unmappedCount = headers.filter((_, i) => !mapping[i]).length;
  const previewRows = parsedRows.slice(0, 15);

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            {t('csvImport.title')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-4">
            {/* Instructions */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              {t('csvImport.instructions')}
            </div>

            {/* Step: Upload */}
            {step === 'upload' && (
              <div className="space-y-4">
                <Button variant="outline" onClick={downloadTemplate} className="w-full border-dashed">
                  <Download className="w-4 h-4 mr-2" /> {t('csvImport.downloadTemplate')}
                </Button>
                <Separator />
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium">{t('csvImport.chooseFile')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('csvImport.browseOrDrop')}</p>
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
                  <p className="text-sm font-medium">{t('csvImport.reviewMapping')}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('csvImport.mappingHelp')}
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t('csvImport.csvColumn')}</TableHead>
                        <TableHead className="text-xs">{t('csvImport.applicationField')}</TableHead>
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
                              <option value="">{t('csvImport.skip')}</option>
                              {FIELD_DEFINITIONS.map((f) => (
                                <option key={f.key} value={f.key}>{fieldLabel(f.key)}{f.required ? ' *' : ''}</option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={() => setStep('preview')} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {t('csvImport.continuePreview')}
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
                  <Badge variant="outline">{t('csvImport.rowCount', { count: validation.totalRows })}</Badge>
                </div>

                {/* Validation summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium">{t('csvImport.validRows')}</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{validation.validRows.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      <span className="text-sm font-medium">{t('csvImport.invalidRows')}</span>
                    </div>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{validation.errors.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium">{t('csvImport.duplicates')}</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{validation.duplicates.length}</p>
                  </div>
                </div>

                {/* Import mode */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('csvImport.importBehavior')}</Label>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { key: 'skip', label: t('csvImport.skipDuplicates') },
                      { key: 'update', label: t('csvImport.updateExisting') },
                      { key: 'stop', label: t('csvImport.stopOnDuplicate') },
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
                        <TableHead className="text-xs">{t('products.productName')}</TableHead>
                        <TableHead className="text-xs">{t('products.productCode')}</TableHead>
                        <TableHead className="text-xs">{t('products.barcode')}</TableHead>
                        <TableHead className="text-xs">{t('products.category')}</TableHead>
                        <TableHead className="text-xs">{t('products.unit')}</TableHead>
                        <TableHead className="text-xs text-right">{t('products.purchasePrice')}</TableHead>
                        <TableHead className="text-xs text-right">{t('products.sellingPrice')}</TableHead>
                        <TableHead className="text-xs text-right">{t('products.stock')}</TableHead>
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
                  <p className="text-xs text-muted-foreground text-center">{t('csvImport.showingRows', { count: validation.totalRows })}</p>
                )}

                {/* Errors list */}
                {validation.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-rose-600">{t('csvImport.validationErrors', { count: validation.errors.length })}</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {validation.errors.slice(0, 50).map((err, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <span className="font-mono">{t('csvImport.rowNumber', { row: err.row })}</span>
                            <span>{t(err.message)}</span>
                          </div>
                        ))}
                        {validation.errors.length > 50 && <p className="text-xs text-muted-foreground">{t('csvImport.moreErrors', { count: validation.errors.length - 50 })}</p>}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Duplicates list */}
                {validation.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-600">{t('csvImport.duplicatesCount', { count: validation.duplicates.length })}</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {validation.duplicates.slice(0, 50).map((dup, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <span className="font-mono">{t('csvImport.rowNumber', { row: dup.row })}</span>
                            <span>{dup.name}</span>
                            <span className="text-muted-foreground">- {t(dup.reason)}</span>
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
                  <p className="font-medium">{t('csvImport.importing')}</p>
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} className="h-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%</span>
                    <span>{progress.processed} / {progress.total}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">{t('csvImport.imported')}</p>
                      <p className="font-bold text-emerald-600">{progress.imported}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">{t('csvImport.updated')}</p>
                      <p className="font-bold text-indigo-600">{progress.updated}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">{t('csvImport.skipped')}</p>
                      <p className="font-bold text-amber-600">{progress.skipped}</p>
                    </div>
                    <div className="text-center rounded-lg border p-2">
                      <p className="text-xs text-muted-foreground">{t('csvImport.failed')}</p>
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
                  <p className="text-lg font-bold">{t('csvImport.completed')}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">{t('csvImport.totalRows')}</p>
                    <p className="text-xl font-bold">{progress.total}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <p className="text-xs text-muted-foreground">{t('csvImport.imported')}</p>
                    <p className="text-xl font-bold text-emerald-600">{progress.imported}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-muted-foreground">{t('csvImport.updated')}</p>
                    <p className="text-xl font-bold text-indigo-600">{progress.updated}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800">
                    <p className="text-xs text-muted-foreground">{t('csvImport.failed')}</p>
                    <p className="text-xl font-bold text-rose-600">{progress.failed}</p>
                  </div>
                </div>

                {errorRows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-rose-600">{t('csvImport.failedRows', { count: errorRows.length })}</p>
                    <ScrollArea className="h-32 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {errorRows.slice(0, 50).map((err, i) => (
                          <div key={i} className="text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <span className="font-mono">{t('csvImport.rowNumber', { row: err.row })}</span>
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
                {t('csvImport.backToMapping')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!validation || validation.validRows.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t('csvImport.importProducts', { count: validation?.validRows.length || 0 })}
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              {errorRows.length > 0 && (
                <Button variant="outline" onClick={downloadErrors}>
                  <Download className="w-4 h-4 mr-2" /> {t('csvImport.downloadErrorReport')}
                </Button>
              )}
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => { onComplete(); handleClose(false); }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> {t('csvImport.viewProducts')}
              </Button>
            </>
          )}
          {(step === 'upload' || step === 'mapping') && (
            <Button variant="outline" onClick={() => handleClose(false)}>{t('common.cancel')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {confirmationDialog}
    </>
  );
}
