<template>
  <div class="mbti-page">
    <!-- 进度条 -->
    <div class="progress-bar" :style="{ width: progress + '%' }"></div>

    <!-- 顶部导航 -->
    <nav class="mbti-nav">
      <button @click="goBackToHome" class="back-btn">
        <svg viewBox="0 0 24 24" fill="none" class="back-icon">
          <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
        返回首页
      </button>
      <div class="nav-title">方块人格 MBTI</div>
      <div class="nav-spacer"></div>
    </nav>

    <main class="main-content">
      <div class="content-container">
        <!-- 测试说明卡片 -->
        <div class="intro-card" v-if="!testStarted && !showResult">
          <header class="card-header">
            <span class="header-tag">BLOCK MBTI</span>
            <h1 class="page-title">探索您的<br /><span class="text-highlight">方块人格</span></h1>
            <p class="page-subtitle">基于深度学习与 Minecraft 游戏机制改编，揭示您在方块世界中的独特身份。</p>
          </header>

          <div class="info-grid">
            <div class="info-item">
              <span class="info-value">{{ totalQuestions }}</span>
              <span class="info-label">专业题目</span>
            </div>
            <div class="info-divider"></div>
            <div class="info-item">
              <span class="info-value">15</span>
              <span class="info-label">预计分钟</span>
            </div>
          </div>

          <div class="instruction-box">
            <h3 class="box-title">测试说明</h3>
            <ul class="instruction-list">
              <li>
                <span class="list-bullet"></span>
                请根据第一反应选择，无需过度思考
              </li>
              <li>
                <span class="list-bullet"></span>
                采用 5 点量表，提供比二选一更精准的维度分析
              </li>
              <li>
                <span class="list-bullet"></span>
                建议在安静环境下完成，以获得最准确的结果
              </li>
            </ul>
          </div>

          <div class="action-area">
            <button class="primary-btn" @click="startTest">
              立即开始测试
            </button>
          </div>
        </div>

        <!-- 题目区域 -->
        <div class="question-container" v-if="testStarted && !showResult">
          <div class="question-header">
            <div class="step-indicator">第 {{ currentPage + 1 }} 页 / 共 {{ totalPages }} 页</div>
            <h2 class="section-title">请选择您的偏好</h2>
            <p class="completion-summary">已完成 {{ answeredCount }} / {{ totalQuestions }} 题</p>
          </div>

          <div class="question-list">
            <div v-for="q in currentPageQuestions" :key="q.id" class="question-card">
              <div class="q-meta">题目 {{ q.id }}</div>
              <p class="q-text">{{ q.text }}</p>

              <div class="likert-group">
                <div class="likert-options" role="radiogroup" :aria-label="`题目 ${q.id} 的作答选项`">
                  <button v-for="score in likertOptions" :key="score" class="likert-btn" :class="{
                    'is-selected': answers[q.id] === score,
                    'size-lg': score === 5 || score === 1,
                    'size-md': score === 4 || score === 2,
                    'size-sm': score === 3
                  }" :aria-label="getLikertLabel(score)" role="radio" :aria-checked="answers[q.id] === score"
                    @click="selectOption(q.id, score)">
                    <div class="dot"></div>
                    <span class="likert-label">{{ getLikertLabel(score) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="pagination-area">
            <button class="secondary-btn" @click="changePage(-1)" :disabled="currentPage === 0">
              上一页
            </button>
            <button class="primary-btn" :disabled="!isCurrentPageComplete"
              @click="currentPage === totalPages - 1 ? calculateResult() : changePage(1)">
              {{ currentPage === totalPages - 1 ? "查看结果" : "下一页" }}
            </button>
          </div>
          <p v-if="!isCurrentPageComplete" class="pagination-hint">请先完成本页所有题目再继续</p>
        </div>

        <!-- 结果区域 -->
        <div class="result-container" v-if="showResult">
          <div class="result-card">
            <header class="result-header">
              <span class="result-tag">您的方块人格类型</span>
              <div class="type-code">{{ resultType }}</div>
              <h2 class="type-name">{{ resultName }}</h2>
            </header>

            <div class="result-divider"></div>

            <div class="type-analysis">
              <h3 class="analysis-title">深度解析</h3>
              <p class="analysis-text">{{ resultDesc }}</p>
            </div>

            <div class="dimension-grid">
              <div v-for="dim in dimensions" :key="dim.key" class="dim-item">
                <div class="dim-header">
                  <div class="dim-side" :class="{ 'is-active': !dim.isRight }">
                    <span class="dim-key">{{ dim.leftKey }}</span>
                    <span class="dim-name">{{ dim.leftLabel }}</span>
                  </div>
                  <div class="dim-percentage">{{ dim.percentage }}%</div>
                  <div class="dim-side" :class="{ 'is-active': dim.isRight }">
                    <span class="dim-key">{{ dim.rightKey }}</span>
                    <span class="dim-name">{{ dim.rightLabel }}</span>
                  </div>
                </div>
                <div class="dim-track">
                  <div class="dim-center"></div>
                  <div class="dim-bar" :class="{ 'is-right': dim.isRight }" :style="{ width: dim.percentage + '%' }">
                  </div>
                </div>
              </div>
            </div>

            <div class="result-actions">
              <button class="primary-btn" @click="shareResult">分享我的结果</button>
              <button class="secondary-btn" @click="restartTest">重新测试</button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="mbti-footer">
      <p>© 2026 BlockOfHome · 方块人格 MBTI 专业测试</p>
    </footer>

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import CommonAlertModal from "@/components/CommonAlertModal.vue";
import { MBTI_QUESTIONS, MBTI_TYPES } from "@/data/mbti-data";
import {
  createEmptyScores,
  calculateScores,
  deriveMbtiType,
  buildMbtiDimensions,
  getFirstUnansweredQuestionId,
} from "@/utils/mbti-scoring";

const router = useRouter();
const STORAGE_KEY = "boh_mbti_progress_v1";
const questionsPerPage = 6;
const likertOptions = [5, 4, 3, 2, 1];
const likertLabelMap = {
  5: "非常同意",
  4: "同意",
  3: "中立",
  2: "不同意",
  1: "非常不同意",
};

const alertState = reactive({
  visible: false,
  type: "info",
  title: "提示",
  message: "",
});

const currentPage = ref(0);
const answers = ref({});
const testStarted = ref(false);
const showResult = ref(false);
const resultType = ref("");
const resultName = ref("");
const resultDesc = ref("");
const scores = ref(createEmptyScores());

const totalQuestions = MBTI_QUESTIONS.length;
const totalPages = computed(() => Math.ceil(totalQuestions / questionsPerPage));
const answeredCount = computed(() => Object.keys(answers.value).length);
const progress = computed(() => (answeredCount.value / totalQuestions) * 100);
const currentPageQuestions = computed(() => {
  const start = currentPage.value * questionsPerPage;
  return MBTI_QUESTIONS.slice(start, start + questionsPerPage);
});
const isCurrentPageComplete = computed(() =>
  currentPageQuestions.value.every((q) => answers.value[q.id] !== undefined)
);
const dimensions = computed(() =>
  showResult.value ? buildMbtiDimensions(scores.value) : []
);

const goBackToHome = () => {
  router.push("/");
};

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const getLikertLabel = (score) => likertLabelMap[score] || "未知选项";

const persistProgress = () => {
  const payload = {
    answers: answers.value,
    currentPage: currentPage.value,
    testStarted: testStarted.value,
    showResult: showResult.value,
    resultType: resultType.value,
    resultName: resultName.value,
    resultDesc: resultDesc.value,
    scores: scores.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const restoreProgress = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    const restoredAnswers = {};
    MBTI_QUESTIONS.forEach((q) => {
      const savedScore = saved?.answers?.[q.id];
      if (Number.isInteger(savedScore) && savedScore >= 1 && savedScore <= 5) {
        restoredAnswers[q.id] = savedScore;
      }
    });

    answers.value = restoredAnswers;
    testStarted.value = Boolean(saved?.testStarted) || Object.keys(restoredAnswers).length > 0;
    currentPage.value = Math.min(
      Math.max(Number(saved?.currentPage) || 0, 0),
      totalPages.value - 1
    );

    const allAnswered = getFirstUnansweredQuestionId(MBTI_QUESTIONS, restoredAnswers) === null;
    if (saved?.showResult && allAnswered) {
      const restoredScores = calculateScores(MBTI_QUESTIONS, restoredAnswers);
      const restoredType = deriveMbtiType(restoredScores);
      const restoredTypeData = MBTI_TYPES[restoredType] || MBTI_TYPES.INTJ;
      scores.value = restoredScores;
      resultType.value = restoredType;
      resultName.value = restoredTypeData.name;
      resultDesc.value = restoredTypeData.description;
      showResult.value = true;
    }
  } catch (error) {
    console.warn("[MBTI] 恢复进度失败，已忽略损坏缓存。", error);
    localStorage.removeItem(STORAGE_KEY);
  }
};

const selectOption = (qid, score) => {
  answers.value[qid] = score;
};

const startTest = () => {
  testStarted.value = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const changePage = (direction) => {
  if (direction > 0 && !isCurrentPageComplete.value) {
    showAlert("warning", "请先完成本页", "当前页所有题目都需要作答后才能继续。");
    return;
  }

  const targetPage = currentPage.value + direction;
  if (targetPage < 0 || targetPage > totalPages.value - 1) return;

  currentPage.value = targetPage;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const calculateResult = () => {
  const firstUnansweredId = getFirstUnansweredQuestionId(MBTI_QUESTIONS, answers.value);
  if (firstUnansweredId !== null) {
    currentPage.value = Math.floor((firstUnansweredId - 1) / questionsPerPage);
    showAlert(
      "warning",
      "还有题目未完成",
      `第 ${firstUnansweredId} 题尚未作答，请补充后再查看结果。`
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const currentScores = calculateScores(MBTI_QUESTIONS, answers.value);
  const type = deriveMbtiType(currentScores);
  const typeData = MBTI_TYPES[type] || MBTI_TYPES.INTJ;

  scores.value = currentScores;
  resultType.value = type;
  resultName.value = typeData.name;
  resultDesc.value = typeData.description;
  showResult.value = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const restartTest = () => {
  answers.value = {};
  currentPage.value = 0;
  testStarted.value = false;
  showResult.value = false;
  resultType.value = "";
  resultName.value = "";
  resultDesc.value = "";
  scores.value = createEmptyScores();
  localStorage.removeItem(STORAGE_KEY);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const shareResult = async () => {
  const text = `我在方块之家的专业MBTI测试中是：${resultType.value} - ${resultName.value}！快来测测你的方块人格吧！`;
  const url = location.href;

  if (navigator.share) {
    try {
      await navigator.share({ title: "方块之家MBTI测试", text, url });
    } catch (error) {
      if (error?.name !== "AbortError") {
        showAlert("error", "分享失败", "系统分享暂不可用，请稍后重试。");
      }
    }
    return;
  }

  const fallbackText = `${text}\n${url}`;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(fallbackText);
      showAlert("success", "已复制分享文案", "分享文案和链接已复制到剪贴板。");
      return;
    } catch (error) {
      console.warn("[MBTI] 剪贴板复制失败，回退到弹窗提示。", error);
    }
  }

  showAlert("info", "分享我的结果", fallbackText);
};

watch(
  [answers, currentPage, testStarted, showResult, resultType, resultName, resultDesc, scores],
  persistProgress,
  { deep: true }
);

onMounted(() => {
  document.body.classList.add("is-loaded");
  restoreProgress();
});
</script>

<style scoped src="./style.scoped.css"></style>
