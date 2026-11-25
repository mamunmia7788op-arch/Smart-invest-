import type { InvestmentPackage } from '../types';

export const CANONICAL_PACKAGE_CATALOG: InvestmentPackage[] = [
  {
    id: 'catalog-starter',
    slug: 'starter',
    name: 'Starter Package',
    tier_order: 1,
    price: 2000,
    duration_days: 30,
    daily_return_rate: 30,
    summary:
      'Entry-level 30-day structured allocation designed for members exploring disciplined capital participation.',
    terms_and_conditions:
      '1. Capital Participation: Purchasing the Starter Package allocates 2,000 BDT from your verified available balance for a fixed 30-day term.\n2. Risk Disclosure: Market-linked allocations carry risk of capital fluctuation or loss. No fixed profit or guaranteed return is promised.\n3. Lock-In Period: Allocated funds remain committed during the 30-day duration and cannot be withdrawn early.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    risk_level: 'Low-Moderate',
    is_active: true,
  },
  {
    id: 'catalog-silver',
    slug: 'silver',
    name: 'Silver Package',
    tier_order: 2,
    price: 10000,
    duration_days: 60,
    daily_return_rate: 30,
    summary:
      'Balanced 60-day diversified portfolio allocation with periodic reporting inside your member ledger.',
    terms_and_conditions:
      '1. Capital Participation: Purchasing the Silver Package allocates 10,000 BDT from your verified available balance for a 60-day term.\n2. Risk Disclosure: Returns are variable and depend on market conditions. Past outcomes do not guarantee future performance.\n3. Lock-In Period: Allocated principal is committed for the full 60-day duration.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    risk_level: 'Moderate',
    is_active: true,
  },
  {
    id: 'catalog-gold',
    slug: 'gold',
    name: 'Gold Package',
    tier_order: 3,
    price: 25000,
    duration_days: 90,
    daily_return_rate: 30,
    summary:
      'Medium-horizon 90-day multi-sector allocation built for members seeking structured quarterly participation.',
    terms_and_conditions:
      '1. Capital Participation: Purchasing the Gold Package allocates 25,000 BDT from your verified available balance for a 90-day term.\n2. Risk Disclosure: All investments involve risk, including potential loss of principal. SMART INVEST does not guarantee profits.\n3. Lock-In Period: Funds remain committed for 90 calendar days from the purchase timestamp.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    risk_level: 'Moderate-High',
    is_active: true,
  },
  {
    id: 'catalog-premium',
    slug: 'premium',
    name: 'Premium Package',
    tier_order: 4,
    price: 50000,
    duration_days: 180,
    daily_return_rate: 30,
    summary:
      'Longer-horizon 180-day institutional-style allocation with comprehensive ledger auditability.',
    terms_and_conditions:
      '1. Capital Participation: Purchasing the Premium Package allocates 50,000 BDT from your verified available balance for a 180-day term.\n2. Risk Disclosure: Higher-horizon strategies carry market, liquidity, and counterparty risks. No return is guaranteed.\n3. Lock-In Period: Funds remain locked for the 180-day duration prior to settlement review.\n4. Regulatory Compliance: Live operations remain subject to applicable local financial, KYC, and payment-provider authorization.',
    risk_level: 'High',
    is_active: true,
  },
];
