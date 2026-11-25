'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive, ArrowDown, ArrowUp, BarChart3, CalendarDays, Check, ChevronLeft,
  ChevronRight, CircleDollarSign, Download, Ellipsis, Eye, FileText, Filter,
  FolderCog, Landmark, Loader2, Pencil, Plus, Printer, Receipt, Repeat2,
  Search, Tags, Trash2, TrendingDown, Upload, Wallet, X,
} from 'lucide-react';
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useConfirmation } from '@/hooks/use-confirmation';
import { escapeCsvCell, escapeHtml } from '@/lib/safe-export';
import { fetchAllPages } from '@/lib/supabase-pagination';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_banking' | 'other';
type PaymentStatus = 'paid' | 'unpaid' | 'partially_paid' | 'overdue' | 'cancelled';
type Period = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
type View = 'expenses' | 'reports' | 'recurring' | 'categories';

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
};

type ExpensePayment = {
  id: string;
  bank_account_id: string | null;
  payment_date: string;
  amount: number | string;
  payment_method: PaymentMethod;
  transaction_reference: string | null;
  account: string | null;
  notes: string | null;
  recorded_by: string | null;
};

type AttachmentRow = {
  id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
};

type ExpenseRow = {
  id: string;
  store_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  reference_number: string | null;
  invoice_number: string | null;
  payee: string | null;
  amount: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  account: string | null;
  date: string;
  due_date: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  deleted_at: string | null;
  recurring_expense_id: string | null;
  expense_categories?: CategoryRow | null;
  expense_payments?: ExpensePayment[];
  expense_attachments?: AttachmentRow[];
};

type RecurringRow = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  payee: string | null;
  amount: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  payment_method: PaymentMethod | null;
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  next_due_date: string;
  end_date: string | null;
  is_enabled: boolean;
};

