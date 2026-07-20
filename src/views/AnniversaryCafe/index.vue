<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  ArrowUp,
  Coffee,
  Droplets,
  Gauge,
  Heart,
  House,
  Milk,
  MoveHorizontal,
  MoveVertical,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-vue-next'

import cafeImage from '@/assets/images/26coffee4.webp'
import fourYearsImage from '@/assets/images/2022-7-4years.webp'
import fiveYearsImage from '@/assets/images/2023-7-5years.webp'
import winterMuseumImage from '@/assets/images/2025wintermuseam.webp'
import habitrainImage from '@/assets/images/habitrain.webp'
import fuzhouImage from '@/assets/images/fuzhou.webp'
import ryyikSkin from '@/assets/images/anniversary-cafe/skins/ryyik-cutout.webp'
import baiyeSkin from '@/assets/images/anniversary-cafe/skins/baiye-cutout.webp'
import chengziSkin from '@/assets/images/anniversary-cafe/skins/chengzi-cutout.webp'
import hamburgerSkin from '@/assets/images/anniversary-cafe/skins/hamburger-cutout.webp'
import xiaoniuSkin from '@/assets/images/anniversary-cafe/skins/xiaoniu-cutout.webp'
import thoikSkin from '@/assets/images/anniversary-cafe/skins/thoik-cutout.webp'
import teacherDingSkin from '@/assets/images/anniversary-cafe/skins/teacher-ding-cutout.webp'
import pufferfishSkin from '@/assets/images/anniversary-cafe/skins/pufferfish-cutout.webp'
import elevenSkin from '@/assets/images/anniversary-cafe/skins/eleven-cutout.webp'
import endSkin from '@/assets/images/anniversary-cafe/skins/end-cutout.webp'
import yufuquSkin from '@/assets/images/anniversary-cafe/skins/yufuqu-cutout.webp'
import fivegeSkin from '@/assets/images/anniversary-cafe/skins/fivege-cutout.webp'

const ROUND_SECONDS = 150
const CAT_HELP_COST = 8

const stepDefinitions = {
  grind: { name: '研磨咖啡豆', short: '研磨', icon: Coffee, mode: 'hold', visual: 'grind', target: [62, 78], rate: 29, action: '按住研磨' },
  extract: { name: '萃取浓缩', short: '萃取', icon: Gauge, mode: 'toggle', visual: 'extract', target: [58, 72], rate: 22, action: '开始萃取' },
  water: { name: '注入热水', short: '热水', icon: Droplets, mode: 'gesture', gesture: 'water', visual: 'water', target: [64, 79], rate: 33, instruction: '向上拖动水壶，保持倾角控制水量' },
  steam: { name: '蒸汽打奶泡', short: '奶泡', icon: Milk, mode: 'gesture', gesture: 'steam', visual: 'steam', target: [58, 72], rate: 25, instruction: '上下拖动奶缸，让蒸汽棒保持在旋涡中心' },
  syrup: { name: '加入焦糖糖浆', short: '焦糖', icon: Sparkles, mode: 'tap', visual: 'dose', targetCount: 2, unit: '泵', jarLabel: '焦糖', color: '#b85b3f', action: '按压焦糖泵' },
  ice: { name: '加入冰块', short: '冰块', icon: Droplets, mode: 'tap', visual: 'dose', targetCount: 3, unit: '块', jarLabel: 'ICE', color: '#8fcbd7', action: '加入一块冰' },
  fruit: { name: '压入鲜果汁', short: '果汁', icon: Sparkles, mode: 'tap', visual: 'dose', targetCount: 2, unit: '压', jarLabel: '鲜果', color: '#df744a', action: '按压果汁泵' },
  cocoa: { name: '加入可可', short: '可可', icon: Coffee, mode: 'tap', visual: 'dose', targetCount: 2, unit: '勺', jarLabel: '可可', color: '#6f4129', action: '加入一勺可可' },
  coconut: { name: '倒入生椰乳', short: '生椰', icon: Milk, mode: 'gesture', gesture: 'water', visual: 'water', target: [61, 77], rate: 30, instruction: '向上拖动生椰瓶，控制椰乳比例' },
  sparkling: { name: '注入气泡水', short: '气泡', icon: Droplets, mode: 'gesture', gesture: 'water', visual: 'water', target: [60, 77], rate: 36, instruction: '缓慢倾斜气泡瓶，避免气泡溢出' },
  pour: { name: '融合与拉花', short: '融合', icon: Milk, mode: 'gesture', gesture: 'pour', visual: 'pour', target: [69, 84], rate: 31, instruction: '在杯面左右往复拖动，完成融合与拉花' }
}

const drinks = [
  { id: 'americano', name: '云上美式', price: 22, steps: ['grind', 'extract', 'water'], color: '#7b4a2d' },
  { id: 'latte', name: '经典拿铁', price: 30, steps: ['grind', 'extract', 'steam', 'pour'], color: '#d7aa70' },
  { id: 'coconut-americano', name: '生椰美式', price: 32, steps: ['grind', 'extract', 'ice', 'coconut'], color: '#e5d6b4' },
  { id: 'orange-americano', name: '橙香美式', price: 34, steps: ['grind', 'extract', 'ice', 'fruit'], color: '#df7745' },
  { id: 'grape-sparkling', name: '葡萄气泡果咖', price: 36, steps: ['ice', 'fruit', 'sparkling', 'extract'], color: '#8b6ca8' },
  { id: 'caramel-macchiato', name: '焦糖玛奇朵', price: 36, steps: ['grind', 'extract', 'steam', 'syrup', 'pour'], color: '#bc784c' },
  { id: 'mocha', name: '黑森林摩卡', price: 36, steps: ['grind', 'extract', 'cocoa', 'steam', 'pour'], color: '#603725' },
  { id: 'anniversary', name: '八周年特调', price: 42, steps: ['grind', 'extract', 'steam', 'fruit', 'syrup', 'pour'], color: '#d96752' }
]

const customers = [
  { name: 'Ryyik', note: '今天也想喝熟悉的味道', image: ryyikSkin },
  { name: '白夜', note: '刚结束一段很长的旅程', image: baiyeSkin },
  { name: '橙子', note: '想在窗边休息一会儿', image: chengziSkin },
  { name: '汉堡', note: '带着新地图来到了店里', image: hamburgerSkin },
  { name: '小牛', note: '点单前已经拍了很多照片', image: xiaoniuSkin },
  { name: 'Thoik', note: '今天想试试菜单上的新品', image: thoikSkin },
  { name: '丁老师', note: '下课后需要一杯热咖啡', image: teacherDingSkin },
  { name: '河豚', note: '在气泡果咖前犹豫了很久', image: pufferfishSkin },
  { name: '十一', note: '想把咖啡带去新的世界', image: elevenSkin },
  { name: 'End', note: '还是坐在靠近吧台的位置', image: endSkin },
  { name: '渔夫曲', note: '从很远的海边赶来', image: yufuquSkin },
  { name: '五歌', note: '想尝尝今天最复杂的一杯', image: fivegeSkin }
]

