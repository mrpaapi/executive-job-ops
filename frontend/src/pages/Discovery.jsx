import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfiles } from '../utils/api'
import api from '../utils/api'
import LoadingMeme from '../components/LoadingMeme'
import PageHeader from '../components/PageHeader'
import {
  Search, Loader2, ExternalLink, Plus, CheckCircle,
  RefreshCw, Filter, AlertCircle, XCircle, Play, Radar, Building2
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const SOURCES = [
  { id: 'remotive',       label: 'Remotive',         desc: 'Remote tech jobs · free API',        color: 'teal' },
  { id: 'weworkremotely', label: 'WeWorkRemotely',    desc: 'Remote jobs · RSS feed',             color: 'blue' },
  { id: 'google',         label: 'Google Jobs',       desc: 'Broad search · may vary by day',     color: 'red'  },
  { id: 'adzuna',         label: 'Indeed (Adzuna)',   desc: 'Global · needs free API key',        color: 'amber'},
]

// Portal scanners hit curated ATS company lists directly — no aggregator
// middle-man. Defaults include Anthropic, OpenAI, ElevenLabs, Retool, n8n, …
const PORTAL_SOURCES = [
  { id: 'greenhouse', label: 'Greenhouse',  desc: '35+ Greenhouse boards (Anthropic, Stripe, Figma…)', color: 'green' },
  { id: 'lever',      label: 'Lever',        desc: 'Lever boards (Netflix, Palantir, Attentive…)',       color: 'violet'},
  { id: 'ashby',      label: 'Ashby',        desc: 'Ashby boards (OpenAI, Retool, n8n, Linear…)',        color: 'pink'  },
  { id: 'wellfound',  label: 'Wellfound',    desc: 'Startup portals (AngelList) · best-effort',           color: 'rose'  },
]

const SOURCE_COLORS = {
  teal:   { badge: 'bg-teal-50 text-teal-700',     btn: 'border-teal-200 hover:bg-teal-50 text-teal-700'    },
  blue:   { badge: 'bg-blue-50 text-blue-700',     btn: 'border-blue-200 hover:bg-blue-50 text-blue-700'    },
  red:    { badge: 'bg-red-50 text-red-600',       btn: 'border-red-200 hover:bg-red-50 text-red-600'      },
  amber:  { badge: 'bg-amber-50 text-amber-700',   btn: 'border-amber-200 hover:bg-amber-50 text-amber-700'},
  green:  { badge: 'bg-emerald-50 text-emerald-700', btn: 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'},
  violet: { badge: 'bg-violet-50 text-violet-700', btn: 'border-violet-200 hover:bg-violet-50 text-violet-700'},
  pink:   { badge: 'bg-pink-50 text-pink-700',     btn: 'border-pink-200 hover:bg-pink-50 text-pink-700'    },
  rose:   { badge: 'bg-rose-50 text-rose-700',     btn: 'border-rose-200 hover:bg-rose-50 text-rose-700'    },
}

function StatusBar({ statuses }) {
  if (!statuses?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map(s => (
        <div key={s.source} className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border',
          s.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          {s.ok
            ? <CheckCircle size={11} />
            : <XCircle size={11} />
          }
          <span className="font-medium">{s.source}</span>
          {s.ok
            ? <span className="text-green-600">{s.count} jobs</span>
            : <span className="text-red-500" title={s.error}>failed</span>
          }
          {!s.ok && s.error && (
            <span className="text-red-400 hidden sm:inline truncate max-w-32" title={s.error}>
              — {s.error}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ScoreBar({ score }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-500 w-8 text-right">{score}%</span>
    </div>
  )
}

function JobCard({ job, profileId, onAdded }) {
  const [added, setAdded] = useState(false)
  const src  = SOURCES.find(s => s.label === job.source || job.source?.includes(s.label.split(' ')[0]))
  const clr  = SOURCE_COLORS[src?.color || 'blue']

  const addMut = useMutation({
    mutationFn: () => api.post('/discovery/add', {
      profile_id:  profileId,
      title:       job.title,
      company:     job.company,
      location:    job.location,
      url:         job.url,
      description: job.description,
      match_score: job.match_score,
      source:      job.source,
    }).then(r => r.data),
    onSuccess: () => { setAdded(true); toast.success(`"${job.title}" added to tracker`); onAdded?.() },
    onError: (e) => {
      const msg = e?.response?.data?.detail || 'Failed to add'
      if (msg.includes('already')) { toast('Already in your tracker', { icon: 'ℹ️' }); setAdded(true) }
      else toast.error(msg)
    }
  })

  return (
    <div className="card p-4 space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={clsx('badge text-xs', clr.badge)}>{job.source}</span>
            {job.posted_at && <span className="text-xs text-slate-400">{job.posted_at}</span>}
          </div>
          <p className="text-sm font-semibold text-slate-900">{job.title}</p>
          <p className="text-xs text-slate-500">
            {job.company}{job.location ? ` · ${job.location}` : ''}
          </p>
        </div>
      </div>
      <ScoreBar score={job.match_score} />
      {job.description && (
        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {job.description.slice(0, 180)}…
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-secondary py-1 text-xs">
            <ExternalLink size={11} /> View job
          </a>
        )}
        <button
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || added}
          className={clsx('btn py-1 text-xs', added ? 'btn-secondary opacity-60' : 'btn-primary')}
        >
          {addMut.isPending ? <Loader2 size={11} className="animate-spin" />
           : added ? <><CheckCircle size={11} /> Added</>
           : <><Plus size={11} /> Track this job</>}
        </button>
      </div>
    </div>
  )
}

function SourceButton({ source, profileId, onResults, disabled, extraParams }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState(null)
  const clr = SOURCE_COLORS[source.color]

  async function run() {
    if (!profileId) { toast.error('Select a profile first'); return }
    setLoading(true)
    setStatus(null)
    try {
      const { data } = await api.get('/discovery/source', {
        params: { profile_id: profileId, source: source.id, ...(extraParams || {}) }
      })
      setStatus(data.status)
      onResults(data.jobs, data.status)
      if (data.status.ok) toast.success(`${source.label}: ${data.status.count} jobs found`)
      else toast.error(`${source.label}: ${data.status.error}`)
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Request failed'
      setStatus({ source: source.label, ok: false, count: 0, error: msg })
      toast.error(`${source.label} failed: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading || disabled}
      className={clsx(
        'flex flex-col items-start w-full px-4 py-3 rounded-xl border-2 text-left transition-all',
        status?.ok     ? 'border-green-300 bg-green-50' :
        status && !status.ok ? 'border-red-200 bg-red-50' :
        'border-slate-200 bg-white hover:border-slate-300',
        (loading || disabled) && 'opacity-60 cursor-not-allowed'
      )}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {loading
            ? <Loader2 size={13} className="animate-spin text-slate-500" />
            : status?.ok
              ? <CheckCircle size={13} className="text-green-500" />
              : status && !status.ok
                ? <XCircle size={13} className="text-red-400" />
                : <Play size={13} className="text-slate-400" />
          }
          <span className="text-sm font-medium text-slate-800">{source.label}</span>
        </div>
        {status?.ok && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            {status.count} found
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1 ml-5">{source.desc}</p>
      {status && !status.ok && (
        <p className="text-xs text-red-400 mt-1 ml-5 truncate" title={status.error}>
          {status.error}
        </p>
      )}
    </button>
  )
}

export default function Discovery() {
  const qc = useQueryClient()
  const [profileId, setProfileId]   = useState('')
  const [allJobs, setAllJobs]       = useState([])
  const [allStatuses, setAllStatuses] = useState([])
  const [minScore, setMinScore]     = useState(0)
  const [searchingAll, setSearchingAll] = useState(false)
  const [customSlugs, setCustomSlugs] = useState('')   // "Name|slug,slug,…" for portals

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })

  // Load the curated portal company lists so we can show them to the user.
  const { data: portalCatalog = {} } = useQuery({
    queryKey: ['portalCompanies'],
    queryFn: () => api.get('/discovery/portals').then(r => r.data),
    staleTime: Infinity,
  })

  const portalExtraParams = customSlugs.trim()
    ? { companies: customSlugs.trim() }
    : undefined

  function mergeResults(newJobs, newStatus) {
    setAllStatuses(prev => {
      const without = prev.filter(s => s.source !== newStatus.source)
      return [...without, newStatus]
    })
    setAllJobs(prev => {
      const existingIds = new Set(prev.map(j => j.id))
      const fresh = newJobs.filter(j => !existingIds.has(j.id))
      const merged = [...prev, ...fresh]
      merged.sort((a,b) => b.match_score - a.match_score)
      return merged
    })
  }

  async function searchAll() {
    if (!profileId) { toast.error('Select a profile first'); return }
    setSearchingAll(true)
    setAllJobs([])
    setAllStatuses([])
    try {
      const sources = SOURCES.map(s => s.id).join(',')
      const { data } = await api.get('/discovery/', {
        params: { profile_id: profileId, sources }
      })
      setAllJobs(data.jobs || [])
      setAllStatuses(data.statuses || [])
      const ok  = (data.statuses || []).filter(s => s.ok).length
      const fail= (data.statuses || []).filter(s => !s.ok).length
      toast.success(`Search complete — ${ok} sources worked${fail ? `, ${fail} failed` : ''}`)
    } catch (e) {
      toast.error('Search failed — check your internet connection')
    } finally {
      setSearchingAll(false)
    }
  }

  const filtered = allJobs.filter(j => j.match_score >= minScore)

  if (profiles.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">No profiles yet. Go to <strong>Dashboard</strong> and drop a resume first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job Boards"
        title="Discovery Engine"
        subtitle="Sweep multiple job boards in parallel and let the AI rank every result against your profile."
        icon={<Search size={22} />}
      />

      {/* Profile selector */}
      <div className="card p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Which profile are you searching for?
          </label>
          <select className="input" value={profileId}
            onChange={e => { setProfileId(e.target.value); setAllJobs([]); setAllStatuses([]) }}>
            <option value="">Select a profile…</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.role_family}</option>
            ))}
          </select>
        </div>

        {/* Search all button */}
        <button
          onClick={searchAll}
          disabled={searchingAll || !profileId}
          className="btn btn-primary w-full justify-center"
        >
          {searchingAll
            ? <><Loader2 size={15} className="animate-spin" /> Searching all sources simultaneously…</>
            : <><Search size={15} /> Search all sources at once</>
          }
        </button>

        <div className="relative flex items-center gap-3 text-xs text-slate-400">
          <div className="flex-1 border-t border-slate-100" />
          <span>or search one source at a time</span>
          <div className="flex-1 border-t border-slate-100" />
        </div>

        {/* Per-source buttons */}
        <div className="grid grid-cols-2 gap-3">
          {SOURCES.map(src => (
            <SourceButton
              key={src.id}
              source={src}
              profileId={profileId}
              onResults={mergeResults}
              disabled={searchingAll}
            />
          ))}
        </div>
      </div>

      {/* Portal Scanner — curated ATS company lists */}
      <div className="card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Radar size={18} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Portal Scanner</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Hit curated company career portals directly across Greenhouse, Lever, Ashby & Wellfound —
              Anthropic, OpenAI, ElevenLabs, Retool, n8n, Stripe, Figma, and 40+ more. No aggregators, no stale feeds.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {PORTAL_SOURCES.map(src => {
            const count = (portalCatalog[src.id] || []).length
            return (
              <SourceButton
                key={src.id}
                source={{ ...src, desc: count ? `${count} companies · ${src.desc}` : src.desc }}
                profileId={profileId}
                onResults={mergeResults}
                disabled={searchingAll}
                extraParams={portalExtraParams}
              />
            )
          })}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            <Building2 size={11} className="inline mr-1 -mt-0.5" />
            Custom companies (optional) — overrides the curated list for any portal you click
          </label>
          <input
            className="input text-xs"
            placeholder="e.g. Anthropic|anthropic, openai, retool, n8n"
            value={customSlugs}
            onChange={e => setCustomSlugs(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Format: <code className="text-slate-500">Name|slug</code> or just <code className="text-slate-500">slug</code>, comma-separated.
            The slug is the URL handle on the platform (e.g. <code className="text-slate-500">boards.greenhouse.io/<b>anthropic</b></code>).
          </p>
        </div>

        {/* Curated-company preview chips */}
        {Object.keys(portalCatalog).length > 0 && !customSlugs && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              See which companies ship by default
            </summary>
            <div className="mt-3 space-y-2">
              {PORTAL_SOURCES.map(src => {
                const list = portalCatalog[src.id] || []
                if (!list.length) return null
                const clr = SOURCE_COLORS[src.color]
                return (
                  <div key={src.id} className="flex flex-wrap items-center gap-1">
                    <span className={clsx('badge text-xs mr-1', clr.badge)}>{src.label}</span>
                    {list.map(c => (
                      <span key={c.slug} className="badge bg-slate-100 text-slate-600 text-xs">{c.name}</span>
                    ))}
                  </div>
                )
              })}
            </div>
          </details>
        )}
      </div>

      {/* Source status bar */}
      {allStatuses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Source results:</p>
          <StatusBar statuses={allStatuses} />
        </div>
      )}

      {/* Results */}
      {allJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {filtered.length} jobs
                {minScore > 0 && ` (${allJobs.length} total, filtered)`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Filter size={13} className="text-slate-400" />
              <span className="text-xs text-slate-500">Min match:</span>
              <input type="range" min="0" max="80" step="10"
                value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                className="w-24" />
              <span className="text-xs font-medium text-slate-600 w-8">{minScore}%</span>
              <button onClick={searchAll} disabled={searchingAll || !profileId}
                className="btn btn-secondary py-1 text-xs">
                <RefreshCw size={11} /> Refresh all
              </button>
            </div>
          </div>

          {filtered.length === 0
            ? <div className="text-center py-12 text-slate-400 text-sm">
                No jobs above {minScore}% match. Lower the filter or try a different profile.
              </div>
            : <div className="grid gap-4 md:grid-cols-2">
                {filtered.map(job => (
                  <JobCard key={job.id} job={job}
                    profileId={parseInt(profileId)}
                    onAdded={() => qc.invalidateQueries({ queryKey: ['jobs'] })} />
                ))}
              </div>
          }
        </div>
      )}

      {/* LinkedIn note */}
      <div className="card p-5 border-dashed">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">LinkedIn jobs</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              LinkedIn blocks automated scraping. To add a LinkedIn job, go to{' '}
              <strong>Jobs → Add job</strong> and paste the URL.
              The AI will score it against your profile instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
