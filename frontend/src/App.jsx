import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSettings, getProfiles } from './utils/api'
import { ActiveProfileProvider, useActiveProfile } from './context/ActiveProfileContext'
import Dashboard from './pages/Dashboard'
import Jobs      from './pages/Jobs'
import Prep      from './pages/Prep'
import Resumes   from './pages/Resumes'
import Settings  from './pages/Settings'
import {
  Briefcase, LayoutDashboard, BookOpen, FileText,
  Settings as SettingsIcon, AlertTriangle, Github,
  Loader2, WifiOff, Sparkles, ChevronDown, Keyboard
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs',     label: 'Jobs',      icon: Briefcase       },
  { to: '/resumes',  label: 'Resumes',   icon: FileText        },
  { to: '/prep',     label: 'Prep',      icon: BookOpen        },
  { to: '/settings', label: 'Settings',  icon: SettingsIcon    },
]

function profileDot(status) {
  if (status === 'done')   return { bg: '#22c55e' }
  if (status === 'failed') return { bg: '#ef4444' }
  return { bg: '#f59e0b', pulse: true }
}

function FancyLogo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6 55%, #ec4899)',
          boxShadow: '0 6px 18px rgba(139, 92, 246, 0.45)',
        }}>
        <Briefcase size={18} className="text-white" />
        <Sparkles size={11} className="absolute -top-1 -right-1 text-amber-300 animate-twinkle" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold text-white tracking-tight">
          executive<span className="text-rainbow">·</span>job-ops
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'rgba(253, 230, 138, 0.85)' }}>
          AI Job Hunt Co-Pilot
        </div>
      </div>
    </div>
  )
}

// ── Topbar with compact profile switcher + shortcut hint ─────────────────────
function TopBar({ profiles }) {
  const { activeProfileId, setActiveProfileId } = useActiveProfile()
  const [open, setOpen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const active = profiles.find(p => String(p.id) === String(activeProfileId))

  return (
    <div className="border-b border-slate-100 bg-white/70 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-8 py-2 flex items-center justify-between gap-3">
        <div className="relative">
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            disabled={!profiles.length}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {active ? active.name : 'No profile'}
            <ChevronDown size={12} />
          </button>
          {open && profiles.length > 0 && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 min-w-48 max-h-72 overflow-y-auto"
              onMouseLeave={() => setOpen(false)}
            >
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProfileId(p.id); setOpen(false) }}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 flex items-center gap-2',
                    String(p.id) === String(activeProfileId) && 'bg-indigo-50 text-indigo-700 font-semibold',
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowShortcuts(v => !v)}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 px-2 py-1 rounded-md"
          title="Keyboard shortcuts"
        >
          <Keyboard size={12} /> ?
        </button>
      </div>
      {showShortcuts && (
        <div className="max-w-6xl mx-auto px-8 pb-3 -mt-1">
          <div className="card p-3 text-[11px] text-slate-600 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><kbd className="kbd">g</kbd> <kbd className="kbd">d</kbd> Dashboard</div>
            <div><kbd className="kbd">g</kbd> <kbd className="kbd">j</kbd> Jobs</div>
            <div><kbd className="kbd">g</kbd> <kbd className="kbd">r</kbd> Resumes</div>
            <div><kbd className="kbd">g</kbd> <kbd className="kbd">p</kbd> Prep</div>
            <div><kbd className="kbd">g</kbd> <kbd className="kbd">s</kbd> Settings</div>
            <div><kbd className="kbd">/</kbd> Focus search (Discover)</div>
            <div><kbd className="kbd">?</kbd> Toggle this panel</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Global keyboard shortcuts (vim-style "g X" navigation) ──────────────────
function useGlobalShortcuts() {
  const navigate = useNavigate()
  useEffect(() => {
    let leader = false
    let leaderTimer = null
    function isTyping(t) {
      if (!t) return false
      const tag = (t.tagName || '').toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable
    }
    function onKey(e) {
      if (isTyping(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (leader) {
        const map = { d: '/', j: '/jobs', r: '/resumes', p: '/prep', s: '/settings' }
        const dest = map[e.key.toLowerCase()]
        if (dest) { e.preventDefault(); navigate(dest) }
        leader = false
        clearTimeout(leaderTimer)
        return
      }
      if (e.key === 'g') {
        leader = true
        clearTimeout(leaderTimer)
        leaderTimer = setTimeout(() => { leader = false }, 1200)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(leaderTimer) }
  }, [navigate])
}

function AppShell() {
  useGlobalShortcuts()
  const { data: settings, isError: settingsError, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    retry: 2,
    retryDelay: 1500,
  })
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })
  const { activeProfileId, setActiveProfileId } = useActiveProfile()
  const noKey          = settings && !settings.has_api_key && !settings.use_local_llm
  const backendOffline = !settingsLoading && settingsError

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar flex-shrink-0 flex flex-col">

        {/* Logo */}
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <FancyLogo />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
              <Icon size={16} className="sidebar-link-icon" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profile switcher */}
        {profiles.length > 0 && (
          <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] px-3 mb-2"
              style={{ color: 'rgba(253, 230, 138, 0.7)' }}>
              ✨ Profiles
            </p>
            <div className="space-y-1">
              {profiles.map(p => {
                const dot = profileDot(p.processing_status)
                const isActive = String(p.id) === String(activeProfileId)
                return (
                  <button
                    key={p.id}
                    onClick={() => setActiveProfileId(p.id, { pathname: '/jobs' })}
                    title={p.processing_status === 'failed' ? `Failed: ${p.processing_error || 'unknown'}` : p.processing_status}
                    className={clsx('profile-btn', isActive && 'active')}>
                    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dot.pulse && 'animate-pulse')}
                      style={{ background: dot.bg, boxShadow: `0 0 8px ${dot.bg}` }} />
                    <span className="profile-btn-name">{p.name}</span>
                    {p.processing_status !== 'done' && p.processing_status !== 'failed' && (
                      <Loader2 size={11} className="animate-spin flex-shrink-0 text-amber-300" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* GitHub footer — prominent + centered */}
        <a href="https://github.com/srinathsankara/executive-job-ops"
          target="_blank" rel="noreferrer"
          className="sidebar-github">
          <span className="sidebar-github-icon">
            <Github size={16} />
          </span>
          <span className="sidebar-github-name">Srinath Sankara</span>
          <span className="sidebar-github-handle">@srinathsankara</span>
        </a>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {backendOffline && (
          <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-2 text-red-800 text-sm font-medium">
            <WifiOff size={14} />
            Backend offline — make sure the Python server is running, then refresh.
          </div>
        )}
        {!backendOffline && noKey && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle size={14} />
            No AI provider configured.{' '}
            <NavLink to="/settings" className="font-semibold underline underline-offset-2 ml-1">
              Open Settings →
            </NavLink>
          </div>
        )}

        <TopBar profiles={profiles} />

        <div className="max-w-6xl mx-auto px-8 py-10">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/jobs"     element={<Jobs />} />
            <Route path="/resumes"  element={<Resumes />} />
            <Route path="/prep"     element={<Prep />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })
  return (
    <ActiveProfileProvider profiles={profiles}>
      <AppShell />
    </ActiveProfileProvider>
  )
}
