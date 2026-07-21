<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Box, Check } from 'lucide-vue-next'
import { applyJourneyCopyDraft, loadJourneyCopyDraft } from './copy-editor-store.js'

import originImage from '@/assets/images/boh-journey/2018-origin.webp'
import builderImage from '@/assets/images/boh-journey/2019-builder.webp'
import islandImage from '@/assets/images/boh-journey/2019-island.webp'
import pokemonImage from '@/assets/images/boh-journey/2019-pokemon.webp'
import togetherImage from '@/assets/images/boh-journey/2021-yier.webp'
import togetherAltImage from '@/assets/images/boh-journey/2021-bimo.webp'
import fourYearsImage from '@/assets/images/boh-journey/2022-four.webp'
import fourYearsAltImage from '@/assets/images/boh-journey/2022-four-alt.webp'
import fourYearsNationalImage from '@/assets/images/boh-journey/2022-national.webp'
import fourYearsChristmasImage from '@/assets/images/boh-journey/2022-christmas.webp'
import fourYearsNewYearImage from '@/assets/images/boh-journey/2022-newyear.webp'
import fiveYearsImage from '@/assets/images/boh-journey/2023-five.webp'
import fiveYearsNationalImage from '@/assets/images/boh-journey/2023-national.webp'
import fiveYearsBirthdayImage from '@/assets/images/boh-journey/2023-birthday.webp'
import fiveYearsChristmasImage from '@/assets/images/boh-journey/2023-christmas.webp'
import fiveYearsFarmImage from '@/assets/images/2023-8-nfls.webp'
import fiveYearsHibernateImage from '@/assets/images/2023-12m-dongmian.webp'
import homeImage from '@/assets/images/boh-journey/2024-snow.webp'
import homeNewYearImage from '@/assets/images/2024-newyears.webp'
import homeTruckImage from '@/assets/images/2024-07-15_13.26.19.webp'
import homeFarmImage from '@/assets/images/2024-1-fangkuai.webp'
import sevenYearsImage from '@/assets/images/boh-journey/2025-seven.webp'
import sevenYearsMuseumImage from '@/assets/images/boh-journey/2025-museum.webp'
import sevenYearsQaImage from '@/assets/images/boh-journey/2025-qa.webp'
import sevenYearsNationalImage from '@/assets/images/2025-10-shengri.webp'
import futureImage from '@/assets/images/boh-journey/2026-newyear.webp'
import winterFourthImage from '@/assets/images/26lfhome.webp'
import reunionImage from '@/assets/images/blockschool.webp'

const router = useRouter()
const journeyCopyDraft = loadJourneyCopyDraft()
const rootRef = ref(null)
const heroRef = ref(null)
const grainRef = ref(null)
const tunnelRef = ref(null)
const thenNowRef = ref(null)
const worldRef = ref(null)
const strataRef = ref(null)
const finaleRef = ref(null)

const heroProgress = ref(0)
const tunnelProgress = ref(0)
const thenNowProgress = ref(0)
const worldProgress = ref(0)
const strataProgress = ref(0)
const finaleProgress = ref(0)
const activeStage = ref('timeline')
const activeChapter = ref(0)
const reduceMotion = ref(false)
const viewportWidth = ref(1024)
const viewportHeight = ref(768)
const collectedYears = ref(new Set())
const finalBlockPlaced = ref(false)
const photoDeckState = ref({ chapterIndex: -1, x: 0, dragging: false, settling: false, leaving: false })
const finalTargetRef = ref(null)
const finalBlockRef = ref(null)
const progressFillRef = ref(null)
const finalBlockOffset = ref({ x: 0, y: 0 })
const finalBlockDragging = ref(false)
const finalBlockSettling = ref(false)

const sectionMetrics = new Map()
const tunnelPanelElements = []
let rootMetrics = null

let photoPointer = null
let photoDeckTimer = 0
let suppressPhotoClick = false
let finalDrag = null
let suppressFinalClick = false
let finalSettleTimer = 0
let geometryObserver = null
let grainObserver = null
let tunnelVisualProgress = 0
let appliedTunnelProgress = -1

const chapters = [
  {
    year: '2018',
    kicker: 'ORIGIN / 出生点',
    title: '世界从空岛醒来',
    copy: '第一张地图很小，路也还没有延伸太远。但出生点旁的每一格土地，都记录着最初的想象。',
    image: originImage,
    scan: originImage,
    accent: '#f6b958',
    moments: [
      { title: '第一张地图', copy: '方块，空岛，指令，一张承载大家心血的地图，方块之家第一张自制地图。', x: 24, y: 63, image: originImage },
      { title: '家的原点', copy: '这里还没有宏大的建筑，只有一群人决定继续把路向外铺开。', x: 70, y: 34, image: originImage }
    ]
  },
  {
    year: '2019',
    kicker: 'SETTLE / 生长',
    title: '三周年，有人开始留下房子',
    copy: '人物站到建筑前，建筑服也逐渐形成，地图不再只是出生点，而是逐渐能被称作家。',
    image: builderImage,
    scan: islandImage,
    accent: '#8ee08f',
    moments: [
      { title: '建筑与建造者', copy: '小牛站在完成的建筑前，人物第一次成为地图记忆的主角。', x: 28, y: 39, image: builderImage },
      { title: '空岛全景', copy: '这一年已经铺开的道路、平台与共同空间，让空岛拥有了完整轮廓，本应有雕刻世界图片，奈何缺失。', x: 73, y: 62, image: islandImage },
      { title: '神奇宝贝服务器', copy: '2019，方块之家初次迈入联机侠，遇到了更多新的人，开启了新的故事。', x: 50, y: 48, image: pokemonImage }
    ]
  },
  {
    year: '2020—21',
    kicker: 'BUILD / 灯火未熄',
    title: '隔着屏幕继续建造',
    copy: '方块世界仍在生长。翼儿、笔墨和更多名字，把各自的房子留在同一张地图上，本应有联机侠建筑服图片，奈何图片缺失。',
    image: togetherImage,
    scan: togetherAltImage,
    accent: '#b8ddff',
    moments: [
      { title: '翼儿的建筑', copy: '房屋与庭院。', x: 26, y: 64, image: togetherImage },
      { title: '笔墨的建筑', copy: '鸡坚强，你快回来啊。', x: 72, y: 35, image: togetherAltImage }
    ]
  },
  {
    year: '2022',
    kicker: 'TOGETHER / 四周年',
    title: '在烟花下合照。',
    copy: '四周年、新年、国庆与圣诞，越来越多的人会在活动结束前站到一起，为这一刻留下坐标。',
    image: fourYearsImage,
    date: '2022/7/21',
    scan: fourYearsChristmasImage,
    scanDate: '2022/12/26',
    scanTitle: '圣诞活动',
    scanCopy: '红色舞台、飘落的粒子和并肩站立的成员，让这一年的冬天也拥有合照，竟然合照台都没变吗。',
    accent: '#ff8e7a',
    moments: [
      { title: '四周年另一帧', date: '2022/7/21', copy: '同一天的另一张照片，记录下不同站位和同一片晚霞。', x: 27, y: 32, image: fourYearsAltImage },
      { title: '国庆特别活动', date: '2022/10', copy: '国庆的红色舞台让这一年的节日合照拥有了鲜明坐标。', x: 73, y: 62, image: fourYearsNationalImage }
    ]
  },
  {
    year: '2023',
    kicker: 'ARCHIVE / 五周年',
    title: '每一次相聚都有名字',
    copy: '五周年、农夫乐事、国庆、冬眠生存与生日会被一张张保存下来。共同记忆开始拥有可以回看的日期和人物。',
    image: fiveYearsImage,
    date: '2023/7/21',
    scan: fiveYearsChristmasImage,
    scanTitle: '圣诞生日会',
    scanCopy: '圣诞树、礼物与生日会出现在同一个夜晚，超级感动，小牛为我们在圣诞树上写了留言，并且做了如此温馨的造景，“我草，我草”（此处省略N个）。',
    accent: '#68d9ff',
    moments: [
      { title: '农夫乐事', date: '2023/8', copy: '农夫乐事第一期获得流量，继续跟上，开始方块街的建设，方块之家群人数逐渐突破100。', x: 26, y: 48, image: fiveYearsFarmImage },
      { title: '国庆特别活动', date: '2023/10', copy: '小牛繁茂洞穴里的长椅和熟悉的名字，愉悦的国庆与生日氛围。', x: 24, y: 58, image: fiveYearsNationalImage },
      { title: '生日与国庆', copy: '生日会和国庆活动在同一张照片里交汇，庆祝的是具体的人。', x: 72, y: 34, image: fiveYearsBirthdayImage },
      { title: '冬眠生存', date: '2023/12/1', copy: '冬天不再只是一次合照，一段持续生存与共同建设的传统。冬眠生存超好玩，每次冬天最期待的就是可以和大家一起玩生存，喝热奶茶！', x: 70, y: 56, image: fiveYearsHibernateImage }
    ]
  },
  {
    year: '2024',
    kicker: 'PLAY / 新年地图',
    title: '地图变成一座游乐场',
    copy: '方块之家全新的尝试，非自制地图，我们选用了游乐场地图与跑酷地图，为数不多没有吵起来的活动。华少：“好无聊啊。”',
    image: homeImage,
    date: '2024/12/31',
    scan: homeNewYearImage,
    accent: '#8ee08f',
    moments: [
      { title: '农夫乐事方块街', date: '2024/2', copy: '火锅店，方块街的起源，方块之家农夫乐事第二期，获得了更好的反响，群人数突破100人！（虽然大家都是进来下资源的，但我相信还是有人注意到方块之家的对吧！）', x: 26, y: 55, image: homeFarmImage },
      { title: 'MC 卡车', date: '2024/7', copy: '卡车驶进方块世界，活动第一次把公路与驾驶体验放进共同地图。', x: 72, y: 38, image: homeTruckImage },
      { title: '新年活动', date: '2024/12/31', copy: '游乐园的新年合照！', x: 26, y: 42, image: homeNewYearImage },
      { title: '雪山跑酷', date: '2024/12/31', copy: '雪山跑酷，跨年夜真的跑破防了。', x: 29, y: 43, image: homeImage }
    ]
  },
  {
    year: '2025',
    kicker: 'MEET / 七周年',
    title: '旧世界被放进博物馆',
    copy: '七周年、国庆特别活动、博物馆与问答活动，把一路走来的故事重新摆到大家面前。',
    image: sevenYearsImage,
    date: '2025/7/21',
    scan: sevenYearsMuseumImage,
    scanDate: '2025/12/12',
    scanTitle: '博物馆合照',
    scanCopy: '成员站在博物馆内部，旧地图与旧物第一次成为可以共同参观的历史。一二：叔叔我是0。',
    accent: '#ffd76d',
    moments: [
      { title: '七周年空岛', date: '2025/7/21', copy: '成员重新站在空岛上，让 2025 与 2018 的第一张地图形成回应。', x: 27, y: 62, image: sevenYearsImage },
      { title: '国庆特别活动', date: '2025/10', copy: '七周年之后的又一次集合，让新的成员也进入这一年的共同画面。', x: 30, y: 46, image: sevenYearsNationalImage },
      { title: '博物馆与问答', date: '2025/12/12', copy: '旧物被陈列，旧故事被提问，记忆从截图变成可以共同回答的档案。', x: 72, y: 36, image: sevenYearsQaImage }
    ]
  },
  {
    year: '2026',
    kicker: 'NEXT / 八周年',
    title: '在 2026 前再次集合',
    copy: '方块之家，2026，我们还在一起！',
    image: futureImage,
    scan: futureImage,
    accent: '#ff6f6f',
    moments: [
      { title: '新年的数字', copy: '2026 不只是背景，它是所有旧年份继续向前延伸后的新坐标。', x: 25, y: 58, image: futureImage },
      { title: '冬眠生存第四季', date: '2026/2/3', copy: '从2021延续而来的冬眠生存发布第四弹，竟然出到第四季了？！YUFUQU：捡到别人袜子了。', x: 30, y: 44, image: winterFourthImage },
      { title: '八周年之前', copy: '围炉QA，好尴尬！', x: 72, y: 34, image: sevenYearsQaImage }
    ]
  }
]

