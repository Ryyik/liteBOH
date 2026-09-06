import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase-client'

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

// 本地时区日期（YYYY-MM-DD）。此前用 toISOString().slice(0,10) 是 UTC 日期，
// 在东八区每天 0:00-7:59 会把"今天"算成昨天，导致日志错日、趋势错列。
export const localDateISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const todayISODate = () => localDateISO()

const clampNumber = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

// sanitize 系列处理 localStorage / 云端返回的不可信数据，入口保持动态类型，
// 出口由各字段校验收敛为本地强类型。
const sanitizeProfile = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  // 数字与字符串两条路径统一走 clamp，杜绝 "999" 之类字符串绕过范围校验
  const heightCm = raw.heightCm === null || raw.heightCm === undefined || raw.heightCm === ''
    ? null
    : clampNumber(raw.heightCm, 100, 250)
  const weightKg = raw.weightKg === null || raw.weightKg === undefined || raw.weightKg === ''
    ? null
    : clampNumber(raw.weightKg, 20, 350)
  const targetWeightKg = raw.targetWeightKg === null || raw.targetWeightKg === undefined || raw.targetWeightKg === ''
    ? null
    : clampNumber(raw.targetWeightKg, 20, 350)
  return {
    sex: ['male', 'female', 'other', 'prefer_not_to_say'].includes(raw.sex) ? raw.sex : '',
    birthYear: Number.isInteger(raw.birthYear) && raw.birthYear >= 1900 && raw.birthYear <= 2030 ? raw.birthYear : null,
    heightCm: heightCm === null ? null : +heightCm.toFixed(1),
    weightKg: weightKg === null ? null : +weightKg.toFixed(1),
    targetWeightKg: targetWeightKg === null ? null : +targetWeightKg.toFixed(1),
    activityLevel: ['sedentary', 'light', 'moderate', 'active'].includes(raw.activityLevel) ? raw.activityLevel : ''
  }
}

const sanitizeWeightLog = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  const w = Number(raw.weightKg)
  if (!Number.isFinite(w) || w < 20 || w > 350) return null
  return {
    id: String(raw.id || genId()),
    weightKg: +w.toFixed(1),
    loggedAt: typeof raw.loggedAt === 'string' ? raw.loggedAt : new Date().toISOString()
  }
}

const sanitizeDailyLog = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  const d = typeof raw.date === 'string' ? raw.date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return {
    id: String(raw.id || genId()),
    date: d,
    sleepHours: typeof raw.sleepHours === 'number' && raw.sleepHours >= 0 && raw.sleepHours <= 24 ? raw.sleepHours : null,
    steps: Number.isInteger(raw.steps) && raw.steps >= 0 && raw.steps <= 100000 ? raw.steps : null,
    waterCups: Number.isInteger(raw.waterCups) && raw.waterCups >= 0 && raw.waterCups <= 30 ? raw.waterCups : null,
    mood: ['great', 'good', 'ok', 'low', 'bad', ''].includes(raw.mood) ? raw.mood : '',
    moodNote: typeof raw.moodNote === 'string' ? raw.moodNote.slice(0, 200) : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
  }
}

