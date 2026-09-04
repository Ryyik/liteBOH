export const BMI_MIN = 15
export const BMI_MAX = 32

export const BMI_TIERS = [
  { key: 'thin', name: '偏轻', color: 'var(--hk-sky)', raw: '#64d2ff', chipBg: 'rgba(100,210,255,0.2)', chipFg: '#0a6ea1', from: 15, to: 18.5 },
  { key: 'normal', name: '健康', color: 'var(--hk-green)', raw: '#30d158', chipBg: 'rgba(48,209,88,0.2)', chipFg: '#1a7f37', from: 18.5, to: 24 },
  { key: 'over', name: '超重', color: 'var(--hk-orange)', raw: '#ff9f0a', chipBg: 'rgba(255,159,10,0.2)', chipFg: '#8a5300', from: 24, to: 28 },
  { key: 'obese', name: '肥胖', color: 'var(--hk-crimson)', raw: '#ff453a', chipBg: 'rgba(255,69,58,0.18)', chipFg: '#a3241c', from: 28, to: 32 }
]

export function bmiTier(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { key: 'none', name: '待填写', color: 'var(--hk-text-3)', raw: '#8e8e93', chipBg: 'rgba(120,120,128,0.16)', chipFg: 'var(--hk-text-2)' }
  }
  if (value < 18.5) return BMI_TIERS[0]
  if (value < 24) return BMI_TIERS[1]
  if (value < 28) return BMI_TIERS[2]
  return BMI_TIERS[3]
}

export function bmiPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  const p = (value - BMI_MIN) / (BMI_MAX - BMI_MIN)
  return Math.max(0, Math.min(1, p)) * 100
}

export function calcBmi(heightCm, weightKg) {
  const h = Number(heightCm)
  const w = Number(weightKg)
  if (!h || !w || h < 100 || h > 250 || w < 20 || w > 350) return null
  const m = h / 100
  return +(w / (m * m)).toFixed(1)
}
