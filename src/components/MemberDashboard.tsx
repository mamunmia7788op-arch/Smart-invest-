import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Headphones,
  Mail,
  MessageCircle,
  Package,
  RefreshCw,
  Send,
  User,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMemberContact,
  isSyntheticMemberEmail,
  sanitizeEmailAddress,
  sanitizeTelegramUrl,
  sanitizeWhatsAppUrl,
} from '../lib/format';
import type { InvestmentPackage, MemberBootstrapData, PackagePurchase, PaymentMethod } from '../types';
import { StatusLabel } from './StatusLabel';

export type MemberTab = 'packages' | 'active' | 'deposits' | 'withdrawals' | 'referrals' | 'support' | 'profile';

export interface DepositDraft {
  method: PaymentMethod;
  amount: string;
  key: number;
}

interface MemberDashboardProps {
  data: MemberBootstrapData | null;
  fallbackPackages?: InvestmentPackage[];
  schemaPending?: boolean;
  depositDraft?: DepositDraft | null;
  loading: boolean;
  error: string | null;
  activeTab: MemberTab;
  onTabChange: (tab: MemberTab) => void;
  onRefresh: () => Promise<void>;
  onSelectPackage: (pkg: InvestmentPackage) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['bKash', 'Nagad', 'Rocket'];

function isPlaceholderNumber(num: string | undefined): boolean {
  const clean = (num || '').trim();
  return !clean || clean === 'Configure in Admin Panel' || clean === 'Not configured';
}

export function MemberDashboard({
  data,
  fallbackPackages = [],
  schemaPending = false,
  depositDraft = null,
  loading,
  error,
  activeTab,
  onTabChange,
  onRefresh,
  onSelectPackage,
}: MemberDashboardProps) {
  // Deposit Form State
  const [depMethod, setDepMethod] = useState<PaymentMethod>('bKash');
  const [depAmount, setDepAmount] = useState('');
  const [depSender, setDepSender] = useState('');
  const [depTxnId, setDepTxnId] = useState('');
  const [depSubmitting, setDepSubmitting] = useState(false);
  const [depFeedback, setDepFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    if (!depositDraft) return;
    setDepMethod(depositDraft.method);
    setDepAmount(depositDraft.amount);
    setDepFeedback(null);
  }, [depositDraft?.key, depositDraft]);

