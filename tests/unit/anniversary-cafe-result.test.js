import { describe, expect, it } from 'vitest'

import {
  getAnniversaryCafeResultTitle,
  getAnniversaryCafeStars
} from '../../src/utils/anniversary-cafe-result.js'

describe('anniversary cafe results', () => {
  it('does not award a consolation star when no drink was served', () => {
    expect(getAnniversaryCafeStars(0, 0)).toBe(0)
    expect(getAnniversaryCafeResultTitle(0, 0)).toBe('今天还没有成功出杯')
  })

  it('keeps the existing two and three star thresholds', () => {
    expect(getAnniversaryCafeStars(5, 70)).toBe(2)
    expect(getAnniversaryCafeStars(8, 85)).toBe(3)
    expect(getAnniversaryCafeResultTitle(8, 88)).toBe('今天是金牌营业日')
  })
})
