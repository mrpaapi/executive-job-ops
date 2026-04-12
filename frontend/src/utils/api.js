import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min — LLM calls can be slow, especially Ollama
})

// When responseType: 'blob' is used, error responses also come back as a Blob,
// so the JSON {detail: "..."} from FastAPI is hidden and the UI can't show it.
// This interceptor decodes blob errors back into a normal JSON object so
// `e.response.data.detail` works the same as for regular requests.
api.interceptors.response.use(
  r => r,
  async err => {
    const data = err?.response?.data
    if (data instanceof Blob) {
      try {
        const text = await data.text()
        try { err.response.data = JSON.parse(text) }
        catch { err.response.data = { detail: text || err.message } }
      } catch { /* leave as-is */ }
    }
    return Promise.reject(err)
  }
)

// Profiles
export const getProfiles = () => api.get('/profiles/').then(r => r.data)
export const uploadResume = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/profiles/upload', fd).then(r => r.data)
}
export const deleteProfile = (id) => api.delete(`/profiles/${id}`).then(r => r.data)
export const retryProfileProcessing = (id) => api.post(`/profiles/${id}/retry`).then(r => r.data)

// Jobs
export const getJobs = (profileId) =>
  api.get('/jobs/', { params: profileId ? { profileId } : {} }).then(r => r.data)

export const analyzeJob = (profileId, url, description) =>
  api.post('/jobs/analyze', { profile_id: profileId, url, description }).then(r => r.data)

export const addJob = (profileId, url, description) =>
  api.post('/jobs/', { profile_id: profileId, url, description }).then(r => r.data)

export const updateJobStatus = (jobId, status, notes) =>
  api.patch(`/jobs/${jobId}/status`, { status, notes }).then(r => r.data)

export const getCoverLetter = (jobId) =>
  api.post(`/jobs/${jobId}/cover-letter`).then(r => r.data)

export const getInterviewQuestions = (jobId) =>
  api.get(`/jobs/${jobId}/questions`).then(r => r.data)

export const deleteJob = (jobId) => api.delete(`/jobs/${jobId}`).then(r => r.data)

export const getNegotiationBrief = (jobId) =>
  api.post(`/jobs/${jobId}/negotiate`).then(r => r.data)

export const getCompanyResearch = (jobId) =>
  api.post(`/jobs/${jobId}/research`).then(r => r.data)

export const getOutreachMessages = (jobId) =>
  api.post(`/jobs/${jobId}/outreach`).then(r => r.data)

export const batchAddJobs = (profileId, urls) =>
  api.post('/jobs/batch-add', { profile_id: profileId, urls }, { timeout: 10 * 60 * 1000 })
    .then(r => r.data)

export const generateStoriesFromJob = (jobId, count = 2) =>
  api.post('/prep/stories/from-job', { job_id: jobId, count }).then(r => r.data)

export const analyzeSkillGaps = (jobId, resumeId) =>
  api.post(`/jobs/${jobId}/analyze-skill-gaps`, { resume_id: resumeId }).then(r => r.data)

// Prep / STAR
export const getStories = (profileId) =>
  api.get('/prep/stories', { params: profileId ? { profile_id: profileId } : {} }).then(r => r.data)

export const createStory = (data) => api.post('/prep/stories', data).then(r => r.data)
export const generateStories = (profileId) =>
  api.post('/prep/stories/generate', { profile_id: profileId }).then(r => r.data)
export const deleteStory = (id) => api.delete(`/prep/stories/${id}`).then(r => r.data)

// Settings
export const getSettings = () => api.get('/settings/').then(r => r.data)
export const testConnection = () => api.post('/settings/test').then(r => r.data)

// Resume (Internal Builder)
export const getResumes = (profileId) =>
  api.get('/resume/resumes', { params: profileId ? { profile_id: profileId } : {} })
    .then(r => Array.isArray(r.data) ? r.data : (r.data?.resumes || []))

export const createResume = (profileId, data) =>
  api.post('/resume', { ...data, profile_id: profileId }).then(r => r.data)

export const updateResume = (resumeId, data) =>
  api.patch(`/resume/${resumeId}`, data).then(r => r.data)

export const deleteResume = (resumeId) =>
  api.delete(`/resume/${resumeId}`).then(r => r.data)

export const exportResumePdf = (resumeId) =>
  api.get(`/resume/${resumeId}/pdf`, { responseType: 'blob' }).then(r => r.data)

// LLM tailoring can be slow with Ollama on a laptop — give it 5 minutes.
const TAILOR_TIMEOUT = 5 * 60 * 1000

export const tailorResumePdf = (resumeId, jobId) =>
  api.post('/resume/tailor', { job_id: jobId, resume_id: resumeId }, {
    responseType: 'blob',
    timeout: TAILOR_TIMEOUT,
  })
    .then(r => ({ blob: r.data, filename: parseFilename(r.headers['content-disposition']) }))

export const tailorResumeUpload = (jobId, file) => {
  const fd = new FormData()
  fd.append('job_id', String(jobId))
  fd.append('file', file)
  return api.post('/resume/tailor-upload', fd, {
    responseType: 'blob',
    timeout: TAILOR_TIMEOUT,
  })
    .then(r => ({ blob: r.data, filename: parseFilename(r.headers['content-disposition']) }))
}

// Skill gap analysis from a locally-uploaded resume PDF.
export const analyzeSkillGapsUpload = (jobId, file) => {
  const fd = new FormData()
  fd.append('job_id', String(jobId))
  fd.append('file', file)
  return api.post('/jobs/analyze-skill-gaps-upload', fd, { timeout: TAILOR_TIMEOUT })
    .then(r => r.data)
}

function parseFilename(disposition) {
  if (!disposition) return null
  const m = /filename="?([^"]+)"?/.exec(disposition)
  return m ? m[1] : null
}

export default api
