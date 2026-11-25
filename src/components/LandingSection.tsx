import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  FileText,
  Headphones,
  Lock,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  formatCurrency,
  sanitizeEmailAddress,
  sanitizeTelegramUrl,
  sanitizeWhatsAppUrl,
} from '../lib/format';
import type { InvestmentPackage, Profile, SupportSettings } from '../types';

interface LandingSectionProps {
  packages: InvestmentPackage[];
  supportSettings?: SupportSettings | null;
  isAuthenticated: boolean;
  profile: Profile | null;
  onSelectPackage: (pkg: InvestmentPackage) => void;
  onNavigateAuth: () => void;
  onNavigateDashboard: () => void;
  onNavigateSupport: () => void;
  onNavigateAdminLogin: () => void;
}

export function LandingSection({
  packages,
  supportSettings,
  isAuthenticated,
  profile,
  onSelectPackage,
  onNavigateAuth,
  onNavigateDashboard,
  onNavigateSupport,
  onNavigateAdminLogin,
}: LandingSectionProps) {
  const [expandedTermsId, setExpandedTermsId] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <main className="bg-white">
      {/* Hero Split Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-16 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
            <div className="space-y-5">
              <div className="text-xs font-semibold tracking-wide text-blue-700">
                ৳100 Instant Signup Bonus · Verified MFS Accounting · 35% Referral Commission
              </div>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 leading-[1.12]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Disciplined Investment Packages Built on Verified Balances
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                SMART INVEST provides transparent fixed-duration investment packages, an instant ৳100 welcome bonus for every new member, manual verification for bKash, Nagad, and Rocket deposits, and strict atomic balance protection.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={onNavigateDashboard}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Open Member Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onNavigateAuth}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Create Member Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <a
                  href="#packages"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Review Packages
                </a>
              </div>

              {isAuthenticated && profile && (
                <div className="text-xs text-slate-500">
                  Signed in as <span className="font-medium text-slate-800">{profile.full_name || profile.email}</span> · Verified Balance:{' '}
                  <span className="font-mono tabular-nums font-semibold text-blue-700">
                    {formatCurrency(profile.available_balance)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 sm:h-96 lg:h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              {!imageFailed ? (
                <img
                  src="/src/assets/images/hero_fintech_architecture_1795537934633.jpg"
                  alt="SMART INVEST modern glass financial headquarters atrium"
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-900 via-slate-900 to-blue-800 flex flex-col items-center justify-center p-8 text-white text-center">
                  <Building2 className="w-12 h-12 text-blue-300 mb-3" />
                  <p className="font-display text-lg font-semibold">SMART INVEST Verified Capital Portal</p>
                  <p className="text-sm text-blue-200 mt-1 max-w-sm">
                    Verified deposits, row-locked balances, and transparent package durations.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Governance Strip Below Hero */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50">
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Verification Policy</div>
            <div className="font-display text-base font-semibold text-slate-900 mt-1">Admin-Confirmed Deposits</div>
            <p className="text-xs text-slate-600 mt-1">Balances credit strictly after Transaction ID verification.</p>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Supported Channels</div>
            <div className="font-display text-base font-semibold text-slate-900 mt-1">bKash · Nagad · Rocket</div>
            <p className="text-xs text-slate-600 mt-1">Managed instructions with min/max transaction thresholds.</p>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Transaction Safety</div>
            <div className="font-display text-base font-semibold text-slate-900 mt-1">Atomic Balance Locks</div>
            <p className="text-xs text-slate-600 mt-1">PostgreSQL row locks prevent duplicate withdrawals and double spending.</p>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Partner Program</div>
            <div className="font-display text-base font-semibold text-slate-900 mt-1">35% Referral Commission</div>
            <p className="text-xs text-slate-600 mt-1">Earn 35% instant balance credit when invited members buy packages.</p>
          </div>
        </div>
      </section>

      {/* Risk Disclosure Banner */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900">Important Risk & Compliance Disclosure:</span> All investments involve financial risk, including possible loss of principal. SMART INVEST does not promise guaranteed profits or fixed returns. Real-money investment operations must not be launched until all applicable legal, regulatory, and payment-provider requirements have been verified.
          </p>
        </div>
      </section>

      {/* Investment Packages Section */}
      <section id="packages" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-semibold text-blue-700 mb-2">Investment Packages</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Four Structured Participation Tiers
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            Packages can only be purchased using your verified available balance. Review the duration, risk level, and terms and conditions carefully prior to allocation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {packages.map((pkg) => {
            const isExpanded = expandedTermsId === pkg.id;
            const dailyRate = Number(pkg.daily_return_rate ?? 30);
            const dailyIncome = Math.round(Number(pkg.price) * dailyRate) / 100;
            const totalDemoReturn = Math.round(dailyIncome * Number(pkg.duration_days) * 100) / 100;
            return (
              <article
                key={pkg.id}
                className="flex flex-col justify-between border border-slate-200 rounded-xl bg-white p-6 hover:border-blue-300 transition-colors"
              >
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-slate-500">
                      Tier 0{pkg.tier_order} · {pkg.risk_level} Risk
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900 mt-1">{pkg.name}</h3>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <div className="text-xs text-slate-500">Purchase Price</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-blue-700 mt-0.5">
                      {formatCurrency(pkg.price)}
                    </div>
                  </div>

                  <div className="space-y-2 text-xs py-2.5 border-y border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Daily Demo Income ({dailyRate}%)</span>
                      <span className="font-mono tabular-nums font-semibold text-emerald-700">
                        +{formatCurrency(dailyIncome)} / day
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Commitment Duration</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {pkg.duration_days} Days
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Total {pkg.duration_days}d Demo Return</span>
                      <span className="font-mono tabular-nums font-semibold text-blue-700">
                        +{formatCurrency(totalDemoReturn)}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">{pkg.summary}</p>

                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedTermsId(isExpanded ? null : pkg.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{isExpanded ? 'Hide Terms & Conditions' : 'Read Terms & Conditions'}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {pkg.terms_and_conditions}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onSelectPackage(pkg)}
                    className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Buy Package
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Funding & Governance Workflow Section */}
      <section id="funding" className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold text-blue-700">Deposit & Withdrawal Governance</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Manual Verification Before Every Balance Update
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                SMART INVEST separates user submission from balance settlement. Deposits via bKash, Nagad, or Rocket remain pending until an authorized administrator reconciles your Transaction ID.
              </p>
              <div className="pt-2 space-y-2.5 text-sm text-slate-700">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>Unique Transaction ID enforcement prevents replay submissions.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>Withdrawals place an atomic balance hold to prevent double spending.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>Declined withdrawals automatically refund to your available balance.</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <Wallet className="w-5 h-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-slate-900">01. MFS Deposit Verification</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Review live admin-configured payment numbers for bKash, Nagad, or Rocket, transfer funds, and submit your sender number and Transaction ID for review.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <ShieldCheck className="w-5 h-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-slate-900">02. Verified Package Purchase</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Only verified available balances can fund Starter, Silver, Gold, or Premium allocations, with mandatory Terms & Conditions confirmation.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <Lock className="w-5 h-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-slate-900">03. Protected Withdrawals</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Request payouts to your bKash, Nagad, or Rocket account. Server-side idempotency and single-pending-request rules block duplicate submissions.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <Users className="w-5 h-5 text-blue-700" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-slate-900">04. 35% Referral & Daily Claims</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Share your personal referral link to receive 35% commission on partner package allocations and claim scheduled daily demo payouts every 24 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Support Section */}
      <section id="support" className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700">
                <Headphones className="w-4 h-4" aria-hidden="true" />
                <span>{supportSettings?.support_title || 'SMART INVEST Customer Support'}</span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Need Assistance With Deposits, Packages, or Withdrawals?
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {supportSettings?.notice_text ||
                  'Contact our support team directly or submit a support ticket from your member dashboard for deposit verification, referral questions, or payout updates.'}
              </p>
              {supportSettings?.support_hours && (
                <div className="text-xs text-slate-500 font-medium">
                  Service Hours: <span className="text-slate-800">{supportSettings.support_hours}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(() => {
                const waUrl = sanitizeWhatsAppUrl(supportSettings?.whatsapp_number);
                const tgUrl = sanitizeTelegramUrl(supportSettings?.telegram_link);
                const emailAddr = sanitizeEmailAddress(supportSettings?.support_email);
                return (
                  <>
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>WhatsApp Support</span>
                      </a>
                    )}
                    {tgUrl && (
                      <a
                        href={tgUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        <span>Telegram Support</span>
                      </a>
                    )}
                    {emailAddr && (
                      <a
                        href={`mailto:${emailAddr}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                        <span>{emailAddr}</span>
                      </a>
                    )}
                  </>
                );
              })()}
              <button
                type="button"
                onClick={isAuthenticated ? onNavigateSupport : onNavigateAuth}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Headphones className="w-4 h-4" />
                <span>{isAuthenticated ? 'Open Support Desk' : 'Sign In for Support'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="font-display text-sm font-bold text-slate-900">SMART INVEST</div>
            <p className="text-xs text-slate-500 mt-1">
              Capital is at risk. No guaranteed returns. Verify all regulatory and payment-provider approvals before live deployment.
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs text-slate-500">
            {isAuthenticated && profile?.role === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={onNavigateAdminLogin}
                  className="font-medium text-slate-700 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  Admin Panel
                </button>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>© {new Date().getFullYear()} SMART INVEST. Demo transactions only.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
