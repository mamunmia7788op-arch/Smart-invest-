import { AlertCircle, CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';

interface StatusLabelProps {
  status: string;
}

export function StatusLabel({ status }: StatusLabelProps) {
  const normalized = status.toLowerCase();

  if (
    normalized === 'approved' ||
    normalized === 'active' ||
    normalized === 'completed' ||
    normalized === 'credit' ||
    normalized === 'replied'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="capitalize">{status}</span>
      </span>
    );
  }

  if (normalized === 'pending' || normalized === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="capitalize">{status}</span>
      </span>
    );
  }

  if (normalized === 'rejected' || normalized === 'deactivated' || normalized === 'cancelled' || normalized === 'debit') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="capitalize">{status}</span>
      </span>
    );
  }

  if (normalized === 'admin') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Admin</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="capitalize">{status}</span>
    </span>
  );
}
