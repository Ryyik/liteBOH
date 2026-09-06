// 方块之家人物皮肤库 —— 供设定集 showcase 英雄区与管理面板选人使用
// key 与 transparent/ 目录下的文件一一对应（不含扩展名）
import baichengStyle from '@/assets/images/Skin/transparent/baicheng_style.webp'
import baiyeStyle from '@/assets/images/Skin/transparent/baiye_style.webp'
import chengziStyle from '@/assets/images/Skin/transparent/chengzi_style.webp'
import elevenStyle from '@/assets/images/Skin/transparent/eleven_style.webp'
import endStyle from '@/assets/images/Skin/transparent/end_style.webp'
import fivegeDoubaoStyle from '@/assets/images/Skin/transparent/fivege_doubaostyle.webp'
import fivegeStyle2 from '@/assets/images/Skin/transparent/fivege_style2.webp'
import hamburgerStyle from '@/assets/images/Skin/transparent/hamburger_style.webp'
import pufferfishStyle from '@/assets/images/Skin/transparent/pufferfish_style.webp'
import ryyikStyle from '@/assets/images/Skin/transparent/ryyik_style.webp'
import slkeswdrStyle from '@/assets/images/Skin/transparent/Slkeswdr_style.webp'
import slkeswdrNewStyle from '@/assets/images/Skin/transparent/Slkeswdr_new_style.webp'
import slkeswdrGrandJudgeStyle from '@/assets/images/Skin/transparent/Slkeswdr_grand_judge_style.webp'
import teacherDingStyle from '@/assets/images/Skin/transparent/teacher-ding_style.webp'
import thoikStyle from '@/assets/images/Skin/transparent/thoik_style.webp'
import xiaoniuStyle from '@/assets/images/Skin/transparent/xiaoniu_style.webp'
import yufuquStyle from '@/assets/images/Skin/transparent/yufuqu_style.webp'

import baichengPhantom from '@/assets/images/Skin/transparent/train/baicheng_phantom_style.webp'
import baiyeBartender from '@/assets/images/Skin/transparent/train/baiye_bartender_style.webp'
import chengyanSpy from '@/assets/images/Skin/transparent/train/chengyan_spy_style.webp'
import chengziCultist from '@/assets/images/Skin/transparent/train/chengzi_cultist_style.webp'
import elevenMimic from '@/assets/images/Skin/transparent/train/eleven_mimic_style.webp'
import endAssassin from '@/assets/images/Skin/transparent/train/end_assassin_style.webp'
import fivegeRetracer from '@/assets/images/Skin/transparent/train/fivege_retracer_style.webp'
import hamburgerArsonist from '@/assets/images/Skin/transparent/train/hamburger_arsonist_style.webp'
import ninetyOnePoisoner from '@/assets/images/Skin/transparent/train/91_poisoner_style.webp'
import pufferfishVoodoo from '@/assets/images/Skin/transparent/train/pufferfish_voodoo_style.webp'
import ryyikConductor from '@/assets/images/Skin/transparent/train/ryyik_conductor_style.webp'
import slkeswdrJudge from '@/assets/images/Skin/transparent/train/Slkeswdr_grand_judge_style.webp'
import teacherDingPolice from '@/assets/images/Skin/transparent/train/teacher-ding_police_style.webp'
import thoikDetective from '@/assets/images/Skin/transparent/train/thoik_detective_style.webp'
import xiaoniuCoroner from '@/assets/images/Skin/transparent/train/xiaoniu_coroner_style.webp'
import yufuquNecromancer from '@/assets/images/Skin/transparent/train/yufuqu_necromancer_style.webp'