chapters.forEach((chapter, chapterIndex) => {
  applyJourneyCopyDraft('timeline-intro', chapter, chapterIndex, journeyCopyDraft)
  chapter.moments.forEach((moment, momentIndex) => {
    applyJourneyCopyDraft(`timeline-${chapter.year}`, moment, momentIndex, journeyCopyDraft)
  })
})

function buildPhotoSet(chapter) {
  const photos = []
  const addPhoto = (photo) => {
    if (!photo?.image || photos.some((item) => item.image === photo.image)) return
    photos.push(photo)
  }

  addPhoto({ image: chapter.image, title: chapter.title, copy: chapter.copy, date: chapter.date })
  chapter.moments.forEach((moment) => addPhoto(moment))
  addPhoto(applyJourneyCopyDraft(`timeline-${chapter.year}-scan`, {
    image: chapter.scan,
    date: chapter.scanDate,
    title: chapter.scanTitle || `${chapter.year} 的另一张现场`,
    copy: chapter.scanCopy || '同一段时间留下的另一张照片，保存了不同的站位、建筑与天气。'
  }, 0, journeyCopyDraft))
  return photos
}

const chapterPhotoSets = chapters.map(buildPhotoSet)
const photoIndices = ref(chapters.map(() => 0))

const thenNowTiles = Array.from({ length: 40 }, (_, index) => {
  const columns = 8
  const column = index % columns
  const row = Math.floor(index / columns)
  return {
    id: index,
    column,
    row,
    delay: ((column * 5 + row * 3) % 13) / 13 * 0.18,
    turn: ((column * 17 + row * 11) % 18) - 9
  }
})

const worldNodes = [
  { year: '2018', date: '2018', code: 'SKYBLOCK / ORIGIN', title: '第一张地图', copy: '所有路线，都从这座空岛向外延伸。', image: originImage, accent: '#f6b958' },
  { year: '2019', date: '2019', code: 'PIXELMON / BRANCH', title: '神奇宝贝服务器', copy: '方块之家的第一次神奇宝贝服务器尝试。', image: pokemonImage, accent: '#d99cff' },
  { year: '2022', date: '2022/7/21', code: 'ANNIVERSARY / 04', title: '方块之家四周年', copy: '第四个生日让周年合照正式成为传统。', image: fourYearsImage, accent: '#ff8e7a' },
  { year: '2022', date: '2022/10', code: 'NATIONAL DAY / EVENT', title: '国庆特别活动', copy: '红色舞台把节日和成员重新带回同一个坐标。', image: fourYearsNationalImage, accent: '#ff7f72' },
  { year: '2022', date: '2022/12/26', code: 'CHRISTMAS / TOGETHER', title: '圣诞活动', copy: '飘落的粒子、节日舞台和冬日合照留在这一晚。', image: fourYearsChristmasImage, accent: '#8ee08f' },
  { year: '2023', date: '2023/7/21', code: 'ANNIVERSARY / 05', title: '方块之家五周年', copy: '五周年庆典与纪念礼盒一起保存了第五年的名字。', image: fiveYearsImage, accent: '#68d9ff' },
  { year: '2023', date: '2023/8', code: 'FARMERS DELIGHT / 01', title: '农夫乐事', copy: '活动从周年舞台走进农夫乐事与共同经营，让群人数飞涨。', image: fiveYearsFarmImage, accent: '#a8df79' },
  { year: '2023', date: '2023/10', code: 'NATIONAL DAY / EVENT', title: '国庆特别活动', copy: '小牛的繁茂洞穴，造的太美了，让我先住进去！', image: fiveYearsNationalImage, accent: '#ff8e7a' },
  { year: '2023', date: '2023/12/1', code: 'HIBERNATION / SEASON 01', title: '冬眠生存', copy: '樱花树下那三季冬眠生存，“我同学说我视频里声音很好听”“啊啊啊你声音很好听？！”', image: fiveYearsHibernateImage, accent: '#b8ddff' },
  { year: '2024', date: '2024/2', code: 'FARMERS DELIGHT / STREET', title: '农夫乐事方块街', copy: '乡村主题扩展成一整条可以生活和探索的方块街。', image: homeFarmImage, accent: '#8ee08f' },
  { year: '2024', date: '2024/7', code: 'TRUCK / ROAD TRIP', title: 'MC 卡车', copy: '卡车与公路第一次成为活动地图里的主角。', image: homeTruckImage, accent: '#f6b958' },
  { year: '2024', date: '2024/12/31', code: 'NEW YEAR / TOGETHER', title: '新年活动', copy: '成员在新年舞台重新集合，为下一段路线揭幕。', image: homeNewYearImage, accent: '#ff8e7a' },
  { year: '2024', date: '2024/12/31', code: 'PARKOUR / PLAY', title: '新年雪山跑酷', copy: '建筑不再只是风景，也成为可以共同穿过的挑战。', image: homeImage, accent: '#8ee08f' },
  { year: '2025', date: '2025/7/21', code: 'ANNIVERSARY / 07', title: '方块之家七周年', copy: '成员回到空岛，让第七年与第一张地图重新重合。', image: sevenYearsImage, accent: '#ffd76d' },
  { year: '2025', date: '2025/10', code: 'NATIONAL DAY / EVENT', title: '国庆特别活动', copy: '新的成员进入画面，也进入这一年的共同记忆。', image: sevenYearsNationalImage, accent: '#ff8e7a' },
  { year: '2025', date: '2025/12/12', code: 'MUSEUM / ARCHIVE', title: '方块博物馆来袭', copy: '旧地图、圣诞与生日会被收进一座可以共同参观的档案馆。', image: sevenYearsMuseumImage, accent: '#ffd76d' },
  { year: '2026', date: '2026/1', code: 'NEW YEAR / NEXT', title: '新年坐标', copy: '数字被建进地图，下一条路线仍在等待上线。', image: futureImage, accent: '#ff6f6f' },
  { year: '2026', date: '2026/2/3', code: 'HIBERNATION / SEASON 04', title: '冬眠生存第四季', copy: '从 2023 延续而来的传统活动，在第四季继续生长。', image: winterFourthImage, accent: '#b8ddff' }
]

