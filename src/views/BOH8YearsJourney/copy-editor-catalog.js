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

import { editableJourneyFields, journeyCopyId } from './copy-editor-store.js'

function makeEntry(group, scope, item, index = 0) {
  return {
    group,
    id: journeyCopyId(scope, item, index),
    image: item.image,
    label: item.title || item.name,
    defaults: Object.fromEntries(editableJourneyFields(item).map((field) => [field, item[field]]))
  }
}

const timelineGroups = [
  {
    year: '2018', intro: { year: '2018', kicker: 'ORIGIN / 出生点', title: '世界从空岛醒来', copy: '第一张地图很小，路也还没有延伸太远。但出生点旁的每一格土地，都记录着最初的想象。', image: originImage },
    moments: [
      { title: '第一张地图', copy: '方块，空岛，指令，一张承载大家心血的地图，方块之家第一张自制地图。', image: originImage },
      { title: '家的原点', copy: '这里还没有宏大的建筑，只有一群人决定继续把路向外铺开。', image: originImage }
    ]
  },
  {
    year: '2019', intro: { year: '2019', kicker: 'SETTLE / 生长', title: '三周年，有人开始留下房子', copy: '人物站到建筑前，建筑服也逐渐形成，地图不再只是出生点，而是逐渐能被称作家。', image: builderImage },
    moments: [
      { title: '建筑与建造者', copy: '小牛站在完成的建筑前，人物第一次成为地图记忆的主角。', image: builderImage },
      { title: '空岛全景', copy: '这一年已经铺开的道路、平台与共同空间，让空岛拥有了完整轮廓，本应有雕刻世界图片，奈何缺失。', image: islandImage },
      { title: '神奇宝贝服务器', copy: '2019，方块之家初次迈入联机侠，遇到了更多新的人，开启了新的故事。', image: pokemonImage }
    ]
  },
  {
    year: '2020—21', intro: { year: '2020—21', kicker: 'BUILD / 灯火未熄', title: '隔着屏幕继续建造', copy: '方块世界仍在生长。翼儿、笔墨和更多名字，把各自的房子留在同一张地图上，本应有联机侠建筑服图片，奈何图片缺失。', image: togetherImage },
    moments: [
      { title: '翼儿的建筑', copy: '房屋与庭院。', image: togetherImage },
      { title: '笔墨的建筑', copy: '鸡坚强，你快回来啊。', image: togetherAltImage }
    ]
  },
  {
    year: '2022', intro: { year: '2022', date: '2022/7/21', kicker: 'TOGETHER / 四周年', title: '在烟花下合照。', copy: '四周年、新年、国庆与圣诞，越来越多的人会在活动结束前站到一起，为这一刻留下坐标。', image: fourYearsImage },
    moments: [
      { date: '2022/7/21', title: '四周年另一帧', copy: '同一天的另一张照片，记录下不同站位和同一片晚霞。', image: fourYearsAltImage },
      { date: '2022/10', title: '国庆特别活动', copy: '国庆的红色舞台让这一年的节日合照拥有了鲜明坐标。', image: fourYearsNationalImage }
    ],
    scan: { date: '2022/12/26', title: '圣诞活动', copy: '红色舞台、飘落的粒子和并肩站立的成员，让这一年的冬天也拥有合照，竟然合照台都没变吗。', image: fourYearsChristmasImage }
  },
  {
    year: '2023', intro: { year: '2023', date: '2023/7/21', kicker: 'ARCHIVE / 五周年', title: '每一次相聚都有名字', copy: '五周年、农夫乐事、国庆、冬眠生存与生日会被一张张保存下来。共同记忆开始拥有可以回看的日期和人物。', image: fiveYearsImage },
    moments: [
      { date: '2023/8', title: '农夫乐事', copy: '农夫乐事第一期获得流量，继续跟上，开始方块街的建设，方块之家群人数逐渐突破100。', image: fiveYearsFarmImage },
      { date: '2023/10', title: '国庆特别活动', copy: '小牛繁茂洞穴里的长椅和熟悉的名字，愉悦的国庆与生日氛围。', image: fiveYearsNationalImage },
      { title: '生日与国庆', copy: '生日会和国庆活动在同一张照片里交汇，庆祝的是具体的人。', image: fiveYearsBirthdayImage },
      { date: '2023/12/1', title: '冬眠生存', copy: '冬天不再只是一次合照，一段持续生存与共同建设的传统。冬眠生存超好玩，每次冬天最期待的就是可以和大家一起玩生存，喝热奶茶！', image: fiveYearsHibernateImage }
    ],
    scan: { title: '圣诞生日会', copy: '圣诞树、礼物与生日会出现在同一个夜晚，超级感动，小牛为我们在圣诞树上写了留言，并且做了如此温馨的造景，“我草，我草”（此处省略N个）。', image: fiveYearsChristmasImage }
  },
  {
    year: '2024', intro: { year: '2024', date: '2024/12/31', kicker: 'PLAY / 新年地图', title: '地图变成一座游乐场', copy: '方块之家全新的尝试，非自制地图，我们选用了游乐场地图与跑酷地图，为数不多没有吵起来的活动。华少：“好无聊啊。”', image: homeImage },
    moments: [
      { date: '2024/2', title: '农夫乐事方块街', copy: '火锅店，方块街的起源，方块之家农夫乐事第二期，获得了更好的反响，群人数突破100人！（虽然大家都是进来下资源的，但我相信还是有人注意到方块之家的对吧！）', image: homeFarmImage },
      { date: '2024/7', title: 'MC 卡车', copy: '卡车驶进方块世界，活动第一次把公路与驾驶体验放进共同地图。', image: homeTruckImage },
      { date: '2024/12/31', title: '新年活动', copy: '游乐园的新年合照！', image: homeNewYearImage },
      { date: '2024/12/31', title: '雪山跑酷', copy: '雪山跑酷，跨年夜真的跑破防了。', image: homeImage }
    ]
  },
  {
    year: '2025', intro: { year: '2025', date: '2025/7/21', kicker: 'MEET / 七周年', title: '旧世界被放进博物馆', copy: '七周年、国庆特别活动、博物馆与问答活动，把一路走来的故事重新摆到大家面前。', image: sevenYearsImage },
    moments: [
      { date: '2025/7/21', title: '七周年空岛', copy: '成员重新站在空岛上，让 2025 与 2018 的第一张地图形成回应。', image: sevenYearsImage },
      { date: '2025/10', title: '国庆特别活动', copy: '七周年之后的又一次集合，让新的成员也进入这一年的共同画面。', image: sevenYearsNationalImage },
      { date: '2025/12/12', title: '博物馆与问答', copy: '旧物被陈列，旧故事被提问，记忆从截图变成可以共同回答的档案。', image: sevenYearsQaImage }
    ],
    scan: { date: '2025/12/12', title: '博物馆合照', copy: '成员站在博物馆内部，旧地图与旧物第一次成为可以共同参观的历史。一二：叔叔我是0。', image: sevenYearsMuseumImage }
  },
  {
    year: '2026', intro: { year: '2026', kicker: 'NEXT / 八周年', title: '在 2026 前再次集合', copy: '方块之家，2026，我们还在一起！', image: futureImage },
    moments: [
      { title: '新年的数字', copy: '2026 不只是背景，它是所有旧年份继续向前延伸后的新坐标。', image: futureImage },
      { date: '2026/2/3', title: '冬眠生存第四季', copy: '从2021延续而来的冬眠生存发布第四弹，竟然出到第四季了？！YUFUQU：捡到别人袜子了。', image: winterFourthImage },
      { title: '八周年之前', copy: '围炉QA，好尴尬！', image: sevenYearsQaImage }
    ]
  }
]

