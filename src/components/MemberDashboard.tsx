import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Package,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportRowsToCsv, formatCurrency, formatDate, formatDateTime } from '../lib/format';
import type { InvestmentPackage, MemberBootstrapData, PackagePurchase, PaymentMethod } from '../types';
import { StatusLabel } from './StatusLabel';

export type MemberTab = 'overview' | 'packages' | 'deposits' | 'withdrawals' | 'ledger' | 'profile';

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

  // Ledger & Terms Inspection State
  const [ledgerDirectionFilter, setLedgerDirectionFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [selectedPurchaseTerms, setSelectedPurchaseTerms] = useState<PackagePurchase | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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

  const { profile, packages, paymentInstructions, deposits, withdrawals, purchases, ledger } = data;
  const activeInstruction = paymentInstructions.find((item) => item.method === depMethod);
  const pendingDepositsCount = deposits.filter((d) => d.status === 'pending').length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;
  const hasPendingWithdrawal = pendingWithdrawalsCount > 0;
  const activePackagesCount = purchases.filter((p) => p.status === 'active').length;

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

  const handleClaimDailyReward = async (purchase: PackagePurchase) => {
    setClaimFeedback(null);
    setClaimingId(purchase.id);
    try {
      const res = await apiRequest<{
        result: {
          days_credited: number;
          duration_days: number;
          reward_amount: number;
        };
      }>(`/api/member/purchases/${purchase.id}/claim`, {
        method: 'POST',
        requireAuth: true,
      });
      setClaimFeedback({
        type: 'success',
        text: `Credited +${formatCurrency(res.result.reward_amount)} (Day ${res.result.days_credited}/${res.result.duration_days}) for ${purchase.package_name} to your verified balance.`,
      });
      await onRefresh();
    } catch (err) {
      setClaimFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to claim daily return right now.',
      });
    } finally {
      setClaimingId(null);
    }
  };

  const navItems: { id: MemberTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'deposits', label: 'Deposits', icon: ArrowDownLeft },
    { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpRight },
    { id: 'ledger', label: 'Ledger', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:w-60 shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Member Account</div>
              <div className="font-display text-sm font-bold text-slate-900 mt-0.5 truncate">
                {profile.full_name || profile.email}
              </div>
              <div className="text-xs text-slate-500 truncate">{profile.email}</div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Status</span>
                <StatusLabel status={profile.status} />
              </div>
            </div>

            <nav aria-label="Member dashboard navigation" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-700 text-white'
                        : 'bg-white lg:bg-transparent text-slate-700 hover:bg-white border border-slate-200 lg:border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Workspace */}
          <main className="flex-1 min-w-0 space-y-6">
            {/* Top Workspace Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">Member Portal / {navItems.find((n) => n.id === activeTab)?.label}</div>
                <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                  {navItems.find((n) => n.id === activeTab)?.label}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => void onRefresh()}
                className="inline-flex items-center gap-2 self-start px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
              </button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs font-medium text-slate-500">Verified Available Balance</div>
                <div className="font-mono tabular-nums text-2xl font-bold text-blue-700 mt-1.5">
                  {formatCurrency(profile.available_balance)}
                </div>
                <div className="text-xs text-slate-500 mt-1">Usable for packages & payouts</div>
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

            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => onTabChange('deposits')}
                    className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900">Submit Deposit Request</div>
                    <p className="text-xs text-slate-600 mt-1">Fund balance via bKash, Nagad, or Rocket.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('packages')}
                    className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900">Browse Investment Packages</div>
                    <p className="text-xs text-slate-600 mt-1">Allocate verified funds across Starter to Premium tiers.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onTabChange('withdrawals')}
                    className="text-left bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900">Request Withdrawal</div>
                    <p className="text-xs text-slate-600 mt-1">Withdraw verified funds to your MFS account.</p>
                  </button>
                </div>

                {/* Purchased Package History */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">Purchased Package History & Daily Demo Income</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Demo daily returns unlock every 24 hours per active allocation until term completion.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTabChange('packages')}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer shrink-0"
                    >
                      View All Packages
                    </button>
                  </div>
                  {claimFeedback && (
                    <div
                      className={`mx-5 mt-4 rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                        claimFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {claimFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{claimFeedback.text}</span>
                    </div>
                  )}
                  {purchases.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-sm text-slate-600">You have not purchased any investment packages yet.</p>
                      <button
                        type="button"
                        onClick={() => onTabChange('packages')}
                        className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Explore Packages
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Package</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium text-right">Daily Demo Income</th>
                            <th className="py-3 px-4 font-medium text-right">Credited</th>
                            <th className="py-3 px-4 font-medium">Maturity</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                            <th className="py-3 px-4 font-medium text-right">Daily Payout</th>
                            <th className="py-3 px-4 font-medium text-right">Terms</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {purchases.map((p) => {
                            const rate = Number(p.daily_return_rate ?? 30);
                            const dailyAmt = Number(
                              p.daily_reward_amount || Math.round(Number(p.purchase_price) * rate) / 100
                            );
                            const daysCredited = Number(p.days_credited ?? 0);
                            const totalCredited = Number(p.total_credited ?? 0);
                            const nextClaimMs = new Date(p.last_credited_at || p.starts_at).getTime() + 24 * 60 * 60 * 1000;
                            const remainingMins = Math.max(1, Math.ceil((nextClaimMs - Date.now()) / 60000));
                            const hrsLeft = Math.floor(remainingMins / 60);
                            const minsLeft = remainingMins % 60;
                            const canClaim =
                              p.status === 'active' && daysCredited < p.duration_days && Date.now() >= nextClaimMs;

                            return (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-medium text-slate-900">{p.package_name}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                                  {formatCurrency(p.purchase_price)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                                  +{formatCurrency(dailyAmt)} ({rate}%)
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {daysCredited}/{p.duration_days}d · {formatCurrency(totalCredited)}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                  {formatDate(p.matures_at)}
                                </td>
                                <td className="py-3 px-4">
                                  <StatusLabel status={p.status} />
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  {p.status !== 'active' || daysCredited >= p.duration_days ? (
                                    <span className="text-xs text-slate-500">Completed</span>
                                  ) : canClaim ? (
                                    <button
                                      type="button"
                                      disabled={claimingId === p.id}
                                      onClick={() => void handleClaimDailyReward(p)}
                                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md cursor-pointer"
                                    >
                                      {claimingId === p.id ? 'Crediting...' : `Claim +${formatCurrency(dailyAmt)}`}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-500 font-mono">
                                      Next in {hrsLeft}h {minsLeft}m
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPurchaseTerms(p)}
                                    className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                                  >
                                    View Terms
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Recent Transaction Activity */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-slate-900">Recent Transaction History</h2>
                    <button
                      type="button"
                      onClick={() => onTabChange('ledger')}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      Open Full Ledger
                    </button>
                  </div>
                  {ledger.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No transactions recorded yet. Approved deposits, package purchases, and withdrawal holds appear here.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Timestamp</th>
                            <th className="py-3 px-4 font-medium">Description</th>
                            <th className="py-3 px-4 font-medium">Type</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium text-right">Balance After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ledger.slice(0, 6).map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {formatDateTime(entry.created_at)}
                              </td>
                              <td className="py-3 px-4 text-slate-900">{entry.description}</td>
                              <td className="py-3 px-4">
                                <StatusLabel status={entry.direction} />
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                                  entry.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {entry.direction === 'credit' ? '+' : '-'}
                                {formatCurrency(entry.amount)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                                {formatCurrency(entry.balance_after)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: PACKAGES */}
            {activeTab === 'packages' && (
              <div className="space-y-8">
                {schemaPending && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
                    <span className="font-semibold">Database Setup Required:</span> Run <span className="font-mono">supabase/schema.sql</span> in Supabase SQL Editor to activate live packages, deposits, and purchases.
                  </div>
                )}
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
                                Tier 0{pkg.tier_order} · {pkg.risk_level} Risk
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
                            <span className="text-emerald-900 font-medium">Daily Demo Income ({dailyRate}%)</span>
                            <span className="font-mono tabular-nums font-bold text-emerald-700">
                              +{formatCurrency(dailyIncome)} / day
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

                {/* Purchased History */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="font-display text-base font-bold text-slate-900">Your Purchased Packages</h2>
                  </div>
                  {purchases.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      No package allocations recorded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Package</th>
                            <th className="py-3 px-4 font-medium text-right">Price Paid</th>
                            <th className="py-3 px-4 font-medium text-right">Daily Demo</th>
                            <th className="py-3 px-4 font-medium text-right">Credited</th>
                            <th className="py-3 px-4 font-medium">Purchased</th>
                            <th className="py-3 px-4 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {purchases.map((p) => {
                            const rate = Number(p.daily_return_rate ?? 30);
                            const dailyAmt = Number(
                              p.daily_reward_amount || Math.round(Number(p.purchase_price) * rate) / 100
                            );
                            return (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-medium text-slate-900">{p.package_name}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">
                                  {formatCurrency(p.purchase_price)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                                  +{formatCurrency(dailyAmt)} ({rate}%)
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                                  {Number(p.days_credited ?? 0)}/{p.duration_days}d · {formatCurrency(Number(p.total_credited ?? 0))}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-600">{formatDateTime(p.starts_at)}</td>
                                <td className="py-3 px-4">
                                  <StatusLabel status={p.status} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB: DEPOSITS */}
            {activeTab === 'deposits' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-900">
                  <span className="font-semibold">Demo Transaction Mode:</span> Deposit submissions operate as verification demonstrations only. Do not send real funds until legal and payment-provider requirements are verified.
                </div>
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
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-900">
                  <span className="font-semibold">Demo Transaction Mode:</span> Withdrawal requests place an atomic balance hold for demonstration review. No real-money payouts occur until compliance approvals are complete.
                </div>
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

            {/* TAB: LEDGER */}
            {activeTab === 'ledger' && (
              <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">Immutable Financial Ledger</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Append-only accounting record of verified balance credits and debits.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(['all', 'credit', 'debit'] as const).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => setLedgerDirectionFilter(dir)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                            ledgerDirectionFilter === dir ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        placeholder="Search description..."
                        className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    {ledger.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          exportRowsToCsv(
                            'smart-invest-member-ledger.csv',
                            ['Date', 'Type', 'Direction', 'Amount', 'Balance Before', 'Balance After', 'Description'],
                            ledger.map((l) => [
                              l.created_at,
                              l.entry_type,
                              l.direction,
                              l.amount,
                              l.balance_before,
                              l.balance_after,
                              l.description,
                            ])
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </button>
                    )}
                  </div>
                </div>
                {(() => {
                  const filtered = ledger.filter((entry) => {
                    if (ledgerDirectionFilter !== 'all' && entry.direction !== ledgerDirectionFilter) {
                      return false;
                    }
                    const q = ledgerSearch.trim().toLowerCase();
                    if (q && !entry.description.toLowerCase().includes(q)) return false;
                    return true;
                  });
                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-sm text-slate-600">
                        {ledger.length === 0
                          ? 'No ledger entries recorded yet. Ledger entries appear automatically when deposits are approved, withdrawals are requested or refunded, or packages are purchased.'
                          : 'No ledger entries match your current filter.'}
                      </div>
                    );
                  }
                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                            <th className="py-3 px-4 font-medium">Timestamp</th>
                            <th className="py-3 px-4 font-medium">Description</th>
                            <th className="py-3 px-4 font-medium">Type</th>
                            <th className="py-3 px-4 font-medium text-right">Amount</th>
                            <th className="py-3 px-4 font-medium text-right">Before</th>
                            <th className="py-3 px-4 font-medium text-right">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {formatDateTime(entry.created_at)}
                              </td>
                              <td className="py-3 px-4 text-slate-900">{entry.description}</td>
                              <td className="py-3 px-4">
                                <StatusLabel status={entry.direction} />
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                                  entry.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {entry.direction === 'credit' ? '+' : '-'}
                                {formatCurrency(entry.amount)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                                {formatCurrency(entry.balance_before)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                                {formatCurrency(entry.balance_after)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </section>
            )}

            {/* TAB: PROFILE */}
            {activeTab === 'profile' && (
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
    </div>
  );
}