worldNodes.forEach((node, index) => {
  applyJourneyCopyDraft('world-route', node, index, journeyCopyDraft)
})

const worldStrata = [
  {
    year: '2018', depth: 'Y +128', code: 'SKY / SPAWN', name: '云层 · 出生点',
    title: '世界从一座空岛开始',
    copy: '最初的边界很近。桥、树与出生点悬在云上，每向外放下一块方块，地图就多出一种可能。',
    image: originImage, accent: '#b8ddff', material: 'sky'
  },
  {
    year: '2019', depth: 'Y +72', code: 'SURFACE / SETTLE', name: '地表 · 聚落',
    title: '路、房子和名字开始出现',
    copy: '道路把不同建筑连成聚落。世界不再只有出生点，也第一次拥有了能够被称作“回来”的地方。',
    image: islandImage, accent: '#8ee08f', material: 'grass'
  },
  {
    year: '2024', depth: 'Y +24', code: 'MECHANISM / PLAY', name: '机关 · 活动层',
    title: '建筑变成共同穿过的游戏',
    copy: '跑酷、机关和活动场地让方块有了动作。被建造的不只是景观，还有一起挑战和抵达的路线。',
    image: homeImage, accent: '#f6b958', material: 'stone'
  },
  {
    year: '2025', depth: 'Y -12', code: 'ARCHIVE / MEMORY', name: '地下 · 档案层',
    title: '旧世界被保存成可以重返的房间',
    copy: '博物馆把地图、物品和故事收进同一处空间。曾经散落的截图，开始拥有可以被共同参观的坐标。',
    image: sevenYearsMuseumImage, accent: '#ffd76d', material: 'archive'
  },
  {
    year: '2026', depth: 'Y -64', code: 'BEDROCK / PEOPLE', name: '基岩 · 玩家层',
    title: '地图最深处，仍然是人的名字',
    copy: '服务器可以换地图，建筑也会更新。真正托住这个世界的，是八年里一次又一次上线、相遇和归来的成员。',
    image: sevenYearsQaImage, accent: '#ff8e7a', material: 'bedrock'
  }
]

worldStrata.forEach((stratum, index) => {
  applyJourneyCopyDraft('stratum', stratum, index, journeyCopyDraft)
})

const blockColors = ['grass', 'dirt', 'stone', 'gold', 'water', 'wood', 'light']
const floatingBlocks = Array.from({ length: 54 }, (_, index) => ({
  id: index,
  type: blockColors[index % blockColors.length],
  x: (index * 37 + 11) % 101,
  y: (index * 61 + 7) % 96,
  size: 8 + ((index * 13) % 24),
  depth: -80 - ((index * 47) % 620),
  delay: (index % 9) * -0.7,
  turn: ((index * 29) % 70) - 35
}))

const figureBlocks = Array.from({ length: 78 }, (_, index) => {
  const t = (index / 78) * Math.PI * 2
  return {
    id: index,
    type: blockColors[(index * 3) % blockColors.length],
    x: 50 + Math.sin(t) * 20,
    y: 50 + Math.sin(t * 2) * 31,
    sx: ((index * 83) % 900) - 450,
    sy: ((index * 137) % 780) - 390,
    sr: ((index * 47) % 540) - 270,
    size: 11 + ((index * 7) % 10)
  }
})

const reunionFragments = [
  { id: 'staff', clip: 'polygon(18% 4%, 38% 4%, 38% 58%, 17% 58%)', x: -34, y: -22, r: -8, s: .82, cx: 28, cy: 31, delay: 0 },
  { id: 'back-center', clip: 'polygon(40% 4%, 55% 4%, 57% 39%, 39% 39%)', x: 8, y: -36, r: 5, s: .78, cx: 48, cy: 21, delay: .08 },
  { id: 'back-white', clip: 'polygon(55% 3%, 70% 3%, 70% 45%, 54% 45%)', x: -8, y: -34, r: -4, s: .8, cx: 62, cy: 23, delay: .03 },
  { id: 'back-right', clip: 'polygon(68% 3%, 84% 3%, 85% 49%, 68% 49%)', x: 32, y: -24, r: 7, s: .84, cx: 76, cy: 25, delay: .13 },
  { id: 'drink', clip: 'polygon(6% 24%, 24% 24%, 25% 62%, 5% 62%)', x: -38, y: -5, r: -7, s: .8, cx: 15, cy: 43, delay: .18 },
  { id: 'ice-cream', clip: 'polygon(22% 27%, 42% 27%, 43% 70%, 21% 70%)', x: -32, y: 13, r: 6, s: .8, cx: 32, cy: 49, delay: .27 },
  { id: 'camera', clip: 'polygon(37% 26%, 55% 26%, 56% 74%, 36% 74%)', x: 2, y: 30, r: -5, s: .76, cx: 46, cy: 50, delay: .2 },
  { id: 'headphones', clip: 'polygon(51% 29%, 68% 29%, 69% 66%, 50% 66%)', x: 4, y: -30, r: 5, s: .82, cx: 60, cy: 48, delay: .3 },
  { id: 'purple', clip: 'polygon(63% 29%, 81% 29%, 82% 79%, 62% 79%)', x: 34, y: 7, r: -6, s: .78, cx: 72, cy: 54, delay: .22 },
  { id: 'pink', clip: 'polygon(78% 27%, 98% 27%, 98% 76%, 77% 76%)', x: 40, y: -3, r: 8, s: .82, cx: 88, cy: 51, delay: .35 },
  { id: 'lollipop', clip: 'polygon(2% 52%, 30% 52%, 31% 100%, 1% 100%)', x: -42, y: 28, r: 8, s: .76, cx: 16, cy: 77, delay: .39 },
  { id: 'pufferfish', clip: 'polygon(25% 56%, 57% 56%, 58% 100%, 24% 100%)', x: -10, y: 38, r: -7, s: .74, cx: 41, cy: 79, delay: .32 },
  { id: 'burger', clip: 'polygon(50% 55%, 72% 55%, 73% 100%, 49% 100%)', x: 12, y: 40, r: 6, s: .76, cx: 61, cy: 78, delay: .43 },
  { id: 'peace', clip: 'polygon(67% 53%, 95% 53%, 96% 100%, 66% 100%)', x: 38, y: 31, r: -7, s: .76, cx: 81, cy: 77, delay: .47 }
]

