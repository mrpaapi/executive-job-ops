import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, testConnection } from '../utils/api'
import api from '../utils/api'
import {
  CheckCircle, XCircle, ExternalLink, Eye, EyeOff,
  Loader2, Save, Cloud, Monitor, Zap, Github, Settings as SettingsIcon,
  Key, Cpu, Globe, Mail, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import LoadingMeme from '../components/LoadingMeme'
import PageHeader from '../components/PageHeader'

// ── Constants ────────────────────────────────────────────────────────────────

const OPENAI_MODELS = [
  { value: 'gpt-4o-mini',  label: 'GPT-4o mini — fastest, cheapest (recommended)' },
  { value: 'gpt-4o',       label: 'GPT-4o — most capable' },
  { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
]

const GEMINI_MODELS = [
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash — fastest (recommended)' },
  { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro — most accurate' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — newest' },
]

const PROVIDERS = [
  {
    id: 'openai',
    icon: Cloud,
    title: 'OpenAI',
    subtitle: 'GPT-4o · needs API key',
  },
  {
    id: 'openrouter',
    icon: Globe,
    title: 'OpenRouter',
    subtitle: 'Multi-model · needs API key',
  },
  {
    id: 'gemini',
    icon: Zap,
    title: 'Gemini',
    subtitle: 'Google AI · free tier available',
  },
  {
    id: 'local',
    icon: Cpu,
    title: 'Local LLM',
    subtitle: 'Ollama · LM Studio · private',
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function ProviderButton({ id, icon: Icon, title, subtitle, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={clsx(
        'flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center cursor-pointer',
        selected
          ? 'border-[#1428a0] bg-blue-50'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      )}
    >
      <div className={clsx(
        'w-9 h-9 rounded-xl flex items-center justify-center',
        selected ? 'bg-blue-100 text-[#1428a0]' : 'bg-slate-100 text-slate-500'
      )}>
        <Icon size={18} />
      </div>
      <div>
        <p className={clsx('text-sm font-semibold', selected ? 'text-[#1428a0]' : 'text-slate-700')}>
          {title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-tight">{subtitle}</p>
      </div>
      {selected && (
        <span className="text-xs bg-[#1428a0] text-white px-2.5 py-0.5 rounded-full">
          Active
        </span>
      )}
    </button>
  )
}

function MaskedInput({ value, onChange, placeholder, label, hint, className }) {
  const [show, setShow] = useState(false)
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      )}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input pr-10"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function SectionHeader({ title, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function ConfiguredBadge({ configured }) {
  return configured ? (
    <span className="badge bg-green-100 text-green-700 gap-1">
      <CheckCircle size={11} /> Configured
    </span>
  ) : (
    <span className="badge bg-slate-100 text-slate-500 gap-1">
      <XCircle size={11} /> Not configured
    </span>
  )
}

function CollapsibleCard({ title, description, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {badge}
          <span className={clsx('text-slate-400 transition-transform', open ? 'rotate-180' : '')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-slate-100 pt-5 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient()

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    retry: 2,
  })

  // ── Form state ──────────────────────────────────────────────────────────────
  const [provider, setProvider]               = useState('local')
  const [initialised, setInitialised]         = useState(false)

  // OpenAI
  const [openaiKey, setOpenaiKey]             = useState('')
  const [openaiModel, setOpenaiModel]         = useState('gpt-4o-mini')

  // OpenRouter
  const [openrouterKey, setOpenrouterKey]     = useState('')
  const [openrouterModel, setOpenrouterModel] = useState('openai/gpt-4o-mini')

  // Gemini
  const [geminiKey, setGeminiKey]             = useState('')
  const [geminiModel, setGeminiModel]         = useState('gemini-1.5-flash')

  // Local LLM
  const [localUrl, setLocalUrl]               = useState('http://localhost:11434/v1')
  const [localModel, setLocalModel]           = useState('llama3')

  // RxResume
  const [rxUrl, setRxUrl]                     = useState('')
  const [rxToken, setRxToken]                 = useState('')

  // Test result
  const [testResult, setTestResult]           = useState(null)

  // ── Load from localStorage on mount ────────────────────────────────────────
  // First load will use defaults (local Ollama), then save to localStorage for persistence
  useEffect(() => {
    const cached = localStorage.getItem('settings_cache')
    if (cached) {
      try {
        const { provider: p, models } = JSON.parse(cached)
        if (p) setProvider(p)
        if (models) {
          if (models.openai) setOpenaiModel(models.openai)
          if (models.openrouter) setOpenrouterModel(models.openrouter)
          if (models.gemini) setGeminiModel(models.gemini)
          if (models.localUrl) setLocalUrl(models.localUrl)
          if (models.localModel) setLocalModel(models.localModel)
          if (models.rxUrl) setRxUrl(models.rxUrl)
        }
      } catch (e) {
        // Ignore cache errors, will use defaults
      }
    }
    // On first load with no cache, default settings are already set (local Ollama)
    // and will be saved to localStorage by the settings save effect
  }, [])

  // ── Sync settings → form (once) ────────────────────────────────────────────
  useEffect(() => {
    if (settings && !initialised) {
      setProvider(settings.active_provider || 'openai')
      if (settings.openai_model)      setOpenaiModel(settings.openai_model)
      if (settings.openrouter_model)  setOpenrouterModel(settings.openrouter_model)
      if (settings.gemini_model)      setGeminiModel(settings.gemini_model)
      if (settings.local_llm_url)     setLocalUrl(settings.local_llm_url)
      if (settings.local_llm_model)   setLocalModel(settings.local_llm_model)
      if (settings.rxresume_url)      setRxUrl(settings.rxresume_url)
      setInitialised(true)
    }
  }, [settings, initialised])

  // ── Save to localStorage ───────────────────────────────────────────────────
  useEffect(() => {
    const cache = {
      provider,
      models: { openai: openaiModel, openrouter: openrouterModel, gemini: geminiModel, localUrl, localModel, rxUrl }
    }
    localStorage.setItem('settings_cache', JSON.stringify(cache))
  }, [provider, openaiModel, openrouterModel, geminiModel, localUrl, localModel, rxUrl])

  // ── Test mutation ───────────────────────────────────────────────────────────
  const testMut = useMutation({
    mutationFn: async () => {
      const result = await testConnection()
      return { ...result, provider }
    },
    onSuccess: data => {
      if (data.ok) {
        const msg = provider === 'local'
          ? `✓ Connected to Ollama (${data.model})`
          : `✓ Connected to ${provider} (${data.model})`
        setTestResult({ ...data, message: msg })
      } else {
        const msg = provider === 'local'
          ? `✗ Could not reach Ollama at ${localUrl}. Is it running? Try: ollama serve`
          : `✗ ${data.error || 'Connection failed'}`
        setTestResult({ ...data, message: msg })
      }
    },
    onError: () => {
      const msg = provider === 'local'
        ? `✗ Could not reach Ollama at ${localUrl}. Make sure Ollama is running (ollama serve)`
        : `✗ Could not reach backend. Is the server running?`
      setTestResult({ ok: false, error: msg })
    },
  })

  // ── Save mutation ───────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        provider,
        openai_api_key:    openaiKey,
        openai_model:      openaiModel,
        openrouter_api_key: openrouterKey,
        openrouter_model:  openrouterModel,
        gemini_api_key:    geminiKey,
        gemini_model:      geminiModel,
        local_llm_url:     localUrl,
        local_llm_model:   localModel,
        rxresume_url:      rxUrl,
        rxresume_token:    rxToken,
      }
      return api.post('/settings/api-key', body).then(r => r.data)
    },
    onSuccess: data => {
      toast.success(data.message || 'Settings saved')
      setOpenaiKey('')
      setOpenrouterKey('')
      setGeminiKey('')
      setRxToken('')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: e => toast.error(e?.response?.data?.detail || 'Failed to save settings'),
  })

  // ── Derived state ───────────────────────────────────────────────────────────
  const isConfigured = (() => {
    if (!settings) return false
    if (provider === 'openai')      return settings.has_api_key
    if (provider === 'openrouter')  return settings.has_openrouter
    if (provider === 'gemini')      return settings.has_gemini
    if (provider === 'local')       return !!settings.local_llm_url
    return false
  })()

  const activeProviderLabel = (() => {
    const p = settings?.active_provider || provider
    if (p === 'openai')     return `OpenAI · ${settings?.openai_model || openaiModel}`
    if (p === 'openrouter') return `OpenRouter · ${settings?.openrouter_model || openrouterModel}`
    if (p === 'gemini')     return `Gemini · ${settings?.gemini_model || geminiModel}`
    if (p === 'local')      return `Local LLM · ${settings?.local_llm_model || localModel}`
    return p
  })()

  // ── Loading / error states ──────────────────────────────────────────────────
  if (isLoading) {
    return <div className="py-8"><LoadingMeme label="Loading settings" /></div>
  }

  if (isError || !settings) {
    return (
      <div className="card p-6 text-center space-y-3 max-w-md">
        <XCircle size={24} className="text-red-400 mx-auto" />
        <p className="text-sm font-medium text-slate-700">Could not load settings</p>
        <p className="text-xs text-slate-500">
          The backend may not be running. Check the backend terminal window is open,
          then refresh.
        </p>
        <button
          className="btn btn-secondary mx-auto"
          onClick={() => qc.invalidateQueries({ queryKey: ['settings'] })}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        compact
        eyebrow="Configuration"
        title="Control Panel"
        icon={<SettingsIcon size={16} />}
      />

      {/* ── Status banner ────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-medium',
        isConfigured
          ? 'bg-green-50 border border-green-200 text-green-800'
          : 'bg-amber-50 border border-amber-200 text-amber-800'
      )}>
        {isConfigured ? (
          <>
            <CheckCircle size={15} className="shrink-0" />
            AI is active — using {activeProviderLabel}
          </>
        ) : (
          <>
            <XCircle size={15} className="shrink-0" />
            No AI provider configured — choose one below and save
          </>
        )}
      </div>

      {/* ── Test connection ───────────────────────────────────────────────── */}
      <div className="card p-5 space-y-3">
        <SectionHeader
          title="Test connection"
          description="Verify the AI provider responds correctly"
        >
          <button
            type="button"
            onClick={() => { setTestResult(null); testMut.mutate() }}
            disabled={testMut.isPending || !isConfigured}
            className="btn btn-secondary"
          >
            {testMut.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Testing…</>
              : <><Zap size={14} /> Test now</>}
          </button>
        </SectionHeader>

        {testMut.isPending && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
            <Loader2 size={12} className="animate-spin text-[#1428a0]" />
            Sending a test message to {activeProviderLabel}…
          </div>
        )}

        {testResult && (
          <div className={clsx(
            'rounded-xl px-4 py-3 text-sm space-y-1',
            testResult.ok
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          )}>
            <div className="flex items-center gap-2 font-medium">
              {testResult.ok ? (
                <>
                  <CheckCircle size={14} className="text-green-600 shrink-0" />
                  <span className="text-green-800">
                    Connected — {testResult.provider} responded in {testResult.latency_ms}ms
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={14} className="text-red-500 shrink-0" />
                  <span className="text-red-700">Connection failed</span>
                </>
              )}
            </div>
            {testResult.ok && testResult.response && (
              <p className="text-xs text-green-700">
                Model reply: <em>{testResult.response}</em>
              </p>
            )}
            {!testResult.ok && testResult.error && (
              <p className="text-xs text-red-600 break-words">{testResult.error}</p>
            )}
            {!testResult.ok && provider === 'local' && (
              <p className="text-xs text-red-600">
                Make sure Ollama is running:{' '}
                <code className="bg-red-100 px-1 rounded">ollama serve</code>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── AI Provider card ──────────────────────────────────────────────── */}
      <div className="card p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-0.5">AI Provider</h2>
          <p className="text-xs text-slate-500">Choose how you want the AI features to work</p>
        </div>

        {/* Provider selector — 2×2 grid on small, 4 cols on wider */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PROVIDERS.map(p => (
            <ProviderButton
              key={p.id}
              {...p}
              selected={provider === p.id}
              onClick={setProvider}
            />
          ))}
        </div>

        {/* ── OpenAI fields ── */}
        {provider === 'openai' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-2">
              <p className="font-medium">Get an API key in 2 minutes:</p>
              <ol className="list-decimal ml-4 space-y-1 text-blue-800 text-xs">
                <li>
                  Visit{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                    className="underline font-medium inline-flex items-center gap-1">
                    platform.openai.com/api-keys <ExternalLink size={11} />
                  </a>
                </li>
                <li>Sign up free → click <strong>Create new secret key</strong></li>
                <li>Copy it and paste below. Light usage costs under $1/month.</li>
              </ol>
            </div>

            <MaskedInput
              label={
                <span>
                  API key
                  {settings.has_api_key && settings.active_provider === 'openai' && (
                    <span className="text-green-600 ml-1 font-normal">(active — leave blank to keep current)</span>
                  )}
                </span>
              }
              value={openaiKey}
              onChange={setOpenaiKey}
              placeholder="sk-..."
            />
            {openaiKey && !openaiKey.startsWith('sk-') && (
              <p className="text-xs text-red-500 -mt-3">OpenAI keys start with sk-</p>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
              <select className="input" value={openaiModel} onChange={e => setOpenaiModel(e.target.value)}>
                {OPENAI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── OpenRouter fields ── */}
        {provider === 'openrouter' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-900 space-y-2">
              <p className="font-medium">OpenRouter routes to 200+ models via one API key:</p>
              <p className="text-xs text-purple-800">
                Create a free key at{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
                  className="underline font-medium inline-flex items-center gap-1">
                  openrouter.ai/keys <ExternalLink size={11} />
                </a>
                . Use any model name from their catalog, e.g.{' '}
                <code className="bg-purple-100 px-1 rounded">openai/gpt-4o-mini</code> or{' '}
                <code className="bg-purple-100 px-1 rounded">anthropic/claude-3-haiku</code>.
              </p>
            </div>

            <MaskedInput
              label={
                <span>
                  API key
                  {settings.has_openrouter && settings.active_provider === 'openrouter' && (
                    <span className="text-green-600 ml-1 font-normal">(active — leave blank to keep current)</span>
                  )}
                </span>
              }
              value={openrouterKey}
              onChange={setOpenrouterKey}
              placeholder="sk-or-..."
            />

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
              <input
                className="input"
                value={openrouterModel}
                onChange={e => setOpenrouterModel(e.target.value)}
                placeholder="openai/gpt-4o-mini"
              />
              <p className="text-xs text-slate-400 mt-1">
                Any model from{' '}
                <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer"
                  className="text-[#1428a0] underline inline-flex items-center gap-0.5">
                  openrouter.ai/models <ExternalLink size={10} />
                </a>
              </p>
            </div>
          </div>
        )}

        {/* ── Gemini fields ── */}
        {provider === 'gemini' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm text-orange-900 space-y-2">
              <p className="font-medium">Google Gemini has a generous free tier:</p>
              <p className="text-xs text-orange-800">
                Get a free key at{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                  className="underline font-medium inline-flex items-center gap-1">
                  aistudio.google.com/app/apikey <ExternalLink size={11} />
                </a>
                . No credit card required for the free tier.
              </p>
            </div>

            <MaskedInput
              label={
                <span>
                  API key
                  {settings.has_gemini && settings.active_provider === 'gemini' && (
                    <span className="text-green-600 ml-1 font-normal">(active — leave blank to keep current)</span>
                  )}
                </span>
              }
              value={geminiKey}
              onChange={setGeminiKey}
              placeholder="AIza..."
            />

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
              <select className="input" value={geminiModel} onChange={e => setGeminiModel(e.target.value)}>
                {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Local LLM fields ── */}
        {provider === 'local' && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-800 space-y-3">
              <p className="font-medium">Supports Ollama and LM Studio — nothing leaves your machine:</p>
              <div className="space-y-2 text-xs text-slate-700">
                <div>
                  <p className="font-medium text-slate-800">Ollama (recommended):</p>
                  <ol className="list-decimal ml-4 space-y-1 mt-1">
                    <li>
                      Download from{' '}
                      <a href="https://ollama.com" target="_blank" rel="noreferrer"
                        className="text-[#1428a0] underline inline-flex items-center gap-0.5">
                        ollama.com <ExternalLink size={10} />
                      </a>
                    </li>
                    <li>
                      Pull a model:{' '}
                      <code className="bg-slate-200 px-1 rounded">ollama pull llama3</code>
                    </li>
                    <li>URL stays as default below</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-slate-800">LM Studio:</p>
                  <ol className="list-decimal ml-4 space-y-1 mt-1">
                    <li>Start the local server in LM Studio</li>
                    <li>
                      Change URL to{' '}
                      <code className="bg-slate-200 px-1 rounded">http://localhost:1234/v1</code>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Server URL</label>
              <input
                className="input"
                value={localUrl}
                onChange={e => setLocalUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
              <p className="text-xs text-slate-400 mt-1">
                Ollama default: <code className="bg-slate-100 px-1 rounded">http://localhost:11434/v1</code>
                {' · '}
                LM Studio: <code className="bg-slate-100 px-1 rounded">http://localhost:1234/v1</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Model name</label>
              <input
                className="input"
                value={localModel}
                onChange={e => setLocalModel(e.target.value)}
                placeholder="llama3"
              />
              <p className="text-xs text-slate-400 mt-1">
                Must match exactly what you see in{' '}
                <code className="bg-slate-100 px-1 rounded">ollama list</code>
              </p>
            </div>
          </div>
        )}

        {/* Save button */}
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="btn btn-primary w-full justify-center"
        >
          {saveMut.isPending
            ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
            : <><Save size={15} /> Save settings — no restart needed</>}
        </button>
      </div>

      {/* ── RxResume collapsible ──────────────────────────────────────────── */}
      <CollapsibleCard
        title="RxResume"
        description="Auto-tailor your resume for each job application"
        badge={<ConfiguredBadge configured={settings.rxresume_configured} />}
        defaultOpen={settings.rxresume_configured}
      >
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
          <p className="font-medium text-slate-800 text-sm">Run RxResume locally (one-time setup):</p>
          <code className="block bg-slate-200 text-slate-800 rounded-lg px-3 py-2 font-mono leading-relaxed whitespace-pre-wrap">
            {'docker run -p 3050:3000 amruthpillai/reactive-resume'}
          </code>
          <p>
            Then open{' '}
            <a href="http://localhost:3050" target="_blank" rel="noreferrer"
              className="text-[#1428a0] underline inline-flex items-center gap-0.5">
              localhost:3050 <ExternalLink size={10} />
            </a>
            {', '}create an account, generate an API token in Settings, and paste it below.
          </p>
          <a
            href="https://github.com/AmruthPillai/Reactive-Resume"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#1428a0] underline"
          >
            <Github size={11} /> AmruthPillai/Reactive-Resume
          </a>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">RxResume URL</label>
          <input
            className="input"
            value={rxUrl}
            onChange={e => setRxUrl(e.target.value)}
            placeholder="http://localhost:3050"
          />
        </div>

        <MaskedInput
          label="API token"
          value={rxToken}
          onChange={setRxToken}
          placeholder="Paste your RxResume token"
          hint={settings.rxresume_configured ? 'Leave blank to keep existing token' : undefined}
        />

        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="btn btn-primary w-full justify-center"
        >
          {saveMut.isPending
            ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
            : <><Save size={15} /> Save RxResume settings</>}
        </button>
      </CollapsibleCard>

      {/* ── Gmail collapsible ─────────────────────────────────────────────── */}
      <CollapsibleCard
        title="Gmail"
        description="Send follow-up emails and cover letters from the app"
        badge={<ConfiguredBadge configured={settings.gmail_configured} />}
        defaultOpen={false}
      >
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 space-y-3">
          <p className="font-medium text-sm text-blue-900">Set up Gmail OAuth (one-time):</p>
          <ol className="list-decimal ml-4 space-y-1.5 text-blue-800">
            <li>
              Go to the{' '}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer"
                className="underline font-medium inline-flex items-center gap-0.5">
                Google Cloud Console <ExternalLink size={10} />
              </a>
            </li>
            <li>Create a project → enable the <strong>Gmail API</strong></li>
            <li>
              Go to <strong>Credentials</strong> → <strong>OAuth 2.0 Client ID</strong> → Desktop App
            </li>
            <li>Download the JSON and save it as:</li>
          </ol>
          <code className="block bg-blue-100 text-blue-900 rounded-lg px-3 py-2 font-mono">
            backend/gmail_credentials.json
          </code>
          <p>
            Then restart the backend — it will open a browser window to complete authorization
            on first use. See the project README for the full walkthrough.
          </p>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
          <Mail size={16} className={settings.gmail_configured ? 'text-green-600' : 'text-slate-400'} />
          <div>
            <p className="text-xs font-medium text-slate-700">
              {settings.gmail_configured ? 'Gmail credentials found and authorized' : 'gmail_credentials.json not found'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Expected path: <code className="bg-slate-200 px-1 rounded">backend/gmail_credentials.json</code>
            </p>
          </div>
        </div>
      </CollapsibleCard>

      {/* ── Current config table ──────────────────────────────────────────── */}
      <div className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Current configuration</h2>
        <div className="divide-y divide-slate-50 text-sm">
          {[
            ['Active provider',   settings.active_provider || '—'],
            ['OpenAI model',      settings.has_api_key ? settings.openai_model : '—'],
            ['OpenRouter model',  settings.has_openrouter ? settings.openrouter_model : '—'],
            ['Gemini model',      settings.has_gemini ? settings.gemini_model : '—'],
            ['Local LLM model',   settings.use_local_llm ? (settings.local_llm_model || '—') : '—'],
            ['Resume folder',     settings.resume_folder],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-2.5">
              <span className="text-slate-500 text-xs">{label}</span>
              <code className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-700 max-w-[60%] truncate">
                {value}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* ── About card ───────────────────────────────────────────────────── */}
      <div className="card p-6 space-y-4 text-center">
        <h2 className="text-base font-bold text-[#1d1d1f]">About this project</h2>
        <p className="text-sm text-slate-600">
          <strong>executive-job-ops</strong> is free and open source — built to help everyone land their next role.
        </p>
        <div className="flex justify-center">
          <a href="https://github.com/srinathsankara"
             target="_blank" rel="noreferrer"
             className="gh-chip">
            <Github size={14} />
            Built by Srinath Sankara · @srinathsankara
          </a>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          <a
            href="https://github.com/srinathsankara/executive-job-ops"
            target="_blank"
            rel="noreferrer"
            className="btn-fancy text-xs"
          >
            <Github size={13} /> Star on GitHub
          </a>
          <a
            href="https://github.com/srinathsankara/executive-job-ops/issues"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary text-xs"
          >
            <ExternalLink size={13} /> Report an issue
          </a>
        </div>
      </div>

    </div>
  )
}
