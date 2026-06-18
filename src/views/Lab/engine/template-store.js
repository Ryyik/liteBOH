import { PRESET_TEMPLATES } from '../utils/constants.js'

const STORAGE_KEY = 'boh_office_templates'

function loadUserTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveUserTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export function getAllTemplates() {
  return [...PRESET_TEMPLATES, ...loadUserTemplates()]
}

export function saveTemplate(name, description, operations) {
  const userTemplates = loadUserTemplates()
  const newTemplate = {
    id: `user_${Date.now()}`,
    name,
    description: description || '',
    operations,
    createdAt: new Date().toISOString(),
  }
  userTemplates.push(newTemplate)
  saveUserTemplates(userTemplates)
  return newTemplate
}

export function deleteTemplate(id) {
  if (PRESET_TEMPLATES.some(t => t.id === id)) return
  const userTemplates = loadUserTemplates()
  saveUserTemplates(userTemplates.filter(t => t.id !== id))
}

export function getTemplate(id) {
  const all = getAllTemplates()
  return all.find(t => t.id === id) || null
}
