import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getResumes, createResume, updateResume, deleteResume, exportResumePdf } from '../utils/api'
import { useActiveProfile } from '../context/ActiveProfileContext'
import {
  Plus, X, Trash2, Download, Edit2, Loader2, AlertCircle, CheckCircle, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import LoadingMeme from '../components/LoadingMeme'
import PageHeader from '../components/PageHeader'

// ── Resume Editor Modal ────────────────────────────────────────────────────
function ResumeEditorModal({ resume, profileId, onClose, onSave }) {
  const [title, setTitle] = useState(resume?.title || '')
  const [summary, setSummary] = useState(resume?.summary || '')
  const [email, setEmail] = useState(resume?.email || '')
  const [phone, setPhone] = useState(resume?.phone || '')
  const [location, setLocation] = useState(resume?.location || '')
  const [website, setWebsite] = useState(resume?.website || '')
  const [skills, setSkills] = useState((resume?.skills || []).join(', '))
  const [saving, setSaving] = useState(false)

  const [experience, setExperience] = useState(resume?.experience || [])
  const [education, setEducation] = useState(resume?.education || [])

  async function handleSave() {
    if (!title.trim()) { toast.error('Resume title required'); return }
    if (!summary.trim()) { toast.error('Professional summary required'); return }

    setSaving(true)
    try {
      const data = {
        title,
        summary,
        email,
        phone,
        location,
        website,
        skills: skills.split(',').map(s => s.trim()).filter(s => s),
        experience: experience.map(e => ({
          title: e.title || '',
          company: e.company || '',
          dates: e.dates || '',
          description: e.description || ''
        })),
        education: education.map(e => ({
          school: e.school || '',
          degree: e.degree || '',
          field: e.field || '',
          dates: e.dates || ''
        }))
      }

      await onSave(data)
      toast.success(resume ? 'Resume updated' : 'Resume created')
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save resume')
    } finally {
      setSaving(false)
    }
  }

  const addExperience = () => {
    setExperience([...experience, { title: '', company: '', dates: '', description: '' }])
  }

  const removeExperience = (idx) => {
    setExperience(experience.filter((_, i) => i !== idx))
  }

  const updateExperience = (idx, field, value) => {
    const updated = [...experience]
    updated[idx][field] = value
    setExperience(updated)
  }

  const addEducation = () => {
    setEducation([...education, { school: '', degree: '', field: '', dates: '' }])
  }

  const removeEducation = (idx) => {
    setEducation(education.filter((_, i) => i !== idx))
  }

  const updateEducation = (idx, field, value) => {
    const updated = [...education]
    updated[idx][field] = value
    setEducation(updated)
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#1d1d1f]">{resume ? 'Edit Resume' : 'Create Resume'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
            <X size={18} />
          </button>
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-600 uppercase">Basic Information</h3>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resume Title</label>
            <input className="input" placeholder="e.g., Senior Director Resume" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Professional Summary</label>
            <textarea className="input min-h-20 resize-y" placeholder="2-3 sentences about your background and goals" value={summary} onChange={e => setSummary(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location</label>
              <input className="input" value={location} onChange={e => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Website/Portfolio</label>
              <input className="input" value={website} onChange={e => setWebsite(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Skills (comma-separated)</label>
            <textarea className="input min-h-16 resize-y text-xs" placeholder="e.g., Python, React, Cloud Architecture, Leadership" value={skills} onChange={e => setSkills(e.target.value)} />
          </div>
        </div>

        {/* Experience */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-600 uppercase">Experience</h3>
            <button onClick={addExperience} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
              <Plus size={12} className="inline mr-1" /> Add
            </button>
          </div>

          {experience.map((exp, idx) => (
            <div key={idx} className="p-3 border border-slate-200 rounded-lg space-y-2">
              <div className="flex gap-2">
                <input className="input flex-1 text-xs" placeholder="Job Title" value={exp.title} onChange={e => updateExperience(idx, 'title', e.target.value)} />
                <button onClick={() => removeExperience(idx)} className="p-1 text-slate-300 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
              <input className="input w-full text-xs" placeholder="Company" value={exp.company} onChange={e => updateExperience(idx, 'company', e.target.value)} />
              <input className="input w-full text-xs" placeholder="Dates (e.g., Jan 2020 - Dec 2023)" value={exp.dates} onChange={e => updateExperience(idx, 'dates', e.target.value)} />
              <textarea className="input w-full text-xs min-h-12 resize-y" placeholder="Description of achievements..." value={exp.description} onChange={e => updateExperience(idx, 'description', e.target.value)} />
            </div>
          ))}
        </div>

        {/* Education */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-600 uppercase">Education</h3>
            <button onClick={addEducation} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
              <Plus size={12} className="inline mr-1" /> Add
            </button>
          </div>

          {education.map((edu, idx) => (
            <div key={idx} className="p-3 border border-slate-200 rounded-lg space-y-2">
              <div className="flex gap-2">
                <input className="input flex-1 text-xs" placeholder="School/University" value={edu.school} onChange={e => updateEducation(idx, 'school', e.target.value)} />
                <button onClick={() => removeEducation(idx)} className="p-1 text-slate-300 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-xs" placeholder="Degree" value={edu.degree} onChange={e => updateEducation(idx, 'degree', e.target.value)} />
                <input className="input text-xs" placeholder="Field" value={edu.field} onChange={e => updateEducation(idx, 'field', e.target.value)} />
              </div>
              <input className="input w-full text-xs" placeholder="Dates" value={edu.dates} onChange={e => updateEducation(idx, 'dates', e.target.value)} />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : resume ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Resume Card ────────────────────────────────────────────────────────────
function ResumeCard({ resume, onEdit, onDelete, onExport }) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await onExport(resume.id)
      toast.success('PDF downloaded')
    } catch (e) {
      toast.error('Failed to export')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1d1d1f] truncate">{resume.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {resume.skills?.length > 0 ? resume.skills.slice(0, 3).join(', ') : 'No skills'}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-600 line-clamp-2">{resume.summary || 'No summary'}</p>

      <div className="flex gap-2">
        <button onClick={() => onEdit(resume)} className="btn btn-secondary py-1 text-xs flex-1">
          <Edit2 size={12} /> Edit
        </button>
        <button onClick={handleExport} disabled={exporting} className="btn btn-secondary py-1 text-xs flex-1">
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
        </button>
        <button onClick={() => onDelete(resume.id)} className="btn py-1 px-2 hover:bg-red-50 hover:text-red-600 text-slate-400 text-xs">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Resumes() {
  const { activeProfileId, activeProfile } = useActiveProfile()
  const qc = useQueryClient()
  const [editingResume, setEditingResume] = useState(null)
  const [showEditor, setShowEditor] = useState(false)

  const { data: resumes = [], isLoading, isError } = useQuery({
    queryKey: ['resumes', activeProfileId],
    queryFn: () => getResumes(activeProfileId),
    enabled: Boolean(activeProfileId),
  })

  const createMut = useMutation({
    mutationFn: (data) => createResume(activeProfileId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumes', activeProfileId] })
      setShowEditor(false)
      setEditingResume(null)
    },
  })

  const updateMut = useMutation({
    mutationFn: (data) => updateResume(editingResume.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumes', activeProfileId] })
      setShowEditor(false)
      setEditingResume(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteResume,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resumes', activeProfileId] })
      toast.success('Resume deleted')
    },
  })

  const exportMut = useMutation({
    mutationFn: async (resumeId) => {
      const blob = await exportResumePdf(resumeId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resume-${resumeId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    },
  })

  const handleSave = async (data) => {
    if (editingResume) {
      await updateMut.mutateAsync(data)
    } else {
      await createMut.mutateAsync(data)
    }
  }

  if (!activeProfileId) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Select a profile to manage resumes</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        compact
        eyebrow={activeProfile?.name ? `Profile · ${activeProfile.name}` : 'Resume Library'}
        title="Resume Studio"
        icon={<FileText size={16} />}
        right={
          <button onClick={() => { setEditingResume(null); setShowEditor(true) }} className="btn-fancy">
            <Plus size={15} /> New resume
          </button>
        }
      />

      {isLoading && <LoadingMeme label="Fetching résumés" />}

      {isError && (
        <div className="card p-4 bg-red-50 border border-red-200 space-y-2">
          <p className="text-sm font-semibold text-red-700">Error loading resumes</p>
          <p className="text-xs text-red-600">Check that your backend is running</p>
        </div>
      )}

      {resumes && resumes.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <AlertCircle size={32} className="mx-auto text-slate-300" />
          <p className="text-base font-bold text-[#1d1d1f]">No resumes yet</p>
          <p className="text-sm text-slate-500">Create your first resume to get started tailoring for jobs.</p>
          <button onClick={() => { setEditingResume(null); setShowEditor(true) }} className="btn btn-primary mx-auto">
            <Plus size={15} /> Create Resume
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {resumes.map(r => (
            <ResumeCard
              key={r.id}
              resume={r}
              onEdit={(resume) => { setEditingResume(resume); setShowEditor(true) }}
              onDelete={(id) => deleteMut.mutate(id)}
              onExport={(id) => exportMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {showEditor && (
        <ResumeEditorModal
          resume={editingResume}
          profileId={activeProfileId}
          onClose={() => { setShowEditor(false); setEditingResume(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
