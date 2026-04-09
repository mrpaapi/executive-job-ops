import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { getProfiles, getJobs, uploadResume, deleteProfile } from '../utils/api'
import { Upload, Trash2, FileText, TrendingUp, CheckCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function ScoreBadge({ score }) {
  const color = score >= 75 ? 'bg-green-100 text-green-700'
    : score >= 50 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600'
  return (
    <span className={clsx('score-ring text-xs', color)}>{Math.round(score)}%</span>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['profiles'], queryFn: getProfiles
  })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => getJobs() })

  const uploadMut = useMutation({
    mutationFn: uploadResume,
    onSuccess: (data) => {
      toast.success(data.message)
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: () => toast.error('Upload failed. Is it a PDF?')
  })

  const deleteMut = useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      toast.success('Profile removed')
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    }
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: (files) => files.forEach(f => uploadMut.mutate(f)),
    multiple: true,
  })

  const applied = jobs.filter(j => j.status === 'applied').length
  const interviews = jobs.filter(j => j.status === 'interview').length
  const offers = jobs.filter(j => j.status === 'offer').length
  const avgScore = jobs.length
    ? Math.round(jobs.reduce((s, j) => s + j.match_score, 0) / jobs.length)
    : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Your job search at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Profiles" value={profiles.length} icon={FileText} color="bg-brand-50 text-brand-600" />
        <StatCard label="Applications" value={applied} icon={Clock} color="bg-blue-50 text-blue-600" />
        <StatCard label="Interviews" value={interviews} icon={TrendingUp} color="bg-amber-50 text-amber-600" />
        <StatCard label="Offers" value={offers} icon={CheckCircle} color="bg-green-50 text-green-600" />
      </div>

      {/* Drop zone */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Your Resume Profiles</h2>
        <p className="text-sm text-slate-500 mb-4">
          Drop PDF resumes here — each file becomes a separate profile automatically.
          Name them like <code className="bg-slate-100 px-1 rounded text-xs">sre-leadership.pdf</code> or <code className="bg-slate-100 px-1 rounded text-xs">devops-lead.pdf</code>.
        </p>

        <div {...getRootProps()} className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
        )}>
          <input {...getInputProps()} />
          <Upload size={24} className={clsx('mx-auto mb-2', isDragActive ? 'text-brand-500' : 'text-slate-400')} />
          {uploadMut.isPending
            ? <p className="text-sm text-brand-600 font-medium">Analysing resume with AI…</p>
            : isDragActive
              ? <p className="text-sm text-brand-600 font-medium">Drop to create profile</p>
              : <p className="text-sm text-slate-500">Drag & drop PDF resumes, or <span className="text-brand-600 font-medium">click to browse</span></p>
          }
        </div>

        {/* Profile list */}
        {loadingProfiles ? (
          <p className="text-sm text-slate-400 mt-4">Loading profiles…</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-slate-400 mt-4 text-center">No profiles yet — drop a resume above to get started.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {profiles.map(p => (
              <div key={p.id} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-brand-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{p.name}</p>
                    <span className="badge bg-brand-50 text-brand-700">{p.role_family}</span>
                    {p.years_experience > 0 && (
                      <span className="text-xs text-slate-400">{p.years_experience}y exp</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{p.summary || 'Processing…'}</p>
                  {p.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.skills.slice(0, 6).map(s => (
                        <span key={s} className="badge bg-slate-100 text-slate-600">{s}</span>
                      ))}
                      {p.skills.length > 6 && (
                        <span className="badge bg-slate-100 text-slate-400">+{p.skills.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => deleteMut.mutate(p.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Recent jobs</h2>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(j => (
              <div key={j.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <ScoreBadge score={j.match_score} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{j.title}</p>
                  <p className="text-xs text-slate-500">{j.company}</p>
                </div>
                <span className={clsx('badge', {
                  'bg-slate-100 text-slate-600': j.status === 'saved',
                  'bg-blue-100 text-blue-700':   j.status === 'applied',
                  'bg-amber-100 text-amber-700': j.status === 'interview',
                  'bg-green-100 text-green-700': j.status === 'offer',
                  'bg-red-100 text-red-600':     j.status === 'rejected',
                })}>{j.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
