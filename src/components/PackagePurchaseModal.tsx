import { useEffect, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency } from '../lib/format';
import type { InvestmentPackage, PaymentInstruction, PaymentMethod, Profile } from '../types';

interface PackagePurchaseModalProps {
  pkg: InvestmentPackage | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  paymentInstructions: PaymentInstruction[];
  schemaPending?: boolean;
  onClose: () => void;
  onConfirmPurchase: (pkg: InvestmentPackage) => Promise<void>;
  onDepositSubmitted: () => Promise<void>;
  onGoToAuth: () => void;
  onGoToDeposit: (draft?: { method: PaymentMethod; amount: string }) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bKash', 'Nagad', 'Rocket'];

function isPlaceholderNumber(num: string | undefined): boolean {
  const clean = (num || '').trim();
  return !clean || clean === 'Configure in Admin Panel' || clean === 'Not configured';
}

export function PackagePurchaseModal({
  pkg,
  profile,
  isAuthenticated,
  paymentInstructions,
  schemaPending = false,
  onClose,
  onConfirmPurchase,
  onDepositSubmitted,
  onGoToAuth,
  onGoToDeposit,
}: PackagePurchaseModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline MFS Deposit State when balance is below package price
  const [depMethod, setDepMethod] = useState<PaymentMethod>('bKash');
  const [depAmount, setDepAmount] = useState('');
  const [depSender, setDepSender] = useState('');
  const [depTxnId, setDepTxnId] = useState('');
  const [depSubmitting, setDepSubmitting] = useState(false);
  const [depFeedback, setDepFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);

  const availableBalance = Number(profile?.available_balance ?? 0);
  const packagePrice = Number(pkg?.price ?? 0);
  const shortfall = Math.max(0, Math.round((packagePrice - availableBalance) * 100) / 100);

  useEffect(() => {
    if (!pkg) return;
    setTermsAccepted(false);
    setError(null);
    setDepFeedback(null);
    setDepSender('');
    setDepTxnId('');
    setCopiedNumber(false);
    setDepAmount(shortfall > 0 ? String(shortfall) : String(packagePrice));
  }, [pkg?.id, packagePrice, shortfall]);

  if (!pkg) return null;

  const hasSufficientBalance = availableBalance >= packagePrice;
  const isCatalogPlaceholder = pkg.id.startsWith('catalog-') || schemaPending;
  const activeInstruction = paymentInstructions.find((item) => item.method === depMethod);
  const hasRealAccountNumber = Boolean(activeInstruction && !isPlaceholderNumber(activeInstruction.account_number));

  const handleCopyNumber = async (num: string) => {
    try {
      await navigator.clipboard.writeText(num);
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    } catch {
      // Fallback ignored if clipboard permissions are restricted
    }
  };

  const handleSubmitPurchase = async () => {
    setError(null);
    if (!termsAccepted) {
      setError('Please confirm you have read the Terms & Conditions.');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirmPurchase(pkg);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete package purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlineDepositSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setDepFeedback(null);
    setDepSubmitting(true);
    try {
      await apiRequest('/api/member/deposits', {
        method: 'POST',
        requireAuth: true,
        body: {
          amount: Number(depAmount),
          payment_method: depMethod,
          sender_account: depSender,
          transaction_id: depTxnId,
        },
      });
      setDepSender('');
      setDepTxnId('');
      setDepFeedback({
        type: 'success',
        text: `${depMethod} deposit request submitted (Pending). Once an administrator verifies your Transaction ID, your verified balance will update so you can confirm ${pkg.name}.`,
      });
      await onDepositSubmitted();
    } catch (err) {
      setDepFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit deposit request.',
      });
    } finally {
      setDepSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-medium text-blue-700">Package Allocation Review</p>
            <h2 id="package-modal-title" className="text-xl font-bold text-slate-900 mt-1">
              {pkg.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div>
            <div className="text-xs text-slate-500">Purchase Price</div>
            <div className="font-mono tabular-nums text-base font-semibold text-slate-900 mt-0.5">
              {formatCurrency(pkg.price)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Term Duration</div>
            <div className="font-mono tabular-nums text-base font-semibold text-slate-900 mt-0.5">
              {pkg.duration_days} Days
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Terms and Conditions</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs leading-relaxed text-slate-700 whitespace-pre-line max-h-40 overflow-y-auto">
            {pkg.terms_and_conditions}
          </div>
        </div>

        {isAuthenticated && profile ? (
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 bg-white">
            <span className="text-sm text-slate-600">Verified Available Balance</span>
            <span
              className={`font-mono tabular-nums text-sm font-semibold ${
                hasSufficientBalance ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatCurrency(availableBalance)}
            </span>
          </div>
        ) : null}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isAuthenticated ? (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToAuth();
              }}
              className="flex-1 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Sign In to See bKash / Nagad Numbers & Buy
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : isCatalogPlaceholder ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-900 space-y-1.5">
            <div className="font-semibold">Database Schema Setup Required</div>
            <p className="leading-relaxed">
              Apply <span className="font-mono">supabase/schema.sql</span> in your Supabase SQL Editor and configure your bKash, Nagad, and Rocket numbers in <span className="font-semibold">Admin Panel → Payment Setup</span> to enable live deposits and package purchases.
            </p>
          </div>
        ) : !hasSufficientBalance ? (
          <div className="space-y-4 pt-1 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Step 1: Deposit via bKash, Nagad, or Rocket
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Send{' '}
                  <span className="font-mono font-semibold text-blue-700">{formatCurrency(shortfall)}</span>{' '}
                  to fund your verified balance for {pkg.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToDeposit({
                    method: depMethod,
                    amount: depAmount || String(shortfall),
                  });
                }}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 self-start sm:self-center cursor-pointer whitespace-nowrap"
              >
                Open Full Deposit Page →
              </button>
            </div>

            {/* Channel Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => {
                    setDepMethod(method);
                    setCopiedNumber(false);
                    setDepFeedback(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    depMethod === method
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            {/* Live Admin-Configured Account Number Box */}
            {activeInstruction ? (
              <div className="space-y-2.5">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-blue-800">
                      {activeInstruction.method} · {activeInstruction.account_type} Account
                    </div>
                    <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5 select-all break-all">
                      {hasRealAccountNumber
                        ? activeInstruction.account_number
                        : 'Account number not configured by Admin yet'}
                    </div>
                  </div>
                  {hasRealAccountNumber && (
                    <button
                      type="button"
                      onClick={() => void handleCopyNumber(activeInstruction.account_number)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                    >
                      {copiedNumber ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedNumber ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Allowed Deposit Limits</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {formatCurrency(activeInstruction.min_deposit)} – {formatCurrency(activeInstruction.max_deposit)}
                  </span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3">
                  {activeInstruction.instructions}
                </p>

                {!hasRealAccountNumber && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    An administrator must enter the active {depMethod} number in <span className="font-semibold">Admin Panel → Payment Setup</span> before deposit requests can be submitted.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                {depMethod} payment channel is currently inactive. Choose another method or contact an administrator.
              </div>
            )}

            {depFeedback && (
              <div
                className={`rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                  depFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {depFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{depFeedback.text}</span>
              </div>
            )}

            {/* Inline TrxID Submission Form */}
            <form onSubmit={handleInlineDepositSubmit} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="modal-dep-amount" className="block text-xs font-medium text-slate-700 mb-1">
                    Amount (BDT)
                  </label>
                  <input
                    id="modal-dep-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="modal-dep-sender" className="block text-xs font-medium text-slate-700 mb-1">
                    Your {depMethod} Number
                  </label>
                  <input
                    id="modal-dep-sender"
                    type="text"
                    required
                    value={depSender}
                    onChange={(e) => setDepSender(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="modal-dep-txnid" className="block text-xs font-medium text-slate-700 mb-1">
                    Transaction ID
                  </label>
                  <input
                    id="modal-dep-txnid"
                    type="text"
                    required
                    value={depTxnId}
                    onChange={(e) => setDepTxnId(e.target.value)}
                    placeholder="TrxID"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="submit"
                  disabled={depSubmitting || !hasRealAccountNumber}
                  className="flex-1 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {depSubmitting ? 'Submitting TrxID...' : `Submit ${depMethod} Deposit Request`}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>
                I have read and accept the Terms & Conditions for this package.
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitPurchase}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Processing Purchase...' : `Confirm Purchase (${formatCurrency(pkg.price)})`}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
