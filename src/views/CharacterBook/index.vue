<template>
  <div class="character-book-page">
    <UnifiedNavbar />

    <main class="character-book-main">
      <section class="book-hero" aria-labelledby="character-book-title">
        <span class="book-kicker">Block of Home</span>
        <h1 id="character-book-title">方块之家设定集</h1>
        <p>人物图、人物档案与设定说明的展示框架，后续可直接替换为正式角色资料。</p>
      </section>

      <section class="character-stage" aria-label="人物设定展示">
        <div class="character-visual-panel">
          <button class="switch-button previous" type="button" aria-label="上一位人物" @click="showPreviousCharacter">
            <ChevronLeft aria-hidden="true" />
          </button>

          <Transition :name="visualTransitionName" mode="out-in">
            <div :key="currentCharacter.id" class="character-image-frame">
              <img
                class="character-style-image"
                :src="currentCharacter.image"
                :alt="`${currentCharacter.name} style 人物图`"
                draggable="false"
               loading="lazy">
            </div>
          </Transition>

          <button class="switch-button next" type="button" aria-label="下一位人物" @click="showNextCharacter">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <aside class="character-profile" aria-live="polite">
          <Transition name="profile-flip" mode="out-in">
            <div :key="currentCharacter.id" class="profile-content">
              <div class="profile-count">{{ currentIndex + 1 }} / {{ characters.length }}</div>
              <h2>{{ currentCharacter.name }}</h2>
              <p class="profile-role">{{ currentCharacter.role }}</p>

              <div class="profile-divider"></div>

              <dl class="profile-facts">
                <div v-for="fact in currentCharacter.facts" :key="fact.label" class="profile-fact">
                  <dt>{{ fact.label }}</dt>
                  <dd>{{ fact.value }}</dd>
                </div>
              </dl>

              <div class="profile-copy">
                <h3>人物介绍</h3>
                <p>{{ currentCharacter.description }}</p>
              </div>
            </div>
          </Transition>

          <div class="character-tabs" aria-label="人物快速切换">
            <button
              v-for="(character, index) in characters"
              :key="character.id"
              type="button"
              class="tab-dot"
              :class="{ active: index === currentIndex }"
              :aria-label="`切换到${character.name}`"
              :aria-pressed="index === currentIndex"
              @click="showCharacter(index)"
            ></button>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
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

const characters = [
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
    description: '黑灰系神秘巫毒师造型，保留河豚原本的黑白灰轮廓与冷淡气质，并加入方块巫毒娃娃、符纹短披肩和骨饰护符。',
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
    description: '以黑白红原始造型为基础的大法官形态，佩戴单边眼镜，一手夹着厚重法典，另一手握着方块法槌。',
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

const currentIndex = ref(0);
const visualTransitionName = ref('visual-flip-next');
const currentCharacter = computed(() => characters[currentIndex.value]);

const showCharacter = (index) => {
  if (index === currentIndex.value) return;

  visualTransitionName.value = index > currentIndex.value ? 'visual-flip-next' : 'visual-flip-previous';
  currentIndex.value = index;
};

const showPreviousCharacter = () => {
  visualTransitionName.value = 'visual-flip-previous';
  currentIndex.value = (currentIndex.value - 1 + characters.length) % characters.length;
};

const showNextCharacter = () => {
  visualTransitionName.value = 'visual-flip-next';
  currentIndex.value = (currentIndex.value + 1) % characters.length;
};
</script>

<style scoped>
@import './style.scoped.css';
</style>
