import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfiles, getJobs, addJob, updateJobStatus, getCoverLetter, getInterviewQuestions, deleteJob } from '../utils/api'
import { Plus, Loader2, ExternalLink, ChevronDown, Copy, Trash2, MessageSquare, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const COLUMNS = [
  { key: 'saved',     label: 'Saved',     color: 'bg-slate-100 text-slate-700' },
  { key: 'applied',   label: 'Applied',   color: 'bg-blue-100 text-blue-700' },
  { key: 'interview', label: 'Interview', color: 'bg-amber-100 text-amber-700' },
  { key: 'offer',     label: 'Offer',     color: 'bg-green-100 text-green-700' },
  { key: 'rejected',  label: 'Rejected',  color: 'bg-red-100 text-red-600' },
]

function ScoreBar({ score }) {
  const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-7 text-right">{Math.round(score)}%</span>
    </div>
  )
}

function JobCard({ job, onStatusChange, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [coverLetter, setCoverLetter] = useState(job.cover_letter || '')
  const [questions, setQuestions] = useState(null)
  const [loadingCL, setLoadingCL] = useState(false)
  const [loadingQ, setLoadingQ] = useState(false)

  const qc = useQueryClient()
  const statusMut = useMutation({
    mutationFn: ({ status }) => onStatusChange(job.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] })
  })

  const salary = job.salary_min > 0
    ? `$${(job.salary_min / 1000).toFixed(0)}k – $${(job.salary_max / 1000).toFixed(0)}k`
    : null

  async function handleCoverLetter() {
    setLoadingCL(true)
    try {
      const data = await getCoverLetter(job.id)
      setCoverLetter(data.cover_letter)
      setExpanded(true)
    } catch { toast.error('Failed to generate cover letter') }
    finally { setLoadingCL(false) }
  }

  async function handleQuestions() {
    setLoadingQ(true)
    try {
      const data = await getInterviewQuestions(job.id)
      setQuestions(data.questions)
      setExpanded(true)
    } catch { toast.error('Failed to generate questions') }
    finally { setLoadingQ(false) }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{job.title}</p>
          <p className="text-xs text-slate-500">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
        </div>
        <button onClick={() => onDelete(job.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      <ScoreBar score={job.match_score} />

      {salary && <p className="text-xs text-green-700 font-medium">{salary}</p>}

      {job.skill_gaps?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.skill_gaps.slice(0, 4).map(g => (
            <span key={g} className="badge bg-red-50 text-red-600 text-xs">{g}</span>
          ))}
          {job.skill_gaps.length > 4 && (
            <span className="badge bg-slate-100 text-slate-400">+{job.skill_gaps.length - 4} gaps</span>
          )}
        </div>
      )}

      {/* Status selector */}
      <select
        value={job.status}
        onChange={e => statusMut.mutate({ status: e.target.value })}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer"
            className="btn btn-secondary py-1 text-xs">
            <ExternalLink size={11} /> View job
          </a>
        )}
        <button onClick={handleCoverLetter} disabled={loadingCL}
          className="btn btn-secondary py-1 text-xs">
          {loadingCL ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />}
          Cover letter
        </button>
        <button onClick={handleQuestions} disabled={loadingQ}
          className="btn btn-secondary py-1 text-xs">
          {loadingQ ? <Loader2 size={11} className="animate-spin" /> : <ChevronDown size={11} />}
          Prep questions
        </button>
      </div>

      {/* Expandable: cover letter */}
      {expanded && coverLetter && (
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-slate-600">Cover letter</p>
            <button onClick={() => { navigator.clipboard.writeText(coverLetter); toast.success('Copied!') }}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              <Copy size={10} /> Copy
            </button>
          </div>
          <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            {coverLetter}
          </p>
        </div>
      )}

      {/* Expandable: interview questions */}
      {expanded && questions?.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-slate-600">Interview prep</p>
          {questions.map((q, i) => (
            <div key={i} className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-800">{q.question}</p>
              {q.tip && <p className="text-xs text-slate-500 mt-1 italic">{q.tip}</p>}
              <span className={clsx('badge text-xs mt-1.5', {
                'bg-blue-50 text-blue-600': q.type === 'technical',
                'bg-purple-50 text-purple-600': q.type === 'behavioural',
                'bg-amber-50 text-amber-600': q.type === 'leadership',
              })}>{q.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Jobs() {
  const qc = useQueryClient()
  const [profileId, setProfileId] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => getJobs() })

  const addMut = useMutation({
    mutationFn: () => addJob(parseInt(profileId), url, description),
    onSuccess: () => {
      toast.success('Job added and analysed!')
      qc.invalidateQueries({ queryKey: ['jobs'] })
      setUrl(''); setDescription(''); setShowForm(false)
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to add job')
  })

  const deleteMut = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['jobs'] }) }
  })

  const jobsByStatus = (status) => jobs.filter(j => j.status === status)

  if (profiles.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">No profiles yet. Go to <strong>Dashboard</strong> and drop a resume first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">{jobs.length} job{jobs.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn btn-primary">
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cancel' : 'Add job'}
        </button>
      </div>

      {/* Add job form */}
      {showForm && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Add a new job</h2>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Which profile are you applying with?</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)} className="input">
              <option value="">Select a profile…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Job URL <span className="text-slate-400">(paste from LinkedIn, Indeed, etc.)</span></label>
            <input className="input" placeholder="https://linkedin.com/jobs/view/..." value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Or paste job description text <span className="text-slate-400">(if URL doesn't work)</span></label>
            <textarea className="input min-h-24 resize-y" placeholder="Paste the job description here…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <button onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !profileId || (!url && !description)}
            className="btn btn-primary w-full justify-center">
            {addMut.isPending ? <><Loader2 size={15} className="animate-spin" /> Analysing with AI…</> : 'Analyse & track job'}
          </button>
          <p className="text-xs text-slate-400 text-center">AI will score match, identify skill gaps, and estimate salary range</p>
        </div>
      )}

      {/* Kanban board */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No jobs yet. Add your first one above.</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <div key={col.key} className="kanban-col w-64">
                <div className="flex items-center gap-2 mb-2">
                  <span className={clsx('badge', col.color)}>{col.label}</span>
                  <span className="text-xs text-slate-400">{jobsByStatus(col.key).length}</span>
                </div>
                {jobsByStatus(col.key).map(job => (
                  <JobCard key={job.id} job={job}
                    onStatusChange={updateJobStatus}
                    onDelete={(id) => deleteMut.mutate(id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
