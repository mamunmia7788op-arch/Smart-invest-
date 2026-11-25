export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'member' | 'admin';
export type AccountStatus = 'active' | 'deactivated';
export type SupportTicketStatus = 'open' | 'replied' | 'closed';
export type LedgerEntryType =
  | 'deposit_credit'
  | 'withdrawal_hold'
  | 'withdrawal_refund'
  | 'package_purchase'
  | 'package_reward'
  | 'referral_commission';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  available_balance: number;
  referral_code: string;
  referred_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestmentPackage {
  id: string;
  slug: string;
  name: string;
  tier_order: number;
  price: number;
  duration_days: number;
  daily_return_rate: number;
  summary: string;
  terms_and_conditions: string;
  risk_level: 'Low-Moderate' | 'Moderate' | 'Moderate-High' | 'High';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentInstruction {
  id: string;
  method: PaymentMethod;
  account_number: string;
  account_type: 'Merchant' | 'Agent' | 'Personal';
  instructions: string;
  min_deposit: number;
  max_deposit: number;
  is_active: boolean;
  updated_at?: string;
}

export interface DepositRequest {
  id: string;
  user_id: string;
  amount: number;
  payment_method: PaymentMethod;
  sender_account: string;
  transaction_id: string;
  status: RequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  payment_method: PaymentMethod;
  account_number: string;
  idempotency_key: string;
  status: RequestStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PackagePurchase {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  purchase_price: number;
  duration_days: number;
  daily_return_rate?: number;
  daily_reward_amount?: number;
  days_credited?: number;
  total_credited?: number;
  last_credited_at?: string | null;
  terms_accepted: boolean;
  terms_snapshot: string;
  status: 'active' | 'completed' | 'cancelled';
  starts_at: string;
  matures_at: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  entry_type: LedgerEntryType;
  direction: 'credit' | 'debit';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_table: string;
  reference_id: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface ReferralMemberSummary {
  id: string;
  label: string;
  joined_at: string;
}

export interface ReferralCommission {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  purchase_id: string;
  package_name: string;
  package_price: number;
  commission_rate: number;
  commission_amount: number;
  created_at: string;
}

export interface SupportSettings {
  id: number;
  support_title: string;
  support_hours: string;
  whatsapp_number: string;
  telegram_link: string;
  support_email: string;
  notice_text: string;
  is_active: boolean;
  updated_at?: string;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberBootstrapData {
  profile: Profile;
  packages: InvestmentPackage[];
  paymentInstructions: PaymentInstruction[];
  deposits: DepositRequest[];
  withdrawals: WithdrawalRequest[];
  purchases: PackagePurchase[];
  ledger: LedgerEntry[];
  referrals: ReferralMemberSummary[];
  referralCommissions: ReferralCommission[];
  supportSettings: SupportSettings | null;
  supportTickets: SupportTicket[];
}

export interface AdminOverviewData {
  members: Profile[];
  deposits: DepositRequest[];
  withdrawals: WithdrawalRequest[];
  packages: InvestmentPackage[];
  paymentInstructions: PaymentInstruction[];
  purchases: PackagePurchase[];
  ledger: LedgerEntry[];
  referralCommissions: ReferralCommission[];
  supportSettings: SupportSettings | null;
  supportTickets: SupportTicket[];
  schemaPending?: boolean;
}

export interface SystemHealth {
  ok: boolean;
  supabaseClientConfigured: boolean;
  supabaseServerConfigured: boolean;
  dbReady?: boolean;
  schemaPending?: boolean;
}

export type AppRoute = 'home' | 'auth' | 'admin-login' | 'dashboard' | 'admin';