const currentChapter = computed(() => chapters[activeChapter.value])
const collectedCount = computed(() => collectedYears.value.size)
const activeWorldIndex = computed(() => Math.min(
  worldNodes.length - 1,
  Math.max(0, Math.round(worldProgress.value * (worldNodes.length - 1)))
))
const activeWorldNode = computed(() => worldNodes[activeWorldIndex.value])
const activeStratumIndex = computed(() => Math.min(
  worldStrata.length - 1,
  Math.max(0, Math.round(strataProgress.value * (worldStrata.length - 1)))
))
const activeStratum = computed(() => worldStrata[activeStratumIndex.value])
const progressYear = computed(() => {
  if (activeStage.value === 'strata') return activeStratum.value.year
  if (activeStage.value === 'world') return activeWorldNode.value.year
  if (activeStage.value === 'then-now') return thenNowProgress.value < 0.5 ? '2018' : '2025'
  return currentChapter.value.year
})

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function measureScrollGeometry() {
  const sections = [heroRef.value, tunnelRef.value, thenNowRef.value, worldRef.value, strataRef.value, finaleRef.value]
  const scrollY = window.scrollY
  sectionMetrics.clear()
  sections.forEach((element) => {
    if (!element) return
    const rect = element.getBoundingClientRect()
    sectionMetrics.set(element, {
      top: scrollY + rect.top,
      bottom: scrollY + rect.bottom,
      height: element.offsetHeight
    })
  })

  const root = rootRef.value
  if (root) {
    const rect = root.getBoundingClientRect()
    rootMetrics = {
      top: scrollY + rect.top,
      height: root.scrollHeight
    }
  } else {
    rootMetrics = null
  }
}

function sectionProgress(element) {
  const metrics = sectionMetrics.get(element)
  if (!metrics) return 0
  const distance = metrics.height - window.innerHeight
  return distance > 0 ? clamp((window.scrollY - metrics.top) / distance) : 0
}

function ownsStickyViewport(element) {
  const metrics = sectionMetrics.get(element)
  if (!metrics) return false
  return window.scrollY >= metrics.top && window.scrollY + window.innerHeight <= metrics.bottom
}

function tunnelPosition(progress = tunnelVisualProgress) {
  const raw = progress * (chapters.length - 1)
  if (raw >= chapters.length - 1) return chapters.length - 1

  const chapter = Math.floor(raw)
  const local = raw - chapter
  const transition = clamp((local - 0.4) / 0.6)
  const eased = transition * transition * (3 - 2 * transition)
  return chapter + eased
}

function panelStyle(index, progress = tunnelProgress.value) {
  const position = tunnelPosition(progress)
  const delta = index - position
  const distance = Math.abs(delta)
  const visible = distance < 1.35
  const easedScale = Math.max(0.74, 1 - distance * 0.16)

  if (distance >= 1.8) {
    return {
      '--accent': chapters[index].accent,
      opacity: 0,
      visibility: 'hidden',
      willChange: 'auto',
      transform: `translate3d(0, calc(${Math.sign(delta) * 32}vh + var(--stage-offset)), -900px)`,
      zIndex: 0
    }
  }

  return {
    '--accent': chapters[index].accent,
    opacity: visible ? Math.max(0, 1 - distance * 0.76) : 0,
    visibility: visible ? 'visible' : 'hidden',
    willChange: visible ? 'transform, opacity' : 'auto',
    transform: reduceMotion.value
      ? `translate3d(0, calc(${delta * 16}vh + var(--stage-offset)), 0)`
      : `translate3d(0, calc(${delta * 16}vh + var(--stage-offset)), ${-distance * 520}px) rotateX(${delta * -42}deg) rotateZ(${delta * 1.2}deg) scale(${easedScale})`,
    zIndex: 20 - Math.round(distance * 10)
  }
}

const thenNowTileBaseStyles = computed(() => {
  const frameWidth = viewportWidth.value
  const frameHeight = viewportHeight.value
  const sourceWidth = 973
  const sourceHeight = 559
  const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const tileWidth = frameWidth / 8
  const tileHeight = frameHeight / 5
  const imageLeft = (frameWidth - renderedWidth) / 2
  const imageTop = (frameHeight - renderedHeight) / 2

  return thenNowTiles.map((tile) => ({
    backgroundImage: `url(${originImage})`,
    backgroundSize: `${renderedWidth}px ${renderedHeight}px`,
    backgroundPosition: `${imageLeft - tile.column * tileWidth}px ${imageTop - tile.row * tileHeight}px`
  }))
})

function thenNowTileStyle(tile) {
  const reveal = clamp((thenNowProgress.value - 0.18 - tile.delay) / 0.36)
  const horizontal = (tile.column - 3.5) * 13 * reveal
  const vertical = (tile.row - 2) * 11 * reveal
  // 飞出视口的瓷砖直接隐藏，避免常驻合成层
  const hidden = reveal >= 0.995
  return {
    ...thenNowTileBaseStyles.value[tile.id],
    opacity: 1 - reveal,
    visibility: hidden ? 'hidden' : 'visible',
    willChange: reveal > 0.02 && reveal < 0.98 ? 'transform, opacity' : 'auto',
    transform: reduceMotion.value
      ? 'none'
      : `translate3d(${horizontal}px, ${vertical}px, ${reveal * 110}px) rotateX(${tile.turn * reveal * -0.7}deg) rotateY(${tile.turn * reveal}deg) scale(${1 - reveal * 0.08})`
  }
}

const worldTrackStyle = computed(() => {
  const raw = worldProgress.value * (worldNodes.length - 1)
  const position = reduceMotion.value ? Math.round(raw) : raw
  const spacing = viewportWidth.value <= 560 ? 210 : 260
  return {
    height: `${(worldNodes.length - 1) * spacing + 220}px`,
    transform: `translate3d(-50%, calc(50dvh - ${position * spacing + 110}px), 0)`
  }
})

function worldNodeStyle(index) {
  const raw = worldProgress.value * (worldNodes.length - 1)
  const distance = Math.abs(index - raw)
  const spacing = viewportWidth.value <= 560 ? 210 : 260
  const horizontal = viewportWidth.value <= 560 ? 50 : 205
  const side = index % 2 === 0 ? -1 : 1
  const visibleDistance = clamp(distance, 0, 2.4)
  return {
    top: `${index * spacing}px`,
    '--node-accent': worldNodes[index].accent,
    opacity: Math.max(0.12, 1 - visibleDistance * 0.34),
    willChange: distance < 2.8 ? 'transform, opacity' : 'auto',
    transform: reduceMotion.value
      ? `translate3d(calc(-50% + ${side * horizontal}px), 0, 0)`
      : `translate3d(calc(-50% + ${side * horizontal}px), 0, ${-visibleDistance * 70}px) scale(${1 - visibleDistance * 0.07})`
  }
}

function stratumStyle(index) {
  const raw = strataProgress.value * (worldStrata.length - 1)
  const delta = index - raw
  const distance = Math.abs(delta)
  const mobile = viewportWidth.value <= 560
  const visible = distance < 1.65
  const verticalStep = mobile ? 70 : 72
  const tilt = mobile ? delta * -2.5 : delta * -11
  const scale = Math.max(0.82, 1 - distance * (mobile ? 0.05 : 0.075))
  return {
    '--stratum-accent': worldStrata[index].accent,
    opacity: visible ? Math.max(0, 1 - distance * 0.68) : 0,
    visibility: visible ? 'visible' : 'hidden',
    willChange: visible ? 'transform, opacity' : 'auto',
    transform: reduceMotion.value
      ? `translate3d(-50%, calc(-50% + ${delta * 16}dvh), 0)`
      : `translate3d(-50%, calc(-50% + ${delta * verticalStep}dvh), ${-distance * 260}px) rotateX(${tilt}deg) scale(${scale})`,
    zIndex: 20 - Math.round(distance * 8)
  }
}

function stratumBackdropStyle(index) {
  const raw = strataProgress.value * (worldStrata.length - 1)
  const distance = Math.abs(index - raw)
  return {
    backgroundImage: `url(${worldStrata[index].image})`,
    opacity: clamp(1 - distance * 1.6) * 0.28
  }
}

function photoPosition(chapterIndex, photoIndex) {
  const count = chapterPhotoSets[chapterIndex].length
  return (photoIndex - photoIndices.value[chapterIndex] + count) % count
}

function isPanelPhotoWindowActive(chapterIndex) {
  return Math.abs(chapterIndex - tunnelPosition()) < 2.4
}

function shouldRenderPanelPhoto(chapterIndex, photoIndex) {
  return isPanelPhotoWindowActive(chapterIndex) && photoPosition(chapterIndex, photoIndex) < 3
}

function activePhoto(chapterIndex) {
  return chapterPhotoSets[chapterIndex][photoIndices.value[chapterIndex]]
}

