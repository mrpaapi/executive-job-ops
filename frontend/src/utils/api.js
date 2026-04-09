import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Profiles
export const getProfiles = () => api.get('/profiles/').then(r => r.data)
export const uploadResume = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/profiles/upload', fd).then(r => r.data)
}
export const deleteProfile = (id) => api.delete(`/profiles/${id}`).then(r => r.data)

// Jobs
export const getJobs = (profileId) =>
  api.get('/jobs/', { params: profileId ? { profile_id: profileId } : {} }).then(r => r.data)

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

// Prep / STAR
export const getStories = (profileId) =>
  api.get('/prep/stories', { params: profileId ? { profile_id: profileId } : {} }).then(r => r.data)

export const createStory = (data) => api.post('/prep/stories', data).then(r => r.data)
export const generateStories = (profileId) =>
  api.post('/prep/stories/generate', { profile_id: profileId }).then(r => r.data)
export const deleteStory = (id) => api.delete(`/prep/stories/${id}`).then(r => r.data)

// Settings
export const getSettings = () => api.get('/settings/').then(r => r.data)

export default api
