import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const auth = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const cmsApi = {
  // Posts
  listPosts: (params = {}) => axios.get(`${API}/cms/posts`, { ...auth(), params }),
  listTrash: () => axios.get(`${API}/cms/posts/trash`, auth()),
  getPost: (id) => axios.get(`${API}/cms/posts/${id}`, auth()),
  createPost: (data) => axios.post(`${API}/cms/posts`, data, auth()),
  updatePost: (id, data) => axios.put(`${API}/cms/posts/${id}`, data, auth()),
  softDelete: (id) => axios.delete(`${API}/cms/posts/${id}`, auth()),
  restore: (id) => axios.post(`${API}/cms/posts/${id}/restore`, {}, auth()),
  purge: (id) => axios.delete(`${API}/cms/posts/${id}/purge`, auth()),

  // Prompts
  listPrompts: (scope) => axios.get(`${API}/cms/prompts`, { ...auth(), params: scope ? { scope } : {} }),
  createPrompt: (data) => axios.post(`${API}/cms/prompts`, data, auth()),
  updatePrompt: (id, data) => axios.put(`${API}/cms/prompts/${id}`, data, auth()),
  deletePrompt: (id) => axios.delete(`${API}/cms/prompts/${id}`, auth()),

  // Sources
  listSources: (q) => axios.get(`${API}/cms/sources`, { ...auth(), params: q ? { q } : {} }),

  // Setup — faculty seed + API keys
  seedFaculty: (dryRun) => axios.post(`${API}/cms/faculty/seed`, {}, { ...auth(), params: { dry_run: dryRun } }),
  listKeys: () => axios.get(`${API}/cms/keys`, auth()),
  createKey: (data) => axios.post(`${API}/cms/keys`, data, auth()),
  revokeKey: (id) => axios.delete(`${API}/cms/keys/${id}`, auth()),
  publicFaculty: () => axios.get(`${API}/faculty`),
  publicPublications: () => axios.get(`${API}/publications`),

  // AI
  aiText: (data) => axios.post(`${API}/cms/ai/generate-text`, data, { ...auth(), timeout: 90000 }),
  aiFull: (data) => axios.post(`${API}/cms/ai/generate-full`, data, { ...auth(), timeout: 120000 }),
  aiImage: (data) => axios.post(`${API}/cms/ai/generate-image`, data, { ...auth(), timeout: 120000 }),
  aiSummarize: (data) => axios.post(`${API}/cms/ai/summarize`, data, { ...auth(), timeout: 90000 }),
  aiTranslate: (data) => axios.post(`${API}/cms/ai/translate`, data, { ...auth(), timeout: 60000 }),
};

export const POST_TYPE_LABEL = {
  article: 'บทความ',
  insight: 'Insight Post',
  case_story: 'Case Story',
  announcement: 'ประชาสัมพันธ์',
};

export const SOURCE_TYPE_LABEL = {
  be_study: 'Brand Equity',
  conjoint_study: 'Conjoint',
  cms_post: 'CMS Post',
};