function photoCardStyle(chapterIndex, photoIndex) {
  const position = photoPosition(chapterIndex, photoIndex)
  const state = photoDeckState.value
  const isCurrent = position === 0
  const isActiveDrag = isCurrent && state.chapterIndex === chapterIndex
  const x = isActiveDrag ? state.x : 0
  const rotation = clamp(x / Math.max(viewportWidth.value, 1) * 12, -7, 7)
  const depthOffset = Math.min(position, 2)

  return {
    opacity: position < 3 ? 1 - depthOffset * 0.14 : 0,
    visibility: position < 3 ? 'visible' : 'hidden',
    transform: isCurrent
      ? `translate3d(${x}px, ${Math.abs(x) * 0.025}px, 0) rotate(${rotation}deg)`
      : `translate3d(${depthOffset * 9}px, ${depthOffset * 11}px, 0) rotate(${depthOffset % 2 ? 1.2 : -0.8}deg) scale(${1 - depthOffset * 0.038})`,
    zIndex: chapterPhotoSets[chapterIndex].length - position
  }
}

function resetPhotoDeckState() {
  photoDeckState.value = { chapterIndex: -1, x: 0, dragging: false, settling: false, leaving: false }
  photoPointer = null
}

function beginPhotoDrag(event, chapterIndex, photoIndex) {
  if (photoPosition(chapterIndex, photoIndex) !== 0 || chapterPhotoSets[chapterIndex].length < 2) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  window.clearTimeout(photoDeckTimer)
  suppressPhotoClick = false
  photoPointer = {
    pointerId: event.pointerId,
    chapterIndex,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocityX: 0,
    axis: null,
    width: event.currentTarget.getBoundingClientRect().width,
    element: event.currentTarget
  }
  photoDeckState.value = { chapterIndex, x: 0, dragging: false, settling: false, leaving: false }
}

function movePhotoDrag(event) {
  if (!photoPointer || photoPointer.pointerId !== event.pointerId) return
  const x = event.clientX - photoPointer.startX
  const y = event.clientY - photoPointer.startY

  if (!photoPointer.axis) {
    if (Math.hypot(x, y) < 10) return
    if (Math.abs(y) >= Math.abs(x) * 1.08) {
      resetPhotoDeckState()
      return
    }
    photoPointer.axis = 'x'
    photoPointer.element.setPointerCapture?.(event.pointerId)
    suppressPhotoClick = true
  }

  const elapsed = Math.max(1, event.timeStamp - photoPointer.lastTime)
  photoPointer.velocityX = (event.clientX - photoPointer.lastX) / elapsed
  photoPointer.lastX = event.clientX
  photoPointer.lastTime = event.timeStamp
  photoDeckState.value = {
    chapterIndex: photoPointer.chapterIndex,
    x,
    dragging: true,
    settling: false,
    leaving: false
  }
}

function finishPhotoDrag(event) {
  if (!photoPointer || photoPointer.pointerId !== event.pointerId) return
  const pointer = photoPointer
  const state = photoDeckState.value
  const shouldAdvance = pointer.axis === 'x'
    && event.type !== 'pointercancel'
    && (Math.abs(state.x) > pointer.width * 0.22 || Math.abs(pointer.velocityX) > 0.45)

  if (shouldAdvance) {
    const direction = Math.sign(Math.abs(pointer.velocityX) > 0.18 ? pointer.velocityX : state.x) || -1
    photoDeckState.value = {
      chapterIndex: pointer.chapterIndex,
      x: direction * (pointer.width + 96),
      dragging: false,
      settling: false,
      leaving: true
    }
    photoPointer = null
    photoDeckTimer = window.setTimeout(() => {
      const count = chapterPhotoSets[pointer.chapterIndex].length
      const step = direction < 0 ? 1 : -1
      photoIndices.value[pointer.chapterIndex] = (photoIndices.value[pointer.chapterIndex] + step + count) % count
      resetPhotoDeckState()
    }, reduceMotion.value ? 120 : 300)
  } else if (pointer.axis === 'x') {
    photoPointer = null
    photoDeckState.value = {
      chapterIndex: pointer.chapterIndex,
      x: 0,
      dragging: false,
      settling: true,
      leaving: false
    }
    photoDeckTimer = window.setTimeout(resetPhotoDeckState, reduceMotion.value ? 120 : 380)
  } else {
    resetPhotoDeckState()
  }

  window.setTimeout(() => {
    suppressPhotoClick = false
  }, 0)
}

function showPhoto(chapterIndex, photoIndex) {
  if (photoIndex === photoIndices.value[chapterIndex]) return
  window.clearTimeout(photoDeckTimer)
  photoIndices.value[chapterIndex] = photoIndex
  resetPhotoDeckState()
}

function handlePhotoClick(chapterIndex) {
  if (suppressPhotoClick || photoDeckState.value.leaving) return
  const count = chapterPhotoSets[chapterIndex].length
  if (count > 1) showPhoto(chapterIndex, (photoIndices.value[chapterIndex] + 1) % count)
}

function collectMemory(year) {
  const next = new Set(collectedYears.value)
  next.add(year)
  collectedYears.value = next
}

function scrollToChapter(index) {
  const tunnel = tunnelRef.value
  if (!tunnel) return
  const tunnelTop = window.scrollY + tunnel.getBoundingClientRect().top
  const distance = tunnel.offsetHeight - window.innerHeight
  const targetProgress = chapters.length > 1 ? index / (chapters.length - 1) : 0
  window.scrollTo({
    top: tunnelTop + distance * targetProgress,
    behavior: reduceMotion.value ? 'auto' : 'smooth'
  })
}

function beginFinalBlockDrag(event) {
  if (finalBlockPlaced.value) return
  const block = finalBlockRef.value
  if (!block) return
  block.setPointerCapture?.(event.pointerId)
  finalBlockDragging.value = true
  finalBlockSettling.value = false
  suppressFinalClick = false
  finalDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    blockRect: block.getBoundingClientRect()
  }
}

function moveFinalBlock(event) {
  if (!finalDrag || finalDrag.pointerId !== event.pointerId) return
  const x = event.clientX - finalDrag.startX
  const y = event.clientY - finalDrag.startY
  if (Math.hypot(x, y) > 8) suppressFinalClick = true
  finalBlockOffset.value = { x, y }
}

function endFinalBlockDrag(event) {
  if (!finalDrag || finalDrag.pointerId !== event.pointerId) return
  const targetRect = finalTargetRef.value?.getBoundingClientRect()
  const landed = event.type !== 'pointercancel'
    && targetRect
    && event.clientX >= targetRect.left - 24
    && event.clientX <= targetRect.right + 24
    && event.clientY >= targetRect.top - 24
    && event.clientY <= targetRect.bottom + 24

  finalBlockDragging.value = false
  finalDrag = null
  if (landed) {
    finalBlockPlaced.value = true
    finalBlockOffset.value = { x: 0, y: 0 }
  } else {
    finalBlockSettling.value = true
    finalBlockOffset.value = { x: 0, y: 0 }
    window.clearTimeout(finalSettleTimer)
    finalSettleTimer = window.setTimeout(() => {
      finalBlockSettling.value = false
    }, 420)
  }
  window.setTimeout(() => {
    suppressFinalClick = false
  }, 0)
}

function placeFinalBlock() {
  if (!suppressFinalClick) finalBlockPlaced.value = true
}

