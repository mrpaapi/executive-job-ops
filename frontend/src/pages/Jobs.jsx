import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addJob, deleteJob, getJobs, getProfiles, updateJobStatus, getResumes, tailorResumePdf, tailorResumeUpload, createResume, analyzeSkillGaps, analyzeSkillGapsUpload, getNegotiationBrief, getCompanyResearch, getOutreachMessages, batchAddJobs, generateStoriesFromJob } from '../utils/api'
import LoadingMeme from '../components/LoadingMeme'
import PageHeader from '../components/PageHeader'
import useLocalStorageState from '../hooks/useLocalStorageState'
import { useActiveProfile } from '../context/ActiveProfileContext'
import api from '../utils/api'
import {
  AlertCircle, CheckCircle, ExternalLink, Filter,
  Loader2, Play, Plus, RefreshCw, Search, X, XCircle,
  FileText, Download, Briefcase, Radar, Building2,
  DollarSign, BookOpen, MessageSquare, Sparkles, Layers,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Sources ────────────────────────────────────────────────────────────────────
const SOURCES = [
  { id: 'remotive',       label: 'Remotive',         desc: 'Remote tech jobs — free API',            color: 'teal'   },
  { id: 'weworkremotely', label: 'WeWorkRemotely',    desc: 'Remote jobs — RSS',                      color: 'blue'   },
  { id: 'arbeitnow',      label: 'Arbeitnow',         desc: 'Remote & international — free',          color: 'green'  },
  { id: 'indeed',         label: 'Indeed',            desc: 'RSS feed — no key needed',               color: 'indigo' },
  { id: 'adzuna',         label: 'Indeed (Adzuna)',   desc: 'API — add ADZUNA keys to .env',          color: 'amber'  },
  { id: 'workingnomads',  label: 'Working Nomads',    desc: 'Remote jobs — free API',                 color: 'cyan'   },
  { id: 'startupjobs',    label: 'startup.jobs',      desc: 'Startup remote jobs',                    color: 'violet' },
  { id: 'remoteok',       label: 'RemoteOK',          desc: 'Remote tech & startup jobs',             color: 'pink'   },
  { id: 'glassdoor',      label: 'Glassdoor',         desc: 'Best-effort scrape (may be blocked)',    color: 'orange' },
  { id: 'gradcracker',    label: 'Gradcracker',       desc: 'UK graduate & early-career jobs',        color: 'lime'   },
  { id: 'linkedin',       label: 'LinkedIn',          desc: 'Best-effort (paste URLs into Tracker)', color: 'sky'    },
]

// Portal scanners hit curated ATS company lists directly (no aggregators).
// Defaults ship with 45+ companies: Anthropic, OpenAI, ElevenLabs, Retool, n8n, Stripe, Figma, …
const PORTAL_SOURCES = [
  { id: 'greenhouse', label: 'Greenhouse', desc: 'Anthropic, Stripe, Figma, Databricks…',  color: 'green'  },
  { id: 'lever',      label: 'Lever',       desc: 'Netflix, Palantir, Attentive, Kong…',    color: 'violet' },
  { id: 'ashby',      label: 'Ashby',       desc: 'OpenAI, Retool, n8n, Linear, Supabase…', color: 'pink'   },
  { id: 'wellfound',  label: 'Wellfound',   desc: 'Best-effort AngelList scrape',            color: 'orange' },
]

const SOURCE_BADGE = {
  teal:   'bg-teal-50 text-teal-700',
  blue:   'bg-blue-50 text-blue-700',
  green:  'bg-green-50 text-green-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  amber:  'bg-amber-50 text-amber-700',
  cyan:   'bg-cyan-50 text-cyan-700',
  violet: 'bg-violet-50 text-violet-700',
  pink:   'bg-pink-50 text-pink-700',
  orange: 'bg-orange-50 text-orange-700',
  lime:   'bg-lime-50 text-lime-700',
  sky:    'bg-sky-50 text-sky-700',
}

const COLUMNS = [
  { key: 'saved',      label: 'Saved',     color: 'bg-slate-100 text-slate-700'  },
  { key: 'applied',    label: 'Applied',   color: 'bg-blue-100 text-blue-700'    },
  { key: 'interview',  label: 'Interview', color: 'bg-amber-100 text-amber-700'  },
  { key: 'offer',      label: 'Offer',     color: 'bg-green-100 text-green-700'  },
  { key: 'rejected',   label: 'Rejected',  color: 'bg-red-100 text-red-600'      },
]

// ── Step progress during job analysis ─────────────────────────────────────────
function AnalysisProgress({ hasUrl }) {
  const steps = hasUrl
    ? ['Fetching job description…', 'Analysing match with AI…', 'Scoring skills & salary…', 'Almost done…']
    : ['Parsing job description…', 'Analysing match with AI…', 'Scoring skills & salary…', 'Almost done…']
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const thresholds = [0, 4, 12, 25]
    setIdx(Math.min(thresholds.filter(t => elapsed >= t).length - 1, steps.length - 1))
  }, [elapsed])
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-indigo-200 bg-indigo-50 text-sm text-indigo-800">
      <Loader2 size={15} className="animate-spin text-indigo-500 flex-shrink-0" />
      <div>
        <p className="font-semibold">{steps[idx]}</p>
        <p className="text-xs text-indigo-500 mt-0.5">{elapsed}s elapsed · can take 30–60s with local LLMs</p>
      </div>
    </div>
  )
}

