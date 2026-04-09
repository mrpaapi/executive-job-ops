import { useQuery } from '@tanstack/react-query'
import { getSettings } from '../utils/api'
import { CheckCircle, XCircle, ExternalLink, Github } from 'lucide-react'

export default function Settings() {
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  if (isLoading) return <div className="text-slate-400 text-sm">Loading…</div>

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configuration and setup guide</p>
      </div>

      {/* API Key status */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">OpenAI API key</h2>

        <div className="flex items-center gap-2">
          {settings.has_api_key
            ? <><CheckCircle size={16} className="text-green-500" /><span className="text-sm text-green-700">API key is set and active</span></>
            : <><XCircle size={16} className="text-red-500" /><span className="text-sm text-red-700">No API key found</span></>
          }
        </div>

        {!settings.has_api_key && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 text-sm text-amber-900">
            <p className="font-medium">How to add your API key (3 steps, takes 2 minutes):</p>
            <ol className="list-decimal ml-4 space-y-2">
              <li>
                Go to{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                  className="text-brand-600 underline inline-flex items-center gap-1">
                  platform.openai.com/api-keys <ExternalLink size={11} />
                </a>{' '}
                and create a free account
              </li>
              <li>Click <strong>Create new secret key</strong> and copy it</li>
              <li>
                Open the file <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">.env</code> in the
                executive-job-ops folder and paste your key next to <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">OPENAI_API_KEY=</code>
              </li>
            </ol>
            <p className="text-amber-700 text-xs">Then restart the app with <code className="bg-amber-100 px-1 rounded">./start.sh</code> (Mac/Linux) or <code className="bg-amber-100 px-1 rounded">start.bat</code> (Windows).</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Model:</span>
          <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{settings.openai_model}</code>
          <span className="text-slate-400">· Change in <code className="bg-slate-100 px-1 rounded text-xs">.env</code></span>
        </div>
      </div>

      {/* Resume folder */}
      <div className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Resume folder</h2>
        <p className="text-sm text-slate-600">
          Drop PDF resumes into this folder and they auto-detect as profiles:
        </p>
        <code className="block bg-slate-100 px-4 py-3 rounded-xl text-sm font-mono text-slate-700">
          {settings.resume_folder}
        </code>
        <div className="text-sm text-slate-500 space-y-1">
          <p><strong>Naming rules:</strong></p>
          <ul className="ml-4 space-y-1 text-xs text-slate-500 list-disc">
            <li><code className="bg-slate-100 px-1 rounded">sre-leadership.pdf</code> → <strong>SRE Leadership</strong> profile</li>
            <li><code className="bg-slate-100 px-1 rounded">devops-leadership-v2.pdf</code> → <strong>Devops Leadership</strong> profile (v2 ignored)</li>
            <li><code className="bg-slate-100 px-1 rounded">jane-doe-general.pdf</code> → <strong>Jane Doe General</strong> profile</li>
          </ul>
        </div>
      </div>

      {/* Local LLM */}
      <div className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Run fully offline (optional)</h2>
        <p className="text-sm text-slate-500">
          You can run executive-job-ops without OpenAI using a local model like{' '}
          <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-brand-600 underline">Ollama</a>.
          Your data never leaves your machine.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs space-y-1 text-slate-700">
          <p className="text-slate-400"># Install Ollama, then pull a model</p>
          <p>ollama pull llama3</p>
          <p className="text-slate-400 mt-2"># In your .env file:</p>
          <p>LOCAL_LLM_URL=http://localhost:11434/v1</p>
          <p>LOCAL_LLM_MODEL=llama3</p>
        </div>
        {settings.use_local_llm && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle size={14} />
            Running with local LLM: <code className="bg-green-50 px-1.5 rounded">{settings.local_llm_url}</code>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">About</h2>
        <p className="text-sm text-slate-600">
          <strong>executive-job-ops</strong> is free and open source, built to help everyone find a job —
          regardless of technical background. Created by{' '}
          <a href="https://github.com/mrpaapi" target="_blank" rel="noreferrer" className="text-brand-600 underline">mrpaapi</a>.
        </p>
        <div className="flex gap-3">
          <a href="https://github.com/mrpaapi/executive-job-ops" target="_blank" rel="noreferrer"
            className="btn btn-secondary text-xs">
            <Github size={13} /> Star on GitHub
          </a>
          <a href="https://github.com/mrpaapi/executive-job-ops/issues" target="_blank" rel="noreferrer"
            className="btn btn-secondary text-xs">
            <ExternalLink size={13} /> Report an issue
          </a>
        </div>
      </div>
    </div>
  )
}