// 分组：classic 经典立绘 / train 列车系列
export const SKIN_LIBRARY = [
  { key: 'baicheng_style', name: '白城', group: 'classic', src: baichengStyle },
  { key: 'baiye_style', name: '白叶', group: 'classic', src: baiyeStyle },
  { key: 'chengzi_style', name: '橙子', group: 'classic', src: chengziStyle },
  { key: 'eleven_style', name: '十一', group: 'classic', src: elevenStyle },
  { key: 'end_style', name: 'end', group: 'classic', src: endStyle },
  { key: 'fivege_doubaostyle', name: '五哥 · 豆包', group: 'classic', src: fivegeDoubaoStyle },
  { key: 'fivege_style2', name: '五哥', group: 'classic', src: fivegeStyle2 },
  { key: 'hamburger_style', name: '汉堡', group: 'classic', src: hamburgerStyle },
  { key: 'pufferfish_style', name: '河豚', group: 'classic', src: pufferfishStyle },
  { key: 'ryyik_style', name: 'ryyik', group: 'classic', src: ryyikStyle },
  { key: 'Slkeswdr_style', name: 'Slkeswdr', group: 'classic', src: slkeswdrStyle },
  { key: 'Slkeswdr_new_style', name: 'Slkeswdr · 新装', group: 'classic', src: slkeswdrNewStyle },
  { key: 'Slkeswdr_grand_judge_style', name: 'Slkeswdr · 大法官', group: 'classic', src: slkeswdrGrandJudgeStyle },
  { key: 'teacher-ding_style', name: '丁老师', group: 'classic', src: teacherDingStyle },
  { key: 'thoik_style', name: 'thoik', group: 'classic', src: thoikStyle },
  { key: 'xiaoniu_style', name: '小牛', group: 'classic', src: xiaoniuStyle },
  { key: 'yufuqu_style', name: 'yufuqu', group: 'classic', src: yufuquStyle },
  { key: 'train/baicheng_phantom_style', name: '白城 · 幻影', group: 'train', src: baichengPhantom },
  { key: 'train/baiye_bartender_style', name: '白叶 · 调酒师', group: 'train', src: baiyeBartender },
  { key: 'train/chengyan_spy_style', name: '橙颜 · 间谍', group: 'train', src: chengyanSpy },
  { key: 'train/chengzi_cultist_style', name: '橙子 · 邪教徒', group: 'train', src: chengziCultist },
  { key: 'train/eleven_mimic_style', name: '十一 · 模仿者', group: 'train', src: elevenMimic },
  { key: 'train/end_assassin_style', name: 'end · 刺客', group: 'train', src: endAssassin },
  { key: 'train/fivege_retracer_style', name: '五哥 · 追溯者', group: 'train', src: fivegeRetracer },
  { key: 'train/hamburger_arsonist_style', name: '汉堡 · 纵火犯', group: 'train', src: hamburgerArsonist },
  { key: 'train/91_poisoner_style', name: '91 · 下毒者', group: 'train', src: ninetyOnePoisoner },
  { key: 'train/pufferfish_voodoo_style', name: '河豚 · 巫毒', group: 'train', src: pufferfishVoodoo },
  { key: 'train/ryyik_conductor_style', name: 'ryyik · 列车长', group: 'train', src: ryyikConductor },
  { key: 'train/Slkeswdr_grand_judge_style', name: 'Slkeswdr · 大法官', group: 'train', src: slkeswdrJudge },
  { key: 'train/teacher-ding_police_style', name: '丁老师 · 警长', group: 'train', src: teacherDingPolice },
  { key: 'train/thoik_detective_style', name: 'thoik · 侦探', group: 'train', src: thoikDetective },
  { key: 'train/xiaoniu_coroner_style', name: '小牛 · 法医', group: 'train', src: xiaoniuCoroner },
  { key: 'train/yufuqu_necromancer_style', name: 'yufuqu · 灵媒', group: 'train', src: yufuquNecromancer }
]

const libraryMap = new Map(SKIN_LIBRARY.map((item) => [item.key, item]))

// 按库 key 解析立绘 URL；自定义上传场景直接返回 src
export const resolveSkinAsset = (key, fallbackSrc = '') => {
  if (fallbackSrc) return fallbackSrc
  return libraryMap.get(key)?.src || ''
}

export const getSkinLibraryItem = (key) => libraryMap.get(key) || null
