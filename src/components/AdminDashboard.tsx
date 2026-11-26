import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  FileCode2,
  Headphones,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatDate, formatDateTime, formatMemberContact, isSyntheticMemberEmail } from '../lib/format';
import type {
  AdminOverviewData,
  InvestmentPackage,
  PaymentInstruction,
  PaymentMethod,
  Profile,
  RequestStatus,
  SupportSettings,
  SupportTicket,
  SupportTicketStatus,
} from '../types';
import { StatusLabel } from './StatusLabel';

type AdminTab = 'deposits' | 'withdrawals' | 'members' | 'packages' | 'allocations' | 'instructions' | 'support';

interface AdminDashboardProps {
  currentAdmin: Profile | null;
  data: AdminOverviewData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

interface ReviewPromptState {
  kind: 'deposit' | 'withdrawal';
  action: 'approve' | 'reject';
  id: string;
  label: string;
}

export function AdminDashboard({
  currentAdmin,
  data,
  loading,
  error,
  onRefresh,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('deposits');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('pending');
  const [memberSearch, setMemberSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'all' | SupportTicketStatus>('all');
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review note modal
  const [reviewPrompt, setReviewPrompt] = useState<ReviewPromptState | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Package edit / create modal
  const [editingPkg, setEditingPkg] = useState<Partial<InvestmentPackage> & { isNew?: boolean } | null>(null);

  // Payment instruction edit state
  const [editingInstruction, setEditingInstruction] = useState<PaymentInstruction | null>(null);

  // Customer support settings & reply modal
  const [supportForm, setSupportForm] = useState<Omit<SupportSettings, 'id' | 'updated_at'>>({
    support_title: 'SMART INVEST Customer Support',
    support_hours: '9:00 AM - 10:00 PM (GMT+6)',
    whatsapp_number: '',
    telegram_link: '',
    support_email: '',
    notice_text: 'Need help with deposits, packages, or withdrawals? Contact our support desk.',
    is_active: true,
  });
  const [replyingTicket, setReplyingTicket] = useState<SupportTicket | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState('');
  const [ticketReplyStatus, setTicketReplyStatus] = useState<'replied' | 'closed'>('replied');

  // Member inspect modal
  const [inspectedMember, setInspectedMember] = useState<Profile | null>(null);

  // One-click Schema SQL helper when DB tables are not yet initialized
  const [sqlText, setSqlText] = useState<string | null>(null);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [sqlLoading, setSqlLoading] = useState(false);

  useEffect(() => {
    if (!data?.supportSettings) return;
    setSupportForm({
      support_title: data.supportSettings.support_title || 'SMART INVEST Customer Support',
      support_hours: data.supportSettings.support_hours || '9:00 AM - 10:00 PM (GMT+6)',
      whatsapp_number: data.supportSettings.whatsapp_number || '',
      telegram_link: data.supportSettings.telegram_link || '',
      support_email: data.supportSettings.support_email || '',
      notice_text: data.supportSettings.notice_text || '',
      is_active: data.supportSettings.is_active !== false,
    });
  }, [data?.supportSettings]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, Profile>();
    if (data?.members) {
      for (const m of data.members) {
        map.set(m.id, m);
      }
    }
    return map;
  }, [data?.members]);

  if (!currentAdmin || currentAdmin.role !== 'admin') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <ShieldAlert className="w-5 h-5" />
            <span>Access Denied</span>
          </div>
          <p className="text-sm text-red-700">
            Administrator privileges are required to view or operate the SMART INVEST Admin Panel.
          </p>
        </div>
      </main>
    );
  }

