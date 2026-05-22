<template>
  <div class="word-cloud-container" ref="containerRef">
    <div v-if="words.length === 0" class="empty-cloud">
      <span class="empty-icon">☁️</span>
      <p>暂无印象词云</p>
    </div>
    <div v-else class="word-cloud-canvas" :style="canvasStyle">
      <span
        v-for="(word, index) in positionedWords"
        :key="index"
        class="cloud-word"
        :style="word.style"
        :title="`${word.text}: ${word.count}次`"
      >
        {{ word.text }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps({
  words: {
    type: Array,
    default: () => []
  },
  width: {
    type: Number,
    default: 0
  },
  height: {
    type: Number,
    default: 200
  }
});

const containerRef = ref(null);
const containerWidth = ref(props.width);
const containerHeight = ref(props.height);

const colors = [
  '#1d9bf0',
  '#00ba7c',
  '#f91880',
  '#7856ff',
  '#ff7a00',
  '#1e9bf0',
  '#2aa4e8',
  '#5c6bc0',
  '#26a69a',
  '#ef5350',
  '#ab47bc',
  '#ff7043'
];

const canvasStyle = computed(() => ({
  width: `${containerWidth.value}px`,
  height: `${containerHeight.value}px`
}));

const maxCount = computed(() => {
  if (props.words.length === 0) return 1;
  return Math.max(...props.words.map(w => w.count));
});

const positionedWords = computed(() => {
  if (props.words.length === 0) return [];

  const width = containerWidth.value;
  const height = containerHeight.value;
  const placedWords = [];
  const padding = 8;
  const minFontSize = 12;
  const maxFontSize = Math.min(36, width / 10);

  const sortedWords = [...props.words].sort((a, b) => b.count - a.count);

  return sortedWords.map((word, index) => {
    const ratio = word.count / maxCount.value;
    const fontSize = Math.round(minFontSize + ratio * (maxFontSize - minFontSize));
    const color = colors[index % colors.length];
    const rotation = (Math.random() - 0.5) * 20;
    
    const textWidth = word.text.length * fontSize * 0.6;
    const textHeight = fontSize * 1.2;
    
    let x, y;
    let attempts = 0;
    const maxAttempts = 50;
    let found = false;

    while (attempts < maxAttempts && !found) {
      x = Math.random() * (width - textWidth - padding * 2) + padding;
      y = Math.random() * (height - textHeight - padding * 2) + textHeight + padding;

      let collision = false;
      for (const placed of placedWords) {
        const dx = Math.abs(x - placed.x);
        const dy = Math.abs(y - placed.y);
        const minDistX = (textWidth + placed.width) / 2 + padding;
        const minDistY = (textHeight + placed.height) / 2 + padding;
        
        if (dx < minDistX && dy < minDistY) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        found = true;
      }
      attempts++;
    }

    x = Math.max(padding, Math.min(width - textWidth - padding, x));
    y = Math.max(fontSize + padding, Math.min(height - padding, y));

    placedWords.push({ x, y, width: textWidth, height: textHeight });

    return {
      text: word.text,
      count: word.count,
      style: {
        left: `${x}px`,
        top: `${y}px`,
        fontSize: `${fontSize}px`,
        color: color,
        transform: `rotate(${rotation}deg)`,
        opacity: 0.7 + ratio * 0.3,
        fontWeight: ratio > 0.5 ? '700' : '500'
      }
    };
  });
});

const updateSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    containerWidth.value = props.width || rect.width || 300;
    containerHeight.value = props.height || rect.height || 200;
  }
};

const resizeObserver = ref(null);

onMounted(() => {
  nextTick(() => {
    updateSize();
  });
  
  resizeObserver.value = new ResizeObserver(() => {
    updateSize();
  });
  
  if (containerRef.value) {
    resizeObserver.value.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver.value) {
    resizeObserver.value.disconnect();
  }
});

watch(() => props.width, updateSize);
watch(() => props.height, updateSize);
</script>

<style scoped>
.word-cloud-container {
  width: 100%;
  min-height: 180px;
  position: relative;
  overflow: hidden;
}

.empty-cloud {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 180px;
  color: #536471;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.6;
}

.empty-cloud p {
  font-size: 14px;
  margin: 0;
}

.word-cloud-canvas {
  position: relative;
  background: linear-gradient(135deg, #f7f9f9 0%, #ffffff 100%);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #eff3f4;
}

.cloud-word {
  position: absolute;
  white-space: nowrap;
  cursor: default;
  transition: all 0.3s ease;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  user-select: none;
}

.cloud-word:hover {
  transform: scale(1.15) !important;
  opacity: 1 !important;
  z-index: 10;
}

@media (max-width: 768px) {
  .word-cloud-container {
    min-height: 150px;
  }
  
  .empty-cloud {
    height: 150px;
  }
  
  .empty-icon {
    font-size: 36px;
  }
}

@media (max-width: 480px) {
  .word-cloud-container {
    min-height: 120px;
  }
  
  .empty-cloud {
    height: 120px;
  }
  
  .cloud-word {
    font-size: 10px !important;
  }
}
</style>
