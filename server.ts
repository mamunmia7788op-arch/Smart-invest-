import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    if (parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in')) {
      return parsed.origin;
    }
    const strippedPath = parsed.pathname.replace(/\/(rest|auth|storage|functions|realtime)\/v1.*$/i, '');
    return `${parsed.origin}${strippedPath}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');

const isServiceConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const isClientConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabaseAdmin: SupabaseClient | null = isServiceConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'member' | 'admin';
  status: 'active' | 'deactivated';
  available_balance: number;
  created_at: string;
  updated_at: string;
}

interface AuthedRequest extends Request {
  authUser?: { id: string; email: string };
  profile?: ProfileRow;
}

const VALID_METHODS = new Set(['bKash', 'Nagad', 'Rocket']);
const VALID_RISK_LEVELS = new Set(['Low-Moderate', 'Moderate', 'Moderate-High', 'High']);
const VALID_ACCOUNT_TYPES = new Set(['Merchant', 'Agent', 'Personal']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveAmount(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0 || num > 100_000_000) return null;
  return Math.round(num * 100) / 100;
}

function cleanString(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

function getBearerToken(req: Request): string | null {
  const customHeader = req.headers['x-supabase-auth'];
  if (typeof customHeader === 'string' && customHeader.trim().length > 0) {
    return customHeader.trim();
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}

function isMissingColumnOrConstraintError(error: { code?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || error.code === '23514';
}

function normalizeProfileRow(
  raw: Record<string, unknown>,
  authUser: { id: string; email?: string }
): ProfileRow {
  const rawRole = typeof raw.role === 'string' ? raw.role.toLowerCase() : 'member';
  const rawStatus = typeof raw.status === 'string' ? raw.status.toLowerCase() : 'active';
  const rawBalance = raw.available_balance ?? raw.balance ?? 0;
  const parsedBalance = Number(rawBalance);

  return {
    id: typeof raw.id === 'string' ? raw.id : authUser.id,
    email: typeof raw.email === 'string' && raw.email ? raw.email : (authUser.email || '').toLowerCase(),
    full_name: typeof raw.full_name === 'string' ? raw.full_name : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    role: rawRole === 'admin' ? 'admin' : 'member',
    status: rawStatus === 'deactivated' ? 'deactivated' : 'active',
    available_balance: Number.isFinite(parsedBalance) && parsedBalance >= 0 ? parsedBalance : 0,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
    updated_at:
      typeof raw.updated_at === 'string'
        ? raw.updated_at
        : typeof raw.created_at === 'string'
        ? raw.created_at
        : new Date().toISOString(),
  };
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!supabaseAdmin) {
    res.status(503).json({
      error: 'Supabase server configuration is incomplete. Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment secrets.',
    });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  const authUser = userData.user;
  const { data: rawProfileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle<Record<string, unknown>>();

  if (profileError) {
    res.status(500).json({ error: 'Unable to load member profile.' });
    return;
  }

  let rawProfile = rawProfileData;
  if (!rawProfile) {
    const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
    const normalizedEmail = (authUser.email || '').toLowerCase();
    const fullName = cleanString(meta.full_name, 120);
    const phone = cleanString(meta.phone, 32);

    const { data: created, error: createError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.id,
        email: normalizedEmail,
        full_name: fullName,
        phone,
        role: 'member',
        status: 'active',
        available_balance: 0,
      })
      .select('*')
      .single<Record<string, unknown>>();

    if (createError && isMissingColumnOrConstraintError(createError)) {
      const { data: legacyCreated, error: legacyError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authUser.id,
          email: normalizedEmail,
          full_name: fullName,
        })
        .select('*')
        .single<Record<string, unknown>>();

      if (legacyError || !legacyCreated) {
        res.status(500).json({ error: 'Failed to initialize member profile.' });
        return;
      }
      rawProfile = legacyCreated;
    } else if (createError || !created) {
      res.status(500).json({ error: 'Failed to initialize member profile.' });
      return;
    } else {
      rawProfile = created;
    }
  }

  const profile = normalizeProfileRow(rawProfile, {
    id: authUser.id,
    email: authUser.email,
  });

  if (profile.status === 'deactivated') {
    res.status(403).json({ error: 'This account has been deactivated by an administrator.' });
    return;
  }

  req.authUser = { id: authUser.id, email: authUser.email || profile.email };
  req.profile = profile;
  next();
}

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!req.profile || req.profile.role !== 'admin') {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    next();
  });
}

function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const parts = host.split('.');
    if (parts.length >= 3 && (host.endsWith('.supabase.co') || host.endsWith('.supabase.in'))) {
      return parts[0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureDatabaseSchemaOnBoot(): Promise<void> {
  if (!supabaseAdmin || !SUPABASE_URL) return;

  const [pkgCheck, payCheck, rateCheck, rewardCheck] = await Promise.all([
    supabaseAdmin.from('investment_packages').select('id').limit(1),
    supabaseAdmin.from('payment_instructions').select('id').limit(1),
    supabaseAdmin.from('investment_packages').select('daily_return_rate').limit(1),
    supabaseAdmin.from('package_purchases').select('daily_reward_amount').limit(1),
  ]);

  const missing =
    isMissingTableError(pkgCheck.error) ||
    isMissingTableError(payCheck.error) ||
    isMissingColumnOrConstraintError(rateCheck.error) ||
    isMissingColumnOrConstraintError(rewardCheck.error);
  const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  const projectRef = extractSupabaseProjectRef(SUPABASE_URL);

  if (!missing || !accessToken || !projectRef) return;

  try {
    const schemaPath = path.resolve(__dirname, 'supabase/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    const migRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/migrations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'smart_invest_schema_upgrade', query: sql }),
    });

    if (migRes.ok) {
      console.log('SMART INVEST schema applied automatically via Supabase Migrations API.');
      return;
    }

    const queryRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql, read_only: false }),
    });

    if (queryRes.ok) {
      console.log('SMART INVEST schema applied automatically via Supabase Query API.');
      return;
    }

    const migDetail = await migRes.text().catch(() => '');
    console.error(`Auto-migration requires database_migrations_write permission (${migRes.status}): ${migDetail.slice(0, 200)}`);
  } catch (err) {
    console.error('Auto-migration attempt failed:', err instanceof Error ? err.message : 'Unknown error');
  }
}

async function createApp(): Promise<void> {
  await ensureDatabaseSchemaOnBoot();
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Health & config readiness check (never exposes secret values or project identifiers)
  app.get('/api/health', async (_req, res) => {
    let dbReady = false;
    let schemaPending = false;
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin
        .from('investment_packages')
        .select('id')
        .limit(1);
      if (!error) {
        dbReady = true;
      } else if (error.code === '42P01' || error.code === 'PGRST205') {
        schemaPending = true;
      }
    }

    res.json({
      ok: true,
      supabaseClientConfigured: isClientConfigured,
      supabaseServerConfigured: isServiceConfigured,
      dbReady,
      schemaPending,
    });
  });

  // Public package listing (reads from DB when configured; returns empty or DB error cleanly)
  app.get('/api/packages', async (_req, res) => {
    if (!supabaseAdmin) {
      res.json({ packages: [], fromDatabase: false });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('investment_packages')
      .select('id, slug, name, tier_order, price, duration_days, daily_return_rate, summary, terms_and_conditions, risk_level, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('tier_order', { ascending: true });

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        res.json({ packages: [], fromDatabase: false, schemaPending: true });
        return;
      }
      res.status(500).json({ error: 'Unable to fetch investment packages.' });
      return;
    }

    res.json({ packages: data || [], fromDatabase: true });
  });

  // Member bootstrap: profile, packages, payment instructions, deposits, withdrawals, purchases, ledger
  app.get('/api/member/bootstrap', requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.profile!.id;

    const [packagesRes, instructionsRes, depositsRes, withdrawalsRes, purchasesRes, ledgerRes] = await Promise.all([
      supabaseAdmin!
        .from('investment_packages')
        .select('*')
        .eq('is_active', true)
        .order('tier_order', { ascending: true }),
      supabaseAdmin!
        .from('payment_instructions')
        .select('id, method, account_number, account_type, instructions, min_deposit, max_deposit, is_active, updated_at')
        .eq('is_active', true)
        .order('method', { ascending: true }),
      supabaseAdmin!
        .from('deposit_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin!
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin!
        .from('package_purchases')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin!
        .from('financial_ledger')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    const queryErrors = [
      packagesRes.error,
      instructionsRes.error,
      depositsRes.error,
      withdrawalsRes.error,
      purchasesRes.error,
      ledgerRes.error,
    ].filter(Boolean);

    const hasUnexpectedError = queryErrors.some((err) => !isMissingTableError(err));
    if (hasUnexpectedError) {
      res.status(500).json({ error: 'Failed to load member dashboard records.' });
      return;
    }

    res.json({
      profile: req.profile,
      packages: packagesRes.error ? [] : packagesRes.data || [],
      paymentInstructions: instructionsRes.error ? [] : instructionsRes.data || [],
      deposits: depositsRes.error ? [] : depositsRes.data || [],
      withdrawals: withdrawalsRes.error ? [] : withdrawalsRes.data || [],
      purchases: purchasesRes.error ? [] : purchasesRes.data || [],
      ledger: ledgerRes.error ? [] : ledgerRes.data || [],
    });
  });

  // Update member profile (safe fields only)
  app.patch('/api/member/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    const fullName = cleanString(req.body?.full_name, 120);
    const phone = cleanString(req.body?.phone, 32);

    if (fullName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    if (phone && !/^[+\d\s\-()]{6,25}$/.test(phone)) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }

    let { data, error } = await supabaseAdmin!
      .from('profiles')
      .update({ full_name: fullName, phone })
      .eq('id', req.profile!.id)
      .select('*')
      .single<Record<string, unknown>>();

    if (error && isMissingColumnOrConstraintError(error)) {
      const retry = await supabaseAdmin!
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', req.profile!.id)
        .select('*')
        .single<Record<string, unknown>>();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      res.status(500).json({ error: 'Unable to update profile.' });
      return;
    }

    res.json({
      profile: normalizeProfileRow(data, req.authUser!),
    });
  });

  // Submit manual deposit request (Pending until Admin verifies; never credits balance here)
  app.post('/api/member/deposits', requireAuth, async (req: AuthedRequest, res: Response) => {
    const amount = parsePositiveAmount(req.body?.amount);
    const method = cleanString(req.body?.payment_method, 24);
    const senderAccount = cleanString(req.body?.sender_account, 64);
    const transactionId = cleanString(req.body?.transaction_id, 80).toUpperCase();

    if (!amount) {
      res.status(400).json({ error: 'Enter a valid positive deposit amount.' });
      return;
    }
    if (!VALID_METHODS.has(method)) {
      res.status(400).json({ error: 'Payment method must be bKash, Nagad, or Rocket.' });
      return;
    }
    if (!/^[+\d\s\-]{6,25}$/.test(senderAccount)) {
      res.status(400).json({ error: 'Enter a valid sender mobile account number.' });
      return;
    }
    if (transactionId.length < 4 || !/^[A-Z0-9\-_]+$/.test(transactionId)) {
      res.status(400).json({ error: 'Enter a valid alphanumeric Transaction ID.' });
      return;
    }

    const { data: instruction, error: instructionError } = await supabaseAdmin!
      .from('payment_instructions')
      .select('account_number, min_deposit, max_deposit, is_active')
      .eq('method', method)
      .maybeSingle();

    if (instructionError) {
      if (isMissingTableError(instructionError)) {
        res.status(503).json({
          error: 'Database tables are not initialized yet. Run supabase/schema.sql in Supabase SQL Editor first.',
        });
        return;
      }
      res.status(500).json({ error: 'Unable to verify payment instructions.' });
      return;
    }

    if (!instruction || !instruction.is_active) {
      res.status(400).json({ error: `${method} deposits are currently unavailable.` });
      return;
    }

    const configuredNumber = String(instruction.account_number || '').trim();
    if (
      !configuredNumber ||
      configuredNumber === 'Configure in Admin Panel' ||
      configuredNumber === 'Not configured'
    ) {
      res.status(400).json({
        error: `${method} account number is not configured yet. Ask an administrator to set the ${method} number in Admin Panel → Payment Setup.`,
      });
      return;
    }

    if (amount < Number(instruction.min_deposit) || amount > Number(instruction.max_deposit)) {
      res.status(400).json({
        error: `Deposit amount for ${method} must be between ${instruction.min_deposit} and ${instruction.max_deposit} BDT.`,
      });
      return;
    }

    const { data: inserted, error } = await supabaseAdmin!
      .from('deposit_requests')
      .insert({
        user_id: req.profile!.id,
        amount,
        payment_method: method,
        sender_account: senderAccount,
        transaction_id: transactionId,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        res.status(503).json({
          error: 'Database tables are not initialized yet. Run supabase/schema.sql in Supabase SQL Editor first.',
        });
        return;
      }
      if (error.code === '23505') {
        res.status(409).json({ error: 'This Transaction ID has already been submitted.' });
        return;
      }
      res.status(500).json({ error: 'Unable to submit deposit request.' });
      return;
    }

    res.status(201).json({ deposit: inserted });
  });

  // Submit withdrawal request via atomic PostgreSQL RPC (prevents double spending & duplicates)
  app.post('/api/member/withdrawals', requireAuth, async (req: AuthedRequest, res: Response) => {
    const amount = parsePositiveAmount(req.body?.amount);
    const method = cleanString(req.body?.payment_method, 24);
    const accountNumber = cleanString(req.body?.account_number, 64);
    const idempotencyKey = cleanString(req.body?.idempotency_key, 128);

    if (!amount) {
      res.status(400).json({ error: 'Enter a valid positive withdrawal amount.' });
      return;
    }
    if (!VALID_METHODS.has(method)) {
      res.status(400).json({ error: 'Withdrawal method must be bKash, Nagad, or Rocket.' });
      return;
    }
    if (!/^[+\d\s\-]{6,25}$/.test(accountNumber)) {
      res.status(400).json({ error: 'Enter a valid recipient account number.' });
      return;
    }
    if (idempotencyKey.length < 8) {
      res.status(400).json({ error: 'Missing request idempotency token.' });
      return;
    }

    const { data, error } = await supabaseAdmin!.rpc('request_withdrawal', {
      p_user_id: req.profile!.id,
      p_amount: amount,
      p_method: method,
      p_account_number: accountNumber,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Unable to process withdrawal request.' });
      return;
    }

    res.status(201).json({ result: data });
  });

  // Purchase investment package via atomic PostgreSQL RPC using verified available balance
  app.post('/api/member/packages/purchase', requireAuth, async (req: AuthedRequest, res: Response) => {
    const packageId = cleanString(req.body?.package_id, 64);
    const termsAccepted = req.body?.terms_accepted === true;

    if (!UUID_REGEX.test(packageId)) {
      res.status(400).json({ error: 'Invalid investment package identifier.' });
      return;
    }
    if (!termsAccepted) {
      res.status(400).json({ error: 'You must accept the package terms and risk disclosure.' });
      return;
    }

    const { data, error } = await supabaseAdmin!.rpc('purchase_package', {
      p_user_id: req.profile!.id,
      p_package_id: packageId,
      p_terms_accepted: true,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Package purchase could not be completed.' });
      return;
    }

    res.status(201).json({ result: data });
  });

  // Claim 24-hour daily demo package payout via atomic PostgreSQL RPC
  app.post('/api/member/purchases/:id/claim', requireAuth, async (req: AuthedRequest, res: Response) => {
    const purchaseId = req.params.id;
    if (!UUID_REGEX.test(purchaseId)) {
      res.status(400).json({ error: 'Invalid package allocation ID.' });
      return;
    }

    const { data, error } = await supabaseAdmin!.rpc('claim_package_reward', {
      p_user_id: req.profile!.id,
      p_purchase_id: purchaseId,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Unable to claim daily package return.' });
      return;
    }

    res.json({ result: data });
  });

  // --------------------------------------------------------------------------
  // ADMIN ROUTES (Protected by requireAdmin RBAC)
  // --------------------------------------------------------------------------

  app.get('/api/admin/verify', requireAdmin, (req: AuthedRequest, res: Response) => {
    res.json({ ok: true, admin: req.profile });
  });

  app.get('/api/admin/overview', requireAdmin, async (_req: AuthedRequest, res: Response) => {
    const [profilesRes, depositsRes, withdrawalsRes, packagesRes, instructionsRes, purchasesRes, ledgerRes] =
      await Promise.all([
        supabaseAdmin!.from('profiles').select('*').order('created_at', { ascending: false }),
        supabaseAdmin!.from('deposit_requests').select('*').order('created_at', { ascending: false }),
        supabaseAdmin!.from('withdrawal_requests').select('*').order('created_at', { ascending: false }),
        supabaseAdmin!.from('investment_packages').select('*').order('tier_order', { ascending: true }),
        supabaseAdmin!.from('payment_instructions').select('*').order('method', { ascending: true }),
        supabaseAdmin!.from('package_purchases').select('*').order('created_at', { ascending: false }),
        supabaseAdmin!.from('financial_ledger').select('*').order('created_at', { ascending: false }).limit(500),
      ]);

    const queryErrors = [
      profilesRes.error,
      depositsRes.error,
      withdrawalsRes.error,
      packagesRes.error,
      instructionsRes.error,
      purchasesRes.error,
      ledgerRes.error,
    ].filter(Boolean);

    if (queryErrors.some((err) => !isMissingTableError(err))) {
      res.status(500).json({ error: 'Failed to load administrator overview.' });
      return;
    }

    const normalizedMembers = (profilesRes.data || []).map((row) =>
      normalizeProfileRow(row as Record<string, unknown>, {
        id: String((row as Record<string, unknown>).id || ''),
        email: String((row as Record<string, unknown>).email || ''),
      })
    );

    res.json({
      members: normalizedMembers,
      deposits: depositsRes.error ? [] : depositsRes.data || [],
      withdrawals: withdrawalsRes.error ? [] : withdrawalsRes.data || [],
      packages: packagesRes.error ? [] : packagesRes.data || [],
      paymentInstructions: instructionsRes.error ? [] : instructionsRes.data || [],
      purchases: purchasesRes.error ? [] : purchasesRes.data || [],
      ledger: ledgerRes.error ? [] : ledgerRes.data || [],
      schemaPending: queryErrors.some((err) => isMissingTableError(err)),
    });
  });

  app.get('/api/admin/schema-sql', requireAdmin, (_req: AuthedRequest, res: Response) => {
    try {
      const schemaPath = path.resolve(__dirname, 'supabase/schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      res.json({ sql });
    } catch {
      res.status(500).json({ error: 'Unable to read supabase/schema.sql file.' });
    }
  });

  app.post('/api/admin/deposits/:id/approve', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const depositId = req.params.id;
    if (!UUID_REGEX.test(depositId)) {
      res.status(400).json({ error: 'Invalid deposit ID.' });
      return;
    }

    const adminNote = cleanString(req.body?.admin_note, 300);
    const { data, error } = await supabaseAdmin!.rpc('approve_deposit', {
      p_deposit_id: depositId,
      p_admin_id: req.profile!.id,
      p_admin_note: adminNote || null,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Failed to approve deposit.' });
      return;
    }

    res.json({ result: data });
  });

  app.post('/api/admin/deposits/:id/reject', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const depositId = req.params.id;
    if (!UUID_REGEX.test(depositId)) {
      res.status(400).json({ error: 'Invalid deposit ID.' });
      return;
    }

    const adminNote = cleanString(req.body?.admin_note, 300);
    const { data, error } = await supabaseAdmin!.rpc('reject_deposit', {
      p_deposit_id: depositId,
      p_admin_id: req.profile!.id,
      p_admin_note: adminNote || null,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Failed to reject deposit.' });
      return;
    }

    res.json({ result: data });
  });

  app.post('/api/admin/withdrawals/:id/approve', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const withdrawalId = req.params.id;
    if (!UUID_REGEX.test(withdrawalId)) {
      res.status(400).json({ error: 'Invalid withdrawal ID.' });
      return;
    }

    const adminNote = cleanString(req.body?.admin_note, 300);
    const { data, error } = await supabaseAdmin!.rpc('approve_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_admin_id: req.profile!.id,
      p_admin_note: adminNote || null,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Failed to approve withdrawal.' });
      return;
    }

    res.json({ result: data });
  });

  app.post('/api/admin/withdrawals/:id/reject', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const withdrawalId = req.params.id;
    if (!UUID_REGEX.test(withdrawalId)) {
      res.status(400).json({ error: 'Invalid withdrawal ID.' });
      return;
    }

    const adminNote = cleanString(req.body?.admin_note, 300);
    const { data, error } = await supabaseAdmin!.rpc('reject_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_admin_id: req.profile!.id,
      p_admin_note: adminNote || null,
    });

    if (error) {
      res.status(400).json({ error: error.message || 'Failed to reject withdrawal.' });
      return;
    }

    res.json({ result: data });
  });

  app.patch('/api/admin/members/:id/status', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const memberId = req.params.id;
    const status = cleanString(req.body?.status, 20);

    if (!UUID_REGEX.test(memberId)) {
      res.status(400).json({ error: 'Invalid member ID.' });
      return;
    }
    if (status !== 'active' && status !== 'deactivated') {
      res.status(400).json({ error: 'Status must be active or deactivated.' });
      return;
    }
    if (memberId === req.profile!.id && status === 'deactivated') {
      res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
      return;
    }

    const { data, error } = await supabaseAdmin!
      .from('profiles')
      .update({ status })
      .eq('id', memberId)
      .select('*')
      .single();

    if (error || !data) {
      res.status(400).json({ error: 'Unable to update member account status.' });
      return;
    }

    res.json({ member: data });
  });

  app.patch('/api/admin/members/:id/role', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const memberId = req.params.id;
    const role = cleanString(req.body?.role, 20);

    if (!UUID_REGEX.test(memberId)) {
      res.status(400).json({ error: 'Invalid member ID.' });
      return;
    }
    if (role !== 'member' && role !== 'admin') {
      res.status(400).json({ error: 'Role must be member or admin.' });
      return;
    }
    if (memberId === req.profile!.id && role !== 'admin') {
      res.status(400).json({ error: 'You cannot remove your own administrator role.' });
      return;
    }

    const { data, error } = await supabaseAdmin!
      .from('profiles')
      .update({ role })
      .eq('id', memberId)
      .select('*')
      .single();

    if (error || !data) {
      res.status(400).json({ error: 'Unable to update member role.' });
      return;
    }

    res.json({ member: data });
  });

  app.patch('/api/admin/purchases/:id/status', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const purchaseId = req.params.id;
    const status = cleanString(req.body?.status, 20);

    if (!UUID_REGEX.test(purchaseId)) {
      res.status(400).json({ error: 'Invalid package purchase ID.' });
      return;
    }
    if (status !== 'active' && status !== 'completed') {
      res.status(400).json({ error: 'Status must be active or completed.' });
      return;
    }

    const { data, error } = await supabaseAdmin!
      .from('package_purchases')
      .update({ status })
      .eq('id', purchaseId)
      .select('*')
      .single();

    if (error || !data) {
      res.status(400).json({ error: 'Unable to update package allocation status.' });
      return;
    }

    res.json({ purchase: data });
  });

  app.post('/api/admin/packages', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const name = cleanString(req.body?.name, 80);
    const slug = cleanString(req.body?.slug, 64).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const price = parsePositiveAmount(req.body?.price);
    const durationDays = Number(req.body?.duration_days);
    const dailyReturnRateRaw = req.body?.daily_return_rate === undefined ? 30 : Number(req.body.daily_return_rate);
    const dailyReturnRate = Math.round(dailyReturnRateRaw * 100) / 100;
    const tierOrder = Number(req.body?.tier_order || 1);
    const summary = cleanString(req.body?.summary, 400);
    const terms = cleanString(req.body?.terms_and_conditions, 4000);
    const riskLevel = cleanString(req.body?.risk_level, 32);
    const isActive = req.body?.is_active !== false;

    if (name.length < 2 || slug.length < 2 || !price || !Number.isInteger(durationDays) || durationDays <= 0) {
      res.status(400).json({ error: 'Provide a valid package name, slug, price, and duration in days.' });
      return;
    }
    if (!Number.isFinite(dailyReturnRate) || dailyReturnRate < 0 || dailyReturnRate > 100) {
      res.status(400).json({ error: 'Daily return rate must be between 0% and 100%.' });
      return;
    }
    if (!VALID_RISK_LEVELS.has(riskLevel)) {
      res.status(400).json({ error: 'Invalid risk level.' });
      return;
    }

    const { data, error } = await supabaseAdmin!
      .from('investment_packages')
      .insert({
        slug,
        name,
        price,
        duration_days: durationDays,
        daily_return_rate: dailyReturnRate,
        tier_order: Number.isInteger(tierOrder) ? tierOrder : 1,
        summary,
        terms_and_conditions: terms,
        risk_level: riskLevel,
        is_active: isActive,
      })
      .select('*')
      .single();

    if (error || !data) {
      if (isMissingTableError(error)) {
        res.status(503).json({
          error: 'Database tables have not been created yet. Run supabase/schema.sql in Supabase SQL Editor first.',
        });
        return;
      }
      res.status(400).json({ error: error?.message || 'Unable to create investment package.' });
      return;
    }

    res.status(201).json({ package: data });
  });

  app.patch('/api/admin/packages/:id', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const packageId = req.params.id;
    if (!UUID_REGEX.test(packageId)) {
      res.status(400).json({ error: 'Invalid package ID.' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      const name = cleanString(req.body.name, 80);
      if (name.length < 2) {
        res.status(400).json({ error: 'Package name is too short.' });
        return;
      }
      updates.name = name;
    }
    if (req.body?.price !== undefined) {
      const price = parsePositiveAmount(req.body.price);
      if (!price) {
        res.status(400).json({ error: 'Invalid package price.' });
        return;
      }
      updates.price = price;
    }
    if (req.body?.duration_days !== undefined) {
      const duration = Number(req.body.duration_days);
      if (!Number.isInteger(duration) || duration <= 0) {
        res.status(400).json({ error: 'Duration must be a positive whole number of days.' });
        return;
      }
      updates.duration_days = duration;
    }
    if (req.body?.daily_return_rate !== undefined) {
      const rate = Math.round(Number(req.body.daily_return_rate) * 100) / 100;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        res.status(400).json({ error: 'Daily return rate must be between 0% and 100%.' });
        return;
      }
      updates.daily_return_rate = rate;
    }
    if (req.body?.summary !== undefined) {
      updates.summary = cleanString(req.body.summary, 400);
    }
    if (req.body?.terms_and_conditions !== undefined) {
      updates.terms_and_conditions = cleanString(req.body.terms_and_conditions, 4000);
    }
    if (req.body?.risk_level !== undefined) {
      const riskLevel = cleanString(req.body.risk_level, 32);
      if (!VALID_RISK_LEVELS.has(riskLevel)) {
        res.status(400).json({ error: 'Invalid risk level.' });
        return;
      }
      updates.risk_level = riskLevel;
    }
    if (req.body?.is_active !== undefined) {
      updates.is_active = Boolean(req.body.is_active);
    }

    const { data, error } = await supabaseAdmin!
      .from('investment_packages')
      .update(updates)
      .eq('id', packageId)
      .select('*')
      .single();

    if (error || !data) {
      res.status(400).json({ error: error?.message || 'Unable to update investment package.' });
      return;
    }

    res.json({ package: data });
  });

  app.put('/api/admin/payment-instructions/:method', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const method = req.params.method;
    if (!VALID_METHODS.has(method)) {
      res.status(400).json({ error: 'Payment method must be bKash, Nagad, or Rocket.' });
      return;
    }

    const accountNumber = cleanString(req.body?.account_number, 64);
    const accountType = cleanString(req.body?.account_type, 24);
    const instructions = cleanString(req.body?.instructions, 1000);
    const minDeposit = parsePositiveAmount(req.body?.min_deposit);
    const maxDeposit = parsePositiveAmount(req.body?.max_deposit);
    const isActive = req.body?.is_active !== false;

    if (accountNumber.length < 4) {
      res.status(400).json({ error: 'Enter a valid payment account number.' });
      return;
    }
    if (!VALID_ACCOUNT_TYPES.has(accountType)) {
      res.status(400).json({ error: 'Account type must be Merchant, Agent, or Personal.' });
      return;
    }
    if (!minDeposit || !maxDeposit || maxDeposit < minDeposit) {
      res.status(400).json({ error: 'Maximum deposit must be greater than or equal to minimum deposit.' });
      return;
    }

    const { data, error } = await supabaseAdmin!
      .from('payment_instructions')
      .upsert(
        {
          method,
          account_number: accountNumber,
          account_type: accountType,
          instructions,
          min_deposit: minDeposit,
          max_deposit: maxDeposit,
          is_active: isActive,
          updated_by: req.profile!.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'method' }
      )
      .select('*')
      .single();

    if (error || !data) {
      if (isMissingTableError(error)) {
        res.status(503).json({
          error: 'Database tables are not created yet. Copy & run supabase/schema.sql in your Supabase Dashboard → SQL Editor, then refresh and save your bKash/Nagad/Rocket numbers.',
        });
        return;
      }
      res.status(400).json({ error: error?.message || 'Unable to save payment instructions.' });
      return;
    }

    res.json({ instruction: data });
  });

  // Frontend Vite dev middleware or production static serving
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProd || !fs.existsSync(distPath)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SMART INVEST server running on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start SMART INVEST server:', err);
  process.exit(1);
});
