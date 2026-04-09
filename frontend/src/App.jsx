import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSettings, getProfiles } from './utils/api'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Prep from './pages/Prep'
import Settings from './pages/Settings'
import { Briefcase, LayoutDashboard, BookOpen, Settings as SettingsIcon, AlertTriangle, Github } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/',        label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs',    label: 'Jobs',       icon: Briefcase },
  { to: '/prep',    label: 'Prep',       icon: BookOpen },
  { to: '/settings',label: 'Settings',  icon: SettingsIcon },
]

export default function App() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })

  const noKey = settings && !settings.has_api_key

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <Briefcase size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-none">executive</p>
              <p className="text-xs text-brand-600 font-medium">job-ops</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profile count */}
        {profiles.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-1">Active profiles</p>
            {profiles.map(p => (
              <div key={p.id} className="flex items-center gap-2 py-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-slate-600 truncate">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100">
          <a href="https://github.com/mrpaapi/executive-job-ops" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <Github size={12} />
            by mrpaapi
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {noKey && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle size={14} />
            No OpenAI API key found. Go to <strong className="mx-1">Settings</strong> to add one, or the app won't be able to analyze jobs.
          </div>
        )}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/jobs"     element={<Jobs />} />
            <Route path="/prep"     element={<Prep />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
