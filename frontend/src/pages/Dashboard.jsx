import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { Link } from 'react-router-dom'
import { getProfiles, getJobs, uploadResume, deleteProfile, retryProfileProcessing } from '../utils/api'
import { useActiveProfile } from '../context/ActiveProfileContext'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  TrendingUp,
  Upload,
  XCircle,
  LayoutDashboard,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import LoadingMeme from '../components/LoadingMeme'
import PageHeader from '../components/PageHeader'

const PIPELINE_STEPS = ['queued', 'extracting_text', 'sending_to_llm', 'classifying', 'done']

function StatCard({ label, value, icon: Icon, color, iconColor, to }) {
  const body = (
    <>
      <div className={clsx('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
      </div>
    </>
  )
  const className = clsx(
    'card p-5 flex items-center gap-4 transition-all duration-200',
    to
      ? 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 hover:border-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300'
      : 'hover:shadow-card-hover'
  )
  if (to) {
    return <Link to={to} className={className} aria-label={`${label}: ${value}`}>{body}</Link>
  }
  return <div className={className}>{body}</div>
}

function ScoreBadge({ score }) {
  const color = score >= 75 ? 'bg-green-100 text-green-700'
    : score >= 50 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600'

  return <span className={clsx('score-ring text-xs', color)}>{Math.round(score)}%</span>
}

function formatPipelineStep(step) {
  return step.replaceAll('_', ' ')
}

function ProfilePipeline({ profile, onRetry, retrying }) {
  const activeStepIndex = PIPELINE_STEPS.indexOf(profile.processing_status)

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {profile.processing_status === 'failed'
            ? <XCircle size={14} className="text-red-500" />
            : profile.processing_status === 'done'
              ? <CheckCircle size={14} className="text-green-600" />
              : <Loader2 size={14} className="animate-spin text-brand-600" />}
          <p className="text-xs font-medium text-slate-700">
            {profile.processing_status === 'failed'
              ? 'Processing failed'
              : `Pipeline: ${formatPipelineStep(profile.processing_status || 'queued')}`}
          </p>
        </div>
        {profile.processing_provider && (
          <span className="badge bg-slate-100 text-slate-600">{profile.processing_provider}</span>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {PIPELINE_STEPS.map((step, index) => {
          const isDone = profile.processing_status === 'done' || (activeStepIndex >= 0 && index <= activeStepIndex)
          const isCurrent = profile.processing_status === step

          return (
            <div
              key={step}
              className={clsx(
                'rounded-lg border px-2 py-2 text-xs capitalize',
                isCurrent
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : isDone
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
              )}
            >
              {formatPipelineStep(step)}
            </div>
          )
        })}
      </div>

      {profile.processing_status === 'failed' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{profile.processing_error || 'Unknown processing error'}</span>
          <button onClick={onRetry} disabled={retrying} className="btn btn-secondary py-1 text-xs">
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  const { activeProfileId, activeProfile } = useActiveProfile()
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    refetchInterval: (query) => {
      const profilesData = query.state.data || []
      return profilesData.some((profile) => !['done', 'failed'].includes(profile.processing_status))
        ? 3000
        : false
    },
    refetchOnWindowFocus: false,
  })
  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs', activeProfileId],
    queryFn: () => getJobs(activeProfileId),
    enabled: Boolean(activeProfileId),
  })

  const uploadMut = useMutation({
    mutationFn: uploadResume,
    onSuccess: (data) => {
      toast.success(data.message)
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Upload failed. Use a PDF or Word (.docx) file.'),
  })

  const retryMut = useMutation({
    mutationFn: retryProfileProcessing,
    onSuccess: () => {
      toast.success('Resume processing restarted')
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not retry profile processing'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      toast.success('Profile removed')
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    onDrop: (files) => files.forEach((file) => uploadMut.mutate(file)),
    multiple: true,
  })

  const applied = jobs.filter((job) => job.status === 'applied').length
  const interviews = jobs.filter((job) => job.status === 'interview').length
  const offers = jobs.filter((job) => job.status === 'offer').length

  // Under-applying nudge: if the user has applied to fewer than 5 jobs in the
  // last 7 days, surface a friendly prompt. The career-ops research showed that
  // most rejections happen because volume is too low, not because resumes are
  // bad — so a soft nudge here is high-leverage and low-cost.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentApplications = jobs.filter(j => {
    if (j.status !== 'applied' && j.status !== 'interview' && j.status !== 'offer') return false
    const ts = j.applied_at ? new Date(j.applied_at).getTime() : 0
    return ts >= sevenDaysAgo
  }).length
  const underApplying = activeProfile && recentApplications < 5

  return (
    <div className="space-y-8">
      <PageHeader
        compact
        eyebrow={activeProfile ? `Profile · ${activeProfile.name}` : 'Welcome aboard'}
        title="Mission Control"
        icon={<LayoutDashboard size={16} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard to="/resumes" label="Profiles"     value={profiles.length} icon={FileText}    color="bg-indigo-50"  iconColor="text-indigo-500" />
        <StatCard to="/jobs"    label="Applications" value={applied}         icon={Clock}       color="bg-sky-50"     iconColor="text-sky-500"    />
        <StatCard to="/jobs"    label="Interviews"   value={interviews}      icon={TrendingUp}  color="bg-amber-50"   iconColor="text-amber-500"  />
        <StatCard to="/jobs"    label="Offers"       value={offers}          icon={CheckCircle} color="bg-emerald-50" iconColor="text-emerald-500" />
      </div>

      {underApplying && (
        <Link
          to="/jobs"
          className="card p-4 flex items-start gap-3 border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
          aria-label="You're under-applying. Open Jobs to add more."
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              You've only applied to {recentApplications} job{recentApplications !== 1 ? 's' : ''} this week
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Most rejections come from low volume, not weak resumes. Aim for 5–10 thoughtful applications per week.
              Open <strong>Jobs → Discover</strong> or batch-paste a few URLs to top up the pipeline.
            </p>
          </div>
        </Link>
      )}

      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Your Resume Profiles</h2>
        <p className="text-sm text-slate-500 mb-4">
          Drop PDF or Word (.docx) résumés here. Each file becomes a profile and now shows its live processing pipeline.
        </p>

        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload size={24} className={clsx('mx-auto mb-2', isDragActive ? 'text-brand-500' : 'text-slate-400')} />
          {uploadMut.isPending
            ? <p className="text-sm text-brand-600 font-medium">Uploading résumé and queueing processing...</p>
            : isDragActive
              ? <p className="text-sm text-brand-600 font-medium">Drop to create profile</p>
              : <p className="text-sm text-slate-500">Drag and drop PDF or Word (.docx) résumés, or <span className="text-brand-600 font-medium">click to browse</span></p>}
        </div>

        {loadingProfiles ? (
          <div className="mt-4"><LoadingMeme label="Loading profiles" compact /></div>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-slate-400 mt-4 text-center">No profiles yet. Drop a resume above to get started.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-brand-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900">{profile.name}</p>
                    <span className="badge bg-brand-50 text-brand-700">{profile.role_family}</span>
                    {profile.years_experience > 0 && (
                      <span className="text-xs text-slate-400">{profile.years_experience}y exp</span>
                    )}
                  </div>

                  {profile.processing_status !== 'done' || profile.processing_error ? (
                    <ProfilePipeline
                      profile={profile}
                      onRetry={() => retryMut.mutate(profile.id)}
                      retrying={retryMut.isPending && retryMut.variables === profile.id}
                    />
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{profile.summary || 'Profile ready'}</p>
                      {profile.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {profile.skills.slice(0, 6).map((skill) => (
                            <span key={skill} className="badge bg-slate-100 text-slate-600">{skill}</span>
                          ))}
                          {profile.skills.length > 6 && (
                            <span className="badge bg-slate-100 text-slate-400">+{profile.skills.length - 6}</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={() => deleteMut.mutate(profile.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recent jobs</h2>
            <p className="text-xs text-slate-500">
              {activeProfile ? `Filtered to ${activeProfile.name}` : 'Select a profile to see recent jobs'}
            </p>
          </div>
          {jobs.length === 0 && activeProfile && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <AlertCircle size={12} />
              No jobs tracked for this profile yet
            </div>
          )}
        </div>

        {jobs.length > 0 ? (
          <div className="space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <ScoreBadge score={job.match_score} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{job.title}</p>
                  <p className="text-xs text-slate-500">{job.company}</p>
                </div>
                <span className={clsx('badge', {
                  'bg-slate-100 text-slate-600': job.status === 'saved',
                  'bg-blue-100 text-blue-700': job.status === 'applied',
                  'bg-amber-100 text-amber-700': job.status === 'interview',
                  'bg-green-100 text-green-700': job.status === 'offer',
                  'bg-red-100 text-red-600': job.status === 'rejected',
                })}>{job.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-slate-400">
            No recent jobs for the active profile yet.
          </div>
        )}
      </div>
    </div>
  )
}
