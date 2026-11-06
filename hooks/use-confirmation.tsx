'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Pencil, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmationKind = 'update' | 'delete' | 'action';

type ConfirmationRequest = {
  kind: ConfirmationKind;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  successMessage?: string | null;
  content?: ReactNode;
  action: () => Promise<void>;
};

type ConfirmationOptions = {
  action: () => Promise<void>;
  successMessage?: string | null;
  content?: ReactNode;
};

type DeleteConfirmationOptions = ConfirmationOptions & {
  recordName: string;
  warning?: string;
};

type ActionConfirmationOptions = ConfirmationOptions & {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'The operation failed. Please try again.';
}

export function useConfirmation() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const resolveRequest = useRef<((confirmed: boolean) => void) | null>(null);
  const isLoadingRef = useRef(false);

  const open = useCallback((nextRequest: ConfirmationRequest): Promise<boolean> => {
    if (resolveRequest.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      resolveRequest.current = resolve;
      setRequest(nextRequest);
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    const resolve = resolveRequest.current;
    resolveRequest.current = null;
    setRequest(null);
    if (resolve) resolve(confirmed);
  }, []);

  const confirmUpdate = useCallback((options: ConfirmationOptions) => open({
    ...options,
    kind: 'update',
    title: 'Confirm Update',
    description: 'Are you sure you want to save these changes?',
    confirmLabel: 'Yes, Update',
    cancelLabel: 'Go Back',
  }), [open]);

  const confirmDelete = useCallback((options: DeleteConfirmationOptions) => open({
    ...options,
    kind: 'delete',
    title: `Delete ${options.recordName}?`,
    description: options.warning || `Are you sure you want to delete “${options.recordName}”? This action cannot be undone.`,
    confirmLabel: 'Yes, Delete',
    cancelLabel: 'Cancel',
  }), [open]);

  const confirmAction = useCallback((options: ActionConfirmationOptions) => open({
    ...options,
    kind: options.destructive ? 'delete' : 'action',
    confirmLabel: options.confirmLabel || 'Confirm',
    cancelLabel: options.cancelLabel || 'Cancel',
  }), [open]);

  const runAction = useCallback(async () => {
    if (!request || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      await request.action();
      if (request.successMessage) toast.success(request.successMessage);
      finish(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [finish, request]);

  const dialog = (
    <AlertDialog
      open={!!request}
      onOpenChange={(openState) => {
        if (!openState && !isLoading) finish(false);
      }}
    >
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className={`mb-1 flex h-11 w-11 items-center justify-center rounded-full ${
            request?.kind === 'delete'
              ? 'bg-destructive/10 text-destructive'
              : request?.kind === 'update'
                ? 'bg-muted text-foreground'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            {request?.kind === 'delete'
              ? <ShieldAlert className="h-5 w-5" />
              : request?.kind === 'update'
                ? <Pencil className="h-5 w-5" />
                : <AlertTriangle className="h-5 w-5" />}
          </div>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {request?.content && <div className="py-2">{request.content}</div>}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isLoading}>{request?.cancelLabel || 'Cancel'}</AlertDialogCancel>
          <Button
            type="button"
            variant={request?.kind === 'delete' ? 'destructive' : 'default'}
            onClick={() => void runAction()}
            disabled={isLoading}
          >
            {isLoading ? 'Working...' : request?.confirmLabel || 'Confirm'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmUpdate, confirmDelete, confirmAction, dialog };
}