  if (loading && !data) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="h-8 w-64 bg-slate-200 animate-pulse rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-28 bg-slate-100 border border-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-72 bg-slate-100 border border-slate-200 animate-pulse rounded-xl" />
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <AlertCircle className="w-5 h-5" />
            <span>Unable to Load Admin Panel</span>
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
    members,
    deposits,
    withdrawals,
    packages,
    paymentInstructions,
    ledger,
    referralCommissions = [],
    supportTickets = [],
  } = data;
  const pendingDeposits = deposits.filter((d) => d.status === 'pending');
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending');
  const openTicketsCount = supportTickets.filter((t) => t.status === 'open').length;
  const activeMembers = members.filter((m) => m.status === 'active').length;
  const totalVerifiedBalances = members.reduce((sum, m) => sum + Number(m.available_balance || 0), 0);
  const totalCommissionsPaid = referralCommissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

  const filteredDeposits = deposits.filter((d) =>
    statusFilter === 'all' ? true : d.status === statusFilter
  );
  const filteredWithdrawals = withdrawals.filter((w) =>
    statusFilter === 'all' ? true : w.status === statusFilter
  );
  const filteredMembers = members.filter((m) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      m.email.toLowerCase().includes(q) ||
      m.full_name.toLowerCase().includes(q) ||
      m.phone.toLowerCase().includes(q) ||
      (m.referral_code || '').toLowerCase().includes(q)
    );
  });
  const filteredTickets = supportTickets.filter((t) =>
    ticketFilter === 'all' ? true : t.status === ticketFilter
  );

  const handleConfirmReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewPrompt) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const endpoint =
        reviewPrompt.kind === 'deposit'
          ? `/api/admin/deposits/${reviewPrompt.id}/${reviewPrompt.action}`
          : `/api/admin/withdrawals/${reviewPrompt.id}/${reviewPrompt.action}`;
      await apiRequest(endpoint, {
        method: 'POST',
        requireAuth: true,
        body: { admin_note: reviewNote.trim() || undefined },
      });
      setFeedback({
        type: 'success',
        text: `${reviewPrompt.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} request ${
          reviewPrompt.action === 'approve' ? 'approved' : 'rejected'
        }.`,
      });
      setReviewPrompt(null);
      setReviewNote('');
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process request.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleMemberStatus = async (member: Profile) => {
    const nextStatus = member.status === 'active' ? 'deactivated' : 'active';
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/members/${member.id}/status`, {
        method: 'PATCH',
        requireAuth: true,
        body: { status: nextStatus },
      });
      setFeedback({
        type: 'success',
        text: `${formatMemberContact(member)} is now ${nextStatus}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update member status.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleMemberRole = async (member: Profile) => {
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/members/${member.id}/role`, {
        method: 'PATCH',
        requireAuth: true,
        body: { role: nextRole },
      });
      setFeedback({
        type: 'success',
        text: `${formatMemberContact(member)} role updated to ${nextRole}.`,
      });
      setInspectedMember((prev) => (prev && prev.id === member.id ? { ...prev, role: nextRole } : prev));
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update member role.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePackageActive = async (pkg: InvestmentPackage) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/packages/${pkg.id}`, {
        method: 'PATCH',
        requireAuth: true,
        body: { is_active: !pkg.is_active },
      });
      setFeedback({
        type: 'success',
        text: `${pkg.name} is now ${!pkg.is_active ? 'active' : 'deactivated'}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update package visibility.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkPurchaseStatus = async (purchaseId: string, nextStatus: 'active' | 'completed') => {
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/purchases/${purchaseId}/status`, {
        method: 'PATCH',
        requireAuth: true,
        body: { status: nextStatus },
      });
      setFeedback({
        type: 'success',
        text: `Allocation marked as ${nextStatus}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update allocation status.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSavePackage = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingPkg) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      if (editingPkg.isNew) {
        await apiRequest('/api/admin/packages', {
          method: 'POST',
          requireAuth: true,
          body: {
            name: editingPkg.name,
            slug: editingPkg.slug,
            tier_order: Number(editingPkg.tier_order || 5),
            price: Number(editingPkg.price),
            duration_days: Number(editingPkg.duration_days),
            daily_return_rate: Number(editingPkg.daily_return_rate ?? 30),
            risk_level: editingPkg.risk_level || 'Moderate',
            summary: editingPkg.summary || '',
            terms_and_conditions: editingPkg.terms_and_conditions || '',
            is_active: editingPkg.is_active !== false,
          },
        });
        setFeedback({ type: 'success', text: `Package "${editingPkg.name}" created.` });
      } else if (editingPkg.id) {
        await apiRequest(`/api/admin/packages/${editingPkg.id}`, {
          method: 'PATCH',
          requireAuth: true,
          body: {
            name: editingPkg.name,
            price: Number(editingPkg.price),
            duration_days: Number(editingPkg.duration_days),
            daily_return_rate: Number(editingPkg.daily_return_rate ?? 30),
            risk_level: editingPkg.risk_level,
            summary: editingPkg.summary,
            terms_and_conditions: editingPkg.terms_and_conditions,
            is_active: editingPkg.is_active,
          },
        });
        setFeedback({ type: 'success', text: `Package "${editingPkg.name}" updated.` });
      }
      setEditingPkg(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save package.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveInstruction = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingInstruction) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/payment-instructions/${editingInstruction.method}`, {
        method: 'PUT',
        requireAuth: true,
        body: {
          account_number: editingInstruction.account_number,
          account_type: editingInstruction.account_type,
          instructions: editingInstruction.instructions,
          min_deposit: Number(editingInstruction.min_deposit),
          max_deposit: Number(editingInstruction.max_deposit),
          is_active: editingInstruction.is_active,
        },
      });
      setFeedback({
        type: 'success',
        text: `${editingInstruction.method} payment instructions saved.`,
      });
      setEditingInstruction(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save payment instructions.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveSupportSettings = async (e: FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest('/api/admin/support-settings', {
        method: 'PUT',
        requireAuth: true,
        body: supportForm,
      });
      setFeedback({ type: 'success', text: 'Customer support settings saved.' });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save customer support settings.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmTicketReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyingTicket) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/support-tickets/${replyingTicket.id}/reply`, {
        method: 'POST',
        requireAuth: true,
        body: {
          admin_reply: ticketReplyText.trim(),
          status: ticketReplyStatus,
        },
      });
      setFeedback({
        type: 'success',
        text: `Support ticket ${ticketReplyStatus === 'closed' ? 'closed' : 'replied'}.`,
      });
      setReplyingTicket(null);
      setTicketReplyText('');
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update support ticket.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const tabs: { id: AdminTab; label: string; count?: number; icon: typeof ArrowDownLeft }[] = [
    { id: 'deposits', label: 'Deposits', count: pendingDeposits.length, icon: ArrowDownLeft },
    { id: 'withdrawals', label: 'Withdrawals', count: pendingWithdrawals.length, icon: ArrowUpRight },
    { id: 'members', label: 'Members', count: members.length, icon: Users },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'allocations', label: 'Allocations', count: data.purchases.length, icon: CheckCircle2 },
    { id: 'instructions', label: 'Payment Setup', icon: CreditCard },
    { id: 'support', label: 'Customer Support', count: openTicketsCount, icon: Headphones },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-700">SMART INVEST · Administrator Console</div>
            <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
              Operations, Verification &amp; Support Management
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-2 self-start px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Demo Mode & Legal Readiness Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
          <span className="font-semibold">Demo Transactions Only:</span> All approvals, package allocations, and balance records currently operate in verification demonstration mode. Do not enable live real-money operations until legal, regulatory, and payment-provider requirements are verified.
        </div>

        {/* One-Click Database Setup Banner when tables (e.g. payment_instructions) are missing */}
        {data.schemaPending && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Supabase Database Tables Pending (`payment_instructions`, `investment_packages`, etc.)</span>
                </div>
                <p className="text-xs text-red-800 leading-relaxed">
                  Saving bKash, Nagad, or Rocket numbers requires running <span className="font-mono">supabase/schema.sql</span> once in your Supabase Dashboard → <span className="font-semibold">SQL Editor</span>. Download or copy the SQL below, paste or import it in Supabase SQL Editor &amp; click <span className="font-semibold">Run</span>, then click <span className="font-semibold">Refresh Data</span>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={sqlLoading}
                  onClick={async () => {
                    setSqlLoading(true);
                    try {
                      const res = await apiRequest<{ sql: string }>('/api/admin/schema-sql', {
                        requireAuth: true,
                      });
                      setSqlText(res.sql);
                      const blob = new Blob([res.sql], { type: 'application/sql;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'smart-invest-schema.sql';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      setFeedback({
                        type: 'error',
                        text: err instanceof Error ? err.message : 'Unable to download setup SQL.',
                      });
                    } finally {
                      setSqlLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{sqlLoading ? 'Preparing...' : 'Download .sql File'}</span>
                </button>
                <button
                  type="button"
                  disabled={sqlLoading}
                  onClick={async () => {
                    setSqlLoading(true);
                    try {
                      const res = await apiRequest<{ sql: string }>('/api/admin/schema-sql', {
                        requireAuth: true,
                      });
                      setSqlText(res.sql);
                      let copied = false;
                      try {
                        await navigator.clipboard.writeText(res.sql);
                        copied = true;
                      } catch {
                        const tmp = document.createElement('textarea');
                        tmp.value = res.sql;
                        tmp.style.position = 'fixed';
                        tmp.style.opacity = '0';
                        document.body.appendChild(tmp);
                        tmp.focus();
                        tmp.select();
                        try {
                          copied = document.execCommand('copy');
                        } catch {
                          copied = false;
                        }
                        tmp.remove();
                      }
                      if (copied) {
                        setSqlCopied(true);
                        setTimeout(() => setSqlCopied(false), 2500);
                      }
                    } catch (err) {
                      setFeedback({
                        type: 'error',
                        text: err instanceof Error ? err.message : 'Unable to load setup SQL.',
                      });
                    } finally {
                      setSqlLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-red-200 hover:bg-red-100 text-red-800 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {sqlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{sqlCopied ? 'Copied Setup SQL!' : 'Copy Setup SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (sqlText) {
                      setSqlText(null);
                      return;
                    }
                    setSqlLoading(true);
                    try {
                      const res = await apiRequest<{ sql: string }>('/api/admin/schema-sql', {
                        requireAuth: true,
                      });
                      setSqlText(res.sql);
                    } catch {
                      // Handled silently
                    } finally {
                      setSqlLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-red-200 hover:bg-red-100 text-red-800 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{sqlText ? 'Hide SQL' : 'View SQL'}</span>
                </button>
              </div>
            </div>
            {sqlText && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-medium text-red-900">
                  Select All &amp; Copy below → Paste in Supabase SQL Editor → Click Run:
                </div>
                <textarea
                  readOnly
                  value={sqlText}
                  rows={8}
                  translate="no"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  onFocus={(e) => e.currentTarget.select()}
                  className="notranslate w-full p-3 text-xs font-mono bg-white border border-red-200 rounded-lg text-slate-800"
                />
              </div>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Registered Members</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1.5">
              {members.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">{activeMembers} active accounts</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Pending Deposit Requests</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1.5">
              {pendingDeposits.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">{deposits.length} total requests</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Pending Withdrawal Requests</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1.5">
              {pendingWithdrawals.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">{withdrawals.length} total payouts</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Verified Member Balances</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-blue-700 mt-1.5">
              {formatCurrency(totalVerifiedBalances)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {formatCurrency(totalCommissionsPaid)} paid in 35% referrals
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3 border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Admin Section Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span className="font-mono tabular-nums text-slate-500">({item.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB: DEPOSITS */}
        {tab === 'deposits' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold text-slate-900">Deposit Verification Queue</h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                      statusFilter === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {filteredDeposits.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No {statusFilter === 'all' ? '' : statusFilter} deposit requests found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">Member</th>
                      <th className="py-3 px-4 font-medium">Method</th>
                      <th className="py-3 px-4 font-medium">Sender</th>
                      <th className="py-3 px-4 font-medium">Transaction ID</th>
                      <th className="py-3 px-4 font-medium text-right">Amount</th>
                      <th className="py-3 px-4 font-medium">Submitted</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDeposits.map((d) => {
                      const member = memberLookup.get(d.user_id);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{member?.full_name || 'Member'}</div>
                            <div className="text-xs text-slate-500">{formatMemberContact(member, d.user_id)}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{d.payment_method}</td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700">{d.sender_account}</td>
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">{d.transaction_id}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                            {formatDateTime(d.created_at)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusLabel status={d.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {d.status === 'pending' ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    setReviewNote('');
                                    setReviewPrompt({
                                      kind: 'deposit',
                                      action: 'approve',
                                      id: d.id,
                                      label: `${formatCurrency(d.amount)} via ${d.payment_method} (${d.transaction_id})`,
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    setReviewNote('');
                                    setReviewPrompt({
                                      kind: 'deposit',
                                      action: 'reject',
                                      id: d.id,
                                      label: `${formatCurrency(d.amount)} via ${d.payment_method} (${d.transaction_id})`,
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">{d.admin_note || 'Reviewed'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB: WITHDRAWALS */}
        {tab === 'withdrawals' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold text-slate-900">Withdrawal Payout Queue</h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                      statusFilter === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {filteredWithdrawals.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No {statusFilter === 'all' ? '' : statusFilter} withdrawal requests found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">Member</th>
                      <th className="py-3 px-4 font-medium">Method</th>
                      <th className="py-3 px-4 font-medium">Recipient Account</th>
                      <th className="py-3 px-4 font-medium text-right">Amount</th>
                      <th className="py-3 px-4 font-medium">Requested</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWithdrawals.map((w) => {
                      const member = memberLookup.get(w.user_id);
                      return (
                        <tr key={w.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{member?.full_name || 'Member'}</div>
                            <div className="text-xs text-slate-500">{formatMemberContact(member, w.user_id)}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{w.payment_method}</td>
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">{w.account_number}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatCurrency(w.amount)}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                            {formatDateTime(w.created_at)}
                          </td>
                          <td className="py-3 px-4">
                            <StatusLabel status={w.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {w.status === 'pending' ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    setReviewNote('');
                                    setReviewPrompt({
                                      kind: 'withdrawal',
                                      action: 'approve',
                                      id: w.id,
                                      label: `${formatCurrency(w.amount)} to ${w.payment_method} (${w.account_number})`,
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => {
                                    setReviewNote('');
                                    setReviewPrompt({
                                      kind: 'withdrawal',
                                      action: 'reject',
                                      id: w.id,
                                      label: `${formatCurrency(w.amount)} to ${w.payment_method} (${w.account_number})`,
                                    });
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md cursor-pointer"
                                >
                                  Reject & Refund
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">{w.admin_note || 'Reviewed'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB: MEMBERS */}
        {tab === 'members' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold text-slate-900">Member Directory</h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search name, email, phone, or ref code..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-3 px-4 font-medium">Member</th>
                    <th className="py-3 px-4 font-medium">Ref Code</th>
                    <th className="py-3 px-4 font-medium">Phone</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium text-right">Verified Balance</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Joined</th>
                    <th className="py-3 px-4 font-medium text-right">Account Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{m.full_name || '—'}</div>
                        <div className="text-xs text-slate-500">{formatMemberContact(m)}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700">
                        {m.referral_code || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">{m.phone || '—'}</td>
                      <td className="py-3 px-4">
                        <StatusLabel status={m.role} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(m.available_balance)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusLabel status={m.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTime(m.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setInspectedMember(m)}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                          >
                            Inspect
                          </button>
                          {m.id === currentAdmin.id ? (
                            <span className="text-xs text-slate-400 px-1">Current Admin</span>
                          ) : (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleToggleMemberStatus(m)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                                m.status === 'active'
                                  ? 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
                                  : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {m.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB: PACKAGES */}
        {tab === 'packages' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900">Manage Investment Packages</h2>
              <button
                type="button"
                onClick={() =>
                  setEditingPkg({
                    isNew: true,
                    name: '',
                    slug: '',
                    tier_order: packages.length + 1,
                    price: 5000,
                    duration_days: 7,
                    daily_return_rate: 30,
                    risk_level: 'Moderate',
                    summary: '',
                    terms_and_conditions: '',
                    is_active: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Package</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((pkg) => {
                const dailyRate = Number(pkg.daily_return_rate ?? 30);
                const dailyIncome = Math.round(Number(pkg.price) * dailyRate) / 100;
                return (
                <div key={pkg.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-500">
                        Tier 0{pkg.tier_order}
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-900">{pkg.name}</h3>
                    </div>
                    <StatusLabel status={pkg.is_active ? 'active' : 'deactivated'} />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div>
                      <span className="text-xs text-slate-500">Price: </span>
                      <span className="font-mono tabular-nums font-bold text-blue-700">
                        {formatCurrency(pkg.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">{dailyRate}% Income: </span>
                      <span className="font-mono tabular-nums font-semibold text-emerald-700">
                        +{formatCurrency(dailyIncome)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Duration: </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {pkg.duration_days} Days
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{pkg.summary}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleTogglePackageActive(pkg)}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      {pkg.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPkg({ ...pkg, isNew: false })}
                      className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                    >
                      Edit Package
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB: PACKAGE ALLOCATIONS */}
        {tab === 'allocations' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">Member Package Allocations</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All purchased investment packages funded by verified member balances.
              </p>
            </div>
            {data.purchases.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No package allocations recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">Member</th>
                      <th className="py-3 px-4 font-medium">Package</th>
                      <th className="py-3 px-4 font-medium text-right">Amount</th>
                      <th className="py-3 px-4 font-medium text-right">Income</th>
                      <th className="py-3 px-4 font-medium text-right">Credited</th>
                      <th className="py-3 px-4 font-medium">Start</th>
                      <th className="py-3 px-4 font-medium">Maturity</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.purchases.map((p) => {
                      const owner = memberLookup.get(p.user_id);
                      const rate = Number(p.daily_return_rate ?? 30);
                      const dailyAmt = Number(
                        p.daily_reward_amount || Math.round(Number(p.purchase_price) * rate) / 100
                      );
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-900">{owner?.full_name || 'Member'}</div>
                            <div className="text-slate-500">{formatMemberContact(owner, p.user_id)}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{p.package_name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                            {formatCurrency(p.purchase_price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                            +{formatCurrency(dailyAmt)} ({rate}%)
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                            {Number(p.days_credited ?? 0)}/{p.duration_days}d · {formatCurrency(Number(p.total_credited ?? 0))}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{formatDate(p.starts_at)}</td>
                          <td className="py-3 px-4 text-xs text-slate-600">{formatDate(p.matures_at)}</td>
                          <td className="py-3 px-4">
                            <StatusLabel status={p.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {p.status === 'active' ? (
                              <button
                                type="button"
                                disabled={actionBusy}
                                onClick={() => void handleMarkPurchaseStatus(p.id, 'completed')}
                                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                              >
                                Mark Completed
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500 capitalize">{p.status}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'allocations' && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  35% Referral Commission Payouts
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatic 35% commissions credited when referred members purchase packages.
                </p>
              </div>
              <div className="font-mono tabular-nums text-sm font-bold text-emerald-700">
                Total: {formatCurrency(totalCommissionsPaid)}
              </div>
            </div>
            {referralCommissions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">
                No referral commission payouts recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">Date</th>
                      <th className="py-3 px-4 font-medium">Referrer</th>
                      <th className="py-3 px-4 font-medium">Referred Buyer</th>
                      <th className="py-3 px-4 font-medium">Package</th>
                      <th className="py-3 px-4 font-medium text-right">Package Price</th>
                      <th className="py-3 px-4 font-medium text-right">35% Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {referralCommissions.map((c) => {
                      const referrer = memberLookup.get(c.referrer_id);
                      const buyer = memberLookup.get(c.referred_user_id);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                            {formatDateTime(c.created_at)}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-900">{referrer?.full_name || 'Member'}</div>
                            <div className="text-slate-500">{formatMemberContact(referrer, c.referrer_id)}</div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-900">{buyer?.full_name || 'Member'}</div>
                            <div className="text-slate-500">{formatMemberContact(buyer, c.referred_user_id)}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{c.package_name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {formatCurrency(c.package_price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            +{formatCurrency(c.commission_amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB: PAYMENT INSTRUCTIONS */}
        {tab === 'instructions' && (
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Manage Deposit Payment Instructions</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Configure active bKash, Nagad, and Rocket account numbers and deposit limits displayed to members.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {(['bKash', 'Nagad', 'Rocket'] as PaymentMethod[]).map((method) => {
                const inst = paymentInstructions.find((item) => item.method === method) || {
                  id: '',
                  method,
                  account_number: 'Not configured',
                  account_type: 'Merchant' as const,
                  instructions: '',
                  min_deposit: 500,
                  max_deposit: 500000,
                  is_active: true,
                };
                return (
                  <div key={method} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-bold text-slate-900">{method}</h3>
                        <StatusLabel status={inst.is_active ? 'active' : 'deactivated'} />
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="text-xs text-slate-500">{inst.account_type} Account</div>
                        <div className="font-mono text-sm font-bold text-slate-900 mt-0.5">
                          {inst.account_number}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600">
                        Limits:{' '}
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {formatCurrency(inst.min_deposit)} – {formatCurrency(inst.max_deposit)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{inst.instructions || 'No instructions set.'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingInstruction({
                          ...inst,
                          account_number:
                            inst.account_number === 'Configure in Admin Panel' ||
                            inst.account_number === 'Not configured'
                              ? ''
                              : inst.account_number,
                          instructions:
                            inst.instructions ||
                            `Send Money or Payment to this ${method} ${inst.account_type} number, then submit your Sender Number and Transaction ID (TrxID) for admin verification.`,
                        })
                      }
                      className="w-full py-2 px-4 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                    >
                      Edit {method} Settings
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB: CUSTOMER SUPPORT */}
        {tab === 'support' && (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Customer Support Channels &amp; Public Notice
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Configure your live WhatsApp, Telegram, Support Email, and support notice displayed on the landing page and Member Support tab.
                </p>
              </div>

              <form onSubmit={handleSaveSupportSettings} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="adm-sup-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Support Desk Title
                    </label>
                    <input
                      id="adm-sup-title"
                      type="text"
                      required
                      maxLength={100}
                      value={supportForm.support_title}
                      onChange={(e) => setSupportForm({ ...supportForm, support_title: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-sup-hours" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Service Hours
                    </label>
                    <input
                      id="adm-sup-hours"
                      type="text"
                      maxLength={100}
                      value={supportForm.support_hours}
                      onChange={(e) => setSupportForm({ ...supportForm, support_hours: e.target.value })}
                      placeholder="e.g. 9:00 AM - 10:00 PM (GMT+6)"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="adm-sup-wa" className="block text-xs font-medium text-slate-700 mb-1.5">
                      WhatsApp Number
                    </label>
                    <input
                      id="adm-sup-wa"
                      type="text"
                      maxLength={32}
                      value={supportForm.whatsapp_number}
                      onChange={(e) => setSupportForm({ ...supportForm, whatsapp_number: e.target.value })}
                      placeholder="+8801XXXXXXXXX"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-sup-tg" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Telegram Link or @Username
                    </label>
                    <input
                      id="adm-sup-tg"
                      type="text"
                      maxLength={160}
                      value={supportForm.telegram_link}
                      onChange={(e) => setSupportForm({ ...supportForm, telegram_link: e.target.value })}
                      placeholder="https://t.me/smartinvest_support"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="adm-sup-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Support Email
                    </label>
                    <input
                      id="adm-sup-email"
                      type="email"
                      maxLength={120}
                      value={supportForm.support_email}
                      onChange={(e) => setSupportForm({ ...supportForm, support_email: e.target.value })}
                      placeholder="support@example.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adm-sup-notice" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Support Notice / Instructions
                  </label>
                  <textarea
                    id="adm-sup-notice"
                    rows={3}
                    maxLength={600}
                    value={supportForm.notice_text}
                    onChange={(e) => setSupportForm({ ...supportForm, notice_text: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={supportForm.is_active}
                      onChange={(e) => setSupportForm({ ...supportForm, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-700"
                    />
                    <span>Show Customer Support contacts publicly &amp; in Member Portal</span>
                  </label>

                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
                  >
                    {actionBusy ? 'Saving...' : 'Save Support Settings'}
                  </button>
                </div>
              </form>
            </section>

            {/* Support Tickets Queue */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">Member Support Tickets</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review and respond directly to member inquiries.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  {(['all', 'open', 'replied', 'closed'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTicketFilter(st)}
                      className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                        ticketFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTickets.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-600">
                  No {ticketFilter === 'all' ? '' : ticketFilter} support tickets found.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredTickets.map((t) => {
                    const sender = memberLookup.get(t.user_id);
                    return (
                      <div key={t.id} className="p-5 space-y-3 hover:bg-slate-50/60">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="text-sm font-semibold text-slate-900">{t.subject}</h3>
                              <StatusLabel status={t.status} />
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {sender?.full_name || 'Member'} · {formatMemberContact(sender, t.user_id)} ·{' '}
                              {formatDateTime(t.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTicket(t);
                              setTicketReplyText(t.admin_reply || '');
                              setTicketReplyStatus(t.status === 'closed' ? 'closed' : 'replied');
                            }}
                            className="self-start px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            {t.admin_reply ? 'Update Reply' : 'Reply'}
                          </button>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{t.message}</p>

                        {t.admin_reply && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                            <div className="text-xs font-semibold text-blue-900">
                              Administrator Reply {t.replied_at ? `· ${formatDateTime(t.replied_at)}` : ''}
                            </div>
                            <p className="text-xs text-blue-900 leading-relaxed whitespace-pre-line">{t.admin_reply}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Review Deposit / Withdrawal Confirmation Modal */}
      {reviewPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleConfirmReview}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-bold text-slate-900 capitalize">
              {reviewPrompt.action} {reviewPrompt.kind} Request
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">{reviewPrompt.label}</p>
            <div>
              <label htmlFor="admin-review-note" className="block text-xs font-medium text-slate-700 mb-1.5">
                Administrator Note (Optional)
              </label>
              <textarea
                id="admin-review-note"
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={
                  reviewPrompt.action === 'approve'
                    ? 'e.g. Verified against merchant statement.'
                    : 'e.g. Transaction ID not found in settlement log.'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewPrompt(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer ${
                  reviewPrompt.action === 'approve'
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-red-700 hover:bg-red-800'
                }`}
              >
                {actionBusy ? 'Processing...' : `Confirm ${reviewPrompt.action}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Package Edit / Create Modal */}
      {editingPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSavePackage}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingPkg.isNew ? 'Create Investment Package' : `Edit ${editingPkg.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPkg(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Package Name</label>
                <input
                  type="text"
                  required
                  value={editingPkg.name || ''}
                  onChange={(e) => setEditingPkg({ ...editingPkg, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              {editingPkg.isNew && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Slug</label>
                  <input
                    type="text"
                    required
                    value={editingPkg.slug || ''}
                    onChange={(e) => setEditingPkg({ ...editingPkg, slug: e.target.value })}
                    placeholder="e.g. platinum"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Price (BDT)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={editingPkg.price ?? ''}
                  onChange={(e) => setEditingPkg({ ...editingPkg, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editingPkg.duration_days ?? ''}
                  onChange={(e) => setEditingPkg({ ...editingPkg, duration_days: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Income Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={editingPkg.daily_return_rate ?? 30}
                  onChange={(e) => setEditingPkg({ ...editingPkg, daily_return_rate: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Risk Level</label>
                <select
                  value={editingPkg.risk_level || 'Moderate'}
                  onChange={(e) =>
                    setEditingPkg({
                      ...editingPkg,
                      risk_level: e.target.value as InvestmentPackage['risk_level'],
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Low-Moderate">Low-Moderate</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Moderate-High">Moderate-High</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPkg.is_active !== false}
                    onChange={(e) => setEditingPkg({ ...editingPkg, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>Active for purchase</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
              <textarea
                rows={2}
                required
                value={editingPkg.summary || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, summary: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Terms and Conditions</label>
              <textarea
                rows={5}
                required
                value={editingPkg.terms_and_conditions || ''}
                onChange={(e) => setEditingPkg({ ...editingPkg, terms_and_conditions: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingPkg(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                {actionBusy ? 'Saving...' : 'Save Package'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Instruction Edit Modal */}
      {editingInstruction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSaveInstruction}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Configure {editingInstruction.method} Instructions
              </h3>
              <button
                type="button"
                onClick={() => setEditingInstruction(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Number</label>
              <input
                type="text"
                required
                placeholder="01XXXXXXXXX"
                value={editingInstruction.account_number}
                onChange={(e) =>
                  setEditingInstruction({ ...editingInstruction, account_number: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account Type</label>
                <select
                  value={editingInstruction.account_type}
                  onChange={(e) =>
                    setEditingInstruction({
                      ...editingInstruction,
                      account_type: e.target.value as PaymentInstruction['account_type'],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Merchant">Merchant</option>
                  <option value="Agent">Agent</option>
                  <option value="Personal">Personal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Min Deposit</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editingInstruction.min_deposit}
                  onChange={(e) =>
                    setEditingInstruction({ ...editingInstruction, min_deposit: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Deposit</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editingInstruction.max_deposit}
                  onChange={(e) =>
                    setEditingInstruction({ ...editingInstruction, max_deposit: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Instructions for Members</label>
              <textarea
                rows={4}
                required
                value={editingInstruction.instructions}
                onChange={(e) =>
                  setEditingInstruction({ ...editingInstruction, instructions: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={editingInstruction.is_active}
                onChange={(e) =>
                  setEditingInstruction({ ...editingInstruction, is_active: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-300 text-blue-700"
              />
              <span>Enable {editingInstruction.method} deposits</span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingInstruction(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                {actionBusy ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Member Detail Inspection Modal */}
      {inspectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs text-blue-700 font-semibold">Member Account Inspection</div>
                <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                  {inspectedMember.full_name || formatMemberContact(inspectedMember)}
                </h3>
                <div className="text-xs text-slate-500">
                  {!isSyntheticMemberEmail(inspectedMember.email) ? `${inspectedMember.email} · ` : ''}
                  {inspectedMember.phone || 'No phone'} · ID:{' '}
                  <span className="font-mono">{inspectedMember.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedMember(null)}
                aria-label="Close member details"
                className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div>
                <div className="text-xs text-slate-500">Verified Balance</div>
                <div className="font-mono tabular-nums text-base font-bold text-blue-700 mt-0.5">
                  {formatCurrency(inspectedMember.available_balance)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Account Status</div>
                <div className="mt-1">
                  <StatusLabel status={inspectedMember.status} />
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Access Role</div>
                <div className="mt-1">
                  <StatusLabel status={inspectedMember.role} />
                </div>
              </div>
            </div>

            {(() => {
              const mDeposits = deposits.filter((d) => d.user_id === inspectedMember.id);
              const mWithdrawals = withdrawals.filter((w) => w.user_id === inspectedMember.id);
              const mPurchases = data.purchases.filter((p) => p.user_id === inspectedMember.id);
              const mLedger = ledger.filter((l) => l.user_id === inspectedMember.id);
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="text-slate-500">Deposits</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                        {mDeposits.length}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="text-slate-500">Withdrawals</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                        {mWithdrawals.length}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-3">
                      <div className="text-slate-500">Packages</div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                        {mPurchases.length}
                      </div>
                    </div>
                  </div>

              <div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">Recent Account Activity</h4>
                    {mLedger.length === 0 ? (
                      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        No recent account activity for this member.
                      </p>
                    ) : (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                              <th className="py-2 px-3 font-medium">Date</th>
                              <th className="py-2 px-3 font-medium">Description</th>
                              <th className="py-2 px-3 font-medium text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mLedger.slice(0, 8).map((entry) => (
                              <tr key={entry.id}>
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                  {formatDateTime(entry.created_at)}
                                </td>
                                <td className="py-2 px-3 text-slate-800">{entry.description}</td>
                                <td
                                  className={`py-2 px-3 text-right font-mono tabular-nums font-medium ${
                                    entry.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  {entry.direction === 'credit' ? '+' : '-'}
                                  {formatCurrency(entry.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {inspectedMember.id !== currentAdmin.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleToggleMemberStatus(inspectedMember)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      inspectedMember.status === 'active'
                        ? 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
                        : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {inspectedMember.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleToggleMemberRole(inspectedMember)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    {inspectedMember.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">Active administrator session</span>
              )}
              <button
                type="button"
                onClick={() => setInspectedMember(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Ticket Reply Modal */}
      {replyingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleConfirmTicketReply}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-semibold text-blue-700">Customer Support Reply</div>
                <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                  {replyingTicket.subject}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTicket(null)}
                aria-label="Close support reply modal"
                className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-line">
              {replyingTicket.message}
            </div>

            <div>
              <label htmlFor="adm-ticket-reply" className="block text-xs font-medium text-slate-700 mb-1.5">
                Administrator Reply
              </label>
              <textarea
                id="adm-ticket-reply"
                rows={4}
                required={ticketReplyStatus !== 'closed'}
                maxLength={2000}
                value={ticketReplyText}
                onChange={(e) => setTicketReplyText(e.target.value)}
                placeholder="Write a clear, helpful response to the member..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="adm-ticket-status" className="block text-xs font-medium text-slate-700 mb-1.5">
                Ticket Status
              </label>
              <select
                id="adm-ticket-status"
                value={ticketReplyStatus}
                onChange={(e) => setTicketReplyStatus(e.target.value as 'replied' | 'closed')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="replied">Replied (Open for reference)</option>
                <option value="closed">Closed (Resolved)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReplyingTicket(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionBusy}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                {actionBusy ? 'Saving...' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