function figureBlockStyle(block) {
  const assemble = clamp(finaleProgress.value / 0.2)
  const settle = 1 - Math.pow(1 - assemble, 3)
  return {
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.size}px`,
    height: `${block.size}px`,
    transform: `translate3d(${block.sx * (1 - settle)}px, ${block.sy * (1 - settle)}px, 0) rotate(${block.sr * (1 - settle)}deg) scale(${0.45 + settle * 0.55})`,
    opacity: Math.min(1, 0.12 + assemble * 1.4)
  }
}

const figureStyle = computed(() => {
  const infinity = clamp((finaleProgress.value - 0.18) / 0.1)
  const exit = clamp((finaleProgress.value - 0.27) / 0.09)
  return {
    opacity: 1 - exit,
    willChange: finaleProgress.value < 0.38 ? 'transform, opacity' : 'auto',
    transform: `translate(-50%, -50%) rotate(${infinity * 90}deg) scale(${0.86 + infinity * 0.14 + exit * 0.16})`
  }
})

const reunionProgress = computed(() => clamp((finaleProgress.value - 0.25) / 0.62))

const reunionFrameRef = ref(null)

// 每个 fragment 的固有属性只绑定一次，filter/opacity/transform 由 CSS 变量驱动
function reunionFragmentStaticStyle(fragment) {
  return {
    clipPath: fragment.clip,
    '--fragment-delay': fragment.delay,
    '--fragment-x': fragment.x,
    '--fragment-y': fragment.y,
    '--fragment-r': fragment.r,
    '--fragment-s': fragment.s,
    '--fragment-cx': fragment.cx,
    '--fragment-cy': fragment.cy
  }
}

watchEffect(() => {
  if (!reunionFrameRef.value) return
  reunionFrameRef.value.style.setProperty('--reunion-progress', reunionProgress.value.toFixed(4))
})

const reunionFrameStyle = computed(() => {
  const arrive = 1 - Math.pow(1 - reunionProgress.value, 3)
  return {
    opacity: clamp(reunionProgress.value * 2.4),
    transform: `translate(-50%, calc(-50% + var(--stage-offset))) scale(${1.12 - arrive * 0.12})`
  }
})

const reunionPhotoStyle = computed(() => {
  const reveal = reduceMotion.value ? 1 : clamp((reunionProgress.value - 0.78) / 0.16)
  return {
    opacity: reveal,
    filter: `blur(${(1 - reveal) * 5}px) saturate(${0.76 + reveal * 0.24})`
  }
})

function updateScroll() {
  heroProgress.value = sectionProgress(heroRef.value)
  tunnelVisualProgress = sectionProgress(tunnelRef.value)
  applyTunnelPanelStyles(tunnelVisualProgress)
  thenNowProgress.value = sectionProgress(thenNowRef.value)
  worldProgress.value = sectionProgress(worldRef.value)
  strataProgress.value = sectionProgress(strataRef.value)
  finaleProgress.value = sectionProgress(finaleRef.value)
  if (rootMetrics) {
    const distance = rootMetrics.height - window.innerHeight
    const progress = distance > 0 ? clamp((window.scrollY - rootMetrics.top) / distance) : 0
    if (progressFillRef.value) progressFillRef.value.style.transform = `scaleY(${progress})`
  }
  activeStage.value = ownsStickyViewport(strataRef.value)
    ? 'strata'
    : ownsStickyViewport(worldRef.value)
      ? 'world'
      : ownsStickyViewport(thenNowRef.value)
        ? 'then-now'
        : 'timeline'
  const nextActiveChapter = Math.min(
    chapters.length - 1,
    Math.max(0, Math.round(tunnelPosition()))
  )
  if (nextActiveChapter !== activeChapter.value) {
    tunnelProgress.value = tunnelVisualProgress
    activeChapter.value = nextActiveChapter
  }
}

function applyTunnelPanelStyles(progress) {
  if (!tunnelPanelElements.length || progress === appliedTunnelProgress) return
  appliedTunnelProgress = progress
  tunnelPanelElements.forEach((element, index) => {
    if (!element) return
    const style = panelStyle(index, progress)
    element.style.opacity = String(style.opacity)
    element.style.visibility = style.visibility
    element.style.willChange = style.willChange
    element.style.transform = style.transform
    element.style.zIndex = String(style.zIndex)
  })
}

let scrollFrame = 0
function requestScrollUpdate() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    updateScroll()
    scrollFrame = 0
  })
}

function handleResize() {
  viewportWidth.value = document.documentElement.clientWidth
  viewportHeight.value = window.innerHeight
  nextTick(() => {
    measureScrollGeometry()
    requestScrollUpdate()
  })
}

function handlePointerMove(event) {
  if (!rootRef.value || reduceMotion.value) return
  const x = (event.clientX / window.innerWidth - 0.5) * 2
  const y = (event.clientY / window.innerHeight - 0.5) * 2
  rootRef.value.style.setProperty('--pointer-x', x.toFixed(3))
  rootRef.value.style.setProperty('--pointer-y', y.toFixed(3))
}

onMounted(() => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  viewportWidth.value = document.documentElement.clientWidth
  viewportHeight.value = window.innerHeight
  document.documentElement.classList.add('boh-journey-scroll')
  try {
    const validYears = new Set(chapters.map((chapter) => chapter.year))
    const storedYears = JSON.parse(localStorage.getItem('boh-journey-v2-memories') || '[]')
    collectedYears.value = new Set(storedYears.filter((year) => validYears.has(year)))
    finalBlockPlaced.value = localStorage.getItem('boh-journey-v2-final-block') === 'true'
  } catch {
    collectedYears.value = new Set()
  }
  measureScrollGeometry()
  updateScroll()
  if ('ResizeObserver' in window && rootRef.value) {
    geometryObserver = new ResizeObserver(() => {
      measureScrollGeometry()
      requestScrollUpdate()
    })
    geometryObserver.observe(rootRef.value)
  }
  // grain 噪声只在 hero 区可视，hero 滚出视口后暂停以节省合成
  if ('IntersectionObserver' in window && heroRef.value && grainRef.value) {
    grainObserver = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting
      grainRef.value.classList.toggle('paused', !visible)
    }, { rootMargin: '50px' })
    grainObserver.observe(heroRef.value)
  }
  window.addEventListener('scroll', requestScrollUpdate, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
  // 仅在精确指针设备上启用视差，触屏设备 pointermove 仅在按住时触发，会造成不必要的样式重算
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
  }
})

watch(collectedYears, (years) => {
  localStorage.setItem('boh-journey-v2-memories', JSON.stringify([...years]))
})

watch(activeChapter, resetPhotoDeckState)

watch(finalBlockPlaced, (placed) => {
  localStorage.setItem('boh-journey-v2-final-block', String(placed))
})

onUnmounted(() => {
  document.documentElement.classList.remove('boh-journey-scroll')
  window.removeEventListener('scroll', requestScrollUpdate)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('pointermove', handlePointerMove)
  window.clearTimeout(photoDeckTimer)
  window.clearTimeout(finalSettleTimer)
  geometryObserver?.disconnect()
  geometryObserver = null
  grainObserver?.disconnect()
  grainObserver = null
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <main ref="rootRef" class="voxel-journey">
    <div ref="grainRef" class="grain" aria-hidden="true" />

    <aside class="journey-progress" aria-label="八周年旅程进度">
      <span class="progress-year">{{ progressYear }}</span>
      <span class="progress-track">
        <span ref="progressFillRef" class="progress-fill" style="transform: scaleY(0)" />
      </span>
      <span class="progress-index">{{ String(activeChapter + 1).padStart(2, '0') }} / {{ String(chapters.length).padStart(2, '0') }}</span>
    </aside>

    <section ref="heroRef" class="hero-scroll">
      <div class="hero-sticky">
        <div class="hero-image" :style="{
          transform: `scale(${1.06 + heroProgress * 0.22}) translate3d(0, ${heroProgress * -4}%, 0)`,
          opacity: 1 - heroProgress * 0.86
        }">
          <img :src="sevenYearsImage" alt="方块之家成员在方块世界中的七周年合影" decoding="async" fetchpriority="high">
        </div>
        <div class="hero-vignette" />

        <div class="voxel-space" aria-hidden="true" :style="{
          transform: `translate3d(0, ${heroProgress * -12}vh, 0) rotate(${heroProgress * 3}deg)`
        }">
          <span
            v-for="block in floatingBlocks"
            :key="block.id"
            class="voxel-particle"
            :class="[`is-${block.type}`, { 'is-active': heroProgress > 0.05 && heroProgress < 0.95 }]"
            :style="{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.size}px`,
              height: `${block.size}px`,
              '--depth': `${block.depth}px`,
              '--delay': `${block.delay}s`,
              '--turn': `${block.turn}deg`,
              opacity: heroProgress > 0.08 ? Math.min(0.8, heroProgress * 1.3) : 0
            }"
          />
        </div>

        <div class="hero-copy" :style="{
          transform: `translate3d(calc(var(--pointer-x) * -10px), calc(var(--stage-offset) - ${heroProgress * 16}vh), 0)`,
          opacity: 1 - heroProgress * 1.35
        }">
          <p class="eyebrow">BLOCK OF HOME · 2018—2026</p>
          <h1><span>八年</span><br>共筑一个世界</h1>
          <p class="hero-lead">这不是一条时间线。<br>是我们一起放下的每一块。</p>
        </div>

        <div class="origin-cube-wrap" :style="{
          opacity: clamp((heroProgress - 0.22) * 2.2),
          transform: `translate(-50%, calc(-50% + var(--stage-offset))) scale(${0.55 + heroProgress * 0.72}) rotate(${heroProgress * 38}deg)`
        }">
          <div class="origin-cube" :style="{
            transform: `rotateX(${-22 + heroProgress * 210}deg) rotateY(${35 + heroProgress * 310}deg)`
          }">
            <span class="cube-face face-front" />
            <span class="cube-face face-back" />
            <span class="cube-face face-right" />
            <span class="cube-face face-left" />
            <span class="cube-face face-top" />
            <span class="cube-face face-bottom" />
          </div>
        </div>

        <div class="hero-origin-copy" :class="{ visible: heroProgress > 0.58 }">
          <span>01</span>
          <p>一切，都从一块方块开始。</p>
        </div>

        <div class="scroll-cue" :class="{ hidden: heroProgress > 0.12 }">
          <span>向下滚动</span>
          <i />
        </div>
      </div>
    </section>

    <section class="manifesto">
      <div class="manifesto-grid" aria-hidden="true">
        <span v-for="index in 32" :key="index" :style="{ animationDelay: `${(index % 8) * 0.08}s` }" />
      </div>
      <div class="manifesto-copy">
        <p class="eyebrow">8 MEMORY CHUNKS</p>
        <h2>我们没有保存所有日子。<br><em>但记住了光落下的位置。</em></h2>
        <p>接下来的滚动，会穿过八块真实的 BOH 记忆。每一帧都来自我们共同生活过的方块世界。</p>
      </div>
    </section>

    <section ref="tunnelRef" class="memory-tunnel" :style="{ height: `${chapters.length * 175}vh` }">
      <div class="tunnel-sticky">
        <div class="tunnel-ceiling" aria-hidden="true" />
        <article
          v-for="(chapter, index) in chapters"
          :key="chapter.year"
          v-memo="[
            index,
            index === activeChapter,
            photoIndices[index],
            collectedYears.has(chapter.year),
            isPanelPhotoWindowActive(index),
            photoDeckState.chapterIndex === index ? photoDeckState.x : 0,
            photoDeckState.chapterIndex === index ? photoDeckState.dragging : false,
            photoDeckState.chapterIndex === index ? photoDeckState.settling : false,
            photoDeckState.chapterIndex === index ? photoDeckState.leaving : false
          ]"
          class="memory-panel"
          :class="{ active: index === activeChapter }"
          :ref="(element) => { tunnelPanelElements[index] = element }"
          :style="panelStyle(index)"
        >
          <div
            class="panel-media"
          >
            <div class="memory-photo-deck" :class="{ single: chapterPhotoSets[index].length === 1 }">
              <button
                v-for="(photo, photoIndex) in chapterPhotoSets[index]"
                :key="`${chapter.year}-${photo.title}`"
                type="button"
                class="memory-photo-card"
                :class="{
                  current: photoPosition(index, photoIndex) === 0,
                  dragging: photoPosition(index, photoIndex) === 0 && photoDeckState.chapterIndex === index && photoDeckState.dragging,
                  settling: photoPosition(index, photoIndex) === 0 && photoDeckState.chapterIndex === index && photoDeckState.settling,
                  leaving: photoPosition(index, photoIndex) === 0 && photoDeckState.chapterIndex === index && photoDeckState.leaving
                }"
                :style="photoCardStyle(index, photoIndex)"
                :tabindex="photoPosition(index, photoIndex) === 0 ? 0 : -1"
                :disabled="photoPosition(index, photoIndex) !== 0"
                :aria-hidden="photoPosition(index, photoIndex) === 0 ? undefined : 'true'"
                :aria-label="`${photo.title}，第 ${photoIndex + 1} 张，共 ${chapterPhotoSets[index].length} 张`"
                @pointerdown="beginPhotoDrag($event, index, photoIndex)"
                @pointermove="movePhotoDrag"
                @pointerup="finishPhotoDrag"
                @pointercancel="finishPhotoDrag"
                @click="handlePhotoClick(index)"
              >
                <img
                  v-if="shouldRenderPanelPhoto(index, photoIndex)"
                  :src="photo.image"
                  :alt="`${chapter.year} · ${photo.title}`"
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                >
                <span class="memory-photo-caption">
                  <strong>{{ photo.title }}</strong>
                <small>{{ photo.date ? `${photo.date} · ` : '' }}{{ String(photoIndex + 1).padStart(2, '0') }} / {{ String(chapterPhotoSets[index].length).padStart(2, '0') }}</small>
                </span>
              </button>
            </div>
            <div class="panel-shade" />
            <nav v-if="chapterPhotoSets[index].length > 1" class="photo-deck-pagination" :aria-label="`${chapter.year} 照片`">
              <button
                v-for="(photo, photoIndex) in chapterPhotoSets[index]"
                :key="photo.title"
                type="button"
                :class="{ active: photoIndices[index] === photoIndex }"
                :aria-label="`查看 ${photo.title}`"
                :aria-current="photoIndices[index] === photoIndex ? 'true' : undefined"
                @click="showPhoto(index, photoIndex)"
              />
            </nav>
          </div>

          <div class="panel-year" aria-hidden="true">{{ chapter.year }}</div>
          <div class="panel-copy">
            <p class="panel-kicker">{{ activePhoto(index).date ? `${activePhoto(index).date} / ACTIVITY` : chapter.kicker }}</p>
            <h2 :key="`${chapter.year}-${photoIndices[index]}-title`">{{ activePhoto(index).title }}</h2>
            <p class="panel-description" :key="`${chapter.year}-${photoIndices[index]}-copy`">{{ activePhoto(index).copy }}</p>
            <button
              type="button"
              class="memory-token"
              :class="{ collected: collectedYears.has(chapter.year) }"
              :aria-pressed="collectedYears.has(chapter.year)"
              @click="collectMemory(chapter.year)"
            >
              <Check v-if="collectedYears.has(chapter.year)" :size="16" />
              <Box v-else :size="16" />
              <span>{{ collectedYears.has(chapter.year) ? `${chapter.year} 记忆已收录` : `收录 ${chapter.year} 记忆方块` }}</span>
            </button>
            <div class="panel-coordinate">
              <span /> BOH MEMORY {{ String(index + 1).padStart(2, '0') }} / {{ String(chapters.length).padStart(2, '0') }}
            </div>
          </div>
        </article>

        <nav class="chapter-dots" aria-label="记忆章节">
          <button
            v-for="(chapter, index) in chapters"
            :key="chapter.year"
            type="button"
            :class="{ active: index === activeChapter }"
            :style="{ '--dot-accent': chapter.accent }"
            :aria-label="`前往 ${chapter.year} 年记忆`"
            :aria-current="index === activeChapter ? 'step' : undefined"
            @click="scrollToChapter(index)"
          >{{ chapter.year }}</button>
        </nav>
      </div>
    </section>

    <section ref="thenNowRef" class="then-now-scroll">
      <div class="then-now-sticky">
        <img
          class="then-now-image then-now-future-image"
          :src="sevenYearsImage"
          alt="2025 年方块之家成员回到空岛的七周年合照"
          loading="lazy"
          decoding="async"
          :style="{ transform: `scale(${1.08 - thenNowProgress * 0.04})` }"
        >
        <img
          class="then-now-image then-now-origin-image"
          :src="originImage"
          alt="2018 年方块之家第一张空岛地图"
          loading="lazy"
          decoding="async"
          :style="{ opacity: 1 - clamp((thenNowProgress - 0.14) / 0.14) }"
        >
        <div class="then-now-tiles" aria-hidden="true">
          <span v-for="tile in thenNowTiles" :key="tile.id" :style="thenNowTileStyle(tile)" />
        </div>
        <div class="then-now-shade" aria-hidden="true" />

        <div class="then-now-copy then-now-copy-origin" :style="{ opacity: clamp(1 - thenNowProgress * 4.2) }">
          <p>2018 · ORIGIN</p>
          <h2>第一张地图，<br>只有一座小小的空岛。</h2>
        </div>
        <div class="then-now-copy then-now-copy-bridge" :style="{ opacity: clamp(1 - Math.abs(thenNowProgress - 0.5) * 7) }">
          <p>SAME COORDINATE</p>
          <h2>地图变了。<br>回到这里的人更多了。</h2>
        </div>
        <div class="then-now-copy then-now-copy-future" :style="{ opacity: clamp((thenNowProgress - 0.66) * 3.3) }">
          <p>2025 · 7TH ANNIVERSARY</p>
          <h2>七年之后，<br>我们又站在同一片天空下。</h2>
        </div>
      </div>
    </section>

    <section
      ref="worldRef"
      class="world-routes-scroll"
      :style="{ height: `${worldNodes.length * (viewportWidth <= 560 ? 58 : 62)}vh` }"
    >
      <div class="world-routes-sticky">
        <div class="world-routes-grid" aria-hidden="true" />
        <header class="world-routes-heading">
          <p>WORLD ROUTES · 2018—2026</p>
          <h2>一个家，<br class="world-heading-mobile-break">长出许多个世界。</h2>
        </header>

        <div class="world-routes-window">
          <div class="world-routes-track" :style="worldTrackStyle">
            <div class="world-route-line" aria-hidden="true">
              <span :style="{ transform: `scaleY(${worldProgress})` }" />
            </div>
            <article
              v-for="(node, index) in worldNodes"
              :key="`${node.date}-${node.title}`"
              class="world-route-node"
              :class="{ active: index === activeWorldIndex }"
              :style="worldNodeStyle(index)"
            >
              <div class="world-node-image">
                <img :src="node.image" :alt="`${node.year} · ${node.title}`" loading="lazy" decoding="async">
              </div>
              <div class="world-node-copy">
                <span>{{ node.code }}</span>
                <strong><small>{{ node.date }}</small>{{ node.title }}</strong>
                <p>{{ node.copy }}</p>
              </div>
              <i aria-hidden="true" />
            </article>
          </div>
        </div>

        <div class="world-routes-index" aria-live="polite">
          <span>{{ String(activeWorldIndex + 1).padStart(2, '0') }}</span>
          <i />
          <span>{{ String(worldNodes.length).padStart(2, '0') }}</span>
        </div>
      </div>
    </section>

    <section ref="strataRef" class="strata-scroll">
      <div class="strata-sticky">
        <div class="strata-atmosphere" aria-hidden="true">
          <span
            v-for="(stratum, index) in worldStrata"
            :key="`${stratum.depth}-backdrop`"
            :style="stratumBackdropStyle(index)"
          />
        </div>
        <div class="strata-grid" aria-hidden="true" />

        <header class="strata-heading">
          <p>WORLD CROSS SECTION · SCROLL TO DESCEND</p>
          <h2>沿着方块的断面，<br>去看一个世界如何被托住。</h2>
        </header>

        <div class="strata-stage">
          <article
            v-for="(stratum, index) in worldStrata"
            :key="stratum.depth"
            class="stratum-slab"
            :class="[{ active: index === activeStratumIndex }, `is-${stratum.material}`]"
            :style="stratumStyle(index)"
          >
            <div class="stratum-media">
              <img :src="stratum.image" :alt="`${stratum.year} · ${stratum.name}`" loading="lazy" decoding="async">
              <span>{{ stratum.depth }}</span>
            </div>
            <div class="stratum-copy">
              <span>{{ stratum.code }}</span>
              <small>{{ stratum.year }} · {{ stratum.name }}</small>
              <h3>{{ stratum.title }}</h3>
              <p>{{ stratum.copy }}</p>
            </div>
            <div class="stratum-cut-face" aria-hidden="true">
              <i v-for="block in 18" :key="block" />
            </div>
          </article>
        </div>

        <div class="strata-depth" aria-live="polite">
          <span>DEPTH</span>
          <strong>{{ activeStratum.depth }}</strong>
          <i><b :style="{ transform: `translateY(${strataProgress * 100}%)` }" /></i>
          <small>{{ String(activeStratumIndex + 1).padStart(2, '0') }} / {{ String(worldStrata.length).padStart(2, '0') }}</small>
        </div>
      </div>
    </section>

    <section class="memory-break">
      <div class="break-image break-image-a">
        <img :src="islandImage" alt="方块之家 2019 空岛全景" loading="lazy" decoding="async">
      </div>
      <div class="break-image break-image-b">
        <img :src="fourYearsNewYearImage" alt="方块之家 2022 新年烟花合照" loading="lazy" decoding="async">
      </div>
      <div class="break-image break-image-c">
        <img :src="homeNewYearImage" alt="方块之家 2024 新年活动合照" loading="lazy" decoding="async">
      </div>
      <div class="break-copy">
        <span>150+ MEMBERS · 2922 DAYS</span>
        <h2>一个世界真正的尺度，<br>不是地图有多大。</h2>
        <p>是有多少人，愿意一次又一次回来。</p>
      </div>
    </section>

    <section ref="finaleRef" class="finale-scroll">
      <div class="finale-sticky">
        <div class="finale-aurora" />
        <div class="figure-eight" :style="figureStyle" aria-hidden="true">
          <span
            v-for="block in figureBlocks"
            :key="block.id"
            class="figure-block"
            :class="[`is-${block.type}`, { 'is-active': finaleProgress < 0.38 }]"
            :style="figureBlockStyle(block)"
          />
        </div>

        <div class="assembly-copy" :style="{
          opacity: clamp(1 - finaleProgress * 5),
          transform: `translateY(${finaleProgress * -40}px)`
        }">
          <span>FINAL BUILD</span>
          <h2>把散落的记忆<br>重新放在一起</h2>
        </div>

        <div class="reveal-copy" :class="{ visible: finaleProgress > 0.18 && finaleProgress < 0.35 }">
          <p class="reveal-year">2018 — 2026</p>
          <h2>八年，感谢有你。</h2>
          <p>每一个名字，都是这个世界的一部分。</p>
        </div>

        <div ref="reunionFrameRef" class="reunion-frame" :style="reunionFrameStyle">
          <img class="reunion-ghost" :src="reunionImage" alt="" loading="lazy" decoding="async" aria-hidden="true">
          <img
            v-for="fragment in reunionFragments"
            :key="fragment.id"
            class="reunion-fragment"
            :src="reunionImage"
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
            :style="reunionFragmentStaticStyle(fragment)"
          >
          <img
            class="reunion-photo"
            :src="reunionImage"
            alt="方块之家八周年校园设定集大合照"
            loading="lazy"
            decoding="async"
            :style="reunionPhotoStyle"
          >
          <div class="reunion-sheen" aria-hidden="true" />
        </div>

        <div class="reunion-guide" :class="{ visible: finaleProgress > 0.29 && finaleProgress < 0.8 }">
          <span>FINAL PORTRAIT</span>
          <p>让每一个名字，回到属于自己的位置。</p>
        </div>

        <div class="reunion-finale-copy" :class="{ visible: finaleProgress > 0.84 }">
          <p class="reveal-year">BLOCK OF HOME · 8TH ANNIVERSARY</p>
          <h2>这一张合照，装下了我们的第八年。</h2>
        </div>

        <div class="finale-participation" :class="{ visible: finaleProgress > 0.86, complete: finalBlockPlaced }">
          <div class="memory-inventory" aria-label="已收录的年度记忆">
            <span
              v-for="chapter in chapters"
              :key="chapter.year"
              :class="{ filled: collectedYears.has(chapter.year) }"
              :style="{ '--slot-accent': chapter.accent }"
            />
            <span
              ref="finalTargetRef"
              class="keystone-target"
              :class="{ filled: finalBlockPlaced }"
              aria-label="第九年的空坐标"
            >
              <span v-if="finalBlockPlaced" class="keystone-placed"><Check :size="14" /></span>
              <small v-else>09</small>
            </span>
          </div>
          <p>{{ finalBlockPlaced ? '第九年的起点已经点亮' : `${collectedCount} / ${chapters.length} 块记忆随你来到这里` }}</p>
          <div v-if="!finalBlockPlaced" class="keystone-workbench">
            <button
              ref="finalBlockRef"
              type="button"
              class="keystone-block"
              :class="{ dragging: finalBlockDragging, settling: finalBlockSettling }"
              :style="{ transform: `translate3d(${finalBlockOffset.x}px, ${finalBlockOffset.y}px, 0) rotate(${finalBlockOffset.x * 0.12}deg)` }"
              aria-label="第九年的第一块，拖动到 09 坐标"
              title="拖动到 09 坐标"
              @pointerdown="beginFinalBlockDrag"
              @pointermove="moveFinalBlock"
              @pointerup="endFinalBlockDrag"
              @pointercancel="endFinalBlockDrag"
              @click="placeFinalBlock"
            ><Box :size="22" /></button>
          </div>
        </div>

        <div class="finale-actions" :class="{ visible: finaleProgress > 0.94 }">
          <button class="primary-action" @click="router.push({ path: '/', hash: '#ryyik-letter' })">查看信件</button>
          <button class="text-action" @click="router.push('/block-wall')">去方块墙留下新的记忆</button>
          <button class="text-action" @click="router.push('/')">返回方块之家</button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
@import './style.scoped.css';
</style>
