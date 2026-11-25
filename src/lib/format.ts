export function formatCurrency(amount: number | string | null | undefined): string {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric)) return '৳0.00';
  return `৳${numeric.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const sanitized = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function sanitizeWhatsAppUrl(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 16) return null;
  return `https://wa.me/${digits}`;
}

export function sanitizeTelegramUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  if (/^@?[a-zA-Z0-9_]{3,64}$/.test(trimmed)) {
    const handle = trimmed.replace(/^@/, '');
    return `https://t.me/${handle}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 't.me' || parsed.hostname === 'telegram.me') &&
      parsed.pathname.length > 1
    ) {
      return `https://t.me${parsed.pathname}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function sanitizeEmailAddress(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