// ── Quick Resume Creation Modal ────────────────────────────────────────────
function QuickResumeModal({ profileId, onClose, onCreated }) {
  const [title, setTitle] = useState('My Resume')
  const [summary, setSummary] = useState('')
  const [skills, setSkills] = useState('')
  const [creating, setCreating] = useState(false)
  const qc = useQueryClient()

  const handleCreate = async () => {
    if (!summary.trim()) { toast.error('Summary required'); return }
    setCreating(true)
    try {
      const resume = await createResume(profileId, {
        title,
        summary,
        skills: skills.split(',').map(s => s.trim()).filter(s => s),
        experience: [],
        education: [],
        certifications: [],
        email: '',
        phone: '',
        location: '',
        website: ''
      })
      qc.invalidateQueries({ queryKey: ['resumes', profileId] })
      toast.success('Resume created! You can edit it later in the Resumes tab.')
      onCreated(resume.id)
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create resume')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#1d1d1f]">Quick Resume</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Create a quick resume to tailor for this job. You can edit it fully later in the <strong>Resumes</strong> tab.
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resume Title</label>
          <input className="input" placeholder="e.g., Senior Director Resume" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Professional Summary *</label>
          <textarea className="input min-h-16 resize-y text-xs" placeholder="2-3 sentences about your background, experience, and career goals..." value={summary} onChange={e => setSummary(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Key Skills (optional)</label>
          <textarea className="input min-h-12 resize-y text-xs" placeholder="Comma-separated, e.g.: Python, React, Cloud Architecture" value={skills} onChange={e => setSkills(e.target.value)} />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1 text-sm">Cancel</button>
          <button onClick={handleCreate} disabled={creating || !summary.trim()} className="btn btn-primary flex-1 justify-center text-sm">
            {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Score modal ───────────────────────────────────────────────────────────────
function ScoreBreakdownModal({ job, profileId, onClose }) {
  const [gapMode, setGapMode] = useState('saved') // 'saved' | 'upload'
  const [selectedResume, setSelectedResume] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [analyzedGaps, setAnalyzedGaps] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const { data: resumes = [] } = useQuery({
    queryKey: ['resumes', profileId],
    queryFn: () => getResumes(profileId),
    enabled: Boolean(profileId),
  })

  // Default to the profile's standard (first / default) resume so the
  // user doesn't have to pick one for the common case.
  useEffect(() => {
    if (selectedResume || !resumes.length) return
    const def = resumes.find(r => r.is_default) || resumes[0]
    if (def) setSelectedResume(def)
  }, [resumes, selectedResume])

  const handleAnalyzeGaps = async () => {
    setIsAnalyzing(true)
    try {
      let result
      if (gapMode === 'upload') {
        if (!uploadFile) { toast.error('Pick a resume PDF'); setIsAnalyzing(false); return }
        result = await analyzeSkillGapsUpload(job.id, uploadFile)
      } else {
        if (!selectedResume) { toast.error('Please select a resume'); setIsAnalyzing(false); return }
        result = await analyzeSkillGaps(job.id, selectedResume.id)
      }
      setAnalyzedGaps(result)
      toast.success('Skill gaps analyzed')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to analyze gaps')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!job) return null
  const score = Math.round(job.match_score || 0)

  // Use analyzed gaps if available, otherwise use profile-based gaps
  const getGaps = () => {
    if (analyzedGaps?.skill_gaps) return analyzedGaps.skill_gaps
    const gaps = job.skill_gaps || []
    return gaps.length > 0 ? gaps : ["Run analysis with a resume for detailed gaps"]
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card max-w-lg w-full p-6 space-y-5 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1d1d1f]">Match Score Breakdown</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-600 font-semibold">Overall Match Score</p>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold" style={{ color: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#dc2626' }}>
              {score}%
            </div>
            <div className="flex-1">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full transition-all', score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-600')}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {score >= 80 ? 'Excellent fit for this role.' : score >= 50 ? 'Good match, but gaps to address.' : 'Significant skill gaps to review.'}
          </p>
        </div>

        {/* Resume Selection & Analysis */}
        <div className="space-y-3 p-4 rounded-2xl border border-indigo-200"
             style={{ background: 'linear-gradient(120deg, #eef2ff, #fdf2f8)' }}>
          <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
            <span>📊</span> Detailed Skill Gap Analysis
          </p>

          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 bg-white/70 rounded-lg border border-indigo-100">
            <button
              type="button"
              onClick={() => setGapMode('saved')}
              className={clsx(
                'flex-1 text-[11px] py-1.5 rounded-md font-bold transition-colors',
                gapMode === 'saved' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              )}
            >
              Profile resume
            </button>
            <button
              type="button"
              onClick={() => setGapMode('upload')}
              className={clsx(
                'flex-1 text-[11px] py-1.5 rounded-md font-bold transition-colors',
                gapMode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              )}
            >
              Upload from computer
            </button>
          </div>

          {gapMode === 'saved' ? (
            <select
              className="input text-xs"
              value={selectedResume?.id || ''}
              onChange={e => {
                const resume = resumes.find(r => r.id === parseInt(e.target.value))
                setSelectedResume(resume)
              }}
            >
              <option value="">— pick a saved resume —</option>
              {resumes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.title}{r.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
              />
              {uploadFile && (
                <p className="text-[11px] text-slate-600 truncate">
                  Selected: <span className="font-bold">{uploadFile.name}</span>
                </p>
              )}
              <p className="text-[10px] text-slate-500">
                Accepts PDF or Word (.docx) — read locally for keyword analysis only, nothing is archived.
              </p>
            </>
          )}

          <button
            onClick={handleAnalyzeGaps}
            disabled={isAnalyzing || (gapMode === 'saved' ? !selectedResume : !uploadFile)}
            className="btn-fancy w-full justify-center text-xs"
          >
            {isAnalyzing ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : 'Analyze Gaps'}
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600 font-semibold">Key Skill Gaps</p>
            {analyzedGaps && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
                vs {analyzedGaps.resume_title}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {getGaps().map((gap, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg text-xs text-slate-700">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{gap}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-600 font-semibold">Scoring Details</p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between p-2 bg-slate-50 rounded">
              <span>Title relevance</span>
              <span className="font-semibold">{score > 70 ? 'Strong' : score > 40 ? 'Moderate' : 'Weak'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-50 rounded">
              <span>Skill alignment</span>
              <span className="font-semibold">{score > 60 ? 'Good' : score > 35 ? 'Partial' : 'Limited'}</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-50 rounded">
              <span>Overall fit</span>
              <span className={clsx('font-semibold', score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600')}>
                {score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low'}
              </span>
            </div>
          </div>
        </div>

        <button onClick={onClose} className="btn btn-primary w-full justify-center">Close</button>
      </div>
    </div>
  )
}

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({ score, onClick, clickable = false }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-600'
  const textColor = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className={clsx('flex items-center gap-2', clickable && 'cursor-pointer hover:opacity-80')} onClick={onClick}>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className={clsx('text-xs font-bold w-8 text-right', textColor)}>{Math.round(score)}%</span>
    </div>
  )
}

// ── Kanban skeleton ────────────────────────────────────────────────────────────
function JobsSkeleton() {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map(col => (
          <div key={col.key} className="kanban-col w-64 space-y-3">
            <div className="h-6 w-20 rounded-full skeleton" />
            {[0, 1].map(i => (
              <div key={i} className="card p-4 space-y-3">
                <div className="h-4 rounded-lg skeleton" />
                <div className="h-3 w-3/4 rounded-lg skeleton" />
                <div className="h-2 rounded-lg skeleton" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Job card ───────────────────────────────────────────────────────────────────
// ── Grade chip ─────────────────────────────────────────────────────────────────
// Apple-clean letter pill so the user can scan a column and see "A, A-, B+,
// C…" without parsing percentages. Colour is keyed to the grade band, not the
// raw percentage, so a B+ in one column always looks the same as a B+ in the
// next column.
function gradeFromScore(score) {
  if (score >= 90) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 80) return 'A-'
  if (score >= 75) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 65) return 'B-'
  if (score >= 60) return 'C+'
  if (score >= 55) return 'C'
  if (score >= 50) return 'C-'
  if (score >= 40) return 'D'
  return 'F'
}

function GradeChip({ grade, score, onClick }) {
  const g = (grade || gradeFromScore(score || 0) || '').toUpperCase()
  const band =
    g.startsWith('A') ? { bg: 'bg-emerald-500/10', text: 'text-emerald-700', ring: 'ring-emerald-400/40' }
  : g.startsWith('B') ? { bg: 'bg-sky-500/10',     text: 'text-sky-700',     ring: 'ring-sky-400/40'     }
  : g.startsWith('C') ? { bg: 'bg-amber-500/10',   text: 'text-amber-700',   ring: 'ring-amber-400/40'   }
  : g.startsWith('D') ? { bg: 'bg-orange-500/10',  text: 'text-orange-700',  ring: 'ring-orange-400/40'  }
  :                     { bg: 'bg-red-500/10',     text: 'text-red-700',     ring: 'ring-red-400/40'     }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${score}% match — click for breakdown`}
      className={clsx(
        'flex flex-col items-center justify-center w-11 h-11 rounded-2xl ring-1 transition-transform hover:-translate-y-0.5',
        band.bg, band.text, band.ring,
      )}
    >
      <span className="text-base font-black leading-none">{g || '–'}</span>
      <span className="text-[9px] font-semibold opacity-70 mt-0.5">{Math.round(score || 0)}%</span>
    </button>
  )
}

// ── Action drawer ──────────────────────────────────────────────────────────────
// Shared bottom sheet for negotiate / research / outreach / story-bank actions.
// Renders the JSON the backend returns; copy buttons keep the keyboard out of
// the user's way.
function ActionDrawer({ title, icon, content, loading, error, onClose }) {
  function copyAll() {
    try {
      navigator.clipboard.writeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2))
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end md:items-center justify-center p-3" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="card max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#1d1d1f]">
            {icon}
            <h3 className="text-base font-bold">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {!loading && !error && content && (
              <button onClick={copyAll} className="text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Copy</button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16} /></button>
          </div>
        </div>
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Generating…</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && content && (
          <pre className="text-xs whitespace-pre-wrap text-slate-700 leading-relaxed font-sans">
            {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function JobCard({ job, onStatusChange, onDelete }) {
  const qc = useQueryClient()
  const [tailoring, setTailoring] = useState(false)
  const [rxResumes, setRxResumes] = useState([])
  const [showTailor, setShowTailor] = useState(false)
  const [selectedResume, setSelectedResume] = useState('')
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [showQuickResume, setShowQuickResume] = useState(false)
  const [tailorMode, setTailorMode] = useState('saved') // 'saved' | 'upload'
  const [uploadFile, setUploadFile] = useState(null)
  // ── Per-action drawer state (negotiate / research / outreach / story-bank)
  const [drawer, setDrawer] = useState(null)         // { kind, title, icon }
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerContent, setDrawerContent] = useState(null)
  const [drawerError, setDrawerError] = useState('')

  const runAction = useCallback(async (kind) => {
    const meta = {
      negotiate: { title: 'Salary negotiation brief', icon: <DollarSign size={16} /> },
      research:  { title: `Company research · ${job.company}`, icon: <BookOpen size={16} /> },
      outreach:  { title: 'LinkedIn outreach drafts', icon: <MessageSquare size={16} /> },
      stories:   { title: 'Add to STAR story bank', icon: <Sparkles size={16} /> },
    }[kind]
    setDrawer(meta)
    setDrawerLoading(true)
    setDrawerError('')
    setDrawerContent(null)
    try {
      let data
      if (kind === 'negotiate') data = await getNegotiationBrief(job.id)
      if (kind === 'research')  data = await getCompanyResearch(job.id)
      if (kind === 'outreach')  data = await getOutreachMessages(job.id)
      if (kind === 'stories')   {
        data = await generateStoriesFromJob(job.id, 2)
        if (data?.created > 0) {
          toast.success(`Added ${data.created} stories to your bank`)
          qc.invalidateQueries({ queryKey: ['stories'] })
        }
      }
      if (data?.error) setDrawerError(data.error)
      else setDrawerContent(data)
    } catch (e) {
      setDrawerError(e?.response?.data?.detail || 'Action failed — check the backend logs')
    } finally {
      setDrawerLoading(false)
    }
  }, [job.id, job.description, job.company, job.title, qc])  // Only recreate if these deps change

  const statusMut = useMutation({
    mutationFn: ({ status }) => onStatusChange(job.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })

  const salary = job.salary_min > 0
    ? `$${(job.salary_min / 1000).toFixed(0)}k – $${(job.salary_max / 1000).toFixed(0)}k`
    : null

  const { activeProfileId } = useActiveProfile()

  async function openTailor() {
    try {
      const data = await getResumes(activeProfileId)
      const list = Array.isArray(data) ? data : (data?.resumes || [])
      setRxResumes(list)
      if (list.length === 0) {
        setShowQuickResume(true)
        return
      }
    } catch {
      toast.error('Could not load resumes')
      return
    }
    setShowTailor(true)
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function timestampFilename(originalName) {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const dot = originalName.lastIndexOf('.')
    const stem = dot > 0 ? originalName.slice(0, dot) : originalName
    // Backend always returns a tailored PDF, so force .pdf even for .docx uploads
    return `${stem}_${stamp}.pdf`
  }

  async function generateResume() {
    setTailoring(true)
    try {
      if (tailorMode === 'upload') {
        if (!uploadFile) { toast.error('Pick a resume file'); return }
        const { blob, filename } = await tailorResumeUpload(job.id, uploadFile)
        // Use server-provided name when available, else original + datetime
        const name = filename || timestampFilename(uploadFile.name)
        downloadBlob(blob, name)
        toast.success(`Saved ${name}`)
      } else {
        if (!selectedResume) { toast.error('Select a resume'); return }
        const { blob, filename } = await tailorResumePdf(selectedResume, job.id)
        const picked = rxResumes.find(r => String(r.id) === String(selectedResume))
        const base = (picked?.title || 'resume') + '.pdf'
        const name = filename || timestampFilename(base)
        downloadBlob(blob, name)
        toast.success(`Saved ${name}`)
      }
      setShowTailor(false)
      setUploadFile(null)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Tailoring failed')
    } finally {
      setTailoring(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {(job.grade || job.match_score > 0) && (
            <GradeChip grade={job.grade} score={job.match_score} onClick={() => setShowScoreModal(true)} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#1d1d1f] truncate">{job.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
            {job.archetype && (
              <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 uppercase tracking-wide">
                {job.archetype}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(job.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
          <X size={13} />
        </button>
      </div>

      {job.why && (
        <p className="text-[11px] text-slate-500 italic leading-snug border-l-2 border-indigo-200 pl-2">
          “{job.why}”
        </p>
      )}

      <div onClick={() => setShowScoreModal(true)}>
        <ScoreBar score={job.match_score} clickable={true} />
      </div>

      {showScoreModal && <ScoreBreakdownModal job={job} profileId={activeProfileId} onClose={() => setShowScoreModal(false)} />}
      {salary && <p className="text-xs font-semibold text-emerald-600">{salary}</p>}

      <select
        value={job.status}
        onChange={e => statusMut.mutate({ status: e.target.value })}
        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
      </select>

      <div className="flex gap-2 flex-wrap">
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-secondary py-1 text-xs">
            <ExternalLink size={11} /> View
          </a>
        )}
        <button onClick={openTailor} className="btn btn-secondary py-1 text-xs">
          <FileText size={11} /> Tailor resume
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          onClick={() => runAction('negotiate')}
          className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold flex items-center gap-1"
          title="Salary negotiation brief"
        >
          <DollarSign size={10} /> Negotiate
        </button>
        <button
          onClick={() => runAction('research')}
          className="text-[10px] px-2 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 font-semibold flex items-center gap-1"
          title="Deep company research"
        >
          <BookOpen size={10} /> Research
        </button>
        <button
          onClick={() => runAction('outreach')}
          className="text-[10px] px-2 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold flex items-center gap-1"
          title="LinkedIn outreach drafts"
        >
          <MessageSquare size={10} /> Outreach
        </button>
        <button
          onClick={() => runAction('stories')}
          className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold flex items-center gap-1"
          title="Add tailored STAR stories to your bank"
        >
          <Sparkles size={10} /> + Stories
        </button>
      </div>

      {drawer && (
        <ActionDrawer
          title={drawer.title}
          icon={drawer.icon}
          loading={drawerLoading}
          error={drawerError}
          content={drawerContent}
          onClose={() => { setDrawer(null); setDrawerContent(null); setDrawerError('') }}
        />
      )}

      {showTailor && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTailorMode('saved')}
              className={clsx(
                'flex-1 text-[11px] py-1.5 rounded-md font-semibold transition-colors',
                tailorMode === 'saved' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              )}
            >
              Saved resume
            </button>
            <button
              type="button"
              onClick={() => setTailorMode('upload')}
              className={clsx(
                'flex-1 text-[11px] py-1.5 rounded-md font-semibold transition-colors',
                tailorMode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              )}
            >
              Upload from computer
            </button>
          </div>

          {tailorMode === 'saved' ? (
            <>
              <p className="text-xs font-semibold text-slate-700">Select resume to tailor:</p>
              {rxResumes.length === 0
                ? <p className="text-xs text-slate-400">No resumes created yet.</p>
                : <select className="input text-xs py-1.5" value={selectedResume} onChange={e => setSelectedResume(e.target.value)}>
                    <option value="">— pick one —</option>
                    {rxResumes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>}
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-700">Pick a PDF or Word (.docx) resume from your computer:</p>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
              />
              {uploadFile && (
                <p className="text-[11px] text-slate-500 truncate">
                  Selected: <span className="font-semibold text-slate-700">{uploadFile.name}</span>
                </p>
              )}
              <p className="text-[10px] text-slate-400">
                The tailored PDF will be saved to your Downloads folder as <span className="font-mono">{uploadFile ? timestampFilename(uploadFile.name) : 'filename_YYYYMMDD_HHMMSS.pdf'}</span>
              </p>
            </>
          )}

          <button
            onClick={generateResume}
            disabled={tailoring || (tailorMode === 'saved' ? !selectedResume : !uploadFile)}
            className="btn btn-primary w-full justify-center text-xs py-2"
          >
            {tailoring ? <><Loader2 size={11} className="animate-spin" /> Generating PDF…</> : <><Download size={11} /> Generate tailored PDF</>}
          </button>
        </div>
      )}

      {showQuickResume && (
        <QuickResumeModal
          profileId={activeProfileId}
          onClose={() => setShowQuickResume(false)}
          onCreated={(resumeId) => {
            setSelectedResume(resumeId)
            setShowTailor(true)
            qc.invalidateQueries({ queryKey: ['resumes', activeProfileId] })
          }}
        />
      )}
    </div>
  )
}

// ── Status bar ─────────────────────────────────────────────────────────────────
function StatusBar({ statuses }) {
  if (!statuses.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map(s => (
        <div key={s.source} className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border font-medium',
          s.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
        )}>
          {s.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
          {s.source}
          {s.ok ? <span className="font-normal text-green-600">{s.count} jobs</span> : <span className="font-normal">{s.error}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Discovered job card ────────────────────────────────────────────────────────
function DiscoveredJobCard({ job, profileId, onAdded }) {
  const [added, setAdded] = useState(false)
  const [showScoreModal, setShowScoreModal] = useState(false)
  const src = SOURCES.find(s => job.source?.toLowerCase().includes(s.label.split(' ')[0].toLowerCase()))
  const addMut = useMutation({
    mutationFn: () => api.post('/discovery/add', {
      profile_id: Number(profileId),
      title: job.title, company: job.company, location: job.location,
      url: job.url, description: job.description, match_score: job.match_score, source: job.source,
    }).then(r => r.data),
    onSuccess: () => { setAdded(true); toast.success(`"${job.title}" added`); onAdded?.() },
    onError: e => toast.error(e?.response?.data?.detail || 'Failed to add job'),
  })
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx('badge text-xs', SOURCE_BADGE[src?.color || 'blue'])}>{job.source}</span>
        {job.posted_at && <span className="text-xs text-slate-400">{job.posted_at}</span>}
      </div>
      <div>
        <p className="text-sm font-bold text-[#1d1d1f]">{job.title}</p>
        <p className="text-xs text-slate-500">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
      </div>
      <div onClick={() => setShowScoreModal(true)}>
        <ScoreBar score={job.match_score} clickable={true} />
      </div>

      {showScoreModal && <ScoreBreakdownModal job={job} profileId={profileId} onClose={() => setShowScoreModal(false)} />}
      {job.description && <p className="text-xs text-slate-500 line-clamp-2">{job.description.slice(0, 180)}</p>}
      <div className="flex gap-2">
        {job.url && <a href={job.url} target="_blank" rel="noreferrer" className="btn btn-secondary py-1 text-xs"><ExternalLink size={11} /> View</a>}
        <button onClick={() => addMut.mutate()} disabled={addMut.isPending || added}
          className={clsx('btn py-1 text-xs', added ? 'btn-secondary opacity-60' : 'btn-primary')}>
          {addMut.isPending ? <Loader2 size={11} className="animate-spin" /> : added ? <><CheckCircle size={11} /> Added</> : <><Plus size={11} /> Track</>}
        </button>
      </div>
    </div>
  )
}

// ── Source button ──────────────────────────────────────────────────────────────
function SourceButton({ source, profileId, onResults, disabled, extraParams }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  async function run() {
    if (!profileId) { toast.error('Select a profile first'); return }
    setLoading(true); setStatus(null)
    try {
      const { data } = await api.get('/discovery/source', {
        params: { profile_id: profileId, source: source.id, ...(extraParams || {}) }
      })
      setStatus(data.status); onResults(data.jobs, data.status)
    } catch (e) {
      const s = { source: source.label, ok: false, count: 0, error: e?.response?.data?.detail || 'Failed' }
      setStatus(s); onResults([], s)
    } finally { setLoading(false) }
  }
  return (
    <button onClick={run} disabled={loading || disabled}
      className={clsx(
        'flex flex-col items-start w-full px-4 py-3 rounded-xl border-2 text-left transition-all',
        status?.ok ? 'border-green-300 bg-green-50' : status ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white hover:border-slate-300',
        (loading || disabled) && 'opacity-50 cursor-not-allowed'
      )}>
      <div className="flex items-center justify-between w-full gap-3">
        <div className="flex items-center gap-2">
          {loading ? <Loader2 size={13} className="animate-spin text-slate-400" />
            : status?.ok ? <CheckCircle size={13} className="text-green-500" />
            : status ? <XCircle size={13} className="text-red-400" />
            : <Play size={13} className="text-slate-400" />}
          <span className="text-sm font-semibold text-[#1d1d1f]">{source.label}</span>
        </div>
        {status?.ok && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{status.count}</span>}
      </div>
      <p className="text-xs text-slate-400 mt-1">{source.desc}</p>
      {status && !status.ok && <p className="text-xs text-red-400 mt-1">{status.error}</p>}
    </button>
  )
}

// ── Batch URL paste form ───────────────────────────────────────────────────────
function BatchAddForm({ profileId, onDone }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)

  // Pull URLs out of any pasted text — handles whitespace, commas, bullet
  // points and "Title — https://..." snippets the user might paste from
  // another tab.
  function extractUrls(raw) {
    const matches = raw.match(/https?:\/\/[^\s,]+/g) || []
    return Array.from(new Set(matches)).slice(0, 25)
  }

  const urls = extractUrls(text)

  async function run() {
    if (!urls.length) return
    setBusy(true); setReport(null)
    try {
      const data = await batchAddJobs(Number(profileId), urls)
      setReport(data)
      qc.invalidateQueries({ queryKey: ['jobs', profileId] })
      if (data.added > 0) toast.success(`Added ${data.added} job${data.added !== 1 ? 's' : ''}`)
      if (data.failed > 0) toast.error(`${data.failed} URL${data.failed !== 1 ? 's' : ''} failed`)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Batch add failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[#1d1d1f]">Batch-add jobs</h2>
        <p className="text-xs text-slate-500 mt-1">Paste up to 25 job URLs at once — one per line, comma-separated, or just dump the text. We'll deduplicate and analyse each.</p>
      </div>
      <textarea
        className="input min-h-32 resize-y font-mono text-xs"
        placeholder={"https://jobs.example.com/123\nhttps://boards.greenhouse.io/anthropic/jobs/456\n..."}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={busy}
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500">{urls.length} URL{urls.length !== 1 ? 's' : ''} detected{urls.length === 25 ? ' (max)' : ''}</span>
        <button onClick={run} disabled={busy || !urls.length} className="btn btn-primary">
          {busy ? <><Loader2 size={13} className="animate-spin" /> Analysing {urls.length} jobs…</> : <><Layers size={13} /> Analyse {urls.length || 'jobs'}</>}
        </button>
      </div>
      {report && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold">{report.added} added</span>
            <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-semibold">{report.duplicate} duplicate</span>
            <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 font-semibold">{report.failed} failed</span>
          </div>
          <ul className="text-[11px] space-y-1 max-h-40 overflow-y-auto">
            {report.results.map((r, i) => (
              <li key={i} className={clsx(
                'truncate',
                r.status === 'added'     && 'text-emerald-700',
                r.status === 'duplicate' && 'text-amber-600',
                r.status === 'failed'    && 'text-red-600',
              )}>
                {r.status === 'added' ? '✓' : r.status === 'duplicate' ? '↺' : '✗'} {r.title || r.url}
                {r.error && <span className="text-slate-400"> — {r.error}</span>}
              </li>
            ))}
          </ul>
          <button onClick={onDone} className="btn btn-secondary text-xs">Done</button>
        </div>
      )}
    </div>
  )
}

// ── Tracker tab ────────────────────────────────────────────────────────────────
function TrackerTab({ activeProfileId, activeProfile }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const { data: jobs = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['jobs', activeProfileId],
    queryFn: () => getJobs(activeProfileId),
    enabled: Boolean(activeProfileId),
  })

  // Detect duplicates - same title + company combo
  const findDuplicates = () => {
    const dupeMap = {}
    jobs.forEach(j => {
      const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
      if (!dupeMap[key]) dupeMap[key] = []
      dupeMap[key].push(j)
    })
    return Object.values(dupeMap).filter(group => group.length > 1)
  }
  const duplicates = findDuplicates()
  const addMut = useMutation({
    mutationFn: () => addJob(Number(activeProfileId), url, description),
    onSuccess: () => {
      toast.success('Job added and analysed')
      qc.invalidateQueries({ queryKey: ['jobs', activeProfileId] })
      setUrl(''); setDescription(''); setShowForm(false)
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Failed to add job'),
  })
  const deleteMut = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['jobs', activeProfileId] }) },
  })
  const jobsByStatus = s => jobs.filter(j => j.status === s)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {activeProfile ? `${jobs.length} job${jobs.length !== 1 ? 's' : ''} tracked for ${activeProfile.name}` : 'Select a profile'}
          {isFetching && !isLoading && <span className="ml-2 text-slate-400 text-xs">Refreshing…</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={() => { setShowBatch(v => !v); if (!showBatch) setShowForm(false) }} className="btn btn-secondary" disabled={!activeProfileId}>
            {showBatch ? <><X size={15} /> Cancel batch</> : <><Layers size={15} /> Batch add</>}
          </button>
          <button onClick={() => { setShowForm(v => !v); if (!showForm) setShowBatch(false) }} className="btn btn-primary" disabled={!activeProfileId}>
            {showForm ? <><X size={15} /> Cancel</> : <><Plus size={15} /> Add job</>}
          </button>
        </div>
      </div>

      {showBatch && activeProfileId && (
        <BatchAddForm profileId={activeProfileId} onDone={() => setShowBatch(false)} />
      )}

      {showForm && activeProfileId && (
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[#1d1d1f]">Add a job to track</h2>
            <p className="text-xs text-slate-500 mt-1">Tracked under <strong>{activeProfile?.name}</strong></p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job URL</label>
            <input className="input" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
            <p className="text-xs text-slate-400 mt-1">Works with LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday and most company career pages.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Or paste the job description</label>
            <textarea className="input min-h-24 resize-y" placeholder="Paste the full job description here…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {addMut.isPending
            ? <AnalysisProgress hasUrl={Boolean(url)} />
            : <button onClick={() => addMut.mutate()} disabled={!url && !description} className="btn btn-primary w-full justify-center">Analyse and track job</button>}
        </div>
      )}

      {isLoading && <LoadingMeme label="Loading your job pipeline" />}
      {isError && (
        <div className="card p-8 text-center space-y-3">
          <p className="text-sm font-bold text-[#1d1d1f]">Could not load jobs</p>
          <p className="text-sm text-slate-500">{error?.response?.data?.detail || error?.message}</p>
          <button onClick={refetch} className="btn btn-secondary mx-auto"><RefreshCw size={14} /> Retry</button>
        </div>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <div className="card p-12 text-center space-y-4">
          <p className="text-base font-bold text-[#1d1d1f]">No jobs yet for {activeProfile?.name}</p>
          <p className="text-sm text-slate-500">Add one manually or switch to Discover to pull in matching roles.</p>
          <button onClick={() => setShowForm(true)} className="btn btn-primary mx-auto"><Plus size={15} /> Add your first job</button>
        </div>
      )}

      {!isLoading && !isError && jobs.length > 0 && (
        <>
          {duplicates.length > 0 && (
            <div className="card p-4 border border-amber-200 bg-amber-50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-600" />
                  <p className="text-xs font-semibold text-amber-800">{duplicates.length} duplicate(s) found</p>
                </div>
                <button onClick={() => setShowDuplicates(!showDuplicates)} className="text-xs text-amber-700 hover:text-amber-900 font-semibold">
                  {showDuplicates ? 'Hide' : 'Show'}
                </button>
              </div>
              {showDuplicates && (
                <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
                  {duplicates.map((dupeGroup, i) => (
                    <div key={i} className="space-y-1.5 text-xs">
                      <p className="font-medium text-amber-900">
                        <strong>{dupeGroup[0].title}</strong> @ {dupeGroup[0].company}
                      </p>
                      <div className="space-y-1 ml-2">
                        {dupeGroup.map((j, idx) => (
                          <div key={j.id} className="flex items-center justify-between py-1.5 px-2 bg-white rounded border border-amber-100">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-600">{j.status} · {j.created_at?.split('T')[0]}</p>
                            </div>
                            {idx > 0 && (
                              <button
                                onClick={() => deleteMut.mutate(j.id)}
                                className="ml-2 px-2 py-1 text-[10px] bg-red-50 text-red-600 rounded hover:bg-red-100 font-semibold"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
              {COLUMNS.map(col => (
                <div key={col.key} className="kanban-col w-64">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={clsx('badge', col.color)}>{col.label}</span>
                    <span className="text-xs text-slate-400 font-semibold">{jobsByStatus(col.key).length}</span>
                  </div>
                <div className="space-y-3">
                  {jobsByStatus(col.key).map(job => (
                    <JobCard key={job.id} job={job} onStatusChange={updateJobStatus} onDelete={id => deleteMut.mutate(id)} />
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Discover tab ───────────────────────────────────────────────────────────────
function DiscoverTab({ activeProfileId }) {
  const qc = useQueryClient()
  const [allJobs, setAllJobs] = useState([])
  const [allStatuses, setAllStatuses] = useState([])
  // Persisted filters — survive refresh + tab switches so the user doesn't
  // have to re-pick their sources/country/keywords every visit.
  const [minScore, setMinScore] = useLocalStorageState('discover.minScore', 0)
  const [searchingAll, setSearchingAll] = useState(false)
  const [storedSources, setStoredSources] = useLocalStorageState(
    'discover.sources',
    ['remotive', 'weworkremotely', 'arbeitnow', 'indeed', 'workingnomads']
  )
  const selectedSources = new Set(storedSources)
  const setSelectedSources = (next) => setStoredSources([...next])
  const [customKeywords, setCustomKeywords] = useLocalStorageState('discover.keywords', '')
  const [selectedCountry, setSelectedCountry] = useLocalStorageState('discover.country', 'global')
  const [customSlugs, setCustomSlugs] = useLocalStorageState('discover.customSlugs', '')
  const [coachMode, setCoachMode] = useLocalStorageState('coachMode', false)

  // Portal catalog — curated company lists for each ATS platform
  const { data: portalCatalog = {} } = useQuery({
    queryKey: ['portalCompanies'],
    queryFn: () => api.get('/discovery/portals').then(r => r.data),
    staleTime: Infinity,
  })

  // Thread the custom-keywords textarea into single-source searches so per-button
  // clicks respect whatever the user typed at the top of the page.
  const keywordExtraParam = customKeywords.trim()
    ? { keywords: customKeywords.split('\n').filter(k => k.trim()).join(',') }
    : {}
  const sharedSourceParams = { ...keywordExtraParam, country: selectedCountry }
  const portalExtraParams = {
    ...sharedSourceParams,
    ...(customSlugs.trim() ? { companies: customSlugs.trim() } : {}),
  }

  const COUNTRIES = [
    { value: 'global', label: '🌍 Global' },
    { value: 'us', label: '🇺🇸 United States' },
    { value: 'uk', label: '🇬🇧 United Kingdom' },
    { value: 'ca', label: '🇨🇦 Canada' },
    { value: 'au', label: '🇦🇺 Australia' },
    { value: 'de', label: '🇩🇪 Germany' },
    { value: 'fr', label: '🇫🇷 France' },
    { value: 'nl', label: '🇳🇱 Netherlands' },
    { value: 'ch', label: '🇨🇭 Switzerland' },
    { value: 'sg', label: '🇸🇬 Singapore' },
  ]

  function mergeResults(newJobs, newStatus) {
    setAllStatuses(prev => [...prev.filter(s => s.source !== newStatus.source), newStatus])
    setAllJobs(prev => {
      const ids = new Set(prev.map(j => j.id))
      return [...prev, ...newJobs.filter(j => !ids.has(j.id))].sort((a, b) => b.match_score - a.match_score)
    })
  }

  async function searchAll() {
    if (!activeProfileId) { toast.error('Select a profile first'); return }
    setSearchingAll(true); setAllJobs([]); setAllStatuses([])
    try {
      const sources = [...selectedSources].join(',')
      const params = { profile_id: activeProfileId, sources, country: selectedCountry }
      if (customKeywords.trim()) {
        params.keywords = customKeywords.split('\n').filter(k => k.trim()).join(',')
      }
      const { data } = await api.get('/discovery/', { params })
      setAllJobs(data.jobs || []); setAllStatuses(data.statuses || [])
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Search failed')
    } finally { setSearchingAll(false) }
  }

  const filteredJobs = allJobs.filter(j => j.match_score >= minScore)

  // Memoise grouped jobs so re-renders only regroup if filteredJobs changed
  const groupedJobs = useMemo(() => {
    return filteredJobs.reduce((acc, j) => {
      const key = j.source || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(j)
      return acc
    }, {})
  }, [filteredJobs])

  return (
    <div className="space-y-6">
      {/* Coach mode + filter persistence indicator */}
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={coachMode}
            onChange={e => setCoachMode(e.target.checked)}
            className="accent-indigo-600"
          />
          <Sparkles size={12} className={coachMode ? 'text-indigo-600' : 'text-slate-400'} />
          Coach mode
        </label>
      </div>

      {coachMode && (
        <div className="card p-4 border border-indigo-200 bg-indigo-50/40 text-xs text-indigo-900 leading-relaxed">
          <strong>Coach tip:</strong> Strong searches start with 2–3 specific titles you'd actually accept,
          plus the country you can legally work in. Then pick 5–8 sources — more isn't better,
          it just slows the page. Your filters now persist across visits.
        </div>
      )}

      {/* Custom keyword search */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#1d1d1f] mb-1">Search by job title or keywords</h3>
          <p className="text-xs text-slate-500">Enter specific job titles to find. Leave blank to search using your profile.</p>
        </div>
        <div className="space-y-3">
          <textarea
            value={customKeywords}
            onChange={e => setCustomKeywords(e.target.value)}
            placeholder="Senior Director, Innovation Delivery&#10;Director, Site Reliability Engineering&#10;Engineering Manager"
            className="input min-h-20 resize-y text-xs"
          />
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Location</label>
            <select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)} className="input">
              {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Source selector */}
      <div className="card p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-[#1d1d1f] mb-1">Select sources</h3>
          <p className="text-xs text-slate-500">Toggle which job boards to search. Greyed-out sources need extra setup.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SOURCES.map(src => (
            <label key={src.id} className={clsx(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all text-sm select-none',
              selectedSources.has(src.id) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
            )}>
              <input type="checkbox" className="accent-indigo-600"
                checked={selectedSources.has(src.id)}
                onChange={e => {
                  const next = new Set(selectedSources)
                  e.target.checked ? next.add(src.id) : next.delete(src.id)
                  setSelectedSources(next)
                }} />
              <div className="min-w-0">
                <p className={clsx('text-xs font-semibold truncate', selectedSources.has(src.id) ? 'text-indigo-800' : 'text-[#1d1d1f]')}>{src.label}</p>
                <p className="text-[10px] text-slate-400 truncate">{src.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <button onClick={searchAll} disabled={searchingAll || !activeProfileId || selectedSources.size === 0}
          className="btn btn-primary w-full justify-center">
          {searchingAll ? <><Loader2 size={15} className="animate-spin" /> Searching {selectedSources.size} sources…</> : <><Search size={15} /> Search selected sources</>}
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-300">
          <div className="flex-1 border-t border-slate-100" /><span>or search one at a time</span><div className="flex-1 border-t border-slate-100" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SOURCES.map(src => (
            <SourceButton
              key={src.id}
              source={src}
              profileId={activeProfileId}
              onResults={mergeResults}
              disabled={searchingAll}
              extraParams={sharedSourceParams}
            />
          ))}
        </div>
      </div>

      {/* ── Portal Scanner ────────────────────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Radar size={18} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#1d1d1f]">Portal Scanner</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Hit curated company career portals directly across Greenhouse, Lever, Ashby and Wellfound.
              Ships with 45+ companies — Anthropic, OpenAI, ElevenLabs, Retool, n8n, Stripe, Figma, Databricks,
              Netflix, Palantir, Linear and more. No aggregators, no stale feeds.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PORTAL_SOURCES.map(src => {
            const count = (portalCatalog[src.id] || []).length
            return (
              <SourceButton
                key={src.id}
                source={{ ...src, desc: count ? `${count} companies · ${src.desc}` : src.desc }}
                profileId={activeProfileId}
                onResults={mergeResults}
                disabled={searchingAll}
                extraParams={portalExtraParams}
              />
            )
          })}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            <Building2 size={11} className="inline mr-1 -mt-0.5" />
            Custom companies (optional) — overrides the curated list
          </label>
          <input
            className="input text-xs"
            placeholder="e.g. Anthropic|anthropic, openai, retool, n8n, linear"
            value={customSlugs}
            onChange={e => setCustomSlugs(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Format: <code className="text-slate-500">Name|slug</code> or just <code className="text-slate-500">slug</code>, comma-separated.
            The slug is the URL handle on the platform (e.g. <code className="text-slate-500">boards.greenhouse.io/<b>anthropic</b></code>).
          </p>
        </div>

        {Object.keys(portalCatalog).length > 0 && !customSlugs && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">
              See which companies ship by default ({
                PORTAL_SOURCES.reduce((n, s) => n + (portalCatalog[s.id] || []).length, 0)
              } total)
            </summary>
            <div className="mt-3 space-y-2">
              {PORTAL_SOURCES.map(src => {
                const list = portalCatalog[src.id] || []
                if (!list.length) return null
                return (
                  <div key={src.id} className="flex flex-wrap items-center gap-1">
                    <span className={clsx('badge text-xs mr-1', SOURCE_BADGE[src.color])}>{src.label}</span>
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

      <StatusBar statuses={allStatuses} />

      {/* Empty state — distinguish "haven't searched yet" from "searched and got nothing" */}
      {allJobs.length === 0 && allStatuses.length > 0 && !searchingAll && (
        <div className="card p-10 text-center space-y-3">
          <Search size={28} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-[#1d1d1f]">No matches across {allStatuses.length} sources</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try broadening your keywords (drop seniority words like "Senior" or "Director"),
            switch the country to <strong>🌍 Global</strong>, or add Greenhouse / Ashby in the Portal Scanner below.
          </p>
        </div>
      )}

      {allJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-[#1d1d1f]">
                {filteredJobs.length} jobs {minScore > 0 ? `(${allJobs.length} total, filtered ≥${minScore}%)` : ''}
              </p>
              {/* "60 of 606 scanned" — shows that Portal Scanner caps at 60 so users
                  understand why a 606-job board returns "only" 60 hits */}
              {allStatuses.some(s => s.ok && s.count === 60) && (
                <span className="badge bg-indigo-50 text-indigo-700 text-[10px]">
                  Showing top 60 per source · raise specificity to narrow
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Filter size={13} className="text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Min match:</span>
              <input type="range" min="0" max="80" step="10" value={minScore}
                onChange={e => setMinScore(Number(e.target.value))} className="w-24 accent-indigo-600" />
              <span className="text-xs font-bold text-[#1d1d1f] w-8">{minScore}%</span>
              <button onClick={searchAll} disabled={searchingAll} className="btn btn-secondary py-1 text-xs">
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
          </div>
          {filteredJobs.length === 0
            ? <p className="text-center py-8 text-slate-400 text-sm">No jobs above {minScore}%. Lower the filter or try more sources.</p>
            : Object.keys(groupedJobs).length > 1
              ? Object.entries(groupedJobs).map(([source, list]) => (
                  <div key={source} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">{source}</h4>
                      <span className="text-[10px] text-slate-400">{list.length} job{list.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {list.map(job => (
                        <DiscoveredJobCard key={job.id} job={job} profileId={activeProfileId}
                          onAdded={() => qc.invalidateQueries({ queryKey: ['jobs', activeProfileId] })} />
                      ))}
                    </div>
                  </div>
                ))
              : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredJobs.map(job => (
                    <DiscoveredJobCard key={job.id} job={job} profileId={activeProfileId}
                      onAdded={() => qc.invalidateQueries({ queryKey: ['jobs', activeProfileId] })} />
                  ))}
                </div>}
        </div>
      )}

      <div className="card p-4 border-dashed">
        <div className="flex items-start gap-3">
          <AlertCircle size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-[#1d1d1f]">LinkedIn & Glassdoor note</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Both platforms block automated scraping. For LinkedIn: copy any job URL and paste it into <strong>Tracker → Add job</strong> for full AI analysis. Glassdoor results may be empty due to their bot detection.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Jobs page ─────────────────────────────────────────────────────────────
export default function Jobs() {
  const [tab, setTab] = useState('tracker')
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })
  const { activeProfileId, activeProfile, setActiveProfileId } = useActiveProfile()

  if (profiles.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-lg font-bold text-[#1d1d1f]">No profiles yet</p>
        <p className="text-slate-500">Go to <strong>Dashboard</strong> and drop a resume PDF to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        compact
        eyebrow={activeProfile?.name ? `Profile · ${activeProfile.name}` : 'Choose a profile'}
        title="Your Job Pipeline"
        icon={<Briefcase size={16} />}
        right={
          <div className="min-w-56">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-1">Active profile</label>
            <select className="input" value={activeProfileId} onChange={e => setActiveProfileId(e.target.value, { pathname: '/jobs' })}>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        }
      />

      <div className="flex border-b border-slate-200">
        {[{ id: 'tracker', label: 'Tracker', desc: 'Your applications' }, { id: 'discover', label: 'Discover', desc: 'Find new jobs' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors -mb-px',
              tab === t.id ? 'border-[#1428a0] text-[#1428a0]' : 'border-transparent text-slate-500 hover:text-[#1d1d1f] hover:border-slate-300')}>
            {t.label}
            <span className={clsx('text-xs px-2 py-0.5 rounded-full', tab === t.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>{t.desc}</span>
          </button>
        ))}
      </div>

      {tab === 'tracker' ? <TrackerTab activeProfileId={activeProfileId} activeProfile={activeProfile} /> : <DiscoverTab activeProfileId={activeProfileId} />}
    </div>
  )
}