  // Withdrawal Form State
  const [wdMethod, setWdMethod] = useState<PaymentMethod>('bKash');
  const [wdAmount, setWdAmount] = useState('');
  const [wdAccount, setWdAccount] = useState('');
  const [wdIdempotencyKey, setWdIdempotencyKey] = useState(() => crypto.randomUUID());
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [wdFeedback, setWdFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Profile Form State
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Referral & Support State
  const [copiedRefCode, setCopiedRefCode] = useState(false);
  const [copiedRefLink, setCopiedRefLink] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportFeedback, setSupportFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Terms Modal State
  const [selectedPurchaseTerms, setSelectedPurchaseTerms] = useState<PackagePurchase | null>(null);

  if (loading && !data) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="h-8 w-56 bg-slate-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-28 bg-slate-100 border border-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 border border-slate-200 animate-pulse rounded-xl" />
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <AlertCircle className="w-5 h-5" />
            <span>Unable to Load Member Dashboard</span>
          </div>
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const {
    profile,
    packages,
    paymentInstructions,
    deposits,
    withdrawals,
    purchases,
    referrals = [],
    referralCommissions = [],
    supportSettings = null,
    supportTickets = [],
  } = data;
  const activeInstruction = paymentInstructions.find((item) => item.method === depMethod);
  const pendingDepositsCount = deposits.filter((d) => d.status === 'pending').length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;
  const hasPendingWithdrawal = pendingWithdrawalsCount > 0;
  const activePackagesCount = purchases.filter((p) => p.status === 'active').length;
  const totalReferralEarned = referralCommissions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const referralLink =
    typeof window !== 'undefined' && profile.referral_code
      ? `${window.location.origin}/?ref=${encodeURIComponent(profile.referral_code)}`
      : '';

  const handleDepositSubmit = async (e: FormEvent) => {
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
      setDepAmount('');
      setDepSender('');
      setDepTxnId('');
      setDepFeedback({
        type: 'success',
        text: 'Deposit request submitted with Pending status. Your verified balance will update only after an administrator confirms the Transaction ID.',
      });
      await onRefresh();
    } catch (err) {
      setDepFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit deposit request.',
      });
    } finally {
      setDepSubmitting(false);
    }
  };

  const handleWithdrawalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setWdFeedback(null);
    setWdSubmitting(true);
    try {
      await apiRequest('/api/member/withdrawals', {
        method: 'POST',
        requireAuth: true,
        body: {
          amount: Number(wdAmount),
          payment_method: wdMethod,
          account_number: wdAccount,
          idempotency_key: wdIdempotencyKey,
        },
      });
      setWdAmount('');
      setWdAccount('');
      setWdIdempotencyKey(crypto.randomUUID());
      setWdFeedback({
        type: 'success',
        text: 'Withdrawal request submitted. Requested funds are held from your available balance pending administrator review.',
      });
      await onRefresh();
    } catch (err) {
      setWdFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit withdrawal request.',
      });
    } finally {
      setWdSubmitting(false);
    }
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    setProfileSubmitting(true);
    try {
      await apiRequest('/api/member/profile', {
        method: 'PATCH',
        requireAuth: true,
        body: {
          full_name: profileName ?? profile.full_name,
          phone: profilePhone ?? profile.phone,
        },
      });
      setProfileFeedback({ type: 'success', text: 'Member profile updated.' });
      await onRefresh();
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update profile.',
      });
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleSupportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSupportFeedback(null);
    setSupportSubmitting(true);
    try {
      await apiRequest('/api/member/support', {
        method: 'POST',
        requireAuth: true,
        body: {
          subject: supportSubject.trim(),
          message: supportMessage.trim(),
        },
      });
      setSupportSubject('');
      setSupportMessage('');
      setSupportFeedback({
        type: 'success',
        text: 'Your support message has been sent. Our administrator team will reply here soon.',
      });
      await onRefresh();
    } catch (err) {
      setSupportFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send support message.',
      });
    } finally {
      setSupportSubmitting(false);
    }
  };

  const navItems: { id: MemberTab; label: string; shortLabel: string; icon: typeof Package }[] = [
    { id: 'packages', label: 'Packages', shortLabel: 'Packages', icon: Package },
    { id: 'active', label: 'Package Active', shortLabel: 'Pkg Active', icon: Activity },
    { id: 'deposits', label: 'Deposits', shortLabel: 'Deposits', icon: ArrowDownLeft },
    { id: 'withdrawals', label: 'Withdrawals', shortLabel: 'Withdraw', icon: ArrowUpRight },
    { id: 'referrals', label: 'Referrals (35%)', shortLabel: 'Refer 35%', icon: Users },
    { id: 'support', label: 'Support', shortLabel: 'Support', icon: Headphones },
    { id: 'profile', label: 'Profile', shortLabel: 'Profile', icon: User },
  ];

  const sortedPurchases = [...purchases].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 pb-32 lg:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden lg:block lg:w-60 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Member Account</div>
              <div className="font-display text-sm font-bold text-slate-900 mt-0.5 truncate">
                {profile.full_name || formatMemberContact(profile)}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {profile.phone || formatMemberContact(profile)}
              </div>
              {profile.referral_code && (
                <div className="mt-2 text-xs text-slate-600">
                  Ref Code: <span className="font-mono font-semibold text-blue-700">{profile.referral_code}</span>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Balance</span>
                <span className="font-mono tabular-nums text-xs font-bold text-blue-700">
                  {formatCurrency(profile.available_balance)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">Status</span>
                <StatusLabel status={profile.status} />
              </div>
            </div>

            <nav aria-label="Member dashboard navigation" className="grid grid-cols-1 gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-700 text-white'
                        : 'bg-transparent text-slate-700 hover:bg-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'active' && activePackagesCount > 0 && (
                      <span
                        className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          active ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {activePackagesCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Workspace */}
          <main className="flex-1 min-w-0 space-y-6">
            {/* Top Workspace Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">Member Portal / {navItems.find((n) => n.id === activeTab)?.label}</div>
                <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                  {navItems.find((n) => n.id === activeTab)?.label}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                  <span className="text-slate-500">Balance:</span>
                  <span className="font-mono tabular-nums font-bold text-blue-700">
                    {formatCurrency(profile.available_balance)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void onRefresh()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Data</span>
                </button>
              </div>
            </div>

            {/* TAB: PACKAGES */}
            {activeTab === 'packages' && (
              <div className="space-y-6">
                {schemaPending && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
                    <span className="font-semibold">Database Setup Required:</span> Run <span className="font-mono">supabase/schema.sql</span> in Supabase SQL Editor to activate live packages, deposits, and purchases.
                  </div>
                )}

                {/* Available Packages Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {(packages.length > 0 ? packages : fallbackPackages).map((pkg) => {
                    const canAfford = Number(profile.available_balance) >= Number(pkg.price);
                    const dailyRate = Number(pkg.daily_return_rate ?? 30);
                    const dailyIncome = Math.round(Number(pkg.price) * dailyRate) / 100;
                    return (
                      <div
                        key={pkg.id}
                        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs text-slate-500">
                                Tier 0{pkg.tier_order}
                              </div>
                              <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">{pkg.name}</h2>
                            </div>
                            <div className="text-right">
                              <div className="font-mono tabular-nums text-lg font-bold text-blue-700">
                                {formatCurrency(pkg.price)}
                              </div>
                              <div className="text-xs text-slate-500 font-mono tabular-nums">
                                {pkg.duration_days} Days
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <span className="text-emerald-900 font-medium">{dailyRate}% Income</span>
                            <span className="font-mono tabular-nums font-bold text-emerald-700">
                              +{formatCurrency(dailyIncome)}
                            </span>
                          </div>

                          <p className="text-sm text-slate-600 leading-relaxed">{pkg.summary}</p>

                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-line max-h-32 overflow-y-auto">
                            {pkg.terms_and_conditions}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
                          <span className={`text-xs font-medium ${canAfford ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {canAfford ? 'Verified balance sufficient' : 'Deposit required to fund'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelectPackage(pkg)}
                            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Buy Package
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: PACKAGE ACTIVE */}
            {activeTab === 'active' && (
              <div className="space-y-6">
                <div
                  className={`rounded-xl border px-4 py-3.5 text-xs flex items-start gap-2.5 ${
                    activePackagesCount > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <Activity
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      activePackagesCount > 0 ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  />
                  <div>
                    {activePackagesCount > 0 ? (
                      <span>
                        <span className="font-semibold">
                          {activePackagesCount} Active {activePackagesCount === 1 ? 'Package' : 'Packages'}:
                        </span>{' '}
                        Your income is added automatically to your Verified Available Balance every 24 hours. No manual claim is needed.
                      </span>
                    ) : (
                      <span>
                        You currently have no active packages. Purchase any package to start receiving automatic 24-hour income directly in your balance.
                      </span>
                    )}
                  </div>
                </div>

                {sortedPurchases.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      You have not purchased any packages yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => onTabChange('packages')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      <Package className="w-4 h-4" />
                      <span>Browse Packages</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sortedPurchases.map((p) => {
                      const rate = Number(p.daily_return_rate ?? 30);
                      const dailyAmt = Number(
                        p.daily_reward_amount || Math.round(Number(p.purchase_price) * rate) / 100
                      );
                      const daysCredited = Number(p.days_credited ?? 0);
                      const totalCredited = Number(p.total_credited ?? 0);
                      const nextCreditAt = new Date(
                        new Date(p.last_credited_at || p.starts_at).getTime() + 24 * 60 * 60 * 1000
                      );
                      const remainingMins = Math.max(1, Math.ceil((nextCreditAt.getTime() - Date.now()) / 60000));
                      const hrsLeft = Math.floor(remainingMins / 60);
                      const minsLeft = remainingMins % 60;
                      const isActivePkg = p.status === 'active' && daysCredited < p.duration_days;
                      const isDueNow = isActivePkg && Date.now() >= nextCreditAt.getTime();

                      return (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="font-display text-base font-bold text-slate-900">
                                {p.package_name}
                              </h2>
                              <div className="text-xs text-slate-500 mt-0.5">
                                Purchased {formatDate(p.starts_at)}
                              </div>
                            </div>
                            <StatusLabel status={p.status} />
                          </div>

                          <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
                            <div>
                              <div className="text-slate-500">Package Price</div>
                              <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                                {formatCurrency(p.purchase_price)}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">{rate}% Auto Income</div>
                              <div className="font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
                                +{formatCurrency(dailyAmt)} / 24h
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Credited So Far</div>
                              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                                {daysCredited}/{p.duration_days} Days ({formatCurrency(totalCredited)})
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Next Auto Credit</div>
                              <div className="font-mono tabular-nums font-semibold text-blue-700 mt-0.5">
                                {!isActivePkg
                                  ? 'Completed'
                                  : isDueNow
                                  ? 'Crediting now...'
                                  : `In ${hrsLeft}h ${minsLeft}m`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                            <span className="text-slate-500">
                              Maturity: <span className="font-medium text-slate-800">{formatDate(p.matures_at)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedPurchaseTerms(p)}
                              className="font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                            >
                              View Terms
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: DEPOSITS */}
            {activeTab === 'deposits' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Payment Instructions */}
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h2 className="font-display text-base font-bold text-slate-900">Payment Instructions</h2>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setDepMethod(method)}
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

                    {activeInstruction ? (
                      <div className="space-y-3 pt-1">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-blue-800 font-medium">
                              {activeInstruction.method} · {activeInstruction.account_type} Account
                            </div>
                            <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-1 select-all break-all">
                              {isPlaceholderNumber(activeInstruction.account_number)
                                ? 'Not configured by Admin yet'
                                : activeInstruction.account_number}
                            </div>
                          </div>
                          {!isPlaceholderNumber(activeInstruction.account_number) && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(activeInstruction.account_number);
                                  setCopiedAccount(true);
                                  setTimeout(() => setCopiedAccount(false), 2000);
                                } catch {
                                  // Ignore clipboard denial
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                            >
                              {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 flex items-center justify-between">
                          <span>Deposit Limits</span>
                          <span className="font-mono tabular-nums font-medium text-slate-800">
                            {formatCurrency(activeInstruction.min_deposit)} – {formatCurrency(activeInstruction.max_deposit)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                          {activeInstruction.instructions}
                        </p>
                        {isPlaceholderNumber(activeInstruction.account_number) && (
                          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            An administrator must enter a live {depMethod} number in <span className="font-semibold">Admin Panel → Payment Setup</span> before deposits can be submitted.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
                        {schemaPending
                          ? 'Database schema is pending. Run supabase/schema.sql in Supabase SQL Editor and configure bKash, Nagad, and Rocket numbers in Admin Panel.'
                          : `${depMethod} instructions are not currently active. Contact an administrator.`}
                      </div>
                    )}
                  </div>

                  {/* Deposit Submission Form */}
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">Submit Deposit Verification</h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Your balance increases only after an administrator verifies your Transaction ID.
                      </p>
                    </div>

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
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <span>{depFeedback.text}</span>
                      </div>
                    )}

                    <form onSubmit={handleDepositSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="dep-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Payment Method
                          </label>
                          <select
                            id="dep-method"
                            value={depMethod}
                            onChange={(e) => setDepMethod(e.target.value as PaymentMethod)}
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600"
                          >
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="dep-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Deposit Amount (BDT)
                          </label>
                          <input
                            id="dep-amount"
                            type="number"
                            step="0.01"
                            min="1"
                            required
                            value={depAmount}
                            onChange={(e) => setDepAmount(e.target.value)}
                            placeholder="e.g. 2000"
                            className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="dep-sender" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Sender Account Number
                          </label>
                          <input
                            id="dep-sender"
                            type="text"
                            required
                            value={depSender}
                            onChange={(e) => setDepSender(e.target.value)}
                            placeholder="01XXXXXXXXX"
                            className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                        </div>

                        <div>
                          <label htmlFor="dep-txnid" className="block text-xs font-medium text-slate-700 mb-1.5">
                            Transaction ID (TrxID)
                          </label>
                          <input
                            id="dep-txnid"
                            type="text"
                            required
                            value={depTxnId}
                            onChange={(e) => setDepTxnId(e.target.value)}
                            placeholder="e.g. BKA94X72M1"
                            className="w-full px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={
                          depSubmitting ||
                          !activeInstruction ||
                          isPlaceholderNumber(activeInstruction.account_number)
                        }
                        className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {depSubmitting ? 'Submitting Request...' : 'Submit Deposit Request'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Deposit History */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">Deposit History</h2>
                  </div>
                  {deposits.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No deposit requests submitted yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Date</th>
                            <th className="py-3 px-4 font-medium">Method</th>
                            <th className="py-3 px-4 font-medium">Sender</th>
                            <th className="py-3 px-4 font-medium">Transaction ID</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                            <th className="py-3 px-4 font-medium">Reviewer Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {deposits.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {formatDateTime(d.created_at)}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900">{d.payment_method}</td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-700">{d.sender_account}</td>
                              <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">{d.transaction_id}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                                {formatCurrency(d.amount)}
                              </td>
                              <td className="py-3 px-4">
                                <StatusLabel status={d.status} />
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600">{d.admin_note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: WITHDRAWALS */}
            {activeTab === 'withdrawals' && (
              <div className="space-y-6">
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">Request Withdrawal</h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Requested funds are immediately reserved from your available balance to prevent double spending. One pending request is permitted at a time.
                      </p>
                    </div>
                    <div className="text-xs text-slate-600">
                      Available:{' '}
                      <span className="font-mono tabular-nums font-bold text-blue-700">
                        {formatCurrency(profile.available_balance)}
                      </span>
                    </div>
                  </div>

                  {hasPendingWithdrawal && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 text-xs text-amber-900 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        You currently have a pending withdrawal awaiting review. New requests are enabled once the current request is processed.
                      </span>
                    </div>
                  )}

                  {wdFeedback && (
                    <div
                      className={`rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                        wdFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {wdFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{wdFeedback.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleWithdrawalSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div>
                      <label htmlFor="wd-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Method
                      </label>
                      <select
                        id="wd-method"
                        value={wdMethod}
                        onChange={(e) => setWdMethod(e.target.value as PaymentMethod)}
                        disabled={hasPendingWithdrawal}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="wd-account" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Account Number
                      </label>
                      <input
                        id="wd-account"
                        type="text"
                        required
                        disabled={hasPendingWithdrawal}
                        value={wdAccount}
                        onChange={(e) => setWdAccount(e.target.value)}
                        placeholder="01XXXXXXXXX"
                        className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="wd-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Amount (BDT)
                      </label>
                      <input
                        id="wd-amount"
                        type="number"
                        step="0.01"
                        min="1"
                        max={Number(profile.available_balance) || undefined}
                        required
                        disabled={hasPendingWithdrawal}
                        value={wdAmount}
                        onChange={(e) => setWdAmount(e.target.value)}
                        placeholder="e.g. 1000"
                        className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={wdSubmitting || hasPendingWithdrawal || Number(profile.available_balance) <= 0}
                      className="py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {wdSubmitting ? 'Submitting...' : 'Submit Withdrawal'}
                    </button>
                  </form>
                </section>

                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">Withdrawal History</h2>
                  </div>
                  {withdrawals.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No withdrawal requests submitted yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Date</th>
                            <th className="py-3 px-4 font-medium">Method</th>
                            <th className="py-3 px-4 font-medium">Account Number</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                            <th className="py-3 px-4 font-medium">Reviewer Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {withdrawals.map((w) => (
                            <tr key={w.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {formatDateTime(w.created_at)}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900">{w.payment_method}</td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-700">{w.account_number}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                                {formatCurrency(w.amount)}
                              </td>
                              <td className="py-3 px-4">
                                <StatusLabel status={w.status} />
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600">{w.admin_note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: REFERRALS (35% COMMISSION) */}
            {activeTab === 'referrals' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Referral Commission Rate</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1.5">35%</div>
                    <div className="text-xs text-slate-500 mt-1">Credited instantly on referral purchases</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Referred Members</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1.5">
                      {referrals.length}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Accounts registered with your code</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Total Referral Earned</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-blue-700 mt-1.5">
                      {formatCurrency(totalReferralEarned)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{referralCommissions.length} commission payouts</div>
                  </div>
                </div>

                {/* Invite Code & Share Link */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Invite Partners &amp; Earn 35% Referral Commission
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Share your referral code or link below. Whenever an invited member purchases any investment package,{' '}
                      <span className="font-semibold text-emerald-700">35% of the package price</span> is credited automatically to your verified available balance.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-blue-800 font-medium">Your Referral Code</div>
                        <div className="font-mono text-lg font-bold text-slate-900 mt-0.5 select-all">
                          {profile.referral_code || 'Generating...'}
                        </div>
                      </div>
                      {profile.referral_code && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(profile.referral_code);
                              setCopiedRefCode(true);
                              setTimeout(() => setCopiedRefCode(false), 2000);
                            } catch {
                              // Ignore clipboard errors
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                        >
                          {copiedRefCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedRefCode ? 'Copied' : 'Copy Code'}</span>
                        </button>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500 font-medium">Direct Invite Link</div>
                        <div className="font-mono text-xs font-semibold text-slate-900 mt-1 truncate select-all">
                          {referralLink || 'Unavailable'}
                        </div>
                      </div>
                      {referralLink && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(referralLink);
                              setCopiedRefLink(true);
                              setTimeout(() => setCopiedRefLink(false), 2000);
                            } catch {
                              // Ignore clipboard errors
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                        >
                          {copiedRefLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedRefLink ? 'Copied' : 'Copy Link'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Commission Payouts History */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      35% Referral Commission History
                    </h2>
                  </div>
                  {referralCommissions.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No referral commissions earned yet. Share your link to start earning 35% per package allocation.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Date</th>
                            <th className="py-3 px-4 font-medium">Package Purchased</th>
                            <th className="py-3 px-4 font-medium text-right">Package Price</th>
                            <th className="py-3 px-4 font-medium text-right">Rate</th>
                            <th className="py-3 px-4 font-medium text-right">35% Commission Credited</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {referralCommissions.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {formatDateTime(c.created_at)}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900">{c.package_name}</td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                                {formatCurrency(c.package_price)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                                {Number(c.commission_rate ?? 35)}%
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                +{formatCurrency(c.commission_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Referred Members List */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">Referred Members</h2>
                  </div>
                  {referrals.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No members have signed up using your referral code yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Member</th>
                            <th className="py-3 px-4 font-medium">Joined Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {referrals.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-medium text-slate-900">{r.label}</td>
                              <td className="py-3 px-4 text-xs text-slate-600">{formatDateTime(r.joined_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: CUSTOMER SUPPORT */}
            {activeTab === 'support' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Live Admin-Configured Support Channels */}
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Headphones className="w-4 h-4" />
                      <h2 className="font-display text-base font-bold text-slate-900">
                        {supportSettings?.support_title || 'SMART INVEST Customer Support'}
                      </h2>
                    </div>

                    {supportSettings?.is_active !== false ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                          {supportSettings?.notice_text ||
                            'Contact our administrator support team via the channels below or submit a direct support message.'}
                        </p>
                        {supportSettings?.support_hours && (
                          <div className="text-xs text-slate-600 flex items-center justify-between">
                            <span>Support Hours</span>
                            <span className="font-medium text-slate-900">{supportSettings.support_hours}</span>
                          </div>
                        )}
                        <div className="space-y-2 pt-1">
                          {(() => {
                            const waUrl = sanitizeWhatsAppUrl(supportSettings?.whatsapp_number);
                            const tgUrl = sanitizeTelegramUrl(supportSettings?.telegram_link);
                            const emailAddr = sanitizeEmailAddress(supportSettings?.support_email);
                            if (!waUrl && !tgUrl && !emailAddr) {
                              return (
                                <p className="text-xs text-slate-500">
                                  Use the ticket form to message an administrator directly.
                                </p>
                              );
                            }
                            return (
                              <>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                    <span>WhatsApp: {supportSettings?.whatsapp_number}</span>
                                  </a>
                                )}
                                {tgUrl && (
                                  <a
                                    href={tgUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    <Send className="w-4 h-4" />
                                    <span>Telegram Support Channel</span>
                                  </a>
                                )}
                                {emailAddr && (
                                  <a
                                    href={`mailto:${emailAddr}`}
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                                  >
                                    <Mail className="w-4 h-4" />
                                    <span>{emailAddr}</span>
                                  </a>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        Direct chat links are currently paused. Submit a support message using the form and our team will reply here.
                      </p>
                    )}
                  </div>

                  {/* Send Support Message Form */}
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">Send Support Request</h2>
                      <p className="text-xs text-slate-600 mt-1">
                        Submit questions regarding deposits, packages, referrals, or payouts directly to administrators.
                      </p>
                    </div>

                    {supportFeedback && (
                      <div
                        className={`rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                          supportFeedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        {supportFeedback.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <span>{supportFeedback.text}</span>
                      </div>
                    )}

                    <form onSubmit={handleSupportSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="sup-subject" className="block text-xs font-medium text-slate-700 mb-1.5">
                          Subject
                        </label>
                        <input
                          id="sup-subject"
                          type="text"
                          required
                          maxLength={120}
                          value={supportSubject}
                          onChange={(e) => setSupportSubject(e.target.value)}
                          placeholder="e.g. Deposit TrxID check or Referral question"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label htmlFor="sup-message" className="block text-xs font-medium text-slate-700 mb-1.5">
                          Message
                        </label>
                        <textarea
                          id="sup-message"
                          rows={4}
                          required
                          maxLength={1500}
                          value={supportMessage}
                          onChange={(e) => setSupportMessage(e.target.value)}
                          placeholder="Describe your question or include your Transaction ID..."
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={supportSubmitting}
                        className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {supportSubmitting ? 'Sending...' : 'Send Support Message'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Member Support Ticket History */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">Your Support Messages</h2>
                  </div>
                  {supportTickets.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No support requests submitted yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {supportTickets.map((t) => (
                        <div key={t.id} className="p-5 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{t.subject}</h3>
                            <div className="flex items-center gap-3">
                              <StatusLabel status={t.status} />
                              <span className="text-xs text-slate-500">{formatDateTime(t.created_at)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{t.message}</p>
                          {t.admin_reply && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 space-y-1">
                              <div className="text-xs font-semibold text-blue-900">
                                Support Reply {t.replied_at ? `· ${formatDateTime(t.replied_at)}` : ''}
                              </div>
                              <p className="text-xs text-blue-900 leading-relaxed whitespace-pre-line">{t.admin_reply}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: PROFILE */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Account Summary Cards (Profile Only) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Verified Available Balance</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-blue-700 mt-1.5">
                      {formatCurrency(profile.available_balance)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Usable for packages &amp; payouts</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Active Packages</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1.5">
                      {activePackagesCount}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{purchases.length} total historical</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Pending Deposits</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1.5">
                      {pendingDepositsCount}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Awaiting admin confirmation</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">Pending Withdrawals</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1.5">
                      {pendingWithdrawalsCount}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Held until payout review</div>
                  </div>
                </div>

                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 max-w-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">Member Profile</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Member ID: <span className="font-mono">{profile.id}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel status={profile.role} />
                    <StatusLabel status={profile.status} />
                  </div>
                </div>

                {profileFeedback && (
                  <div
                    className={`rounded-lg px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                      profileFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>{profileFeedback.text}</span>
                  </div>
                )}

                <form onSubmit={handleProfileSave} className="space-y-4">
                  {!isSyntheticMemberEmail(profile.email) && (
                    <div>
                      <label htmlFor="prof-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Registered Email (Read-Only)
                      </label>
                      <input
                        id="prof-email"
                        type="email"
                        disabled
                        value={profile.email}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="prof-refcode" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Referral Code (35% Commission · Read-Only)
                    </label>
                    <input
                      id="prof-refcode"
                      type="text"
                      disabled
                      value={profile.referral_code || '—'}
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-100 text-blue-700 font-semibold border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div>
                    <label htmlFor="prof-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="prof-name"
                      type="text"
                      required
                      value={profileName ?? profile.full_name}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="prof-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      id="prof-phone"
                      type="tel"
                      value={profilePhone ?? profile.phone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Registered: {formatDateTime(profile.created_at)}
                    </span>
                    <button
                      type="submit"
                      disabled={profileSubmitting}
                      className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      {profileSubmitting ? 'Saving...' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </section>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Purchased Package Terms Snapshot Modal */}
      {selectedPurchaseTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs text-blue-700 font-medium">Accepted Terms Snapshot</div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {selectedPurchaseTerms.package_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseTerms(null)}
                aria-label="Close terms modal"
                className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div>
                <span className="text-slate-500">Allocation: </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatCurrency(selectedPurchaseTerms.purchase_price)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Maturity: </span>
                <span className="font-mono text-slate-900">
                  {formatDate(selectedPurchaseTerms.matures_at)}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-700 whitespace-pre-line max-h-60 overflow-y-auto leading-relaxed">
              {selectedPurchaseTerms.terms_snapshot}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPurchaseTerms(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile dashboard navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-2 py-2 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
      >
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[11px] font-medium leading-tight transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">
                  {item.shortLabel}
                  {item.id === 'active' && activePackagesCount > 0 ? ` (${activePackagesCount})` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
