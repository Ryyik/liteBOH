<template>
  <div class="block-calendar-container fade-section">
    <div class="calendar-card glass-panel">
      <!-- 头部：年月显示与翻页 -->
      <header class="calendar-header">
        <div class="calendar-title-group">
          <span class="calendar-tag">方块日历</span>
          <h2 class="calendar-title">{{ currentYear }} <span class="month-light">{{ monthNames[currentMonth] }}</span>
          </h2>
        </div>
        <div class="calendar-controls">
          <button class="nav-btn today-btn" @click="goToToday" title="回到今天">
            今日
          </button>
          <button class="nav-btn prev-btn" @click="prevMonth" :disabled="isPrevDisabled">
            <span class="arrow-icon">←</span>
          </button>
          <button class="nav-btn next-btn" @click="nextMonth" :disabled="isNextDisabled">
            <span class="arrow-icon">→</span>
          </button>
        </div>
      </header>

      <div class="calendar-divider"></div>

      <!-- 日历网格 -->
      <div class="calendar-grid">
        <!-- 星期头 -->
        <div class="weekdays-row">
          <div v-for="day in weekDays" :key="day" class="weekday-cell">{{ day }}</div>
        </div>

        <!-- 日期格子 -->
        <div class="days-grid">
          <!-- 空白占位 -->
          <div v-for="n in firstDayOfWeek" :key="'empty-' + n" class="day-cell empty"></div>

          <!-- 实际日期 -->
          <div v-for="date in daysInMonth" :key="date" class="day-cell" :class="{
            'is-today': isToday(date),
            'is-special': isSpecialDate(date),
            'is-weekend': isWeekend(date)
          }" :style="isSpecialDate(date) ? {
            borderColor: getSpecialDateInfo(date).color + '40',
            backgroundColor: getSpecialDateInfo(date).color + '10',
            color: getSpecialDateInfo(date).color
          } : {}" @mouseenter="hoverDate = date" @mouseleave="hoverDate = null" @click="handleDateClick(date)">
            <img v-if="isSpecialDate(date)" :src="writableBookUrl" class="book-decoration" alt="event" />
            <span class="day-number">{{ date }}</span>
            <span v-if="isSpecialDate(date)" class="in-cell-event-title"
              :style="{ color: getSpecialDateInfo(date).color }">
              {{ getSpecialDateInfo(date).title }}
            </span>
            <div v-if="isSpecialDate(date)" class="special-dot"
              :style="{ backgroundColor: getSpecialDateInfo(date).color }"></div>

            <!-- Tooltip -->
            <transition name="fade-tooltip">
              <div v-if="hoverDate === date && isSpecialDate(date)" class="date-tooltip"
                :style="{ backgroundColor: getSpecialDateInfo(date).color }">
                {{ getSpecialDateInfo(date).title }}
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- 底部说明 -->
      <div class="calendar-footer">
        <p class="footer-note">标注圆点代表方块之家的特殊纪念日或社区活动。</p>
      </div>
    </div>

    <!-- 右侧：事件列表 -->
    <div class="events-sidebar glass-panel">
      <div class="sidebar-header">
        <span class="sidebar-tag">UPCOMING</span>
        <h3 class="sidebar-title">近期活动</h3>
      </div>

      <div class="events-list">
        <div v-for="(event, index) in sortedEvents" :key="index" class="event-item"
          @click="jumpToDate(event.year, event.month)">
          <div class="event-date-badge" :style="{ backgroundColor: event.color || '#111' }">
            <span class="event-month">{{ monthNames[event.month - 1].substring(0, 3) }}</span>
            <span class="event-day">{{ event.day }}</span>
          </div>
          <div class="event-info">
            <h4 class="event-name">{{ event.title }}</h4>
            <span class="event-year">{{ event.year }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Event Toast -->
    <transition name="fade-toast">
      <div v-if="activeEvent" class="mobile-event-toast">
        <div class="toast-content" :style="{ borderLeft: '4px solid ' + activeEvent.color }">
          <span class="toast-title">{{ activeEvent.title }}</span>
          <span class="toast-date">{{ activeEvent.year }}.{{ activeEvent.month }}.{{ activeEvent.day }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import writableBookUrl from '../../assets/images/Writable_Book.webp';

// 基础数据
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth()); // 0-11
const hoverDate = ref(null);
const activeEvent = ref(null);
let toastTimer = null;

// 限制范围：2025-2026
const minYear = 2025;
const maxYear = 2026;

// 确保初始时间在范围内，如果当前时间早于2025，则设为2025年1月；如果晚于2026，设为2026年12月
if (currentYear.value < minYear) {
  currentYear.value = minYear;
  currentMonth.value = 0;
} else if (currentYear.value > maxYear) {
  currentYear.value = maxYear;
  currentMonth.value = 11;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const weekDays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// 特殊日期数据 (YYYY-M-D 格式，注意月份从1开始以便阅读)
const specialDates = [
  { year: 2026, month: 2, day: 16, title: "26新年抽奖", color: "#ff6b6b" },
  { year: 2025, month: 1, day: 1, title: "元旦抽奖", color: "#ff6b6b" },
  { year: 2025, month: 2, day: 1, title: "冬眠生存3", color: "#00d2d3" },
  { year: 2025, month: 7, day: 21, title: "方块之家7周年", color: "#48dbfb" },
  { year: 2025, month: 10, day: 4, title: "Eleven与百城小悠生日会", color: "#ff9f43" },
  { year: 2025, month: 12, day: 12, title: "方块博物馆", color: "#a55eea" },
  { year: 2026, month: 1, day: 22, title: "冬眠生存第四季", color: "#00d2d3" },

];

// 按时间排序的事件列表
const sortedEvents = computed(() => {
  return [...specialDates].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
});

// 跳转到指定日期
const jumpToDate = (year, month) => {
  currentYear.value = year;
  // 数据中的month是1-12，API使用的是0-11
  currentMonth.value = month - 1;
};

// 计算属性
const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate();
});

const firstDayOfWeek = computed(() => {
  return new Date(currentYear.value, currentMonth.value, 1).getDay();
});

const isPrevDisabled = computed(() => {
  return currentYear.value === minYear && currentMonth.value === 0;
});

const isNextDisabled = computed(() => {
  return currentYear.value === maxYear && currentMonth.value === 11;
});

// 方法
const prevMonth = () => {
  if (isPrevDisabled.value) return;
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
};

const nextMonth = () => {
  if (isNextDisabled.value) return;
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
};

const goToToday = () => {
  const today = new Date();
  // 检查是否在范围内
  const year = today.getFullYear();
  if (year >= minYear && year <= maxYear) {
    currentYear.value = year;
    currentMonth.value = today.getMonth();
  }
};

const isToday = (day) => {
  const today = new Date();
  return today.getFullYear() === currentYear.value &&
    today.getMonth() === currentMonth.value &&
    today.getDate() === day;
};

const isWeekend = (day) => {
  const date = new Date(currentYear.value, currentMonth.value, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

const getSpecialDateInfo = (day) => {
  return specialDates.find(d =>
    d.year === currentYear.value &&
    d.month === currentMonth.value + 1 &&
    d.day === day
  );
};

const isSpecialDate = (day) => {
  return !!getSpecialDateInfo(day);
};

const handleDateClick = (day) => {
  const event = getSpecialDateInfo(day);
  if (event) {
    activeEvent.value = event;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      activeEvent.value = null;
    }, 3000);
  }
};
</script>

<style scoped src="./style.scoped.css"></style>