const cafeMemories = [
  { id: 'four-years', year: '2022', title: '四周年烟花夜', detail: '老朋友们重新聚在一起，也留下了第一批被认真保存的周年影像。', image: fourYearsImage },
  { id: 'five-years', year: '2023', title: '五周年纪念册', detail: '第五年的合影被收进纪念册，后来每一次周年都延续了这份仪式感。', image: fiveYearsImage },
  { id: 'winter-museum', year: '2025', title: '冬眠博物馆', detail: '方块街圣诞与生日会特别活动，把大家的冬日回忆收藏进了博物馆。', image: winterMuseumImage },
  { id: 'habitrain', year: '2026', title: '哈比快车谋杀案', detail: '那趟充满推理、身份与笑声的列车，至今仍是方块之家最热闹的游戏之一。', image: habitrainImage },
  { id: 'fuzhou', year: '2026', title: 'Halo，福州', detail: '遇见系列从线上世界走到真实城市，新的共同记忆正在福州发生。', image: fuzhouImage }
]

const phase = ref('intro')
const timeLeft = ref(ROUND_SECONDS)
const coins = ref(0)
const served = ref(0)
const missed = ref(0)
const combo = ref(0)
const bestCombo = ref(0)
const bestScore = ref(0)
const totalQuality = ref(0)
const orders = ref([])
const activeOrderId = ref(null)
const isPaused = ref(false)
const soundEnabled = ref(true)
const showMenu = ref(false)
const customerIndex = ref(-1)
const catAffinity = ref(0)
const catMood = ref('idle')
const catMessage = ref('')
const catSpot = ref(1)
const hearts = ref([])
const machineHeat = ref(0)
const steamCleanliness = ref(100)
const counterCleanliness = ref(100)
const maintenanceLock = ref('')
const wallet = ref(0)
const upgrades = ref({ grinder: 0, machine: 0, steam: 0 })
const discoveredMemories = ref([])
const activeMemoryId = ref(null)
const memoryMessage = ref(null)

const order = computed(() => orders.value.find((item) => item.id === activeOrderId.value) || null)

function activeOrderField(key, fallback) {
  return computed({
    get: () => order.value?.[key] ?? fallback,
    set: (value) => {
      if (order.value) order.value[key] = value
    }
  })
}

const patience = activeOrderField('patience', 100)
const feedback = activeOrderField('feedback', '等待操作')
const feedbackTone = activeOrderField('feedbackTone', 'neutral')
const isResolving = activeOrderField('isResolving', false)
const activeStepIndex = activeOrderField('activeStepIndex', 0)
const processProgress = activeOrderField('processProgress', 0)
const processState = activeOrderField('processState', 'idle')
const stepQualities = activeOrderField('stepQualities', [])
const syrupPumps = activeOrderField('syrupPumps', 0)
const isHolding = activeOrderField('isHolding', false)
const extractionRunning = activeOrderField('extractionRunning', false)
const kettleAngle = activeOrderField('kettleAngle', 0)
const steamPosition = activeOrderField('steamPosition', 50)
const latteTrail = activeOrderField('latteTrail', [])
const latteReversals = activeOrderField('latteReversals', 0)

const currentDrink = computed(() => drinks.find((drink) => drink.id === order.value?.drinkId) || drinks[0])
const currentCustomer = computed(() => customers[order.value?.customerIndex ?? 0])
const currentStepId = computed(() => currentDrink.value.steps[activeStepIndex.value] || null)
const currentStep = computed(() => currentStepId.value ? stepDefinitions[currentStepId.value] : null)
const canServe = computed(() => activeStepIndex.value >= currentDrink.value.steps.length)
const isTapStep = computed(() => currentStep.value?.mode === 'tap')
const progress = computed(() => ((ROUND_SECONDS - timeLeft.value) / ROUND_SECONDS) * 100)
const catHelpReady = computed(() => catAffinity.value >= CAT_HELP_COST && phase.value === 'playing' && !isResolving.value)
const catPositionStyle = computed(() => ({ '--cat-spot': `${43 + catSpot.value * 18}%` }))
const currentQuality = computed(() => stepQualities.value.length
  ? Math.round(stepQualities.value.reduce((sum, value) => sum + value, 0) / stepQualities.value.length)
  : 0)
const averageQuality = computed(() => served.value ? Math.round(totalQuality.value / served.value) : 0)
const resultTitle = computed(() => {
  if (served.value >= 8 && averageQuality.value >= 88) return '今天是金牌营业日'
  if (served.value >= 6) return '云上咖啡店座无虚席'
  return '忙碌而温暖的一天'
})
const stars = computed(() => {
  if (served.value >= 8 && averageQuality.value >= 85) return 3
  if (served.value >= 5) return 2
  return 1
})
const targetBounds = computed(() => {
  if (!currentStep.value || isTapStep.value) return [0, 100]
  const [start, end] = currentStep.value.target
  const shrink = Math.min(5, served.value * 0.65)
  let upgradeBonus = 0
  if (currentStepId.value === 'grind') upgradeBonus = upgrades.value.grinder * 1.4
  if (currentStepId.value === 'extract') upgradeBonus = upgrades.value.machine * 1.25
  if (currentStepId.value === 'steam') upgradeBonus = upgrades.value.steam * 1.3
  return [Math.max(2, start + shrink - upgradeBonus), Math.min(98, end - shrink + upgradeBonus)]
})
const measurement = computed(() => {
  const value = processProgress.value
  if (currentStepId.value === 'grind') return `${Math.round(value)}% 细度`
  if (currentStepId.value === 'extract') return `${(18 + value * 0.18).toFixed(1)} 秒`
  if (currentStepId.value === 'water') return `${Math.round(value * 1.8)} ml`
  if (currentStepId.value === 'coconut') return `${Math.round(value * 1.45)} ml 椰乳`
  if (currentStepId.value === 'sparkling') return `${Math.round(value * 1.7)} ml 气泡水`
  if (currentStepId.value === 'steam') return `${Math.round(22 + value * 0.66)}°C`
  if (currentStepId.value === 'pour') return `${Math.round(value)}% 融合`
  if (isTapStep.value) return `${syrupPumps.value} / ${currentStep.value.targetCount} ${currentStep.value.unit}`
  return '完成'
})
const machineActionLabel = computed(() => {
  if (canServe.value) return '可以出杯'
  if (currentStepId.value === 'extract' && extractionRunning.value) return '停止萃取'
  return currentStep.value?.action || '制作完成'
})
const gestureInstruction = computed(() => {
  return currentStep.value?.instruction || ''
})
const usesEquipmentGesture = computed(() => currentStep.value?.mode === 'gesture')
const queueCount = computed(() => orders.value.filter((item) => !item.isResolving).length)
const activeMemory = computed(() => cafeMemories.find((memory) => memory.id === activeMemoryId.value) || null)
const upgradeCatalog = computed(() => [
  { id: 'grinder', name: '钻石磨豆机', description: '扩大研磨最佳区间', level: upgrades.value.grinder, cost: 120 + upgrades.value.grinder * 90 },
  { id: 'machine', name: '双锅炉咖啡机', description: '降低萃取升温并扩大窗口', level: upgrades.value.machine, cost: 150 + upgrades.value.machine * 110 },
  { id: 'steam', name: '强力蒸汽棒', description: '奶泡更稳定且更耐用', level: upgrades.value.steam, cost: 130 + upgrades.value.steam * 100 }
])

let gameTimer = null
let catTimer = null
let processFrame = 0
let processTimestamp = 0
let heartId = 0
let audioContext = null
let lastPetAt = 0
let equipmentGesture = null
let arrivalTimer = null
let orderSerial = 0
let maintenanceTimer = null
let memoryTimer = null
const managedTimers = new Set()

