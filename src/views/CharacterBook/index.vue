<template>
  <div class="character-book-page">
    <main class="character-book-main">
      <section class="book-hero" aria-labelledby="character-book-title">
        <span class="book-kicker">Block of Home</span>
        <h1 id="character-book-title">方块之家设定集</h1>
        <p>人物图、人物档案与设定说明的展示框架，后续可直接替换为正式角色资料。</p>
      </section>

      <section class="character-stage" aria-label="人物设定展示">
        <div class="character-visual-panel">
          <button
            class="switch-button previous"
            type="button"
            aria-label="上一位人物"
            @click="showPreviousCharacter"
          >
            <ChevronLeft aria-hidden="true" />
          </button>

          <Transition :name="visualTransitionName" mode="out-in">
            <div :key="currentCharacter.id" class="character-image-frame">
              <img
                class="character-style-image"
                :src="currentCharacter.image"
                :alt="`${currentCharacter.name} style 人物图`"
                draggable="false"
                loading="lazy"
              />
            </div>
          </Transition>

          <button
            class="switch-button next"
            type="button"
            aria-label="下一位人物"
            @click="showNextCharacter"
          >
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
// 角色数据（含立绘）单源见 @/data/character-book.js —— 全局搜索也要索引同一份
import { CHARACTER_BOOK_ENTRIES } from '@/data/character-book';

const characters = CHARACTER_BOOK_ENTRIES;

const currentIndex = ref(0);
const visualTransitionName = ref('visual-flip-next');
const currentCharacter = computed(() => characters[currentIndex.value]);

const showCharacter = (index) => {
  if (index === currentIndex.value) return;

  visualTransitionName.value =
    index > currentIndex.value ? 'visual-flip-next' : 'visual-flip-previous';
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