const worldRoutes = [
  ['2018', 'SKYBLOCK / ORIGIN', '第一张地图', '所有路线，都从这座空岛向外延伸。', originImage],
  ['2019', 'PIXELMON / BRANCH', '神奇宝贝服务器', '方块之家的第一次神奇宝贝服务器尝试。', pokemonImage],
  ['2022/7/21', 'ANNIVERSARY / 04', '方块之家四周年', '第四个生日让周年合照正式成为传统。', fourYearsImage],
  ['2022/10', 'NATIONAL DAY / EVENT', '国庆特别活动', '红色舞台把节日和成员重新带回同一个坐标。', fourYearsNationalImage],
  ['2022/12/26', 'CHRISTMAS / TOGETHER', '圣诞活动', '飘落的粒子、节日舞台和冬日合照留在这一晚。', fourYearsChristmasImage],
  ['2023/7/21', 'ANNIVERSARY / 05', '方块之家五周年', '五周年庆典与纪念礼盒一起保存了第五年的名字。', fiveYearsImage],
  ['2023/8', 'FARMERS DELIGHT / 01', '农夫乐事', '活动从周年舞台走进农夫乐事与共同经营，让群人数飞涨。', fiveYearsFarmImage],
  ['2023/10', 'NATIONAL DAY / EVENT', '国庆特别活动', '小牛的繁茂洞穴，造的太美了，让我先住进去！', fiveYearsNationalImage],
  ['2023/12/1', 'HIBERNATION / SEASON 01', '冬眠生存', '樱花树下那三季冬眠生存，“我同学说我视频里声音很好听”“啊啊啊你声音很好听？！”', fiveYearsHibernateImage],
  ['2024/2', 'FARMERS DELIGHT / STREET', '农夫乐事方块街', '乡村主题扩展成一整条可以生活和探索的方块街。', homeFarmImage],
  ['2024/7', 'TRUCK / ROAD TRIP', 'MC 卡车', '卡车与公路第一次成为活动地图里的主角。', homeTruckImage],
  ['2024/12/31', 'NEW YEAR / TOGETHER', '新年活动', '成员在新年舞台重新集合，为下一段路线揭幕。', homeNewYearImage],
  ['2024/12/31', 'PARKOUR / PLAY', '新年雪山跑酷', '建筑不再只是风景，也成为可以共同穿过的挑战。', homeImage],
  ['2025/7/21', 'ANNIVERSARY / 07', '方块之家七周年', '成员回到空岛，让第七年与第一张地图重新重合。', sevenYearsImage],
  ['2025/10', 'NATIONAL DAY / EVENT', '国庆特别活动', '新的成员进入画面，也进入这一年的共同记忆。', sevenYearsNationalImage],
  ['2025/12/12', 'MUSEUM / ARCHIVE', '方块博物馆来袭', '旧地图、圣诞与生日会被收进一座可以共同参观的档案馆。', sevenYearsMuseumImage],
  ['2026/1', 'NEW YEAR / NEXT', '新年坐标', '数字被建进地图，下一条路线仍在等待上线。', futureImage],
  ['2026/2/3', 'HIBERNATION / SEASON 04', '冬眠生存第四季', '从 2023 延续而来的传统活动，在第四季继续生长。', winterFourthImage]
].map(([date, code, title, copy, image]) => ({ date, code, title, copy, image }))

