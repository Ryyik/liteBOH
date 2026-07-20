export const JOURNEY_COPY_DRAFT_KEY = 'boh-journey-copy-draft-v1'

const EDITABLE_FIELDS = ['date', 'kicker', 'code', 'name', 'title', 'copy']

export function journeyCopyId(scope, item, index = 0) {
  const anchor = item.date || item.year || item.depth || String(index + 1)
  const label = item.title || item.name || item.kicker || String(index + 1)
  return `${scope}:${anchor}:${label}`
}

export function loadJourneyCopyDraft() {
  try {
    return JSON.parse(localStorage.getItem(JOURNEY_COPY_DRAFT_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveJourneyCopyDraft(draft) {
  localStorage.setItem(JOURNEY_COPY_DRAFT_KEY, JSON.stringify(draft))
}

export function clearJourneyCopyDraft() {
  localStorage.removeItem(JOURNEY_COPY_DRAFT_KEY)
}

export function applyJourneyCopyDraft(scope, item, index, draft) {
  const patch = draft[journeyCopyId(scope, item, index)]
  if (!patch) return item
  EDITABLE_FIELDS.forEach((field) => {
    if (typeof patch[field] === 'string') item[field] = patch[field]
  })
  return item
}

export function editableJourneyFields(item) {
  return EDITABLE_FIELDS.filter((field) => typeof item[field] === 'string')
}