type AuditRow = {
  id: number;
  action: 'created' | 'updated' | 'deleted' | 'payment_recorded';
  actor_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

type BankAccountOption = {
  id: string;
  bank_name: string;
  account_number: string | null;
  balance: number | string | null;
};

type ExpenseForm = {
  title: string;
  category_id: string;
  date: string;
  due_date: string;
  amount: string;
  tax_amount: string;
  discount_amount: string;
  description: string;
  payee: string;
  reference_number: string;
  invoice_number: string;
  payment_method: PaymentMethod;
  bank_account_id: string;
  account: string;
  notes: string;
  initial_status: 'unpaid' | 'partially_paid' | 'paid';
  initial_paid: string;
};

type RecurringForm = {
  title: string;
  category_id: string;
  amount: string;
  tax_amount: string;
  discount_amount: string;
  payee: string;
  description: string;
  payment_method: PaymentMethod;
  interval: RecurringRow['interval'];
  start_date: string;
  next_due_date: string;
  end_date: string;
};

type PaymentForm = {
  payment_date: string;
  amount: string;
  payment_method: PaymentMethod;
  bank_account_id: string;
  transaction_reference: string;
  account: string;
  notes: string;
};

const PAGE_SIZE = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const CHART_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_banking', label: 'Mobile banking' },
  { value: 'other', label: 'Other' },
];
const EMPTY_EXPENSE_FORM: ExpenseForm = {
  title: '',
  category_id: '',
  date: dateInput(new Date()),
  due_date: dateInput(new Date()),
  amount: '',
  tax_amount: '0',
  discount_amount: '0',
  description: '',
  payee: '',
  reference_number: '',
  invoice_number: '',
  payment_method: 'cash',
  bank_account_id: '',
  account: '',
  notes: '',
  initial_status: 'unpaid',
  initial_paid: '',
};
const EMPTY_RECURRING_FORM: RecurringForm = {
  title: '',
  category_id: '',
  amount: '',
  tax_amount: '0',
  discount_amount: '0',
  payee: '',
  description: '',
  payment_method: 'cash',
  interval: 'monthly',
  start_date: dateInput(new Date()),
  next_due_date: dateInput(new Date()),
  end_date: '',
};
const EMPTY_PAYMENT_FORM: PaymentForm = {
  payment_date: dateInput(new Date()),
  amount: '',
  payment_method: 'cash',
  bank_account_id: '',
  transaction_reference: '',
  account: '',
  notes: '',
};

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPeriodRange(period: Exclude<Period, 'all' | 'custom'>): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'today') return { from: dateInput(start), to: dateInput(start) };
  if (period === 'yesterday') {
    start.setDate(start.getDate() - 1);
    return { from: dateInput(start), to: dateInput(start) };
  }
  if (period === 'thisWeek') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return { from: dateInput(start), to: dateInput(today) };
  }
  if (period === 'thisMonth') {
    return { from: dateInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: dateInput(today) };
  }
  if (period === 'lastMonth') {
    return {
      from: dateInput(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: dateInput(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  return { from: `${today.getFullYear()}-01-01`, to: dateInput(today) };
}

function money(value: number): string {
  return `৳${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expenseStatus(expense: ExpenseRow): PaymentStatus {
  if (expense.payment_status === 'cancelled') return 'cancelled';
  const remaining = Number(expense.total_amount) - Number(expense.paid_amount);
  if (remaining <= 0) return 'paid';
  if (Number(expense.paid_amount) > 0) return expense.due_date < dateInput(new Date()) ? 'overdue' : 'partially_paid';
  return expense.due_date < dateInput(new Date()) ? 'overdue' : 'unpaid';
}

function statusLabel(status: PaymentStatus): string {
  return ({
    paid: 'Paid',
    unpaid: 'Unpaid',
    partially_paid: 'Partially paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  })[status];
}

function statusClass(status: PaymentStatus): string {
  return ({
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    unpaid: 'border-amber-200 bg-amber-50 text-amber-700',
    partially_paid: 'border-sky-200 bg-sky-50 text-sky-700',
    overdue: 'border-rose-200 bg-rose-50 text-rose-700',
    cancelled: 'border-muted bg-muted text-muted-foreground',
  })[status];
}

function inRange(date: string, from: string, to: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unexpected error';
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recurring, setRecurring] = useState<RecurringRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>('expenses');
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [dateFrom, setDateFrom] = useState(getPeriodRange('thisMonth').from);
  const [dateTo, setDateTo] = useState(getPeriodRange('thisMonth').to);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [payeeFilter, setPayeeFilter] = useState('');
  const [referenceFilter, setReferenceFilter] = useState('');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'amount' | 'category' | 'status'>('date');
  const [sortAscending, setSortAscending] = useState(false);
  const [page, setPage] = useState(1);

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(EMPTY_EXPENSE_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<ExpenseRow | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(EMPTY_PAYMENT_FORM);
  const [detailExpense, setDetailExpense] = useState<ExpenseRow | null>(null);
  const [detailAudit, setDetailAudit] = useState<AuditRow[]>([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState<CategoryRow | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#4f46e5' });
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [recurringEditing, setRecurringEditing] = useState<RecurringRow | null>(null);
  const [recurringForm, setRecurringForm] = useState<RecurringForm>(EMPTY_RECURRING_FORM);
  const [recurringHistory, setRecurringHistory] = useState<RecurringRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState('');
  const { confirmAction, dialog: confirmationDialog } = useConfirmation();

  const can = useCallback((key: string) => permissions.includes('*') || permissions.includes(key), [permissions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageMessage('');
    const permissionResult = await supabase.rpc('get_my_permissions');
    if (permissionResult.error) {
      setPermissions([]);
      toast.error(`Could not verify expense permissions: ${permissionResult.error.message}`);
    } else {
      setPermissions((permissionResult.data || []) as string[]);
    }

    const [expenseResult, categoryResult, recurringResult] = await Promise.all([
      fetchAllPages<ExpenseRow>((from, to) => supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .range(from, to)),
      supabase.from('expense_categories').select('id, name, description, color, is_active').order('name'),
      supabase.from('recurring_expenses').select('*').order('next_due_date'),
    ]);

    const failed = [expenseResult, categoryResult, recurringResult]
      .find((result) => result.error);
    if (failed?.error) {
      const message = failed.error.message;
      setPageMessage(`Could not load expenses: ${message}`);
      toast.error(`Could not load expenses: ${message}`);
      setLoading(false);
      return;
    }

    const [paymentResult, attachmentResult] = await Promise.all([
      fetchAllPages<ExpensePayment & { expense_id: string }>((from, to) => supabase
        .from('expense_payments')
        .select('id, expense_id, bank_account_id, payment_date, amount, payment_method, transaction_reference, account, notes, recorded_by')
        .order('payment_date', { ascending: false })
        .range(from, to)),
      fetchAllPages<AttachmentRow & { expense_id: string }>((from, to) => supabase
        .from('expense_attachments')
        .select('id, expense_id, object_path, file_name, mime_type, file_size')
        .order('created_at', { ascending: false })
        .range(from, to)),
    ]);
    const relatedDataError = paymentResult.error || attachmentResult.error;
    if (relatedDataError) {
      setPageMessage(`Could not load expenses: ${relatedDataError.message}`);
      toast.error(`Could not load expenses: ${relatedDataError.message}`);
      setLoading(false);
      return;
    }

    const categories = (categoryResult.data || []) as CategoryRow[];
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const paymentsByExpense = new Map<string, ExpensePayment[]>();
    (paymentResult.data || []).forEach(({ expense_id, ...payment }) => {
      const payments = paymentsByExpense.get(expense_id) || [];
      payments.push(payment);
      paymentsByExpense.set(expense_id, payments);
    });
    const attachmentsByExpense = new Map<string, AttachmentRow[]>();
    (attachmentResult.data || []).forEach(({ expense_id, ...attachment }) => {
      const attachments = attachmentsByExpense.get(expense_id) || [];
      attachments.push(attachment);
      attachmentsByExpense.set(expense_id, attachments);
    });

    setExpenses(((expenseResult.data || []) as ExpenseRow[]).map((expense) => ({
      ...expense,
      expense_categories: expense.category_id ? categoriesById.get(expense.category_id) || null : null,
      expense_payments: paymentsByExpense.get(expense.id) || [],
      expense_attachments: attachmentsByExpense.get(expense.id) || [],
    })));
    setCategories(categories);
    setRecurring((recurringResult.data || []) as RecurringRow[]);
    const loadedPermissions = permissionResult.error ? [] : (permissionResult.data || []) as string[];
    if (loadedPermissions.includes('*') || loadedPermissions.includes('reports.view')) {
      const { data: accounts, error: accountError } = await supabase.from('bank_accounts')
        .select('id, bank_name, account_number, balance')
        .eq('status', 'active')
        .order('bank_name');
      if (accountError) toast.error(`Could not load bank accounts: ${accountError.message}`);
      setBankAccounts((accounts || []) as BankAccountOption[]);
    } else {
      setBankAccounts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeFiltersCount = [
    categoryFilter !== 'all',
    statusFilter !== 'all',
    methodFilter !== 'all',
    Boolean(payeeFilter.trim()),
    Boolean(referenceFilter.trim()),
    Boolean(createdByFilter.trim()),
    Boolean(minAmount),
    Boolean(maxAmount),
  ].filter(Boolean).length;

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = expenses.filter((expense) => {
      const status = expenseStatus(expense);
      const categoryName = expense.expense_categories?.name || '';
      return inRange(expense.date, dateFrom, dateTo)
        && (categoryFilter === 'all' || expense.category_id === categoryFilter)
        && (statusFilter === 'all' || status === statusFilter)
        && (methodFilter === 'all' || expense.payment_method === methodFilter
          || expense.expense_payments?.some((payment) => payment.payment_method === methodFilter))
        && (!payeeFilter || (expense.payee || '').toLowerCase().includes(payeeFilter.toLowerCase()))
        && (!referenceFilter || (expense.reference_number || '').toLowerCase().includes(referenceFilter.toLowerCase()))
        && (!createdByFilter || (expense.created_by || '').toLowerCase().includes(createdByFilter.toLowerCase()))
        && (!minAmount || Number(expense.total_amount) >= Number(minAmount))
        && (!maxAmount || Number(expense.total_amount) <= Number(maxAmount))
        && (!query || [
          expense.title,
          expense.description,
          expense.payee,
          expense.reference_number,
          expense.invoice_number,
          categoryName,
          expense.id,
        ].some((value) => value?.toLowerCase().includes(query)));
    });

    return rows.sort((a, b) => {
      let compare = 0;
      if (sortKey === 'amount') compare = Number(a.total_amount) - Number(b.total_amount);
      if (sortKey === 'date') compare = a.date.localeCompare(b.date);
      if (sortKey === 'category') compare = (a.expense_categories?.name || '').localeCompare(b.expense_categories?.name || '');
      if (sortKey === 'status') compare = expenseStatus(a).localeCompare(expenseStatus(b));
      return sortAscending ? compare : -compare;
    });
  }, [
    expenses, dateFrom, dateTo, categoryFilter, statusFilter, methodFilter, payeeFilter,
    referenceFilter, createdByFilter, minAmount, maxAmount, search, sortKey, sortAscending,
  ]);

  const periodRows = useMemo(
    () => expenses.filter((expense) => inRange(expense.date, dateFrom, dateTo)
      && expenseStatus(expense) !== 'cancelled'),
    [expenses, dateFrom, dateTo]
  );
  const activeRows = useMemo(
    () => expenses.filter((expense) => expenseStatus(expense) !== 'cancelled'),
    [expenses]
  );
  const totalForRange = periodRows.reduce((total, expense) => total + Number(expense.total_amount), 0);
  const todayValue = dateInput(new Date());
  const todayTotal = activeRows
    .filter((expense) => expense.date === todayValue)
    .reduce((total, expense) => total + Number(expense.total_amount), 0);
  const monthKey = todayValue.slice(0, 7);
  const monthTotal = activeRows
    .filter((expense) => expense.date.slice(0, 7) === monthKey)
    .reduce((total, expense) => total + Number(expense.total_amount), 0);
  const yearTotal = activeRows
    .filter((expense) => expense.date.slice(0, 4) === todayValue.slice(0, 4))
    .reduce((total, expense) => total + Number(expense.total_amount), 0);
  const pendingTotal = periodRows.reduce(
    (total, expense) => total + Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount)),
    0
  );
  const paidCount = periodRows.filter((expense) => expenseStatus(expense) === 'paid').length;
  const overdueCount = periodRows.filter((expense) => expenseStatus(expense) === 'overdue').length;
  const averageExpense = periodRows.length ? totalForRange / periodRows.length : 0;

  const categoryChart = useMemo(() => {
    const totals = new Map<string, number>();
    periodRows.forEach((expense) => {
      const label = expense.expense_categories?.name || 'Uncategorized';
      totals.set(label, (totals.get(label) || 0) + Number(expense.total_amount));
    });
    return Array.from(totals, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [periodRows]);

  const payeeChart = useMemo(() => {
    const totals = new Map<string, number>();
    periodRows.forEach((expense) => {
      const name = expense.payee?.trim() || 'Unspecified payee';
      totals.set(name, (totals.get(name) || 0) + Number(expense.total_amount));
    });
    return Array.from(totals, ([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [periodRows]);

  const trendChart = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(new Date().getFullYear(), new Date().getMonth() - 11 + index, 1);
      return {
        key: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
        name: month.toLocaleDateString(undefined, { month: 'short' }),
        amount: 0,
      };
    });
    const totals = new Map(months.map((month) => [month.key, 0]));
    activeRows.forEach((expense) => {
      const key = expense.date.slice(0, 7);
      if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + Number(expense.total_amount));
    });
    return months.map((month) => ({ ...month, amount: totals.get(month.key) || 0 }));
  }, [activeRows]);

  const paymentMethodChart = useMemo(() => {
    const totals = new Map<string, number>();
    periodRows.forEach((expense) => {
      (expense.expense_payments || []).forEach((payment) => {
        totals.set(payment.payment_method, (totals.get(payment.payment_method) || 0) + Number(payment.amount));
      });
    });
    return Array.from(totals, ([method, amount]) => ({
      name: PAYMENT_METHODS.find((item) => item.value === method)?.label || method,
      amount,
    }));
  }, [periodRows]);

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const visibleExpenses = filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, categoryFilter, statusFilter, methodFilter, payeeFilter, referenceFilter, createdByFilter, minAmount, maxAmount]);

  const selectPeriod = (value: Period) => {
    setPeriod(value);
    if (value !== 'all' && value !== 'custom') {
      const range = getPeriodRange(value);
      setDateFrom(range.from);
      setDateTo(range.to);
    } else if (value === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const openNewExpense = (copy?: ExpenseRow) => {
    setEditingExpense(null);
    setFiles([]);
    setExpenseForm(copy ? {
      ...EMPTY_EXPENSE_FORM,
      title: copy.title,
      category_id: copy.category_id || '',
      date: dateInput(new Date()),
      due_date: dateInput(new Date()),
      amount: String(copy.amount),
      tax_amount: String(copy.tax_amount),
      discount_amount: String(copy.discount_amount),
      description: copy.description || '',
      payee: copy.payee || '',
      reference_number: copy.reference_number || '',
      invoice_number: copy.invoice_number || '',
      payment_method: copy.payment_method || 'cash',
      account: copy.account || '',
      notes: copy.notes || '',
      initial_status: 'unpaid',
      initial_paid: '',
    } : { ...EMPTY_EXPENSE_FORM });
    setExpenseDialogOpen(true);
  };

  const openEditExpense = (expense: ExpenseRow) => {
    setEditingExpense(expense);
    setFiles([]);
    setExpenseForm({
      ...EMPTY_EXPENSE_FORM,
      title: expense.title,
      category_id: expense.category_id || '',
      date: expense.date,
      due_date: expense.due_date,
      amount: String(expense.amount),
      tax_amount: String(expense.tax_amount),
      discount_amount: String(expense.discount_amount),
      description: expense.description || '',
      payee: expense.payee || '',
      reference_number: expense.reference_number || '',
      invoice_number: expense.invoice_number || '',
      payment_method: expense.payment_method || 'cash',
      account: expense.account || '',
      notes: expense.notes || '',
    });
    setExpenseDialogOpen(true);
  };

  const handleExpenseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expenseForm.title.trim() || !expenseForm.category_id || !expenseForm.date) {
      toast.error('Expense title, category and date are required.');
      return;
    }
    const amount = Number(expenseForm.amount);
    const tax = Number(expenseForm.tax_amount || 0);
    const discount = Number(expenseForm.discount_amount || 0);
    const total = amount + tax - discount;
    const paid = Number(expenseForm.initial_paid || 0);
    if (![amount, tax, discount, paid].every(Number.isFinite) || amount < 0 || tax < 0 || discount < 0 || total < 0) {
      toast.error('Enter valid non-negative amounts. The total cannot be negative.');
      return;
    }
    if (!editingExpense && (
      (expenseForm.initial_status === 'unpaid' && paid !== 0)
      || (expenseForm.initial_status === 'paid' && (total <= 0 || paid !== total))
      || (expenseForm.initial_status === 'partially_paid' && (paid <= 0 || paid >= total))
    )) {
      toast.error('Paid amount must match the selected payment status and cannot exceed the total.');
      return;
    }
    if (paid > 0 && !can('expenses.edit')) {
      toast.error('You need expense edit permission to record a payment.');
      return;
    }
    if (paid > 0 && expenseForm.payment_method === 'bank_transfer' && !expenseForm.bank_account_id) {
      toast.error('Choose the bank account used for the initial transfer.');
      return;
    }
    if (files.some((file) => file.size <= 0 || file.size > MAX_FILE_SIZE || !ALLOWED_FILE_TYPES.has(file.type))) {
      toast.error('Attachments must be JPG, PNG, WEBP or PDF files no larger than 10 MB.');
      return;
    }

    setSaving(true);
    const payload = {
      category_id: expenseForm.category_id,
      title: expenseForm.title.trim(),
      description: expenseForm.description.trim() || null,
      amount,
      tax_amount: tax,
      discount_amount: discount,
      date: expenseForm.date,
      due_date: expenseForm.due_date || expenseForm.date,
      payee: expenseForm.payee.trim() || null,
      reference_number: expenseForm.reference_number.trim() || null,
      invoice_number: expenseForm.invoice_number.trim() || null,
      payment_method: expenseForm.payment_method,
      account: expenseForm.account.trim() || null,
      notes: expenseForm.notes.trim() || null,
    };

    try {
      const expenseId = editingExpense?.id || crypto.randomUUID();
      const { error } = editingExpense
        ? await supabase.from('expenses').update(payload).eq('id', expenseId)
        : await supabase.from('expenses').insert({ ...payload, id: expenseId });
      if (error) throw error;

      if (!editingExpense && paid > 0) {
        const { error: paymentError } = await supabase.from('expense_payments').insert({
          expense_id: expenseId,
          payment_date: expenseForm.date,
          amount: paid,
          payment_method: expenseForm.payment_method,
          bank_account_id: expenseForm.bank_account_id || null,
          account: expenseForm.account.trim() || null,
        });
        if (paymentError) {
          toast.error(`Expense was saved, but its initial payment failed: ${paymentError.message}`);
          setExpenseDialogOpen(false);
          await loadData();
          return;
        }
      }

      if (files.length) {
        const { data: storeId, error: storeError } = await supabase.rpc('get_my_store_id');
        if (storeError || !storeId) throw storeError || new Error('Could not verify the current store for attachments.');
        for (const file of files) {
          const path = `${storeId}/${expenseId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error: uploadError } = await supabase.storage
            .from('expense-attachments')
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw uploadError;
          const { error: metadataError } = await supabase.from('expense_attachments').insert({
            expense_id: expenseId,
            object_path: path,
            file_name: file.name,
            mime_type: file.type,
            file_size: file.size,
          });
          if (metadataError) {
            await supabase.storage.from('expense-attachments').remove([path]);
            throw metadataError;
          }
        }
      }

      toast.success(editingExpense ? 'Expense updated.' : 'Expense created.');
      setExpenseDialogOpen(false);
      setEditingExpense(null);
      setFiles([]);
      await loadData();
    } catch (error) {
      toast.error(`Could not save expense: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const openPaymentDialog = (expense: ExpenseRow, fullPayment = false) => {
    const due = Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount));
    setPaymentTarget(expense);
    setPaymentForm({
      ...EMPTY_PAYMENT_FORM,
      amount: fullPayment ? due.toFixed(2) : '',
      payment_method: expense.payment_method || 'cash',
      bank_account_id: bankAccounts[0]?.id || '',
    });
    setPaymentDialogOpen(true);
  };

  const openExpenseDetails = async (expense: ExpenseRow) => {
    setDetailExpense(expense);
    setDetailAudit([]);
    setDetailAuditLoading(true);
    const { data, error } = await supabase.from('expense_audit_logs')
      .select('id, action, actor_id, before_data, after_data, created_at')
      .eq('expense_id', expense.id)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(`Could not load expense audit history: ${error.message}`);
      setDetailAuditLoading(false);
      return;
    }
    setDetailAudit((data || []) as AuditRow[]);
    setDetailAuditLoading(false);
  };

  const handlePaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget) return;
    const amount = Number(paymentForm.amount);
    const due = Number(paymentTarget.total_amount) - Number(paymentTarget.paid_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > due) {
      toast.error(`Payment must be greater than zero and no more than the remaining due (${money(due)}).`);
      return;
    }
    if (paymentForm.payment_method === 'bank_transfer' && !paymentForm.bank_account_id) {
      toast.error('Choose the bank account used for this transfer.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('expense_payments').insert({
      expense_id: paymentTarget.id,
      payment_date: paymentForm.payment_date,
      amount,
      payment_method: paymentForm.payment_method,
      bank_account_id: paymentForm.bank_account_id || null,
      transaction_reference: paymentForm.transaction_reference.trim() || null,
      account: paymentForm.account.trim() || null,
      notes: paymentForm.notes.trim() || null,
    });
    if (error) {
      toast.error(`Could not record payment: ${error.message}`);
    } else {
      toast.success('Payment recorded.');
      setPaymentDialogOpen(false);
      setPaymentTarget(null);
      await loadData();
    }
    setSaving(false);
  };

  const archiveExpense = async (expense: ExpenseRow) => {
    await confirmAction({
      title: 'Archive expense',
      description: `Archive “${expense.title}”? Payment history will be retained for audit.`,
      confirmLabel: 'Archive expense',
      destructive: true,
      successMessage: 'Expense archived.',
      action: async () => {
        const { error } = await supabase.from('expenses')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', expense.id);
        if (error) throw error;
        await loadData();
      },
    });
  };

  const cancelExpense = async (expense: ExpenseRow) => {
    if (Number(expense.paid_amount) > 0) {
      toast.error('Record a refund before cancelling an expense with payments.');
      return;
    }
    await confirmAction({
      title: 'Cancel expense',
      description: `Cancel “${expense.title}”? This expense will no longer count in regular expense totals.`,
      confirmLabel: 'Cancel expense',
      destructive: true,
      successMessage: 'Expense cancelled.',
      action: async () => {
        const { error } = await supabase.from('expenses')
          .update({ payment_status: 'cancelled' })
          .eq('id', expense.id);
        if (error) throw error;
        await loadData();
      },
    });
  };

  const exportCsv = (rows: ExpenseRow[], fileName = 'expenses.csv') => {
    if (!can('expenses.export')) {
      toast.error('You do not have permission to export expenses.');
      return;
    }
    const header = [
      'Expense ID', 'Date', 'Title', 'Category', 'Reference', 'Supplier / Payee',
      'Amount', 'Tax', 'Discount', 'Total', 'Paid', 'Due', 'Payment Method', 'Status', 'Created By',
    ];
    const csvRows = rows.map((expense) => [
      expense.id,
      expense.date,
      expense.title,
      expense.expense_categories?.name || '',
      expense.reference_number || '',
      expense.payee || '',
      Number(expense.amount),
      Number(expense.tax_amount),
      Number(expense.discount_amount),
      Number(expense.total_amount),
      Number(expense.paid_amount),
      Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount)),
      expense.payment_method || '',
      statusLabel(expenseStatus(expense)),
      expense.created_by || '',
    ]);
    const content = [header, ...csvRows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printExpenses = (rows: ExpenseRow[]) => {
    if (!can('expenses.print')) {
      toast.error('You do not have permission to print expenses.');
      return;
    }
    const reportRows = rows.map((expense) => `<tr>
      <td>${escapeHtml(expense.date)}</td><td>${escapeHtml(expense.title)}</td>
      <td>${escapeHtml(expense.expense_categories?.name || '-')}</td>
      <td>${escapeHtml(expense.payee || '-')}</td><td>${money(Number(expense.total_amount))}</td>
      <td>${escapeHtml(statusLabel(expenseStatus(expense)))}</td>
    </tr>`).join('');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      toast.error('Allow pop-ups to print this report.');
      return;
    }
    win.opener = null;
    win.document.write(`<html><head><title>Expense report</title><style>
      body{font:14px Arial,sans-serif;padding:24px;color:#111827}h1{font-size:22px}
      table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}
      th{background:#f3f4f6}.summary{font-size:16px;margin:12px 0}
      </style></head><body><h1>Expense report</h1>
      <p class="summary">${rows.length} expenses · ${money(rows.reduce((sum, item) => sum + Number(item.total_amount), 0))}</p>
      <table><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Payee</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${reportRows}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const printExpense = (expense: ExpenseRow) => {
    if (!can('expenses.print')) {
      toast.error('You do not have permission to print expenses.');
      return;
    }
    const payments = (expense.expense_payments || []).map((payment) => `<tr>
      <td>${escapeHtml(payment.payment_date)}</td>
      <td>${escapeHtml(PAYMENT_METHODS.find((item) => item.value === payment.payment_method)?.label || payment.payment_method)}</td>
      <td>${escapeHtml(payment.transaction_reference || '-')}</td>
      <td>${money(Number(payment.amount))}</td>
    </tr>`).join('');
    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) {
      toast.error('Allow pop-ups to print this expense.');
      return;
    }
    win.opener = null;
    win.document.write(`<html><head><title>${escapeHtml(expense.title)}</title><style>
      body{font:14px Arial,sans-serif;padding:28px;color:#111827}h1{font-size:22px}
      table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #d1d5db;padding:8px;text-align:left}
      .amount{font-size:18px;font-weight:bold}
      </style></head><body><h1>${escapeHtml(expense.title)}</h1>
      <p>${escapeHtml(expense.date)} · ${escapeHtml(expense.expense_categories?.name || 'Uncategorized')}</p>
      <p>${escapeHtml(expense.description || '')}</p>
      <p>Payee: ${escapeHtml(expense.payee || '-')} · Reference: ${escapeHtml(expense.reference_number || '-')}</p>
      <p class="amount">Total: ${money(Number(expense.total_amount))}</p>
      <p>Paid: ${money(Number(expense.paid_amount))} · Due: ${money(Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount)))} · ${escapeHtml(statusLabel(expenseStatus(expense)))}</p>
      <h2>Payments</h2><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>${payments || '<tr><td colspan="4">No payments recorded.</td></tr>'}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const openAttachment = async (attachment: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from('expense-attachments')
      .createSignedUrl(attachment.object_path, 300, { download: attachment.mime_type === 'application/pdf' });
    if (error) {
      toast.error(`Could not open attachment: ${error.message}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const deleteAttachment = async (attachment: AttachmentRow) => {
    await confirmAction({
      title: 'Delete attachment',
      description: `Delete “${attachment.file_name}”?`,
      confirmLabel: 'Delete file',
      destructive: true,
      successMessage: 'Attachment deleted.',
      action: async () => {
        const { error: storageError } = await supabase.storage
          .from('expense-attachments')
          .remove([attachment.object_path]);
        if (storageError) throw storageError;
        const { error: metadataError } = await supabase.from('expense_attachments')
          .delete().eq('id', attachment.id);
        if (metadataError) throw metadataError;
        await loadData();
      },
    });
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    setSaving(true);
    const request = categoryEditing
      ? supabase.from('expense_categories').update({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        color: categoryForm.color,
      }).eq('id', categoryEditing.id)
      : supabase.from('expense_categories').insert({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        color: categoryForm.color,
      });
    const { error } = await request;
    if (error) toast.error(`Could not save category: ${error.message}`);
    else {
      toast.success(categoryEditing ? 'Category updated.' : 'Category created.');
      setCategoryEditing(null);
      setCategoryForm({ name: '', description: '', color: '#4f46e5' });
      await loadData();
    }
    setSaving(false);
  };

  const toggleCategory = async (category: CategoryRow) => {
    const { error } = await supabase.from('expense_categories')
      .update({ is_active: !category.is_active }).eq('id', category.id);
    if (error) toast.error(`Could not update category: ${error.message}`);
    else {
      toast.success(category.is_active ? 'Category deactivated.' : 'Category activated.');
      await loadData();
    }
  };

  const deleteCategory = async (category: CategoryRow) => {
    await confirmAction({
      title: 'Delete category',
      description: `Delete “${category.name}”? Categories in use cannot be deleted; deactivate them instead.`,
      confirmLabel: 'Delete category',
      destructive: true,
      successMessage: 'Category deleted.',
      action: async () => {
        const { error } = await supabase.from('expense_categories').delete().eq('id', category.id);
        if (error) {
          if (error.code === '23503') throw new Error('This category is used by existing expenses. Deactivate it instead.');
          throw error;
        }
        await loadData();
      },
    });
  };

  const openRecurringForm = (template?: RecurringRow) => {
    setRecurringEditing(template || null);
    setRecurringForm(template ? {
      title: template.title,
      category_id: template.category_id || '',
      amount: String(template.amount),
      tax_amount: String(template.tax_amount),
      discount_amount: String(template.discount_amount),
      payee: template.payee || '',
      description: template.description || '',
      payment_method: template.payment_method || 'cash',
      interval: template.interval,
      start_date: template.start_date,
      next_due_date: template.next_due_date,
      end_date: template.end_date || '',
    } : { ...EMPTY_RECURRING_FORM });
    setRecurringDialogOpen(true);
  };

  const saveRecurring = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(recurringForm.amount);
    const tax = Number(recurringForm.tax_amount || 0);
    const discount = Number(recurringForm.discount_amount || 0);
    if (!recurringForm.title.trim() || !recurringForm.category_id || !Number.isFinite(amount)
      || !Number.isFinite(tax) || !Number.isFinite(discount)
      || amount < 0 || tax < 0 || discount < 0 || amount + tax < discount
      || recurringForm.next_due_date < recurringForm.start_date
      || (recurringForm.end_date && recurringForm.end_date < recurringForm.start_date)) {
      toast.error('Check the title, category, dates and non-negative amount fields.');
      return;
    }
    setSaving(true);
    const payload = {
      title: recurringForm.title.trim(),
      category_id: recurringForm.category_id,
      amount,
      tax_amount: tax,
      discount_amount: discount,
      payee: recurringForm.payee.trim() || null,
      description: recurringForm.description.trim() || null,
      payment_method: recurringForm.payment_method,
      interval: recurringForm.interval,
      start_date: recurringForm.start_date,
      next_due_date: recurringForm.next_due_date,
      end_date: recurringForm.end_date || null,
      is_enabled: true,
    };
    const request = recurringEditing
      ? supabase.from('recurring_expenses').update(payload).eq('id', recurringEditing.id)
      : supabase.from('recurring_expenses').insert(payload);
    const { error } = await request;
    if (error) toast.error(`Could not save recurring expense: ${error.message}`);
    else {
      toast.success(recurringEditing ? 'Recurring expense updated.' : 'Recurring expense created.');
      setRecurringDialogOpen(false);
      await loadData();
    }
    setSaving(false);
  };

  const toggleRecurring = async (template: RecurringRow) => {
    const { error } = await supabase.from('recurring_expenses')
      .update({ is_enabled: !template.is_enabled }).eq('id', template.id);
    if (error) toast.error(`Could not update recurring expense: ${error.message}`);
    else {
      toast.success(template.is_enabled ? 'Recurring expense disabled.' : 'Recurring expense enabled.');
      await loadData();
    }
  };

  const openRecurringHistory = (template: RecurringRow) => {
    setRecurringHistory(template);
    setHistoryOpen(true);
  };

  const historyExpenses = useMemo(
    () => recurringHistory ? expenses.filter((expense) => expense.recurring_expense_id === recurringHistory.id) : [],
    [expenses, recurringHistory]
  );

  const openCategoryEditor = (category?: CategoryRow) => {
    setCategoryEditing(category || null);
    setCategoryForm(category
      ? { name: category.name, description: category.description || '', color: category.color }
      : { name: '', description: '', color: '#4f46e5' });
    setCategoryDialogOpen(true);
  };

  const clearFilters = () => {
    setCategoryFilter('all');
    setStatusFilter('all');
    setMethodFilter('all');
    setPayeeFilter('');
    setReferenceFilter('');
    setCreatedByFilter('');
    setMinAmount('');
    setMaxAmount('');
    setSearch('');
    selectPeriod('all');
  };

  const renderExpenseTable = (rows: ExpenseRow[]) => (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search title, payee, reference…" value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
            <Filter className="mr-2 h-4 w-4" /> Filters{activeFiltersCount ? ` (${activeFiltersCount})` : ''}
          </Button>
          {can('expenses.export') && <Button variant="outline" size="sm" onClick={() => exportCsv(rows)}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>}
          {can('expenses.print') && <Button variant="outline" size="sm" onClick={() => printExpenses(rows)}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>}
          {can('expenses.create') && <Button size="sm" onClick={() => openNewExpense()}>
            <Plus className="mr-2 h-4 w-4" /> Add expense
          </Button>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense ID</TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1" onClick={() => {
                  setSortKey('date'); setSortAscending(sortKey === 'date' ? !sortAscending : false);
                }}>Date {sortKey === 'date' && (sortAscending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
              </TableHead>
              <TableHead>Title / Reference</TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1" onClick={() => {
                  setSortKey('category'); setSortAscending(sortKey === 'category' ? !sortAscending : true);
                }}>Category {sortKey === 'category' && (sortAscending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
              </TableHead>
              <TableHead>Supplier / Payee</TableHead>
              <TableHead className="text-right">
                <button className="inline-flex items-center gap-1" onClick={() => {
                  setSortKey('amount'); setSortAscending(sortKey === 'amount' ? !sortAscending : true);
                }}>Total {sortKey === 'amount' && (sortAscending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1" onClick={() => {
                  setSortKey('status'); setSortAscending(sortKey === 'status' ? !sortAscending : true);
                }}>Status {sortKey === 'status' && (sortAscending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</button>
              </TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Payment method</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 6 }, (_, index) => (
              <TableRow key={index}>{Array.from({ length: 11 }, (_, cell) => (
                <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>
              ))}</TableRow>
            )) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="py-12 text-center">
                <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No expenses found</p>
                <p className="mt-1 text-sm text-muted-foreground">Try another date range or clear your filters.</p>
                {can('expenses.create') && <Button className="mt-4" size="sm" onClick={() => openNewExpense()}>
                  <Plus className="mr-2 h-4 w-4" /> Add an expense
                </Button>}
              </TableCell></TableRow>
            ) : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((expense) => {
              const status = expenseStatus(expense);
              return (
                <TableRow key={expense.id}>
                  <TableCell className="font-mono text-xs">{expense.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(expense.date)}</TableCell>
                  <TableCell className="min-w-[180px]">
                    <p className="font-medium">{expense.title}</p>
                    <p className="text-xs text-muted-foreground">{expense.reference_number || expense.invoice_number || '—'}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{expense.expense_categories?.name || 'Uncategorized'}</Badge></TableCell>
                  <TableCell>{expense.payee || '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{money(Number(expense.total_amount))}</TableCell>
                  <TableCell><Badge variant="outline" className={statusClass(status)}>{statusLabel(status)}</Badge></TableCell>
                  <TableCell>{money(Number(expense.tax_amount))}</TableCell>
                  <TableCell>{PAYMENT_METHODS.find((item) => item.value === expense.payment_method)?.label || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{expense.created_by?.slice(0, 8) || '—'}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Expense actions"><Ellipsis className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void openExpenseDetails(expense)}><Eye className="mr-2 h-4 w-4" /> View details</DropdownMenuItem>
                        {can('expenses.edit') && status !== 'cancelled' && (
                          <DropdownMenuItem onSelect={() => openEditExpense(expense)}><Pencil className="mr-2 h-4 w-4" /> Edit expense</DropdownMenuItem>
                        )}
                        {can('expenses.create') && <DropdownMenuItem onSelect={() => openNewExpense(expense)}>
                          <Repeat2 className="mr-2 h-4 w-4" /> Duplicate
                        </DropdownMenuItem>}
                        {can('expenses.edit') && status !== 'cancelled' && status !== 'paid' && (
                          <>
                            <DropdownMenuItem onSelect={() => openPaymentDialog(expense, true)}>
                              <Check className="mr-2 h-4 w-4" /> Mark as paid
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openPaymentDialog(expense)}>
                              <CircleDollarSign className="mr-2 h-4 w-4" /> Partially pay
                            </DropdownMenuItem>
                          </>
                        )}
                        {can('expenses.edit') && status !== 'cancelled' && Number(expense.paid_amount) === 0 && (
                          <DropdownMenuItem onSelect={() => void cancelExpense(expense)}>Cancel expense</DropdownMenuItem>
                        )}
                        {(can('expenses.print') || can('expenses.delete')) && <DropdownMenuSeparator />}
                        {can('expenses.print') && <DropdownMenuItem onSelect={() => printExpense(expense)}>
                          <Printer className="mr-2 h-4 w-4" /> Print details
                        </DropdownMenuItem>}
                        {can('expenses.delete') && <DropdownMenuItem className="text-destructive" onSelect={() => void archiveExpense(expense)}>
                          <Archive className="mr-2 h-4 w-4" /> Archive
                        </DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>Showing {Math.min((page - 1) * PAGE_SIZE + 1, rows.length)}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track operating costs, payments, recurring bills and expense reports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={period}
            onChange={(event) => selectPeriod(event.target.value as Period)}
            aria-label="Dashboard date range"
          >
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisWeek">This week</option>
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="thisYear">This year</option>
            <option value="custom">Custom range</option>
          </select>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input aria-label="Start date" type="date" className="w-auto" value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)} />
              <span className="text-muted-foreground">–</span>
              <Input aria-label="End date" type="date" className="w-auto" value={dateTo}
                onChange={(event) => setDateTo(event.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {([
          ['expenses', 'Expenses', Receipt],
          ['reports', 'Reports', BarChart3],
          ['recurring', 'Recurring', Repeat2],
          ['categories', 'Categories', Tags],
        ] as const).map(([key, label, Icon]) => (
          <Button key={key} variant={view === key ? 'default' : 'ghost'} size="sm" onClick={() => setView(key)}>
            <Icon className="mr-2 h-4 w-4" />{label}
          </Button>
        ))}
        {view === 'expenses' && <a className="ml-auto self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          href="/admin/reports/purchase-expense">Purchase &amp; Expense Report</a>}
      </div>

      {pageMessage && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{pageMessage}</div>}

      {view === 'expenses' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Expenses in range', value: money(totalForRange), icon: Receipt, tone: 'text-indigo-600 bg-indigo-50' },
              { label: "Today's expenses", value: money(todayTotal), icon: CalendarDays, tone: 'text-sky-600 bg-sky-50' },
              { label: "This month's expenses", value: money(monthTotal), icon: Wallet, tone: 'text-amber-600 bg-amber-50' },
              { label: "This year's expenses", value: money(yearTotal), icon: TrendingDown, tone: 'text-rose-600 bg-rose-50' },
              { label: 'Pending balance', value: money(pendingTotal), icon: CircleDollarSign, tone: 'text-orange-600 bg-orange-50' },
              { label: 'Paid expenses', value: String(paidCount), icon: Check, tone: 'text-emerald-600 bg-emerald-50' },
              { label: 'Overdue expenses', value: String(overdueCount), icon: CalendarDays, tone: 'text-red-600 bg-red-50' },
              { label: 'Average expense', value: money(averageExpense), icon: BarChart3, tone: 'text-violet-600 bg-violet-50' },
            ].map((stat) => (
              <Card key={stat.label} className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.tone}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                  <p className="truncate text-lg font-bold">{stat.value}</p>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-4 xl:col-span-2">
              <div className="mb-4">
                <h2 className="font-semibold">Monthly expense trend</h2>
                <p className="text-xs text-muted-foreground">Recorded expenses over the last 12 months</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChart}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => `৳${value}`} />
                    <Tooltip formatter={(value) => money(Number(value))} />
                    <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-4">
                <h2 className="font-semibold">Payment methods</h2>
                <p className="text-xs text-muted-foreground">Actual payments recorded in this date range</p>
              </div>
              {paymentMethodChart.length ? <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentMethodChart} dataKey="amount" nameKey="name" outerRadius={88} innerRadius={45} paddingAngle={3}>
                      {paymentMethodChart.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => money(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div> : <p className="py-20 text-center text-sm text-muted-foreground">No payments in this range.</p>}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-4 xl:col-span-1">
              <h2 className="font-semibold">Category breakdown</h2>
              <p className="mb-4 text-xs text-muted-foreground">Total amounts, excluding cancelled expenses</p>
              <div className="space-y-3">
                {categoryChart.length ? categoryChart.slice(0, 7).map((category, index) => (
                  <div key={category.name}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate">{category.name}</span><span className="font-medium">{money(category.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, totalForRange ? (category.amount / totalForRange) * 100 : 0)}%`,
                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                      }} />
                    </div>
                  </div>
                )) : <p className="py-10 text-center text-sm text-muted-foreground">No expenses in this range.</p>}
              </div>
            </Card>
            <div className="xl:col-span-2">{renderExpenseTable(filteredExpenses)}</div>
          </div>
        </>
      )}

      {view === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Expense reports</h2>
              <p className="text-sm text-muted-foreground">Date range reports include only non-cancelled database expenses.</p>
            </div>
            <div className="flex gap-2">
              {can('expenses.export') && <Button variant="outline" size="sm" onClick={() => exportCsv(filteredExpenses, 'expense-report.csv')}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>}
              {can('expenses.print') && <Button variant="outline" size="sm" onClick={() => printExpenses(filteredExpenses)}>
                <Printer className="mr-2 h-4 w-4" /> Print report
              </Button>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Total expense</p><p className="mt-1 text-xl font-bold">{money(periodRows.reduce((sum, item) => sum + Number(item.total_amount), 0))}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Recorded payments</p><p className="mt-1 text-xl font-bold">{money(periodRows.reduce((sum, item) => sum + Number(item.paid_amount), 0))}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Remaining due</p><p className="mt-1 text-xl font-bold">{money(pendingTotal)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Expense count</p><p className="mt-1 text-xl font-bold">{periodRows.length}</p></Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Category-wise expense report</h3>
              <div className="max-h-80 space-y-3 overflow-y-auto">
                {categoryChart.map((item) => <div key={item.name} className="flex justify-between border-b pb-2 text-sm">
                  <span>{item.name}</span><span className="font-medium">{money(item.amount)}</span>
                </div>)}
                {!categoryChart.length && <p className="py-8 text-center text-sm text-muted-foreground">No category totals for this range.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Supplier / payee-wise expense report</h3>
              <div className="max-h-80 space-y-3 overflow-y-auto">
                {payeeChart.map((item) => <div key={item.name} className="flex justify-between border-b pb-2 text-sm">
                  <span className="truncate pr-4">{item.name}</span><span className="shrink-0 font-medium">{money(item.amount)}</span>
                </div>)}
                {!payeeChart.length && <p className="py-8 text-center text-sm text-muted-foreground">No payee totals for this range.</p>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Paid vs unpaid</h3>
              <div className="space-y-3">
                {([
                  ['Paid', periodRows.filter((item) => expenseStatus(item) === 'paid').length, 'bg-emerald-500'],
                  ['Partially paid', periodRows.filter((item) => expenseStatus(item) === 'partially_paid').length, 'bg-sky-500'],
                  ['Unpaid', periodRows.filter((item) => expenseStatus(item) === 'unpaid').length, 'bg-amber-500'],
                  ['Overdue', periodRows.filter((item) => expenseStatus(item) === 'overdue').length, 'bg-rose-500'],
                ] as const).map(([label, count, color]) => <div key={label} className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>
                  <span className="font-medium">{count}</span>
                </div>)}
              </div>
              <div className="mt-5">
                <h3 className="mb-3 font-semibold">Payment method report</h3>
                {paymentMethodChart.map((item) => <div key={item.name} className="flex justify-between border-b pb-2 pt-2 text-sm">
                  <span>{item.name}</span><span className="font-medium">{money(item.amount)}</span>
                </div>)}
                {!paymentMethodChart.length && <p className="py-3 text-sm text-muted-foreground">No payments in this range.</p>}
              </div>
            </Card>
          </div>
          {renderExpenseTable(filteredExpenses)}
        </div>
      )}

      {view === 'recurring' && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-semibold">Recurring expenses</h2>
              <p className="text-sm text-muted-foreground">Generated by a scheduled database job. Occurrences are idempotent.</p>
            </div>
            {can('expenses.create') && <Button size="sm" onClick={() => openRecurringForm()}>
              <Plus className="mr-2 h-4 w-4" /> New recurring expense
            </Button>}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Template</TableHead><TableHead>Category</TableHead><TableHead>Interval</TableHead>
                <TableHead>Next due</TableHead><TableHead>End date</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                  : recurring.length ? recurring.map((template) => {
                    const category = categories.find((item) => item.id === template.category_id);
                    return <TableRow key={template.id}>
                      <TableCell><p className="font-medium">{template.title}</p><p className="text-xs text-muted-foreground">{money(Number(template.amount) + Number(template.tax_amount) - Number(template.discount_amount))}</p></TableCell>
                      <TableCell>{category?.name || '—'}</TableCell>
                      <TableCell className="capitalize">{template.interval}</TableCell>
                      <TableCell>{formatDate(template.next_due_date)}</TableCell>
                      <TableCell>{template.end_date ? formatDate(template.end_date) : 'No end date'}</TableCell>
                      <TableCell><Badge variant={template.is_enabled ? 'default' : 'secondary'}>{template.is_enabled ? 'Enabled' : 'Disabled'}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Recurring expense actions"><Ellipsis className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openRecurringHistory(template)}><Eye className="mr-2 h-4 w-4" /> History</DropdownMenuItem>
                            {can('expenses.edit') && <>
                              <DropdownMenuItem onSelect={() => openRecurringForm(template)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void toggleRecurring(template)}>{template.is_enabled ? 'Disable' : 'Enable'}</DropdownMenuItem>
                            </>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>;
                  }) : <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <Repeat2 className="mx-auto mb-2 h-8 w-8" />No recurring templates yet.
                  </TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {view === 'categories' && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-semibold">Expense categories</h2>
              <p className="text-sm text-muted-foreground">Categories in use cannot be deleted; deactivate them instead.</p>
            </div>
            {can('expenses.create') && <Button size="sm" onClick={() => openCategoryEditor()}>
              <Plus className="mr-2 h-4 w-4" /> Add category
            </Button>}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Color</TableHead>
                <TableHead>Status</TableHead><TableHead>Expenses</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {categories.map((category) => <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>{category.description || '—'}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full border" style={{ backgroundColor: category.color }} />{category.color}</span></TableCell>
                  <TableCell><Badge variant={category.is_active ? 'default' : 'secondary'}>{category.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell>{expenses.filter((expense) => expense.category_id === category.id).length}</TableCell>
                  <TableCell className="text-right">
                    {can('expenses.edit') && <Button size="sm" variant="ghost" onClick={() => {
                      void toggleCategory(category);
                    }}>{category.is_active ? 'Deactivate' : 'Activate'}</Button>}
                    {can('expenses.edit') && <Button size="icon" variant="ghost" onClick={() => openCategoryEditor(category)} aria-label="Edit category"><Pencil className="h-4 w-4" /></Button>}
                    {can('expenses.delete') && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => void deleteCategory(category)} aria-label="Delete category"><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>)}
                {!categories.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No categories available.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Advanced expense filters</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Date range</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={dateFrom} onChange={(event) => { setPeriod('custom'); setDateFrom(event.target.value); }} />
                <Input type="date" value={dateTo} onChange={(event) => { setPeriod('custom'); setDateTo(event.target.value); }} />
              </div>
            </div>
            <div className="space-y-2"><Label>Category</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></div>
            <div className="space-y-2"><Label>Payment status</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>{(['paid', 'unpaid', 'partially_paid', 'overdue', 'cancelled'] as PaymentStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select></div>
            <div className="space-y-2"><Label>Payment method</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
              <option value="all">All methods</option>{PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
            </select></div>
            <div className="space-y-2"><Label>Supplier / Payee</Label><Input value={payeeFilter} onChange={(event) => setPayeeFilter(event.target.value)} placeholder="Search payee" /></div>
            <div className="space-y-2"><Label>Amount from</Label><Input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} /></div>
            <div className="space-y-2"><Label>Amount to</Label><Input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} /></div>
            <div className="space-y-2"><Label>Created by (user ID)</Label><Input value={createdByFilter} onChange={(event) => setCreatedByFilter(event.target.value)} placeholder="Filter by creator ID" /></div>
            <div className="space-y-2"><Label>Reference number</Label><Input value={referenceFilter} onChange={(event) => setReferenceFilter(event.target.value)} placeholder="Search reference" /></div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4" />Clear filters</Button>
            <Button onClick={() => {
              if (dateFrom && dateTo && dateTo < dateFrom) {
                toast.error('End date cannot be earlier than start date.');
                return;
              }
              if ((minAmount && Number(minAmount) < 0) || (maxAmount && Number(maxAmount) < 0)
                || (minAmount && maxAmount && Number(minAmount) > Number(maxAmount))) {
                toast.error('Check the amount range.');
                return;
              }
              setFilterOpen(false);
            }}>Apply filters</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseDialogOpen} onOpenChange={(open) => {
        setExpenseDialogOpen(open);
        if (!open) { setEditingExpense(null); setFiles([]); }
      }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editingExpense ? 'Edit expense' : 'Add expense'}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => void handleExpenseSubmit(event)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="expense-title">Expense title *</Label>
                <Input id="expense-title" required value={expenseForm.title} onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })} placeholder="e.g. Monthly shop rent" />
              </div>
              <div className="space-y-2"><Label>Category *</Label><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={expenseForm.category_id} onChange={(event) => setExpenseForm({ ...expenseForm, category_id: event.target.value })}>
                <option value="">Select category</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></div>
              <div className="space-y-2"><Label>Expense date *</Label><Input type="date" required value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Due date</Label><Input type="date" value={expenseForm.due_date} onChange={(event) => setExpenseForm({ ...expenseForm, due_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Payee / supplier</Label><Input value={expenseForm.payee} onChange={(event) => setExpenseForm({ ...expenseForm, payee: event.target.value })} /></div>
              <div className="space-y-2"><Label>Reference number</Label><Input value={expenseForm.reference_number} onChange={(event) => setExpenseForm({ ...expenseForm, reference_number: event.target.value })} /></div>
              <div className="space-y-2"><Label>Invoice number</Label><Input value={expenseForm.invoice_number} onChange={(event) => setExpenseForm({ ...expenseForm, invoice_number: event.target.value })} /></div>
              <div className="space-y-2"><Label>Payment method</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={expenseForm.payment_method} onChange={(event) => setExpenseForm({ ...expenseForm, payment_method: event.target.value as PaymentMethod })}>
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select></div>
              {expenseForm.payment_method !== 'cash' && <div className="space-y-2"><Label>Bank account for initial payment</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={expenseForm.bank_account_id} onChange={(event) => setExpenseForm({ ...expenseForm, bank_account_id: event.target.value })}>
                <option value="">No bank account selected</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank_name}{account.account_number ? ` · ${account.account_number}` : ''}</option>)}
              </select>{expenseForm.payment_method === 'bank_transfer' && !bankAccounts.length && <p className="text-xs text-destructive">A bank account with reports access is required for transfers.</p>}</div>}
              <div className="space-y-2"><Label>Bank / account</Label><Input value={expenseForm.account} onChange={(event) => setExpenseForm({ ...expenseForm, account: event.target.value })} /></div>
              <div className="space-y-2"><Label>Amount *</Label><Input required type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Tax amount</Label><Input type="number" min="0" step="0.01" value={expenseForm.tax_amount} onChange={(event) => setExpenseForm({ ...expenseForm, tax_amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Discount</Label><Input type="number" min="0" step="0.01" value={expenseForm.discount_amount} onChange={(event) => setExpenseForm({ ...expenseForm, discount_amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Total amount</Label><div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 font-semibold">
                {money((Number(expenseForm.amount) || 0) + (Number(expenseForm.tax_amount) || 0) - (Number(expenseForm.discount_amount) || 0))}
              </div></div>
              {!editingExpense && <div className="space-y-2"><Label>Payment status *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={expenseForm.initial_status} onChange={(event) => setExpenseForm({
                ...expenseForm,
                initial_status: event.target.value as ExpenseForm['initial_status'],
                initial_paid: event.target.value === 'paid'
                  ? String(Math.max(0, (Number(expenseForm.amount) || 0) + (Number(expenseForm.tax_amount) || 0) - (Number(expenseForm.discount_amount) || 0)))
                  : event.target.value === 'unpaid' ? '' : expenseForm.initial_paid,
              })}>
                <option value="unpaid">Unpaid</option><option value="partially_paid" disabled={!can('expenses.edit')}>Partially paid</option><option value="paid" disabled={!can('expenses.edit')}>Paid</option>
              </select></div>}
              {!editingExpense && expenseForm.initial_status !== 'unpaid' && <div className="space-y-2"><Label>Initial paid amount</Label><Input type="number" min="0" step="0.01" value={expenseForm.initial_paid} onChange={(event) => setExpenseForm({ ...expenseForm, initial_paid: event.target.value })} /></div>}
              <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={expenseForm.notes} onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="expense-files">Invoice, receipt or supporting files (JPG, PNG, WEBP, PDF; max 10 MB each)</Label>
                <Input id="expense-files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
                {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((file) => file.name).join(', ')}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingExpense ? 'Save changes' : 'Create expense'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Record expense payment</DialogTitle></DialogHeader>
          {paymentTarget && <form onSubmit={(event) => void handlePaymentSubmit(event)} className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">{paymentTarget.title}</p>
              <p className="mt-1 text-muted-foreground">Remaining due: <span className="font-semibold text-foreground">{money(Number(paymentTarget.total_amount) - Number(paymentTarget.paid_amount))}</span></p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Payment date *</Label><Input type="date" required value={paymentForm.payment_date} onChange={(event) => setPaymentForm({ ...paymentForm, payment_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Amount *</Label><Input type="number" required min="0.01" max={Number(paymentTarget.total_amount) - Number(paymentTarget.paid_amount)} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Payment method *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentForm.payment_method} onChange={(event) => setPaymentForm({ ...paymentForm, payment_method: event.target.value as PaymentMethod })}>
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select></div>
              {paymentForm.payment_method !== 'cash' && <div className="space-y-2"><Label>Bank account</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentForm.bank_account_id} onChange={(event) => setPaymentForm({ ...paymentForm, bank_account_id: event.target.value })}>
                <option value="">No bank account selected</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank_name}{account.account_number ? ` · ${account.account_number}` : ''}</option>)}
              </select>{paymentForm.payment_method === 'bank_transfer' && !bankAccounts.length && <p className="text-xs text-destructive">A bank account with reports access is required for transfers.</p>}</div>}
              <div className="space-y-2"><Label>Transaction reference</Label><Input value={paymentForm.transaction_reference} onChange={(event) => setPaymentForm({ ...paymentForm, transaction_reference: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Bank / account</Label><Input value={paymentForm.account} onChange={(event) => setPaymentForm({ ...paymentForm, account: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record payment</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailExpense)} onOpenChange={(open) => { if (!open) setDetailExpense(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detailExpense && <>
            <DialogHeader><DialogTitle>{detailExpense.title}</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Expense ID</p><p className="font-mono text-sm">{detailExpense.id}</p></div>
              <div><p className="text-xs text-muted-foreground">Date / Due date</p><p className="text-sm">{formatDate(detailExpense.date)} / {formatDate(detailExpense.due_date)}</p></div>
              <div><p className="text-xs text-muted-foreground">Category</p><p className="text-sm">{detailExpense.expense_categories?.name || 'Uncategorized'}</p></div>
              <div><p className="text-xs text-muted-foreground">Payment status</p><Badge variant="outline" className={statusClass(expenseStatus(detailExpense))}>{statusLabel(expenseStatus(detailExpense))}</Badge></div>
              <div><p className="text-xs text-muted-foreground">Payee / Supplier</p><p className="text-sm">{detailExpense.payee || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Reference / Invoice</p><p className="text-sm">{detailExpense.reference_number || '—'} / {detailExpense.invoice_number || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Created by</p><p className="font-mono text-sm">{detailExpense.created_by || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Updated by</p><p className="font-mono text-sm">{detailExpense.updated_by || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Subtotal / Tax / Discount</p><p className="text-sm">{money(Number(detailExpense.amount))} / {money(Number(detailExpense.tax_amount))} / {money(Number(detailExpense.discount_amount))}</p></div>
              <div><p className="text-xs text-muted-foreground">Total / Paid / Due</p><p className="text-sm font-semibold">{money(Number(detailExpense.total_amount))} / {money(Number(detailExpense.paid_amount))} / {money(Math.max(0, Number(detailExpense.total_amount) - Number(detailExpense.paid_amount)))}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="whitespace-pre-wrap text-sm">{detailExpense.description || '—'}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="whitespace-pre-wrap text-sm">{detailExpense.notes || '—'}</p></div>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Payment history</h3>
              <div className="overflow-x-auto rounded-md border">
                <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>{(detailExpense.expense_payments || []).map((payment) => <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.payment_date)}</TableCell>
                    <TableCell>{PAYMENT_METHODS.find((item) => item.value === payment.payment_method)?.label || payment.payment_method}</TableCell>
                    <TableCell>{payment.transaction_reference || '—'}</TableCell>
                    <TableCell className="text-right">{money(Number(payment.amount))}</TableCell>
                  </TableRow>)}
                    {!detailExpense.expense_payments?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No payments recorded.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Attachments</h3>
              <div className="space-y-2">
                {(detailExpense.expense_attachments || []).map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <button className="truncate text-left text-sm underline-offset-4 hover:underline" onClick={() => void openAttachment(attachment)}>{attachment.file_name}</button>
                  <span className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" aria-label="Download attachment" onClick={() => void openAttachment(attachment)}><Download className="h-4 w-4" /></Button>
                    {can('expenses.edit') && <Button size="icon" variant="ghost" aria-label="Delete attachment" onClick={() => void deleteAttachment(attachment)}><Trash2 className="h-4 w-4" /></Button>}
                  </span>
                </div>)}
                {!detailExpense.expense_attachments?.length && <p className="text-sm text-muted-foreground">No attachments.</p>}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Audit history</h3>
              <div className="space-y-2">
                {detailAuditLoading ? <p className="text-sm text-muted-foreground">Loading audit history…</p>
                  : detailAudit.length ? detailAudit.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="capitalize">{entry.action.replace('_', ' ')}</span>
                    <span className="font-mono text-xs text-muted-foreground">{entry.actor_id || 'Scheduled job'}</span>
                    <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>)
                    : <p className="text-sm text-muted-foreground">No audit entries.</p>}
              </div>
            </div>
            <DialogFooter className="flex-wrap sm:justify-between">
              <Button variant="outline" onClick={() => printExpense(detailExpense)}><Printer className="mr-2 h-4 w-4" />Print details</Button>
              {can('expenses.edit') && expenseStatus(detailExpense) !== 'paid' && expenseStatus(detailExpense) !== 'cancelled' &&
                <Button onClick={() => { setDetailExpense(null); openPaymentDialog(detailExpense); }}><Plus className="mr-2 h-4 w-4" />Record payment</Button>}
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{categoryEditing ? 'Edit category' : 'Add category'}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => void saveCategory(event)} className="space-y-4">
            <div className="space-y-2"><Label>Category name *</Label><Input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></div>
            <div className="space-y-2"><Label>Category color</Label><Input type="color" className="h-10 w-20 p-1" value={categoryForm.color} onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : categoryEditing ? 'Save category' : 'Create category'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{recurringEditing ? 'Edit recurring expense' : 'New recurring expense'}</DialogTitle></DialogHeader>
          <form onSubmit={(event) => void saveRecurring(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>Expense title *</Label><Input required value={recurringForm.title} onChange={(event) => setRecurringForm({ ...recurringForm, title: event.target.value })} /></div>
              <div className="space-y-2"><Label>Category *</Label><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={recurringForm.category_id} onChange={(event) => setRecurringForm({ ...recurringForm, category_id: event.target.value })}>
                <option value="">Select category</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></div>
              <div className="space-y-2"><Label>Interval</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={recurringForm.interval} onChange={(event) => setRecurringForm({ ...recurringForm, interval: event.target.value as RecurringForm['interval'] })}>
                {(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map((interval) => <option key={interval} value={interval}>{interval[0].toUpperCase() + interval.slice(1)}</option>)}
              </select></div>
              <div className="space-y-2"><Label>Amount *</Label><Input type="number" min="0" step="0.01" required value={recurringForm.amount} onChange={(event) => setRecurringForm({ ...recurringForm, amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Tax amount</Label><Input type="number" min="0" step="0.01" value={recurringForm.tax_amount} onChange={(event) => setRecurringForm({ ...recurringForm, tax_amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Discount</Label><Input type="number" min="0" step="0.01" value={recurringForm.discount_amount} onChange={(event) => setRecurringForm({ ...recurringForm, discount_amount: event.target.value })} /></div>
              <div className="space-y-2"><Label>Payee</Label><Input value={recurringForm.payee} onChange={(event) => setRecurringForm({ ...recurringForm, payee: event.target.value })} /></div>
              <div className="space-y-2"><Label>Start date</Label><Input type="date" required value={recurringForm.start_date} onChange={(event) => setRecurringForm({ ...recurringForm, start_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Next due date</Label><Input type="date" required value={recurringForm.next_due_date} onChange={(event) => setRecurringForm({ ...recurringForm, next_due_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>End date (optional)</Label><Input type="date" value={recurringForm.end_date} onChange={(event) => setRecurringForm({ ...recurringForm, end_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>Payment method</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={recurringForm.payment_method} onChange={(event) => setRecurringForm({ ...recurringForm, payment_method: event.target.value as PaymentMethod })}>
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select></div>
              <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={recurringForm.description} onChange={(event) => setRecurringForm({ ...recurringForm, description: event.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRecurringDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Recurring expense history{recurringHistory ? ` · ${recurringHistory.title}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {historyExpenses.map((expense) => <div key={expense.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>{formatDate(expense.date)}</span><span>{money(Number(expense.total_amount))}</span><Badge variant="outline" className={statusClass(expenseStatus(expense))}>{statusLabel(expenseStatus(expense))}</Badge>
            </div>)}
            {!historyExpenses.length && <p className="py-8 text-center text-sm text-muted-foreground">No generated expenses found yet. The scheduled job creates expenses when they become due.</p>}
          </div>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