const strata = [
  { year: '2018', depth: 'Y +128', code: 'SKY / SPAWN', name: '云层 · 出生点', title: '世界从一座空岛开始', copy: '最初的边界很近。桥、树与出生点悬在云上，每向外放下一块方块，地图就多出一种可能。', image: originImage },
  { year: '2019', depth: 'Y +72', code: 'SURFACE / SETTLE', name: '地表 · 聚落', title: '路、房子和名字开始出现', copy: '道路把不同建筑连成聚落。世界不再只有出生点，也第一次拥有了能够被称作“回来”的地方。', image: islandImage },
  { year: '2024', depth: 'Y +24', code: 'MECHANISM / PLAY', name: '机关 · 活动层', title: '建筑变成共同穿过的游戏', copy: '跑酷、机关和活动场地让方块有了动作。被建造的不只是景观，还有一起挑战和抵达的路线。', image: homeImage },
  { year: '2025', depth: 'Y -12', code: 'ARCHIVE / MEMORY', name: '地下 · 档案层', title: '旧世界被保存成可以重返的房间', copy: '博物馆把地图、物品和故事收进同一处空间。曾经散落的截图，开始拥有可以被共同参观的坐标。', image: sevenYearsMuseumImage },
  { year: '2026', depth: 'Y -64', code: 'BEDROCK / PEOPLE', name: '基岩 · 玩家层', title: '地图最深处，仍然是人的名字', copy: '服务器可以换地图，建筑也会更新。真正托住这个世界的，是八年里一次又一次上线、相遇和归来的成员。', image: sevenYearsQaImage }
]

export const copyEditorGroups = [
  {
    id: 'timeline',
    title: '年份照片栈',
    entries: timelineGroups.flatMap((chapter, chapterIndex) => [
      makeEntry('年份照片栈', 'timeline-intro', chapter.intro, chapterIndex),
      ...chapter.moments.map((moment, index) => makeEntry('年份照片栈', `timeline-${chapter.year}`, moment, index)),
      ...(chapter.scan ? [makeEntry('年份照片栈', `timeline-${chapter.year}-scan`, chapter.scan, 0)] : [])
    ])
  },
  {
    id: 'routes',
    title: '世界分支地图',
    entries: worldRoutes.map((item, index) => makeEntry('世界分支地图', 'world-route', item, index))
  },
  {
    id: 'strata',
    title: '地图剖面电梯',
    entries: strata.map((item, index) => makeEntry('地图剖面电梯', 'stratum', item, index))
  }
]