const sanitizeVaultRecord = (raw: any) => {
  if (!raw || typeof raw !== 'object') return null
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 48) : ''
  if (!title) return null
  // indicators 只接受扁平的 string/number/boolean 键值对，防止数组/嵌套对象
  // 原样透传撑爆 localStorage，也压缩自由文本注入面
  const indicators: Record<string, string> = {}
  if (raw.indicators && typeof raw.indicators === 'object' && !Array.isArray(raw.indicators)) {
    for (const [k, v] of Object.entries(raw.indicators)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        indicators[String(k).slice(0, 24)] = String(v).slice(0, 60)
      }
      if (Object.keys(indicators).length >= 20) break
    }
  }
  return {
    id: String(raw.id || genId()),
    title,
    indicators,
    fileName: typeof raw.fileName === 'string' ? raw.fileName.slice(0, 120) : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
  }
}

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
  const cloudSynced = ref(false)
  const cloudSyncError = ref<string | null>(null)

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

  const applyLocalPayload = (data: any) => {
    if (data?.profile) {
      const p = sanitizeProfile(data.profile)
      if (p) profile.value = p
    }
    if (Array.isArray(data?.weightLogs)) {
      const sanitized = data.weightLogs.map(sanitizeWeightLog).filter(Boolean).slice(0, 500)
      if (sanitized.length) weightLogs.value = sanitized
    }
    if (Array.isArray(data?.dailyLogs)) {
      const sanitized = data.dailyLogs.map(sanitizeDailyLog).filter(Boolean).slice(0, 500)
      if (sanitized.length) dailyLogs.value = sanitized
    }
    if (Array.isArray(data?.vaultRecords)) {
      const sanitized = data.vaultRecords.map(sanitizeVaultRecord).filter(Boolean).slice(0, 200)
      if (sanitized.length) vaultRecords.value = sanitized
    }
    if (typeof data?.onboardingDone === 'boolean') onboardingDone.value = data.onboardingDone
  }

  // 云端为单一可信源，但合并时保留"云端没有的本地记录"（通常是离线期间
  // push 失败的数据），并在合并后重新上行，避免本地独有数据被覆盖丢失。
  const mergeAndRepush = (
    cloudProfile: any,
    cloudWeights: any,
    cloudDailies: any,
    cloudVaults: any,
    _userId: string
  ) => {
    if (cloudProfile) {
      const p = sanitizeProfile({
        sex: cloudProfile.sex,
        birthYear: cloudProfile.birth_year,
        heightCm: cloudProfile.height_cm,
        weightKg: cloudProfile.weight_kg,
        targetWeightKg: cloudProfile.target_weight_kg,
        activityLevel: cloudProfile.activity_level
      })
      if (p) profile.value = p
    }

    // 体重：按 loggedAt 对齐（push 时原样上行 logged_at），云端命中优先，本地独有保留
    const cloudWeightKeys = new Set((cloudWeights || []).map((row: any) => String(row.logged_at)))
    const localOnlyWeights = weightLogs.value.filter((l) => !cloudWeightKeys.has(l.loggedAt))
    weightLogs.value = [
      ...(cloudWeights || []).map((row: any) => sanitizeWeightLog({ id: row.id, weightKg: row.weight_kg, loggedAt: row.logged_at })).filter(Boolean),
      ...localOnlyWeights
    ]
      .sort((a, b) => String(b.loggedAt).localeCompare(String(a.loggedAt)))
      .slice(0, 180)

    // 每日日志：按 log_date 对齐（云端有该日则云端优先），本地独有日期保留
    const cloudDailyKeys = new Set((cloudDailies || []).map((row: any) => String(row.log_date)))
    const localOnlyDailies = dailyLogs.value.filter((l) => !cloudDailyKeys.has(l.date))
    dailyLogs.value = [
      ...(cloudDailies || []).map((row: any) => sanitizeDailyLog({
        id: row.id,
        date: row.log_date,
        sleepHours: row.sleep_hours,
        steps: row.steps,
        waterCups: row.water_cups,
        mood: row.mood,
        moodNote: row.mood_note,
        createdAt: row.created_at
      })).filter(Boolean),
      ...localOnlyDailies
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 365)

    // 体检档案：按 createdAt 对齐（push 时显式上行 created_at），本地独有保留
    const cloudVaultKeys = new Set((cloudVaults || []).map((row: any) => String(row.created_at)))
    const localOnlyVaults = vaultRecords.value.filter((r) => !cloudVaultKeys.has(r.createdAt))
    vaultRecords.value = [
      ...(cloudVaults || []).map((row: any) => sanitizeVaultRecord({
        id: row.id,
        title: row.title,
        indicators: row.indicators,
        fileName: row.file_name,
        createdAt: row.created_at
      })).filter(Boolean),
      ...localOnlyVaults
    ]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100)

    persist()

    // 自愈：把本地独有的（此前 push 失败的）记录重新上行
    localOnlyWeights.forEach((l) => void pushWeightLog(l))
    localOnlyDailies.forEach((l) => void pushDailyLog(l))
    localOnlyVaults.forEach((r) => void pushVaultRecord(r))
  }

  const runHydrate = async () => {
    // 1) 本机数据先就绪,保证首屏不空白
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        applyLocalPayload(data)
      }
    } catch {
      // corrupted, ignore
    }
    // 2) 尝试拉云端并与本地合并;失败保留本地数据且不锁死,允许下次重试
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) return // 未登录,只保留本地
      const [profileRes, weightRes, dailyRes, vaultRes] = await Promise.all([
        supabase.from('health_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('health_weight_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(180),
        supabase.from('health_daily_logs').select('*').eq('user_id', userId).order('log_date', { ascending: false }).limit(365),
        supabase.from('health_vault_records').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
      ])
      if (profileRes.error) throw profileRes.error
      if (weightRes.error) throw weightRes.error
      if (dailyRes.error) throw dailyRes.error
      if (vaultRes.error) throw vaultRes.error

      mergeAndRepush(profileRes.data, weightRes.data, dailyRes.data, vaultRes.data, userId)
      cloudSynced.value = true
      cloudSyncError.value = null
    } catch (err: any) {
      cloudSynced.value = false
      cloudSyncError.value = err?.message || String(err)
      // 允许下次 hydrate 重试（登录/切页时会被再次调用）
      hasHydrated.value = false
    }
  }

  // 可等待且防重入：同一时刻只有一个在途 hydrate，并发调用共享同一个 Promise
  let hydrateInflight: Promise<void> | null = null
  const hydrate = () => {
    if (hydrateInflight) return hydrateInflight
    if (hasHydrated.value) return Promise.resolve()
    hasHydrated.value = true
    hydrateInflight = runHydrate().finally(() => { hydrateInflight = null })
    return hydrateInflight
  }

  const getUserId = async () => {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id || null
  }

  // 上行同步:写入本地后异步写云,失败仅记录错误,不阻塞 UI
  const pushProfile = async (next: HealthProfile) => {
    const userId = await getUserId()
    if (!userId) return
    const payload = {
      user_id: userId,
      sex: next.sex || null,
      birth_year: next.birthYear || null,
      height_cm: next.heightCm || null,
      weight_kg: next.weightKg || null,
      target_weight_kg: next.targetWeightKg || null,
      activity_level: next.activityLevel || null
    }
    const { error } = await supabase.from('health_profiles').upsert(payload, { onConflict: 'user_id' })
    if (error) {
      cloudSyncError.value = error.message
      return
    }
    cloudSynced.value = true
  }

  const pushWeightLog = async (log: WeightLog) => {
    const userId = await getUserId()
    if (!userId) return
    // 本地 id 是临时 id，云端主键是 uuid：不带 id 插入，但回读云端 id
    // 回写本地，保证后续按 id 的操作与 hydrate 合并键一致
    const { data, error } = await supabase.from('health_weight_logs')
      .insert({ user_id: userId, weight_kg: log.weightKg, logged_at: log.loggedAt })
      .select('id')
      .single()
    if (error) {
      cloudSyncError.value = error.message
      return
    }
    if (data?.id) {
      const local = weightLogs.value.find((l) => l.id === log.id)
      if (local) local.id = data.id
    }
    cloudSynced.value = true
  }

  const pushDailyLog = async (log: DailyLog) => {
    const userId = await getUserId()
    if (!userId) return
    const { error } = await supabase.from('health_daily_logs').upsert({
      user_id: userId,
      log_date: log.date,
      sleep_hours: log.sleepHours,
      steps: log.steps,
      water_cups: log.waterCups,
      mood: log.mood || null,
      mood_note: log.moodNote || null
    }, { onConflict: 'user_id,log_date' })
    if (error) cloudSyncError.value = error.message
    else cloudSynced.value = true
  }

  const pushVaultRecord = async (rec: HealthVaultRecord) => {
    const userId = await getUserId()
    if (!userId) return
    // 显式上行 created_at（hydrate 合并按它对齐），并回读云端 uuid 回写本地，
    // 否则"新增后未刷新就删除"会用本地临时 id 删云端 uuid 主键，必然失败
    const { data, error } = await supabase.from('health_vault_records')
      .insert({
        user_id: userId,
        title: rec.title,
        indicators: rec.indicators || {},
        file_name: rec.fileName || null,
        created_at: rec.createdAt
      })
      .select('id')
      .single()
    if (error) {
      cloudSyncError.value = error.message
      return
    }
    if (data?.id) {
      const local = vaultRecords.value.find((r) => r.id === rec.id)
      if (local) local.id = data.id
      persist()
    }
    cloudSynced.value = true
  }

  const removeVaultRecordCloud = async (rec: HealthVaultRecord) => {
    const userId = await getUserId()
    if (!userId) return
    // 记录还没拿到云端 uuid（push 未完成/失败）时，按 title+created_at 兜底删除，
    // 避免把临时 id 直接 cast 成 uuid 触发 22P02
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rec.id)
    let query = supabase.from('health_vault_records').delete().eq('user_id', userId)
    query = isUuid ? query.eq('id', rec.id) : query.eq('title', rec.title).eq('created_at', rec.createdAt)
    const { error } = await query
    if (error) cloudSyncError.value = error.message
  }

  const clearAllCloud = async () => {
    const userId = await getUserId()
    if (!userId) return { ok: true }
    const results = await Promise.all([
      supabase.from('health_profiles').delete().eq('user_id', userId),
      supabase.from('health_weight_logs').delete().eq('user_id', userId),
      supabase.from('health_daily_logs').delete().eq('user_id', userId),
      supabase.from('health_vault_records').delete().eq('user_id', userId)
    ])
    // 任一表删除失败都不清本地，否则未删净的云端数据会在下次 hydrate "复活"
    const firstError = results.find((r) => r?.error)?.error
    if (firstError) {
      cloudSynced.value = false
      cloudSyncError.value = firstError.message
      return { ok: false, error: firstError.message }
    }
    return { ok: true }
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
          const newLog = { id: genId(), weightKg: patch.weightKg, loggedAt: new Date().toISOString() }
          weightLogs.value.unshift(newLog)
          if (weightLogs.value.length > 180) weightLogs.value.length = 180
          void pushWeightLog(newLog)
        }
      }
    }
    if (patch.targetWeightKg !== undefined) profile.value.targetWeightKg = patch.targetWeightKg
    if (patch.activityLevel !== undefined) profile.value.activityLevel = patch.activityLevel as HealthActivityLevel
    persist()
    void pushProfile(profile.value)
  }

  const addWeightLog = (weightKg: number) => {
    if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 350) return { ok: false, error: '体重超出可记录范围' }
    const log = { id: genId(), weightKg: +weightKg.toFixed(1), loggedAt: new Date().toISOString() }
    weightLogs.value.unshift(log)
    if (weightLogs.value.length > 180) weightLogs.value.length = 180
    profile.value.weightKg = +weightKg.toFixed(1)
    persist()
    void pushWeightLog(log)
    void pushProfile(profile.value)
    return { ok: true }
  }

  const upsertDailyLog = (date: string, patch: Partial<Omit<DailyLog, 'id' | 'date' | 'createdAt'>>) => {
    const d = date || todayISODate()
    let found = dailyLogs.value.find((l) => l.date === d)
    if (!found) {
      found = { id: genId(), date: d, sleepHours: null, steps: null, waterCups: null, mood: '', moodNote: '', createdAt: new Date().toISOString() }
      dailyLogs.value.unshift(found)
    }
    // 与 DB CHECK 约束（sleep 0-24 / steps 0-100000 / water 0-30）对齐，越界值钳制；
    // clampNumber 对非有限值返回 null，此处兜底为 0（与越界拒收语义一致，不写入脏数据）
    if (patch.sleepHours !== undefined) {
      const clamped = clampNumber(patch.sleepHours, 0, 24)
      found.sleepHours = patch.sleepHours === null || clamped === null ? null : +clamped.toFixed(1)
    }
    if (patch.steps !== undefined) {
      const clamped = clampNumber(patch.steps, 0, 100000)
      found.steps = patch.steps === null || clamped === null ? null : Math.round(clamped)
    }
    if (patch.waterCups !== undefined) {
      const clamped = clampNumber(patch.waterCups, 0, 30)
      found.waterCups = patch.waterCups === null || clamped === null ? null : Math.round(clamped)
    }
    if (patch.mood !== undefined) {
      found.mood = (['great', 'good', 'ok', 'low', 'bad', ''].includes(patch.mood) ? patch.mood : '') as HealthMood | ''
    }
    if (patch.moodNote !== undefined) found.moodNote = String(patch.moodNote).slice(0, 200)
    // keep sorted desc
    dailyLogs.value.sort((a, b) => b.date.localeCompare(a.date))
    if (dailyLogs.value.length > 365) dailyLogs.value.length = 365
    persist()
    void pushDailyLog(found)
    return found
  }

  const addVaultRecord = (title: string, indicators: Record<string, string>, fileName?: string) => {
    const rec: HealthVaultRecord = { id: genId(), title: title.slice(0, 48) || '未命名记录', indicators, fileName, createdAt: new Date().toISOString() }
    vaultRecords.value.unshift(rec)
    if (vaultRecords.value.length > 100) vaultRecords.value.length = 100
    persist()
    void pushVaultRecord(rec)
    return rec
  }

  const removeVaultRecord = (id: string) => {
    const rec = vaultRecords.value.find((r) => r.id === id)
    vaultRecords.value = vaultRecords.value.filter((r) => r.id !== id)
    persist()
    if (rec) void removeVaultRecordCloud(rec)
  }

  const clearAll = async () => {
    // 先删云端：任一表失败则保留本地，防止未删净的云端数据在下次 hydrate 复活
    const cloudResult = await clearAllCloud()
    if (cloudResult && cloudResult.ok === false) return cloudResult
    profile.value = { sex: '', birthYear: null, heightCm: null, weightKg: null, targetWeightKg: null, activityLevel: '' }
    weightLogs.value = []
    dailyLogs.value = []
    vaultRecords.value = []
    onboardingDone.value = false
    localStorage.removeItem(STORAGE_KEY)
    cloudSynced.value = false
    cloudSyncError.value = null
    persist()
    return { ok: true }
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
      const iso = localDateISO(d) // 本地时区，与写入侧 todayISODate 保持同一基准
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

  // 清空本机状态（登出/换账号时防止下一位用户看到前任的健康数据）
  const resetLocalState = () => {
    profile.value = { sex: '', birthYear: null, heightCm: null, weightKg: null, targetWeightKg: null, activityLevel: '' }
    weightLogs.value = []
    dailyLogs.value = []
    vaultRecords.value = []
    onboardingDone.value = false
    hasHydrated.value = false
    cloudSynced.value = false
    cloudSyncError.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  // Initialize from storage immediately (云端拉取在 hydrate 阶段完成)
  void hydrate().catch(() => {})

  // 登录态切换监听：登出/换号立即清空本机数据；新登录重置后重新拉取云端
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      resetLocalState()
    } else if (event === 'SIGNED_IN' && session?.user?.id) {
      resetLocalState()
      void hydrate().catch(() => {})
    }
  })

  return {
    profile,
    weightLogs,
    dailyLogs,
    vaultRecords,
    onboardingDone,
    cloudSynced,
    cloudSyncError,
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