function playTone(kind = 'tap') {
  if (!soundEnabled.value || typeof window === 'undefined') return
  try {
    audioContext ||= new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const frequencies = { tap: 350, machine: 125, success: 660, error: 145, purr: 108, pump: 240 }
    oscillator.frequency.setValueAtTime(frequencies[kind] || 350, audioContext.currentTime)
    if (kind === 'success') oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.13)
    oscillator.type = ['machine', 'purr'].includes(kind) ? 'triangle' : 'sine'
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(kind === 'error' ? 0.055 : 0.03, audioContext.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.17)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.18)
  } catch {
    soundEnabled.value = false
  }
}

function setFeedback(message, tone = 'neutral') {
  feedback.value = message
  feedbackTone.value = tone
}

function selectNextMemory() {
  const undiscovered = cafeMemories.filter((memory) => !discoveredMemories.value.some((item) => item.id === memory.id))
  activeMemoryId.value = undiscovered.length
    ? undiscovered[Math.floor(Math.random() * undiscovered.length)].id
    : null
}

function closeMemory() {
  window.clearTimeout(memoryTimer)
  memoryTimer = null
  memoryMessage.value = null
  if (phase.value === 'playing') selectNextMemory()
}

function discoverMemory(memory) {
  if (!memory || memoryMessage.value) return
  if (!discoveredMemories.value.some((item) => item.id === memory.id)) {
    discoveredMemories.value.push(memory)
    catAffinity.value = Math.min(16, catAffinity.value + 1)
  }
  activeMemoryId.value = null
  memoryMessage.value = memory
  playTone('success')
  memoryTimer = window.setTimeout(closeMemory, 4200)
}

function cancelProcessFrame() {
  cancelAnimationFrame(processFrame)
  processFrame = 0
  processTimestamp = 0
  isHolding.value = false
  extractionRunning.value = false
  equipmentGesture = null
}

function clearTimers() {
  window.clearInterval(gameTimer)
  window.clearInterval(catTimer)
  window.clearInterval(arrivalTimer)
  window.clearTimeout(maintenanceTimer)
  window.clearTimeout(memoryTimer)
  managedTimers.forEach((timer) => window.clearTimeout(timer))
  managedTimers.clear()
  gameTimer = null
  catTimer = null
  arrivalTimer = null
  maintenanceTimer = null
  memoryTimer = null
  cancelProcessFrame()
}

function createOrder() {
  if (orders.value.length >= 3) return null
  const usedCustomers = new Set(orders.value.map((item) => item.customerIndex))
  customerIndex.value = (customerIndex.value + 1) % customers.length
  while (usedCustomers.has(customerIndex.value)) customerIndex.value = (customerIndex.value + 1) % customers.length
  const previousDrink = orders.value.at(-1)?.drinkId
  const options = drinks.filter((drink) => drink.id !== previousDrink)
  const drink = options[Math.floor(Math.random() * options.length)]
  const newOrder = {
    id: `order-${orderSerial += 1}`,
    customerIndex: customerIndex.value,
    drinkId: drink.id,
    patience: 100,
    feedback: `先完成「${stepDefinitions[drink.steps[0]].name}」`,
    feedbackTone: 'neutral',
    isResolving: false,
    activeStepIndex: 0,
    processProgress: 0,
    processState: 'idle',
    stepQualities: [],
    syrupPumps: 0,
    isHolding: false,
    extractionRunning: false,
    kettleAngle: 0,
    steamPosition: 50,
    latteTrail: [],
    latteReversals: 0
  }
  orders.value.push(newOrder)
  if (!activeOrderId.value) activeOrderId.value = newOrder.id
  playTone('tap')
  return newOrder
}

function getOrderDrink(queuedOrder) {
  return drinks.find((drink) => drink.id === queuedOrder.drinkId) || drinks[0]
}

function getOrderCustomer(queuedOrder) {
  return customers[queuedOrder.customerIndex] || customers[0]
}

function getOrderStep(queuedOrder) {
  const drink = getOrderDrink(queuedOrder)
  if (queuedOrder.activeStepIndex >= drink.steps.length) return '等待出杯'
  return stepDefinitions[drink.steps[queuedOrder.activeStepIndex]].short
}

function selectOrder(orderId) {
  if (orderId === activeOrderId.value || !orders.value.some((item) => item.id === orderId)) return
  if (processState.value === 'running') processState.value = 'idle'
  cancelProcessFrame()
  activeOrderId.value = orderId
  playTone('tap')
}

function scheduleReplacement(delay = 1200) {
  const timer = window.setTimeout(() => {
    managedTimers.delete(timer)
    if (phase.value === 'playing') createOrder()
  }, delay)
  managedTimers.add(timer)
}

function removeOrder(orderId) {
  const wasActive = activeOrderId.value === orderId
  orders.value = orders.value.filter((item) => item.id !== orderId)
  if (wasActive) activeOrderId.value = orders.value.find((item) => !item.isResolving)?.id || null
  if (phase.value === 'playing') scheduleReplacement()
}

function startGame() {
  clearTimers()
  phase.value = 'playing'
  showMenu.value = false
  timeLeft.value = ROUND_SECONDS
  coins.value = 0
  served.value = 0
  missed.value = 0
  combo.value = 0
  bestCombo.value = 0
  totalQuality.value = 0
  orders.value = []
  activeOrderId.value = null
  orderSerial = 0
  customerIndex.value = -1
  catAffinity.value = 0
  discoveredMemories.value = []
  memoryMessage.value = null
  catMood.value = 'idle'
  isPaused.value = false
  machineHeat.value = 0
  steamCleanliness.value = 100
  counterCleanliness.value = 100
  maintenanceLock.value = ''
  selectNextMemory()
  createOrder()
  createOrder()
  playTone('success')

  gameTimer = window.setInterval(() => {
    if (isPaused.value || phase.value !== 'playing') return
    timeLeft.value = Math.max(0, timeLeft.value - 1)
    machineHeat.value = Math.max(0, machineHeat.value - (2.5 + upgrades.value.machine * 0.35))
    const expiredOrders = []
    for (const queuedOrder of orders.value) {
      if (queuedOrder.isResolving) continue
      queuedOrder.patience = Math.max(0, queuedOrder.patience - (0.62 + served.value * 0.055))
      if (queuedOrder.patience <= 0) expiredOrders.push(queuedOrder.id)
    }
    expiredOrders.forEach(loseOrder)
    if (timeLeft.value <= 0) finishGame()
  }, 1000)

  arrivalTimer = window.setInterval(() => {
    if (!isPaused.value && phase.value === 'playing') createOrder()
  }, 10500)

  catTimer = window.setInterval(() => {
    if (isPaused.value || phase.value !== 'playing' || catMood.value === 'chase') return
    catSpot.value = Math.floor(Math.random() * 3)
    catMood.value = Math.random() > 0.7 ? 'sleep' : 'walk'
    catMessage.value = catMood.value === 'sleep' ? '呼噜…' : ''
    window.setTimeout(() => {
      if (catMood.value !== 'chase') catMood.value = 'idle'
    }, 1800)
  }, 5600)
}

