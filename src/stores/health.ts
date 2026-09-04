import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type HealthSex = 'male' | 'female' | 'other' | 'prefer_not_to_say' | ''
export type HealthActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | ''
export type HealthMood = 'great' | 'good' | 'ok' | 'low' | 'bad'

export interface HealthProfile {
  sex: HealthSex
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  targetWeightKg: number | null
  activityLevel: HealthActivityLevel
}

export interface WeightLog {
  id: string
  weightKg: number
  loggedAt: string // ISO
}

export interface DailyLog {
  id: string
  date: string // YYYY-MM-DD
  sleepHours: number | null
  steps: number | null
  waterCups: number | null
  mood: HealthMood | ''
  moodNote: string
  createdAt: string
}

export interface HealthVaultRecord {
  id: string
  title: string
  indicators: Record<string, string>
  fileName?: string
  createdAt: string
}

const STORAGE_KEY = 'boh_health_v1'

const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const todayISODate = () => new Date().toISOString().slice(0, 10)

export const useHealthStore = defineStore('health', () => {
  const profile = ref<HealthProfile>({
    sex: '',
    birthYear: null,
    heightCm: null,
    weightKg: null,
    targetWeightKg: null,
    activityLevel: ''
  })
  const weightLogs = ref<WeightLog[]>([])
  const dailyLogs = ref<DailyLog[]>([])
  const vaultRecords = ref<HealthVaultRecord[]>([])
  const onboardingDone = ref(false)
  const hasHydrated = ref(false)

  const age = computed(() => {
    const y = profile.value.birthYear
    if (!y || y < 1900 || y > new Date().getFullYear()) return null
    return new Date().getFullYear() - y
  })

  const bmi = computed(() => {
    const h = profile.value.heightCm
    const w = profile.value.weightKg
    if (!h || !w || h < 100 || h > 250 || w < 20 || w > 350) return null
    const m = h / 100
    return +(w / (m * m)).toFixed(1)
  })

  const bmiCategory = computed(() => {
    const v = bmi.value
    if (v === null) return ''
    if (v < 18.5) return '偏轻'
    if (v < 24) return '健康'
    if (v < 28) return '超重'
    return '肥胖'
  })

  const bmr = computed(() => {
    const h = profile.value.heightCm
    const w = profile.value.weightKg
    const a = age.value
    const sex = profile.value.sex
    if (!h || !w || !a) return null
    // Mifflin-St Jeor
    const base = 10 * w + 6.25 * h - 5 * a
    if (sex === 'male') return Math.round(base + 5)
    if (sex === 'female') return Math.round(base - 161)
    return Math.round(base - 78) // average for other
  })

  const tdee = computed(() => {
    const b = bmr.value
    if (!b) return null
    const map: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725
    }
    const factor = map[profile.value.activityLevel] || 1.2
    return Math.round(b * factor)
  })

  const persist = () => {
    try {
      const payload = {
        profile: profile.value,
        weightLogs: weightLogs.value,
        dailyLogs: dailyLogs.value,
        vaultRecords: vaultRecords.value,
        onboardingDone: onboardingDone.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {}
  }

  const hydrate = () => {
    if (hasHydrated.value) return
    hasHydrated.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.profile) {
        // migrate & validate
        const p = data.profile
        profile.value.sex = ['male', 'female', 'other', 'prefer_not_to_say'].includes(p.sex) ? p.sex : ''
        profile.value.birthYear = Number.isInteger(p.birthYear) && p.birthYear >= 1900 && p.birthYear <= 2030 ? p.birthYear : null
        profile.value.heightCm = typeof p.heightCm === 'number' && p.heightCm >= 100 && p.heightCm <= 250 ? p.heightCm : (typeof p.heightCm === 'string' ? Number(p.heightCm) || null : null)
        profile.value.weightKg = typeof p.weightKg === 'number' && p.weightKg >= 20 && p.weightKg <= 350 ? p.weightKg : (typeof p.weightKg === 'string' ? Number(p.weightKg) || null : null)
        profile.value.targetWeightKg = typeof p.targetWeightKg === 'number' ? p.targetWeightKg : null
        profile.value.activityLevel = ['sedentary', 'light', 'moderate', 'active'].includes(p.activityLevel) ? p.activityLevel : ''
      }
      if (Array.isArray(data.weightLogs)) weightLogs.value = data.weightLogs.slice(0, 500)
      if (Array.isArray(data.dailyLogs)) dailyLogs.value = data.dailyLogs.slice(0, 500)
      if (Array.isArray(data.vaultRecords)) vaultRecords.value = data.vaultRecords.slice(0, 200)
      if (typeof data.onboardingDone === 'boolean') onboardingDone.value = data.onboardingDone
    } catch {
      // corrupted, ignore
    }
  }

  const setProfile = (patch: Partial<HealthProfile>) => {
    if (patch.sex !== undefined) profile.value.sex = patch.sex as HealthSex
    if (patch.birthYear !== undefined) profile.value.birthYear = patch.birthYear
    if (patch.heightCm !== undefined) profile.value.heightCm = patch.heightCm
    if (patch.weightKg !== undefined) {
      profile.value.weightKg = patch.weightKg
      if (patch.weightKg !== null) {
        // auto weight log when weight changes significantly
        const last = weightLogs.value[0]
        const diff = last ? Math.abs(last.weightKg - patch.weightKg) : 999
        if (diff >= 0.3 || weightLogs.value.length === 0) {
          weightLogs.value.unshift({ id: genId(), weightKg: patch.weightKg, loggedAt: new Date().toISOString() })
          if (weightLogs.value.length > 180) weightLogs.value.length = 180
        }
      }
    }
    if (patch.targetWeightKg !== undefined) profile.value.targetWeightKg = patch.targetWeightKg
    if (patch.activityLevel !== undefined) profile.value.activityLevel = patch.activityLevel as HealthActivityLevel
    persist()
  }

  const addWeightLog = (weightKg: number) => {
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 350) return { ok: false, error: '体重超出可记录范围' }
    weightLogs.value.unshift({ id: genId(), weightKg: +weightKg.toFixed(1), loggedAt: new Date().toISOString() })
    if (weightLogs.value.length > 180) weightLogs.value.length = 180
    profile.value.weightKg = +weightKg.toFixed(1)
    persist()
    return { ok: true }
  }

  const upsertDailyLog = (date: string, patch: Partial<Omit<DailyLog, 'id' | 'date' | 'createdAt'>>) => {
    const d = date || todayISODate()
    let found = dailyLogs.value.find((l) => l.date === d)
    if (!found) {
      found = { id: genId(), date: d, sleepHours: null, steps: null, waterCups: null, mood: '', moodNote: '', createdAt: new Date().toISOString() }
      dailyLogs.value.unshift(found)
    }
    if (patch.sleepHours !== undefined) found.sleepHours = patch.sleepHours
    if (patch.steps !== undefined) found.steps = patch.steps
    if (patch.waterCups !== undefined) found.waterCups = patch.waterCups
    if (patch.mood !== undefined) found.mood = patch.mood as HealthMood
    if (patch.moodNote !== undefined) found.moodNote = String(patch.moodNote).slice(0, 200)
    // keep sorted desc
    dailyLogs.value.sort((a, b) => b.date.localeCompare(a.date))
    if (dailyLogs.value.length > 365) dailyLogs.value.length = 365
    persist()
    return found
  }

  const addVaultRecord = (title: string, indicators: Record<string, string>, fileName?: string) => {
    const rec: HealthVaultRecord = { id: genId(), title: title.slice(0, 48) || '未命名记录', indicators, fileName, createdAt: new Date().toISOString() }
    vaultRecords.value.unshift(rec)
    if (vaultRecords.value.length > 100) vaultRecords.value.length = 100
    persist()
    return rec
  }

  const removeVaultRecord = (id: string) => {
    vaultRecords.value = vaultRecords.value.filter((r) => r.id !== id)
    persist()
  }

  const clearAll = () => {
    profile.value = { sex: '', birthYear: null, heightCm: null, weightKg: null, targetWeightKg: null, activityLevel: '' }
    weightLogs.value = []
    dailyLogs.value = []
    vaultRecords.value = []
    onboardingDone.value = false
    localStorage.removeItem(STORAGE_KEY)
  }

  const markOnboardingDone = () => {
    onboardingDone.value = true
    persist()
  }

  // derived stats for dashboard
  const last7Days = computed(() => {
    const days: DailyLog[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      const found = dailyLogs.value.find((l) => l.date === iso)
      days.push(found || { id: `empty-${iso}`, date: iso, sleepHours: null, steps: null, waterCups: null, mood: '', moodNote: '', createdAt: '' })
    }
    return days
  })

  const weeklyAvgSleep = computed(() => {
    const vals = last7Days.value.map((d) => d.sleepHours).filter((v): v is number => typeof v === 'number')
    if (!vals.length) return null
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  })

  const todayLog = computed(() => {
    const iso = todayISODate()
    return dailyLogs.value.find((l) => l.date === iso) || null
  })

  // Initialize from storage immediately
  try { hydrate() } catch {}

  return {
    profile,
    weightLogs,
    dailyLogs,
    vaultRecords,
    onboardingDone,
    age,
    bmi,
    bmiCategory,
    bmr,
    tdee,
    last7Days,
    weeklyAvgSleep,
    todayLog,
    hydrate,
    setProfile,
    addWeightLog,
    upsertDailyLog,
    addVaultRecord,
    removeVaultRecord,
    clearAll,
    markOnboardingDone,
    persist
  }
}, {
  persist: {
    key: 'boh_health_persist',
    pick: ['profile', 'weightLogs', 'dailyLogs', 'vaultRecords', 'onboardingDone']
  } as any
})
