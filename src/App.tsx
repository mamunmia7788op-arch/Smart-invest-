import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginView } from './components/AdminLoginView';
import { AuthView } from './components/AuthView';
import { LandingSection } from './components/LandingSection';
import { MemberDashboard, type DepositDraft, type MemberTab } from './components/MemberDashboard';
import { Navbar } from './components/Navbar';
import { PackagePurchaseModal } from './components/PackagePurchaseModal';
import { apiRequest } from './lib/api';
import { CANONICAL_PACKAGE_CATALOG } from './lib/packageDefaults';
import { getSupabaseClient, initSupabaseClient, isSupabaseConfigured } from './lib/supabase';
import type {
  AdminOverviewData,
  AppRoute,
  InvestmentPackage,
  MemberBootstrapData,
  SystemHealth,
} from './types';

function routeFromPathname(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/admin-login') return 'admin-login';
  if (clean === '/admin') return 'admin';
  if (clean === '/dashboard') return 'dashboard';
  if (clean === '/login' || clean === '/auth' || clean === '/register') return 'auth';
  return 'home';
}

function pathnameFromRoute(route: AppRoute): string {
  switch (route) {
    case 'auth':
      return '/login';
    case 'admin-login':
      return '/admin-login';
    case 'dashboard':
      return '/dashboard';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromPathname(window.location.pathname));
  const [memberTab, setMemberTab] = useState<MemberTab>('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(() =>
    isSupabaseConfigured || Boolean(getSupabaseClient())
  );
  const [session, setSession] = useState<Session | null>(null);
  const [publicPackages, setPublicPackages] = useState<InvestmentPackage[]>(CANONICAL_PACKAGE_CATALOG);

  const [memberData, setMemberData] = useState<MemberBootstrapData | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [selectedPkg, setSelectedPkg] = useState<InvestmentPackage | null>(null);
  const [purchaseToast, setPurchaseToast] = useState<string | null>(null);
  const [depositDraft, setDepositDraft] = useState<DepositDraft | null>(null);

  const navigateTo = useCallback((nextRoute: AppRoute, replace = false) => {
    setRoute(nextRoute);
    const targetPath = pathnameFromRoute(nextRoute);
    if (window.location.pathname !== targetPath) {
      if (replace) {
        window.history.replaceState(null, '', targetPath);
      } else {
        window.history.pushState(null, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(routeFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Fetch system readiness, runtime public Supabase config, & live packages from server
  useEffect(() => {
    void (async () => {
      try {
        const client = await initSupabaseClient();
        if (client) {
          setSupabaseReady(true);
        }
      } catch {
        // Ignore transient config failure on boot
      }

      try {
        const healthRes = await apiRequest<SystemHealth>('/api/health');
        setHealth(healthRes);
      } catch {
        // Ignore network transient on boot
      }

      try {
        const pkgRes = await apiRequest<{ packages: InvestmentPackage[]; fromDatabase: boolean }>('/api/packages');
        if (pkgRes.fromDatabase && pkgRes.packages.length > 0) {
          setPublicPackages(pkgRes.packages);
        }
      } catch {
        // Keep canonical package catalog for public viewing
      }
    })();
  }, []);

  const loadMemberBootstrap = useCallback(async () => {
    setMemberLoading(true);
    setMemberError(null);
    try {
      const payload = await apiRequest<MemberBootstrapData>('/api/member/bootstrap', {
        requireAuth: true,
      });
      setMemberData(payload);
      if (payload.packages.length > 0) {
        setPublicPackages(payload.packages);
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Unable to load member workspace.');
    } finally {
      setMemberLoading(false);
    }
  }, []);

  const loadAdminOverview = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const payload = await apiRequest<AdminOverviewData>('/api/admin/overview', {
        requireAuth: true,
      });
      setAdminData(payload);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to load admin overview.');
    } finally {
      setAdminLoading(false);
    }
  }, []);

  // Subscribe to Supabase Auth session
  useEffect(() => {
    const client = getSupabaseClient();
    if (!supabaseReady || !client) return;

    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadMemberBootstrap();
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadMemberBootstrap();
      } else {
        setMemberData(null);
        setAdminData(null);
        setRoute((prev) => {
          if (prev === 'dashboard' || prev === 'admin') {
            window.history.replaceState(null, '', '/');
            return 'home';
          }
          return prev;
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabaseReady, loadMemberBootstrap]);

  // Redirect non-admin members away from admin routes & load admin data for authorized admins
  useEffect(() => {
    if (
      (route === 'admin' || route === 'admin-login') &&
      session &&
      memberData?.profile &&
      memberData.profile.role !== 'admin'
    ) {
      window.history.replaceState(null, '', '/dashboard');
      setRoute('dashboard');
      return;
    }
    if (route === 'admin' && session && memberData?.profile.role === 'admin') {
      void loadAdminOverview();
    }
  }, [route, session, memberData?.profile, loadAdminOverview]);

  const handleNavigate = (targetRoute: AppRoute, sectionId?: string) => {
    if (targetRoute === 'dashboard' && !session) {
      navigateTo('auth');
      return;
    }
    if (targetRoute === 'admin') {
      if (!session) {
        navigateTo('auth');
        return;
      }
      if (memberData?.profile.role !== 'admin') {
        navigateTo('dashboard');
        return;
      }
    }
    if (targetRoute === 'admin-login' && session && memberData?.profile.role !== 'admin') {
      navigateTo('dashboard');
      return;
    }
    navigateTo(targetRoute);
    if (sectionId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSignOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
    setSession(null);
    setMemberData(null);
    setAdminData(null);
    navigateTo('home');
  };

  const handleConfirmPurchase = async (pkg: InvestmentPackage) => {
    await apiRequest('/api/member/packages/purchase', {
      method: 'POST',
      requireAuth: true,
      body: {
        package_id: pkg.id,
        terms_accepted: true,
      },
    });
    setPurchaseToast(`Allocated ${pkg.name} from your verified available balance.`);
    await loadMemberBootstrap();
    navigateTo('dashboard');
    setMemberTab('overview');
  };

  const isAuthenticated = Boolean(session);
  const currentProfile = memberData?.profile ?? null;
  const displayedPackages = memberData?.packages.length ? memberData.packages : publicPackages;

  const effectiveRoute: AppRoute =
    route === 'dashboard' && !isAuthenticated
      ? 'auth'
      : route === 'admin' && !isAuthenticated
      ? 'auth'
      : (route === 'admin' || route === 'admin-login') &&
        isAuthenticated &&
        currentProfile &&
        currentProfile.role !== 'admin'
      ? 'dashboard'
      : route;

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <Navbar
        route={effectiveRoute}
        onNavigate={handleNavigate}
        profile={currentProfile}
        isAuthenticated={isAuthenticated}
        onSignOut={() => void handleSignOut()}
      />

      {purchaseToast && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 text-xs text-emerald-900 text-center font-medium">
          {purchaseToast}
          <button
            type="button"
            onClick={() => setPurchaseToast(null)}
            className="ml-3 underline hover:text-emerald-700 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1">
        {effectiveRoute === 'home' && (
          <LandingSection
            packages={displayedPackages}
            isAuthenticated={isAuthenticated}
            profile={currentProfile}
            onSelectPackage={(pkg) => setSelectedPkg(pkg)}
            onNavigateAuth={() => handleNavigate('auth')}
            onNavigateDashboard={() => handleNavigate('dashboard')}
            onNavigateAdminLogin={() => handleNavigate('admin')}
          />
        )}

        {effectiveRoute === 'auth' && (
          <AuthView
            health={health}
            supabaseReady={supabaseReady}
            onSuccess={() => {
              navigateTo('dashboard');
              void loadMemberBootstrap();
            }}
            onCancel={() => navigateTo('home')}
          />
        )}

        {effectiveRoute === 'admin-login' && (
          <AdminLoginView
            health={health}
            supabaseReady={supabaseReady}
            onSuccess={() => {
              void loadMemberBootstrap().then(() => {
                navigateTo('admin');
                void loadAdminOverview();
              });
            }}
            onGoToMemberLogin={() => navigateTo('auth')}
            onCancel={() => navigateTo('home')}
          />
        )}

        {effectiveRoute === 'dashboard' && (
          <MemberDashboard
            data={memberData}
            fallbackPackages={publicPackages}
            schemaPending={health?.schemaPending}
            depositDraft={depositDraft}
            loading={memberLoading}
            error={memberError}
            activeTab={memberTab}
            onTabChange={setMemberTab}
            onRefresh={loadMemberBootstrap}
            onSelectPackage={(pkg) => setSelectedPkg(pkg)}
          />
        )}

        {effectiveRoute === 'admin' && (
          <AdminDashboard
            currentAdmin={currentProfile}
            data={adminData}
            loading={adminLoading}
            error={adminError}
            onRefresh={loadAdminOverview}
          />
        )}
      </div>

      <PackagePurchaseModal
        pkg={selectedPkg}
        profile={currentProfile}
        isAuthenticated={isAuthenticated}
        paymentInstructions={memberData?.paymentInstructions ?? []}
        schemaPending={health?.schemaPending}
        onClose={() => setSelectedPkg(null)}
        onConfirmPurchase={handleConfirmPurchase}
        onDepositSubmitted={loadMemberBootstrap}
        onGoToAuth={() => handleNavigate('auth')}
        onGoToDeposit={(draft) => {
          if (draft) {
            setDepositDraft({
              method: draft.method,
              amount: draft.amount,
              key: Date.now(),
            });
          }
          navigateTo('dashboard');
          setMemberTab('deposits');
        }}
      />
    </div>
  );
}