function finishGame() {
  if (phase.value !== 'playing') return
  phase.value = 'result'
  showMenu.value = false
  isPaused.value = false
  clearTimers()
  bestScore.value = Math.max(bestScore.value, coins.value)
  wallet.value += coins.value
  try {
    localStorage.setItem('boh-anniversary-cafe-best', String(bestScore.value))
    localStorage.setItem('boh-anniversary-cafe-wallet', String(wallet.value))
    localStorage.setItem('boh-anniversary-cafe-upgrades', JSON.stringify(upgrades.value))
  } catch { /* localStorage may be unavailable in private contexts. */ }
  playTone('success')
}

function togglePause() {
  if (phase.value !== 'playing') return
  isPaused.value = !isPaused.value
  if (isPaused.value) cancelProcessFrame()
  playTone('tap')
}

function processLoop(timestamp) {
  if ((!isHolding.value && !extractionRunning.value) || isPaused.value || processState.value !== 'running') return
  if (!processTimestamp) processTimestamp = timestamp
  const delta = Math.min(0.05, (timestamp - processTimestamp) / 1000)
  processTimestamp = timestamp
  const difficulty = 1 + Math.min(0.32, served.value * 0.035)
  let gestureRate = 1
  if (currentStep.value?.gesture === 'water') gestureRate = Math.max(0.08, kettleAngle.value / 52)
  if (currentStep.value?.gesture === 'steam') gestureRate = steamPosition.value >= 36 && steamPosition.value <= 66 ? 1 : 0.42
  processProgress.value = Math.min(100, processProgress.value + currentStep.value.rate * difficulty * gestureRate * delta)
  if (processProgress.value >= 100) {
    failStep('操作过头了，需要重新来')
    return
  }
  processFrame = requestAnimationFrame(processLoop)
}

