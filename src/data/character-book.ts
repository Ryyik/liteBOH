/**
 * 方块之家设定集数据单源（2026-09-27 抽出）
 *
 * 原先是 `views/CharacterBook/index.vue` 的组件内常量（连同 15 个立绘 import 一起）。
 * 抽出原因：全局搜索（plans/020）要索引角色名与设定说明；留在组件里就只能抄一份，
 * 抄了就会漂移。
 *
 * ⚠️ 立绘 import 必须留在本文件：`image` 字段是 `characters` 的一部分，拆开会导致
 * 「数据一份、图片一份」，加角色时又要改两处。
 */
import baichengStyle from '@/assets/images/Skin/baicheng_style.webp';
import baiyeStyle from '@/assets/images/Skin/baiye_style.webp';
import chengziStyle from '@/assets/images/Skin/chengzi_style.webp';
import elevenStyle from '@/assets/images/Skin/eleven_style.webp';
import endStyle from '@/assets/images/Skin/end_style.webp';
import fivegeDoubaoStyle from '@/assets/images/Skin/fivege_doubaostyle.webp';
import hamburgerStyle from '@/assets/images/Skin/hamburger_style.webp';
import pufferfishStyle from '@/assets/images/Skin/pufferfish_style.webp';
import pufferfishVoodooStyle from '@/assets/images/Skin/train/pufferfish_voodoo_style.webp';
import ryyikStyle from '@/assets/images/Skin/ryyik_style.webp';
import slkeswdrGrandJudgeStyle from '@/assets/images/Skin/Slkeswdr_grand_judge_style.webp';
import teacherDingStyle from '@/assets/images/Skin/teacher-ding_style.webp';
import thoikStyle from '@/assets/images/Skin/thoik_style.webp';
import xiaoniuStyle from '@/assets/images/Skin/xiaoniu_style.webp';
import yufuquStyle from '@/assets/images/Skin/yufuqu_style.webp';

export interface CharacterBookFact {
  label: string;
  value: string;
}

export interface CharacterBookEntry {
  id: string;
  name: string;
  image: string;
  role: string;
  facts: CharacterBookFact[];
  description: string;
}

export const CHARACTER_BOOK_ENTRIES: CharacterBookEntry[] = [
  {
    id: 'baicheng',
    name: 'baicheng',
    image: baichengStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'baicheng' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'baiye',
    name: 'baiye',
    image: baiyeStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'baiye' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'chengzi',
    name: 'chengzi',
    image: chengziStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'chengzi' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'eleven',
    name: 'eleven',
    image: elevenStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'eleven' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'end',
    name: 'end',
    image: endStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'end' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'fivege',
    name: 'fivege',
    image: fivegeDoubaoStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'fivege_doubaostyle' },
      { label: '图像', value: 'doubao style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'hamburger',
    name: 'hamburger',
    image: hamburgerStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'hamburger' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'pufferfish',
    name: 'pufferfish',
    image: pufferfishStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'pufferfish' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'pufferfish_voodoo_style',
    name: 'pufferfish_voodoo_style',
    image: pufferfishVoodooStyle,
    role: 'train 系列皮肤',
    facts: [
      { label: '档案名', value: 'pufferfish_voodoo_style' },
      { label: '图像', value: 'train style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description:
      '黑灰系神秘巫毒师造型，保留河豚原本的黑白灰轮廓与冷淡气质，并加入方块巫毒娃娃、符纹短披肩和骨饰护符。',
  },
  {
    id: 'ryyik',
    name: 'ryyik',
    image: ryyikStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'ryyik' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'Slkeswdr',
    name: 'Slkeswdr',
    image: slkeswdrGrandJudgeStyle,
    role: '大法官',
    facts: [
      { label: '档案名', value: 'Slkeswdr' },
      { label: '图像', value: 'grand judge style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description:
      '以黑白红原始造型为基础的大法官形态，佩戴单边眼镜，一手夹着厚重法典，另一手握着方块法槌。',
  },
  {
    id: 'teacher-ding',
    name: 'teacher-ding',
    image: teacherDingStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'teacher-ding' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'thoik',
    name: 'thoik',
    image: thoikStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'thoik' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'xiaoniu',
    name: 'xiaoniu',
    image: xiaoniuStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'xiaoniu' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
  {
    id: 'yufuqu',
    name: 'yufuqu',
    image: yufuquStyle,
    role: '方块之家人物设定',
    facts: [
      { label: '档案名', value: 'yufuqu' },
      { label: '图像', value: 'style 立绘' },
      { label: '状态', value: '已收录' },
    ],
    description: '人物设定资料已接入，后续可以继续补充背景、身份、口头禅与重要剧情节点。',
  },
];
