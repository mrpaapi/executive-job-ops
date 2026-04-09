import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfiles, getStories, generateStories, createStory, deleteStory } from '../utils/api'
import { Sparkles, Plus, Trash2, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function StoryCard({ story, onDelete }) {
  const [open, setOpen] = useState(false)
  const tags = story.tags || []
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen(v => !v)} className="flex-1 text-left">
          <p className="text-sm font-semibold text-slate-900">{story.title}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map(t => <span key={t} className="badge bg-brand-50 text-brand-700">{t}</span>)}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setOpen(v => !v)} className="p-1 text-slate-400 hover:text-slate-600">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={() => onDelete(story.id)} className="p-1 text-slate-300 hover:text-red-400">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {[
            { label: 'Situation', text: story.situation },
            { label: 'Task', text: story.task },
            { label: 'Action', text: story.action },
            { label: 'Result', text: story.result },
          ].map(({ label, text }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Prep() {
  const qc = useQueryClient()
  const [selectedProfile, setSelectedProfile] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', situation: '', task: '', action: '', result: '', tags: '' })

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: getProfiles })
  const { data: stories = [], isLoading } = useQuery({
    queryKey: ['stories', selectedProfile],
    queryFn: () => getStories(selectedProfile || undefined),
  })

  const generateMut = useMutation({
    mutationFn: () => generateStories(parseInt(selectedProfile)),
    onSuccess: (data) => {
      toast.success(`Generated ${data.length} STAR stories!`)
      qc.invalidateQueries({ queryKey: ['stories'] })
    },
    onError: () => toast.error('Generation failed. Check your API key.')
  })

  const createMut = useMutation({
    mutationFn: () => createStory({
      profile_id: parseInt(selectedProfile),
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast.success('Story saved')
      qc.invalidateQueries({ queryKey: ['stories'] })
      setShowForm(false)
      setForm({ title: '', situation: '', task: '', action: '', result: '', tags: '' })
    }
  })

  const deleteMut = useMutation({
    mutationFn: deleteStory,
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['stories'] }) }
  })

  if (profiles.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">No profiles yet. Go to <strong>Dashboard</strong> and drop a resume first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Interview prep</h1>
        <p className="text-slate-500 text-sm mt-1">STAR story bank — one per profile</p>
      </div>

      {/* Profile selector + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)} className="input w-auto">
          <option value="">All profiles</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {selectedProfile && (
          <>
            <button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}
              className="btn btn-primary">
              {generateMut.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                : <><Sparkles size={14} /> AI-generate stories</>}
            </button>
            <button onClick={() => setShowForm(v => !v)} className="btn btn-secondary">
              {showForm ? <X size={14} /> : <Plus size={14} />}
              {showForm ? 'Cancel' : 'Add manually'}
            </button>
          </>
        )}
      </div>

      {/* Manual add form */}
      {showForm && selectedProfile && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">New STAR story</h2>
          {[
            { key: 'title', label: 'Story title', placeholder: 'e.g. Led SRE team through major outage' },
            { key: 'situation', label: 'Situation', placeholder: 'Context and background…' },
            { key: 'task', label: 'Task', placeholder: 'What you were responsible for…' },
            { key: 'action', label: 'Action', placeholder: 'Specific steps you took…' },
            { key: 'result', label: 'Result', placeholder: 'Quantified outcome…' },
            { key: 'tags', label: 'Tags (comma separated)', placeholder: 'leadership, incident, scale' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              {key === 'title' || key === 'tags'
                ? <input className="input" placeholder={placeholder} value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                : <textarea className="input min-h-20 resize-y" placeholder={placeholder} value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              }
            </div>
          ))}
          <button onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.title}
            className="btn btn-primary">
            {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save story
          </button>
        </div>
      )}

      {/* Stories grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
      ) : stories.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm space-y-2">
          <p>No stories yet.</p>
          {selectedProfile
            ? <p>Click <strong>AI-generate stories</strong> to create them from your resume automatically.</p>
            : <p>Select a profile to get started.</p>
          }
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stories.map(s => (
            <StoryCard key={s.id} story={s} onDelete={(id) => deleteMut.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