function beginHold(event) {
  if (!currentStep.value || currentStep.value.mode !== 'hold') return
  if (isPaused.value || isResolving.value || ['passed', 'error'].includes(processState.value)) return
  if (maintenanceLock.value) {
    setFeedback('设备正在维护，请稍候', 'error')
    return
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  isHolding.value = true
  processState.value = 'running'
  processTimestamp = 0
  setFeedback('保持住，在金色区域松手')
  playTone('machine')
  processFrame = requestAnimationFrame(processLoop)
}

function beginKeyboardHold(event) {
  if (event.repeat || isHolding.value) return
  beginHold(event)
}

function beginEquipmentGesture(event) {
  if (!usesEquipmentGesture.value || isPaused.value || isResolving.value || ['passed', 'error'].includes(processState.value)) return
  if (maintenanceLock.value) {
    setFeedback('设备正在维护，请稍候', 'error')
    return
  }
  if (currentStep.value?.gesture === 'steam' && steamCleanliness.value < 24) {
    setFeedback('蒸汽棒需要先清洁和排气', 'error')
    playTone('error')
    return
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const rect = event.currentTarget.getBoundingClientRect()
  equipmentGesture = {
    pointerId: event.pointerId,
    rect,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    distance: 0,
    direction: 0
  }
  isHolding.value = true
  processState.value = 'running'
  processTimestamp = 0
  if (currentStep.value?.gesture === 'pour') {
    processProgress.value = 0
    latteTrail.value = []
    latteReversals.value = 0
  } else {
    processFrame = requestAnimationFrame(processLoop)
  }
  setFeedback(gestureInstruction.value)
  playTone('machine')
}

function moveEquipmentGesture(event) {
  if (!equipmentGesture || event.pointerId !== equipmentGesture.pointerId) return
  const gesture = equipmentGesture
  if (currentStep.value?.gesture === 'water') {
    kettleAngle.value = Math.max(0, Math.min(55, (gesture.startY - event.clientY) * 0.72))
  } else if (currentStep.value?.gesture === 'steam') {
    steamPosition.value = Math.max(0, Math.min(100, ((event.clientY - gesture.rect.top) / gesture.rect.height) * 100))
  } else if (currentStep.value?.gesture === 'pour') {
    const dx = event.clientX - gesture.lastX
    const dy = event.clientY - gesture.lastY
    const distance = Math.hypot(dx, dy)
    if (distance > 1) {
      gesture.distance += distance
      const direction = Math.abs(dx) > 2 ? Math.sign(dx) : gesture.direction
      if (gesture.direction && direction && direction !== gesture.direction) latteReversals.value += 1
      gesture.direction = direction
      processProgress.value = Math.min(100, gesture.distance / Math.max(1.8, gesture.rect.width * 0.0065))
      latteTrail.value = [...latteTrail.value.slice(-13), {
        x: ((event.clientX - gesture.rect.left) / gesture.rect.width) * 100,
        y: ((event.clientY - gesture.rect.top) / gesture.rect.height) * 100
      }]
    }
  }
  gesture.lastX = event.clientX
  gesture.lastY = event.clientY
}

function endEquipmentGesture(event) {
  if (!equipmentGesture || (event?.pointerId != null && event.pointerId !== equipmentGesture.pointerId)) return
  const gestureType = currentStep.value?.gesture
  isHolding.value = false
  cancelAnimationFrame(processFrame)
  processFrame = 0
  equipmentGesture = null
  if (gestureType === 'steam' && (steamPosition.value < 36 || steamPosition.value > 66)) {
    failStep('奶缸位置偏离蒸汽旋涡')
    return
  }
  if (gestureType === 'pour' && latteReversals.value < 3) {
    failStep('拉花需要至少三次左右往复')
    return
  }
  gradeStep()
}

function releaseHold() {
  if (!isHolding.value) return
  isHolding.value = false
  cancelAnimationFrame(processFrame)
  gradeStep()
}

function toggleExtraction() {
  if (currentStepId.value !== 'extract' || isPaused.value || isResolving.value || processState.value === 'passed') return
  if (extractionRunning.value) {
    extractionRunning.value = false
    cancelAnimationFrame(processFrame)
    gradeStep()
    return
  }
  if (machineHeat.value >= 88) {
    setFeedback('咖啡机过热，需要排压降温', 'error')
    playTone('error')
    return
  }
  if (maintenanceLock.value) return
  processState.value = 'running'
  extractionRunning.value = true
  processTimestamp = 0
  setFeedback('观察压力表，在金色区域停止')
  playTone('machine')
  processFrame = requestAnimationFrame(processLoop)
}

function doseIngredient() {
  if (!isTapStep.value || isPaused.value || isResolving.value || processState.value === 'passed') return
  syrupPumps.value += 1
  processProgress.value = (syrupPumps.value / currentStep.value.targetCount) * 100
  playTone('pump')
  if (syrupPumps.value < currentStep.value.targetCount) {
    processState.value = 'running'
    setFeedback(`还需要 ${currentStep.value.targetCount - syrupPumps.value} ${currentStep.value.unit}${currentStep.value.name}`)
    return
  }
  completeStep(96, `${currentStep.value.targetCount} ${currentStep.value.unit}，份量刚好`)
}

function gradeStep() {
  if (!currentStep.value || processState.value !== 'running') return
  const [start, end] = targetBounds.value
  const value = processProgress.value
  if (value >= start && value <= end) {
    const center = (start + end) / 2
    const half = Math.max(1, (end - start) / 2)
    const quality = Math.round(100 - (Math.abs(value - center) / half) * 13)
    completeStep(quality, quality >= 96 ? '时机完美' : '状态很好')
    return
  }
  const distance = value < start ? start - value : value - end
  if (distance <= 8) {
    completeStep(Math.round(76 - distance * 2), '稍有偏差，但可以继续')
    return
  }
  failStep(value < start ? '太早了，设备还没进入状态' : '太晚了，这一步需要重做')
}

function completeStep(quality, message) {
  const completedOrder = order.value
  if (!completedOrder) return
  cancelProcessFrame()
  completedOrder.processState = 'passed'
  completedOrder.stepQualities.push(quality)
  completedOrder.feedback = `${message} · 品质 ${quality}`
  completedOrder.feedbackTone = 'success'
  if (currentStepId.value === 'extract') machineHeat.value = Math.min(100, machineHeat.value + Math.max(12, 25 - upgrades.value.machine * 4))
  if (currentStepId.value === 'steam') steamCleanliness.value = Math.max(0, steamCleanliness.value - Math.max(14, 29 - upgrades.value.steam * 3))
  playTone('success')
  const completedOrderId = completedOrder.id
  const timer = window.setTimeout(() => {
    managedTimers.delete(timer)
    const targetOrder = orders.value.find((item) => item.id === completedOrderId)
    if (!targetOrder) return
    targetOrder.activeStepIndex += 1
    targetOrder.processProgress = 0
    targetOrder.syrupPumps = 0
    targetOrder.processState = 'idle'
    const targetDrink = drinks.find((drink) => drink.id === targetOrder.drinkId)
    const nextStepId = targetDrink.steps[targetOrder.activeStepIndex]
    const average = Math.round(targetOrder.stepQualities.reduce((sum, value) => sum + value, 0) / targetOrder.stepQualities.length)
    targetOrder.feedback = nextStepId ? `下一步：${stepDefinitions[nextStepId].name}` : `制作完成 · 综合品质 ${average}`
    targetOrder.feedbackTone = nextStepId ? 'neutral' : 'success'
  }, 480)
  managedTimers.add(timer)
}

function failStep(message) {
  const failedOrder = order.value
  if (!failedOrder) return
  cancelProcessFrame()
  failedOrder.processState = 'error'
  failedOrder.patience = Math.max(5, failedOrder.patience - 8)
  failedOrder.feedback = `${message} · 顾客耐心 -8`
  failedOrder.feedbackTone = 'error'
  playTone('error')
  const failedOrderId = failedOrder.id
  const timer = window.setTimeout(() => {
    managedTimers.delete(timer)
    const targetOrder = orders.value.find((item) => item.id === failedOrderId)
    if (!targetOrder) return
    targetOrder.processProgress = 0
    targetOrder.syrupPumps = 0
    targetOrder.processState = 'idle'
  }, 650)
  managedTimers.add(timer)
}

function resetCurrentStep() {
  if (processState.value === 'passed' || canServe.value) return
  cancelProcessFrame()
  processProgress.value = 0
  syrupPumps.value = 0
  kettleAngle.value = 0
  steamPosition.value = 50
  latteTrail.value = []
  latteReversals.value = 0
  processState.value = 'idle'
  setFeedback(`已重置「${currentStep.value.name}」`)
  playTone('tap')
}

function resolveSuccess({ catAssist = false, orderId = activeOrderId.value } = {}) {
  const completedOrder = orders.value.find((item) => item.id === orderId)
  if (!completedOrder || completedOrder.isResolving) return
  completedOrder.isResolving = true
  const completedDrink = drinks.find((drink) => drink.id === completedOrder.drinkId)
  const quality = catAssist
    ? 82
    : Math.round(completedOrder.stepQualities.reduce((sum, value) => sum + value, 0) / completedOrder.stepQualities.length)
  const earnedCombo = catAssist ? combo.value : combo.value + 1
  combo.value = earnedCombo
  bestCombo.value = Math.max(bestCombo.value, earnedCombo)
  const qualityTip = Math.round((quality - 60) / 4)
  const patienceTip = Math.round(completedOrder.patience / 14)
  const comboTip = Math.min(earnedCombo * 2, 14)
  const earned = completedDrink.price + Math.max(0, qualityTip) + patienceTip + comboTip
  coins.value += earned
  served.value += 1
  totalQuality.value += quality
  completedOrder.feedback = catAssist ? `小满稳稳送出了 ${completedDrink.name}` : `出杯完成 · 品质 ${quality} · +${earned}`
  completedOrder.feedbackTone = 'success'
  counterCleanliness.value = Math.max(0, counterCleanliness.value - 11)
  playTone('success')
  if (activeOrderId.value === orderId) {
    cancelProcessFrame()
    activeOrderId.value = orders.value.find((item) => item.id !== orderId && !item.isResolving)?.id || orderId
  }
  const timer = window.setTimeout(() => {
    managedTimers.delete(timer)
    removeOrder(orderId)
  }, 650)
  managedTimers.add(timer)
}

function serveDrink() {
  if (phase.value !== 'playing' || isPaused.value || isResolving.value) return
  if (!canServe.value) {
    patience.value = Math.max(5, patience.value - 4)
    setFeedback(`还没有完成「${currentStep.value.name}」`, 'error')
    playTone('error')
    return
  }
  if (counterCleanliness.value < 16) {
    setFeedback('操作台需要先清洁才能出杯', 'error')
    playTone('error')
    return
  }
  resolveSuccess()
}

function serviceEquipment(kind) {
  if (maintenanceLock.value || isHolding.value || extractionRunning.value) return
  maintenanceLock.value = kind
  cancelProcessFrame()
  playTone('machine')
  maintenanceTimer = window.setTimeout(() => {
    if (kind === 'machine') machineHeat.value = Math.max(0, machineHeat.value - 42)
    if (kind === 'steam') steamCleanliness.value = 100
    if (kind === 'counter') counterCleanliness.value = 100
    maintenanceLock.value = ''
    if (order.value) setFeedback(kind === 'machine' ? '排压完成，咖啡机已经降温' : kind === 'steam' ? '蒸汽棒清洁完成' : '操作台已经擦干净', 'success')
    playTone('success')
  }, kind === 'machine' ? 1200 : 900)
}

function purchaseUpgrade(item) {
  if (wallet.value < item.cost || item.level >= 3) return
  wallet.value -= item.cost
  upgrades.value[item.id] += 1
  try {
    localStorage.setItem('boh-anniversary-cafe-wallet', String(wallet.value))
    localStorage.setItem('boh-anniversary-cafe-upgrades', JSON.stringify(upgrades.value))
  } catch { /* localStorage may be unavailable in private contexts. */ }
  playTone('success')
}

function loseOrder(orderId = activeOrderId.value) {
  const lostOrder = orders.value.find((item) => item.id === orderId)
  if (!lostOrder || lostOrder.isResolving) return
  lostOrder.isResolving = true
  const lostCustomer = customers[lostOrder.customerIndex]
  if (activeOrderId.value === orderId) cancelProcessFrame()
  missed.value += 1
  combo.value = 0
  lostOrder.feedback = `${lostCustomer.name} 没能等到这杯咖啡`
  lostOrder.feedbackTone = 'error'
  playTone('error')
  if (activeOrderId.value === orderId) {
    activeOrderId.value = orders.value.find((item) => item.id !== orderId && !item.isResolving)?.id || orderId
  }
  const timer = window.setTimeout(() => {
    managedTimers.delete(timer)
    removeOrder(orderId)
  }, 650)
  managedTimers.add(timer)
}

function spawnHeart() {
  const id = heartId += 1
  hearts.value.push({ id, left: 42 + Math.random() * 16 })
  window.setTimeout(() => {
    hearts.value = hearts.value.filter((heart) => heart.id !== id)
  }, 1100)
}

function petCat() {
  const now = Date.now()
  if (now - lastPetAt < 320) return
  lastPetAt = now
  catAffinity.value = Math.min(16, catAffinity.value + 1)
  catMood.value = 'happy'
  catMessage.value = catAffinity.value >= CAT_HELP_COST ? '我能帮忙！' : '喵~'
  spawnHeart()
  playTone('purr')
  window.setTimeout(() => {
    if (catMood.value === 'happy') catMood.value = 'idle'
    catMessage.value = ''
  }, 1200)
}

function playWithCat() {
  if (catMood.value === 'chase') return
  catMood.value = 'chase'
  catMessage.value = '抓到了！'
  catAffinity.value = Math.min(16, catAffinity.value + 2)
  catSpot.value = (catSpot.value + 1) % 3
  playTone('tap')
  window.setTimeout(() => {
    catMood.value = 'happy'
    catMessage.value = ''
  }, 1300)
}

function askCatForHelp() {
  if (!catHelpReady.value) return
  const assistedOrderId = activeOrderId.value
  catAffinity.value -= CAT_HELP_COST
  catMood.value = 'help'
  catMessage.value = '这杯交给我！'
  cancelProcessFrame()
  activeStepIndex.value = currentDrink.value.steps.length
  stepQualities.value = currentDrink.value.steps.map(() => 82)
  processState.value = 'passed'
  window.setTimeout(() => resolveSuccess({ catAssist: true, orderId: assistedOrderId }), 350)
  window.setTimeout(() => {
    catMood.value = 'idle'
    catMessage.value = ''
  }, 1500)
}

function returnToIntro() {
  clearTimers()
  phase.value = 'intro'
  showMenu.value = false
  memoryMessage.value = null
  activeMemoryId.value = null
  orders.value = []
  activeOrderId.value = null
}

onMounted(() => {
  document.documentElement.classList.add('anniversary-cafe-open')
  try {
    bestScore.value = Number(localStorage.getItem('boh-anniversary-cafe-best')) || 0
    wallet.value = Math.max(0, Number(localStorage.getItem('boh-anniversary-cafe-wallet')) || 0)
    const savedUpgrades = JSON.parse(localStorage.getItem('boh-anniversary-cafe-upgrades') || '{}')
    for (const key of Object.keys(upgrades.value)) {
      const level = Number(savedUpgrades[key])
      upgrades.value[key] = Number.isFinite(level) ? Math.max(0, Math.min(3, Math.floor(level))) : 0
    }
  } catch { /* localStorage may be unavailable in private contexts. */ }
})

onUnmounted(() => {
  clearTimers()
  document.documentElement.classList.remove('anniversary-cafe-open')
  audioContext?.close()
})
</script>

<template>
  <main class="cafe-game" :style="{ '--cafe-image': `url(${cafeImage})` }">
    <div class="cafe-backdrop" aria-hidden="true"></div>
    <div class="cafe-shade" aria-hidden="true"></div>

    <header class="game-bar">
      <button type="button" class="brand-lockup" aria-label="返回开场" @click="returnToIntro">
        <span class="brand-mark">BOH</span>
        <span><strong>云上咖啡店</strong><small>八周年营业日</small></span>
      </button>
      <div v-if="phase === 'playing'" class="day-progress" aria-label="营业时间进度">
        <span>营业中</span><div><i :style="{ transform: `scaleX(${progress / 100})` }"></i></div><strong>{{ timeLeft }}s</strong>
      </div>
      <div class="bar-actions">
        <router-link to="/" class="icon-button" aria-label="返回网站首页">
          <House :size="18" />
        </router-link>
        <button type="button" class="icon-button" :aria-label="soundEnabled ? '关闭音效' : '打开音效'" @click="soundEnabled = !soundEnabled">
          <Volume2 v-if="soundEnabled" :size="18" /><VolumeX v-else :size="18" />
        </button>
        <button v-if="phase === 'playing'" type="button" class="icon-button" :aria-label="isPaused ? '继续营业' : '暂停营业'" @click="togglePause">
          <Play v-if="isPaused" :size="18" /><Pause v-else :size="18" />
        </button>
      </div>
    </header>

    <section v-if="phase === 'playing'" class="hud" aria-label="营业数据">
      <div><small>营业额</small><strong>¥ {{ coins }}</strong></div>
      <div><small>已出杯</small><strong>{{ served }}</strong></div>
      <div :class="{ active: combo > 1 }"><small>连杯</small><strong>× {{ combo }}</strong></div>
    </section>

    <section v-if="phase === 'playing'" class="game-stage" :class="{ paused: isPaused }">
      <nav class="order-queue" aria-label="待制作订单">
        <header><span>ORDER QUEUE</span><strong>{{ queueCount }} / 3</strong></header>
        <button
          v-for="queuedOrder in orders"
          :key="queuedOrder.id"
          type="button"
          class="queue-order"
          :class="{ active: queuedOrder.id === activeOrderId, resolving: queuedOrder.isResolving, warning: queuedOrder.patience < 35 }"
          :disabled="queuedOrder.isResolving"
          @click="selectOrder(queuedOrder.id)"
        >
          <img :src="getOrderCustomer(queuedOrder).image" alt="">
          <span><b>{{ getOrderCustomer(queuedOrder).name }}</b><small>{{ getOrderDrink(queuedOrder).name }}</small></span>
          <em>{{ queuedOrder.isResolving ? '完成' : getOrderStep(queuedOrder) }}</em>
          <i><span :style="{ transform: `scaleX(${queuedOrder.patience / 100})` }"></span></i>
        </button>
      </nav>

      <aside class="equipment-status" aria-label="设备状态">
        <header><span>EQUIPMENT</span><strong>{{ maintenanceLock ? '维护中' : '设备监控' }}</strong></header>
        <button type="button" :class="{ danger: machineHeat >= 72 }" :disabled="Boolean(maintenanceLock)" @click="serviceEquipment('machine')">
          <Gauge :size="15" /><span><b>锅炉温度</b><i><em :style="{ transform: `scaleX(${machineHeat / 100})` }"></em></i></span><strong>{{ Math.round(machineHeat) }}%</strong><small>{{ maintenanceLock === 'machine' ? '排压中' : '排压' }}</small>
        </button>
        <button type="button" :class="{ danger: steamCleanliness <= 38 }" :disabled="Boolean(maintenanceLock)" @click="serviceEquipment('steam')">
          <Milk :size="15" /><span><b>蒸汽棒</b><i><em :style="{ transform: `scaleX(${steamCleanliness / 100})` }"></em></i></span><strong>{{ Math.round(steamCleanliness) }}%</strong><small>{{ maintenanceLock === 'steam' ? '清洁中' : '清洁' }}</small>
        </button>
        <button type="button" :class="{ danger: counterCleanliness <= 32 }" :disabled="Boolean(maintenanceLock)" @click="serviceEquipment('counter')">
          <Sparkles :size="15" /><span><b>操作台</b><i><em :style="{ transform: `scaleX(${counterCleanliness / 100})` }"></em></i></span><strong>{{ Math.round(counterCleanliness) }}%</strong><small>{{ maintenanceLock === 'counter' ? '擦拭中' : '擦拭' }}</small>
        </button>
      </aside>

      <button
        v-if="activeMemory"
        type="button"
        class="memory-poster"
        :aria-label="`查看方块之家回忆：${activeMemory.title}`"
        @click="discoverMemory(activeMemory)"
      >
        <img :src="activeMemory.image" :alt="activeMemory.title">
        <span>{{ activeMemory.year }}</span>
      </button>

      <Transition name="memory-pop">
        <aside v-if="memoryMessage" class="memory-reveal" role="status">
          <img :src="memoryMessage.image" :alt="memoryMessage.title">
          <div><small>BOH MEMORY · {{ memoryMessage.year }}</small><strong>{{ memoryMessage.title }}</strong><p>{{ memoryMessage.detail }}</p></div>
          <button type="button" aria-label="收起回忆" @click="closeMemory"><X :size="16" /></button>
        </aside>
      </Transition>

      <div v-if="order" class="customer-zone" :key="order.id">
        <div class="speech-ticket">
          <div class="ticket-topline"><span>{{ currentCustomer.name }}</span><span class="patience-dot" :class="{ warning: patience < 35 }"></span></div>
          <strong>{{ currentDrink.name }}</strong>
          <small>{{ currentCustomer.note }}</small>
          <div class="patience-track" aria-label="顾客耐心"><i :style="{ transform: `scaleX(${patience / 100})` }"></i></div>
        </div>
        <img class="mc-customer" :src="currentCustomer.image" :alt="`${currentCustomer.name} 的 Minecraft 皮肤角色`">
      </div>

      <div class="cat-zone" :style="catPositionStyle">
        <TransitionGroup name="heart-rise">
          <Heart v-for="heart in hearts" :key="heart.id" class="cat-heart" :style="{ left: `${heart.left}%` }" :size="19" fill="currentColor" />
        </TransitionGroup>
        <span v-if="catMessage" class="cat-bubble">{{ catMessage }}</span>
        <button type="button" class="voxel-cat" :class="`mood-${catMood}`" aria-label="摸摸小满" @pointerdown="petCat">
          <span class="cat-tail"></span><span class="cat-body"></span><span class="cat-chest"></span>
          <span class="cat-head"><i class="ear left"></i><i class="ear right"></i><i class="eye left"></i><i class="eye right"></i><i class="nose"></i></span>
          <span class="cat-paw left"></span><span class="cat-paw right"></span>
        </button>
        <div class="cat-controls">
          <button type="button" class="toy-button" @click="playWithCat"><span aria-hidden="true"></span>逗猫</button>
          <button type="button" class="help-button" :disabled="!catHelpReady" @click="askCatForHelp">
            <Heart :size="14" :fill="catHelpReady ? 'currentColor' : 'none'" />{{ catHelpReady ? '小满救场' : `${catAffinity}/${CAT_HELP_COST}` }}
          </button>
        </div>
      </div>

      <section v-if="order" class="workbench" aria-label="咖啡制作台">
        <header class="ticket-rail">
          <button type="button" class="menu-toggle" @click="showMenu = !showMenu"><Coffee :size="16" /><span>{{ currentDrink.name }}</span></button>
          <ol class="process-steps">
            <li
              v-for="(stepId, index) in currentDrink.steps"
              :key="stepId"
              :class="{ done: index < activeStepIndex, active: index === activeStepIndex && !canServe }"
            >
              <component :is="stepDefinitions[stepId].icon" :size="14" />
              <span>{{ stepDefinitions[stepId].short }}</span>
              <b v-if="index < activeStepIndex">{{ stepQualities[index] }}</b>
            </li>
          </ol>
          <div class="quality-readout"><small>本杯品质</small><strong>{{ currentQuality || '--' }}</strong></div>
        </header>

        <div class="machine-deck" :class="`station-${currentStepId || 'serve'}`">
          <div
            class="equipment-bay"
            :class="{ interactive: usesEquipmentGesture, 'gesture-active': isHolding }"
            :role="usesEquipmentGesture ? 'button' : undefined"
            :tabindex="usesEquipmentGesture ? 0 : undefined"
            :aria-label="usesEquipmentGesture ? gestureInstruction : undefined"
            @pointerdown="beginEquipmentGesture"
            @pointermove="moveEquipmentGesture"
            @pointerup="endEquipmentGesture"
            @pointercancel="endEquipmentGesture"
          >
            <div
              v-if="usesEquipmentGesture"
              class="gesture-guide"
              :class="`guide-${currentStep?.gesture}`"
              aria-hidden="true"
            >
              <ArrowUp v-if="currentStep?.gesture === 'water'" :size="24" :stroke-width="2.5" />
              <MoveVertical v-else-if="currentStep?.gesture === 'steam'" :size="24" :stroke-width="2.5" />
              <MoveHorizontal v-else :size="28" :stroke-width="2.5" />
            </div>
            <div v-if="currentStep?.visual === 'grind'" class="grinder machine-object">
              <span class="bean-hopper"><i v-for="bean in 7" :key="bean"></i></span><span class="grinder-body"><b></b></span><span class="portafilter"></span><span class="grounds" :style="{ transform: `scaleY(${processProgress / 100})` }"></span>
            </div>
            <div v-else-if="currentStep?.visual === 'extract'" class="espresso-machine machine-object" :class="{ running: extractionRunning }">
              <span class="machine-top"><i></i><b></b></span><span class="machine-face"><i :style="{ transform: `rotate(${-115 + processProgress * 2.3}deg)` }"></i></span><span class="group-head"></span><span class="coffee-stream"></span><span class="machine-cup"><i :style="{ transform: `scaleY(${processProgress / 100})` }"></i></span>
            </div>
            <div v-else-if="currentStep?.visual === 'water'" class="kettle-station machine-object" :class="{ running: isHolding, coconut: currentStepId === 'coconut', sparkling: currentStepId === 'sparkling' }">
              <span class="voxel-kettle" :style="{ '--kettle-angle': `${-kettleAngle}deg` }"><i></i><b></b><em>{{ currentStepId === 'coconut' ? 'COCO' : currentStepId === 'sparkling' ? 'SODA' : 'H₂O' }}</em></span><span class="water-stream" :style="{ opacity: kettleAngle > 8 ? Math.min(1, kettleAngle / 28) : 0 }"></span><span class="brew-cup"><i :style="{ transform: `scaleY(${processProgress / 100})` }"></i></span>
            </div>
            <div v-else-if="currentStep?.visual === 'steam'" class="steam-station machine-object" :class="{ running: isHolding }">
              <span class="steam-wand"><i></i></span><span class="milk-pitcher" :style="{ transform: `translate(-50%, ${(steamPosition - 50) * 0.32}px)` }"><i :style="{ transform: `scaleY(${Math.max(0.2, processProgress / 100)})` }"></i></span><span class="steam-cloud">•••</span>
            </div>
            <div v-else-if="currentStep?.visual === 'dose'" class="syrup-station machine-object" :class="{ pumping: processState === 'running' }" :style="{ '--dose-color': currentStep.color }">
              <span class="syrup-bottle"><i>{{ currentStep.jarLabel }}</i><b></b></span><span class="syrup-pump"></span><span class="syrup-cup"><i v-for="pump in syrupPumps" :key="pump"></i></span>
            </div>
            <div v-else-if="currentStep?.visual === 'pour'" class="pour-station machine-object" :class="{ running: isHolding }">
              <span class="pour-pitcher"><i></i></span><span class="milk-ribbon"></span><span class="latte-cup"><i :style="{ transform: `scale(${processProgress / 100})` }"></i><b v-for="(point, index) in latteTrail" :key="index" :style="{ left: `${point.x}%`, top: `${point.y}%` }"></b></span>
            </div>
            <div v-else class="serve-station machine-object"><span class="finished-cup"><i></i></span><Sparkles :size="28" /></div>
          </div>

          <div class="control-bay">
            <div class="control-heading">
              <span>STEP {{ Math.min(activeStepIndex + 1, currentDrink.steps.length) }} / {{ currentDrink.steps.length }}</span>
              <strong>{{ canServe ? '制作完成' : currentStep.name }}</strong>
              <small>{{ canServe ? '检查品质并交给顾客' : measurement }}</small>
            </div>

            <div v-if="!canServe && !isTapStep" class="process-meter" :class="processState">
              <span class="meter-target" :style="{ left: `${targetBounds[0]}%`, width: `${targetBounds[1] - targetBounds[0]}%` }"></span>
              <i :style="{ transform: `scaleX(${processProgress / 100})` }"></i>
              <b :style="{ left: `${processProgress}%` }"></b>
            </div>
            <div v-else-if="isTapStep" class="pump-counter">
              <i v-for="dose in currentStep.targetCount" :key="dose" :class="{ filled: syrupPumps >= dose }"></i>
            </div>
            <div v-else class="quality-bar"><span :style="{ width: `${currentQuality}%` }"></span></div>

            <p class="feedback" :class="feedbackTone" role="status">{{ feedback }}</p>

            <div class="machine-actions">
              <button v-if="!canServe" type="button" class="reset-button" :disabled="processState === 'passed'" aria-label="重置当前步骤" @click="resetCurrentStep"><Trash2 :size="18" /></button>
              <button
                v-if="currentStepId === 'extract'"
                type="button"
                class="machine-button"
                :class="{ running: extractionRunning }"
                @click="toggleExtraction"
              ><Gauge :size="18" />{{ machineActionLabel }}</button>
              <button
                v-else-if="isTapStep"
                type="button"
                class="machine-button"
                @click="doseIngredient"
              ><Sparkles :size="18" />{{ machineActionLabel }}</button>
              <div v-else-if="usesEquipmentGesture" class="gesture-hint">
                <component :is="currentStep.icon" :size="18" /><span>{{ gestureInstruction }}</span>
              </div>
              <button
                v-else-if="!canServe"
                type="button"
                class="machine-button hold-button"
                :class="{ running: isHolding }"
                @pointerdown="beginHold"
                @pointerup="releaseHold"
                @pointercancel="releaseHold"
                @keydown.space.prevent="beginKeyboardHold"
                @keyup.space.prevent="releaseHold"
              ><component :is="currentStep.icon" :size="18" />{{ machineActionLabel }}</button>
              <button v-else type="button" class="serve-button" @click="serveDrink"><Send :size="19" />出杯给 {{ currentCustomer.name }}</button>
            </div>
          </div>
        </div>
      </section>

      <Transition name="menu-pop">
        <aside v-if="showMenu" class="menu-sheet" aria-label="完整菜单">
          <div class="menu-sheet-head"><div><small>MENU / 今日菜单</small><strong>云上咖啡</strong></div><button type="button" class="icon-button" aria-label="关闭菜单" @click="showMenu = false"><X :size="18" /></button></div>
          <div v-for="drink in drinks" :key="drink.id" class="menu-line">
            <span :style="{ '--drink-color': drink.color }"></span><strong>{{ drink.name }}</strong><small>{{ drink.steps.map((step) => stepDefinitions[step].short).join(' → ') }}</small><b>¥{{ drink.price }}</b>
          </div>
        </aside>
      </Transition>
    </section>

    <section v-if="phase === 'intro'" class="opening-panel">
      <p class="opening-kicker">BLOCK OF HOME · 8TH ANNIVERSARY</p>
      <h1>亲手做一杯<br>云上的咖啡。</h1>
      <p class="opening-copy">同时照顾三位方块熟客，在研磨、萃取、奶泡与融合之间灵活切换。留意设备温度和清洁度，打烊后还能永久升级吧台。</p>
      <div class="opening-meta"><span><strong>150</strong> 秒营业</span><span><strong>3</strong> 单并行</span><span><strong>8</strong> 款咖啡</span></div>
      <button type="button" class="start-button" @click="startGame"><Play :size="19" fill="currentColor" />开始营业</button>
      <p v-if="bestScore" class="best-score">历史最佳营业额 ¥{{ bestScore }}</p>
    </section>

    <section v-if="phase === 'result'" class="result-panel">
      <p class="opening-kicker">CLOSED · 今日打烊</p>
      <div class="result-stars" :aria-label="`${stars} 星评价`"><Sparkles v-for="star in 3" :key="star" :class="{ lit: star <= stars }" :size="24" fill="currentColor" /></div>
      <h2>{{ resultTitle }}</h2>
      <p>最后一位客人离开后，小满跳上操作台，认真检查了咖啡机和今天的账本。</p>
      <div class="result-grid"><div><small>营业额</small><strong>¥{{ coins }}</strong></div><div><small>完成订单</small><strong>{{ served }}</strong></div><div><small>平均品质</small><strong>{{ averageQuality }}</strong></div><div><small>最高连杯</small><strong>×{{ bestCombo }}</strong></div></div>
      <section v-if="discoveredMemories.length" class="memory-log" aria-label="本局发现的方块之家回忆">
        <header><span>今日找到的回忆</span><strong>{{ discoveredMemories.length }} / {{ cafeMemories.length }}</strong></header>
        <div><span v-for="memory in discoveredMemories" :key="memory.id"><img :src="memory.image" alt=""><b>{{ memory.year }}</b>{{ memory.title }}</span></div>
      </section>
      <section class="upgrade-shop" aria-label="设备升级">
        <header><span><small>长期经营资金</small><strong>¥{{ wallet }}</strong></span><b>永久升级</b></header>
        <div v-for="item in upgradeCatalog" :key="item.id" class="upgrade-row">
          <span><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span>
          <div class="upgrade-level" :aria-label="`${item.level} 级，共 3 级`"><i v-for="level in 3" :key="level" :class="{ filled: level <= item.level }"></i></div>
          <button type="button" :disabled="item.level >= 3 || wallet < item.cost" @click="purchaseUpgrade(item)">{{ item.level >= 3 ? '已满级' : `¥${item.cost} 升级` }}</button>
        </div>
      </section>
      <p class="result-note">今日营业额已存入长期经营资金，升级会保留到下一局。</p>
      <div class="result-actions"><button type="button" class="secondary-button" @click="returnToIntro">回到店外</button><button type="button" class="start-button" @click="startGame"><RotateCcw :size="18" />再营业一次</button></div>
    </section>

    <Transition name="pause-fade"><div v-if="isPaused" class="pause-overlay"><button type="button" aria-label="继续营业" @click="togglePause"><Play :size="28" fill="currentColor" /></button><strong>暂停营业</strong><span>咖啡机和顾客耐心都已暂停</span></div></Transition>
  </main>
</template>

<style scoped src="./style.scoped.css"></style>
