import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AppRoute, Profile } from '../types';

interface NavbarProps {
  route: AppRoute;
  onNavigate: (route: AppRoute, sectionId?: string) => void;
  profile: Profile | null;
  isAuthenticated: boolean;
  onSignOut: () => void;
}

export function Navbar({ route, onNavigate, profile, isAuthenticated, onSignOut }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLink = (targetRoute: AppRoute, sectionId?: string) => {
    setMobileOpen(false);
    onNavigate(targetRoute, sectionId);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('home')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 rounded"
        >
          SMART INVEST
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => handleLink('home')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-900 ${
              route === 'home' ? 'text-blue-700 font-semibold' : ''
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'packages')}
            className="whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-900"
          >
            Packages
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'funding')}
            className="whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-900"
          >
            Funding
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => handleLink('dashboard')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-900 ${
                route === 'dashboard' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              Dashboard
            </button>
          )}
          {profile?.role === 'admin' && (
            <button
              type="button"
              onClick={() => handleLink('admin')}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer hover:text-slate-900 ${
                route === 'admin' ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              Admin Panel
            </button>
          )}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onSignOut();
              }}
              className="hidden md:inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleLink('auth')}
              className="hidden md:inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Member Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          <button
            type="button"
            onClick={() => handleLink('home')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'packages')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Packages
          </button>
          <button
            type="button"
            onClick={() => handleLink('home', 'funding')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Funding
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => handleLink('dashboard')}
              className="block w-full text-left px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
            >
              Member Dashboard
            </button>
          )}
          {profile?.role === 'admin' && (
            <button
              type="button"
              onClick={() => handleLink('admin')}
              className="block w-full text-left px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
            >
              Admin Panel
            </button>
          )}
          <div className="pt-2 border-t border-slate-200">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onSignOut();
                }}
                className="w-full py-2.5 px-4 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleLink('auth')}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                Member Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
