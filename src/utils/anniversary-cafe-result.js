export function getAnniversaryCafeResultTitle(served, averageQuality) {
  if (served === 0) return '今天还没有成功出杯'
  if (served >= 8 && averageQuality >= 88) return '今天是金牌营业日'
  if (served >= 6) return '云上咖啡店座无虚席'
  return '忙碌而温暖的一天'
}

export function getAnniversaryCafeStars(served, averageQuality) {
  if (served === 0) return 0
  if (served >= 8 && averageQuality >= 85) return 3
  if (served >= 5) return 2
  return 1
}
