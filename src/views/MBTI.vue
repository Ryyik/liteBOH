<template>
  <div class="mbti-test">
    <!-- 进度条 -->
    <div class="progress-bar" :style="{ width: progress + '%' }"></div>

    <!-- 顶部透明毛玻璃横条 -->
    <div class="top-glass-bar">
      <button @click="goBackToHome" class="back-home-btn">返回首页</button>
      <h4 class="page-title">BlockOfHome - MBTI专业测试</h4>
    </div>

    <!-- 主内容 -->
    <div class="main-content">
      <div class="container">
        <!-- 测试说明 -->
        <div
          class="test-card"
          id="introCard"
          v-if="!testStarted && !showResult"
        >
          <div class="test-header">
            <h1 class="test-title">方块人格MBTI测试</h1>
            <p class="test-subtitle">基于Minecraft游戏改编 | 48题版</p>
          </div>
          <div
            style="
              color: #d1d5db;
              line-height: 1.8;
              font-size: 14px;
              background: rgba(255, 255, 255, 0.02);
              backdrop-filter: blur(10px);
              -webkit-backdrop-filter: blur(10px);
              border-radius: 12px;
              padding: 16px;
              border: 1px solid rgba(255, 255, 255, 0.05);
            "
          >
            <p><strong>测试说明：</strong></p>
            <ul style="margin: 12px 0; padding-left: 20px">
              <li>本测试包含48道题目，约需15-20分钟</li>
              <li>请根据第一反应选择，无需过度思考</li>
              <li>每页6题，共8页，可随时返回修改</li>
              <li>采用5点量表，比二选一更准确</li>
            </ul>
          </div>
          <div
            class="intro-pagination"
            style="margin-top: 24px; text-align: center"
          >
            <button
              class="nav-btn primary"
              @click="startTest"
              style="width: 100%; max-width: 200px; margin: 0 auto"
            >
              开始测试
            </button>
          </div>
        </div>

        <!-- 题目区域 -->
        <div id="questionCard" v-if="testStarted && !showResult">
          <div class="question-list" id="questionList">
            <div
              v-for="(q, index) in testData.questions"
              :key="q.id"
              class="question-item"
              :class="{
                active: currentPage === Math.floor(index / questionsPerPage),
              }"
              :data-page="Math.floor(index / questionsPerPage)"
            >
              <span class="question-number"
                >题目 {{ q.id }} / {{ testData.questions.length }}</span
              >
              <p class="question-text">{{ q.text }}</p>
              <div class="likert-scale" :data-qid="q.id">
                <div
                  v-for="score in [5, 4, 3, 2, 1]"
                  :key="score"
                  class="likert-option"
                  :class="{ selected: answers[q.id] === score }"
                  :data-score="score"
                  @click="selectOption(q.id, score)"
                >
                  {{ score }}
                </div>
              </div>
              <div class="likert-labels">
                <span>非常同意</span><span>同意</span><span>中立</span
                ><span>不同意</span><span>非常不同意</span>
              </div>
            </div>
          </div>
          <div class="pagination">
            <div class="page-info" id="pageInfo">
              第 {{ currentPage + 1 }} 页 / 共 {{ totalPages }} 页
            </div>
            <div class="nav-buttons">
              <button
                class="nav-btn"
                id="prevBtn"
                @click="changePage(-1)"
                :disabled="currentPage === 0"
              >
                上一页
              </button>
              <button
                class="nav-btn"
                id="nextBtn"
                @click="
                  currentPage === totalPages - 1
                    ? calculateResult
                    : changePage(1)
                "
              >
                {{ currentPage === totalPages - 1 ? "查看结果" : "下一页" }}
              </button>
            </div>
          </div>
        </div>

        <!-- 结果区域 -->
        <div class="result-container" id="resultContainer" v-if="showResult">
          <div class="result-card">
            <h2 style="color: #4ade80; margin-bottom: 16px; font-size: 20px">
              你的方块人格类型
            </h2>
            <div class="mbti-type" id="resultType">{{ resultType }}</div>
            <div class="type-name" id="resultName">{{ resultName }}</div>
            <div class="type-description" id="resultDesc">
              <p>{{ resultDesc }}</p>
            </div>

            <div class="dimension-scores">
              <h3 style="color: #4ade80; margin-bottom: 12px; font-size: 16px">
                人格维度分析
              </h3>
              <div id="dimensionScores">
                <div class="dimension-item">
                  <div class="dimension-label">
                    <span>外向(E) vs 内向(I)</span>
                    <span
                      >{{ Math.max(scores.E, scores.I) }} -
                      {{ Math.min(scores.E, scores.I) }}</span
                    >
                  </div>
                  <div class="dimension-bar">
                    <div
                      class="dimension-fill"
                      :style="{
                        width: (scores.E / (scores.E + scores.I)) * 100 + '%',
                      }"
                    ></div>
                  </div>
                </div>
                <div class="dimension-item">
                  <div class="dimension-label">
                    <span>实感(S) vs 直觉(N)</span>
                    <span
                      >{{ Math.max(scores.S, scores.N) }} -
                      {{ Math.min(scores.S, scores.N) }}</span
                    >
                  </div>
                  <div class="dimension-bar">
                    <div
                      class="dimension-fill"
                      :style="{
                        width: (scores.S / (scores.S + scores.N)) * 100 + '%',
                      }"
                    ></div>
                  </div>
                </div>
                <div class="dimension-item">
                  <div class="dimension-label">
                    <span>思考(T) vs 情感(F)</span>
                    <span
                      >{{ Math.max(scores.T, scores.F) }} -
                      {{ Math.min(scores.T, scores.F) }}</span
                    >
                  </div>
                  <div class="dimension-bar">
                    <div
                      class="dimension-fill"
                      :style="{
                        width: (scores.T / (scores.T + scores.F)) * 100 + '%',
                      }"
                    ></div>
                  </div>
                </div>
                <div class="dimension-item">
                  <div class="dimension-label">
                    <span>判断(J) vs 感知(P)</span>
                    <span
                      >{{ Math.max(scores.J, scores.P) }} -
                      {{ Math.min(scores.J, scores.P) }}</span
                    >
                  </div>
                  <div class="dimension-bar">
                    <div
                      class="dimension-fill"
                      :style="{
                        width: (scores.J / (scores.J + scores.P)) * 100 + '%',
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="trait-grid" id="traitGrid"></div>

            <div class="accuracy-notice">
              <strong>⚠️ 重要提示：</strong>
              本测试为娱乐参考，不能替代专业心理评估。
            </div>

            <div class="result-actions">
              <button @click="restartTest">重新测试</button>
              <button @click="shareResult">分享结果</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <footer>
      <div class="container">
        <p>© 2025 BlockOfHome - 方块之家MBTI测试</p>
        <p style="margin-top: 8px">仅供娱乐参考 · v1.0</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";

// 路由实例
const router = useRouter();

// 返回官网
const goBackToHome = () => {
  router.push("/");
};

// 测试数据
const testData = {
  questions: [
    {
      id: 1,
      text: "在服务器中，我更喜欢主动与其他玩家交流互动",
      dimension: "E",
      reverse: false,
    },
    {
      id: 2,
      text: "独自建造一个大项目比团队合作更让我享受",
      dimension: "I",
      reverse: true,
    },
    {
      id: 3,
      text: "我经常是群里第一个发起活动或话题的人",
      dimension: "E",
      reverse: false,
    },
    {
      id: 4,
      text: "长时间在线社交会让我感到疲惫",
      dimension: "I",
      reverse: false,
    },
    {
      id: 5,
      text: "在探索新地图时，我希望有队友一起同行",
      dimension: "E",
      reverse: false,
    },
    {
      id: 6,
      text: "我更倾向于在小范围内与亲密朋友游戏",
      dimension: "I",
      reverse: false,
    },
    {
      id: 7,
      text: "我喜欢在公共频道分享自己的游戏成果",
      dimension: "E",
      reverse: false,
    },
    {
      id: 8,
      text: "我享受独自在生存模式中挑战极限",
      dimension: "I",
      reverse: false,
    },
    {
      id: 9,
      text: "服务器活动总能让我充满能量和期待",
      dimension: "E",
      reverse: false,
    },
    {
      id: 10,
      text: "我更喜欢观察和倾听，而不是主动发言",
      dimension: "I",
      reverse: false,
    },
    {
      id: 11,
      text: "与他人合作建造会激发我的创造力",
      dimension: "E",
      reverse: false,
    },
    {
      id: 12,
      text: "我通常会避免成为众人关注的焦点",
      dimension: "I",
      reverse: false,
    },
    {
      id: 13,
      text: "我倾向于按照教程和成熟方案进行建造",
      dimension: "S",
      reverse: false,
    },
    {
      id: 14,
      text: "我更关注建筑的实用性和功能性",
      dimension: "S",
      reverse: false,
    },
    {
      id: 15,
      text: "我喜欢尝试前所未有的建筑风格",
      dimension: "N",
      reverse: false,
    },
    {
      id: 16,
      text: "具体的数据和效率对我很重要",
      dimension: "S",
      reverse: false,
    },
    {
      id: 17,
      text: "我常常凭直觉选择挖矿地点",
      dimension: "N",
      reverse: false,
    },
    { id: 18, text: "我更相信经验而非灵感", dimension: "S", reverse: true },
    {
      id: 19,
      text: "我喜欢思考游戏机制背后的可能性",
      dimension: "N",
      reverse: false,
    },
    { id: 20, text: "我注重细节和精确性", dimension: "S", reverse: false },
    {
      id: 21,
      text: "我能轻松发现不同模组间的创新组合",
      dimension: "N",
      reverse: false,
    },
    {
      id: 22,
      text: "我更喜欢使用经过验证的红石设计",
      dimension: "S",
      reverse: false,
    },
    {
      id: 23,
      text: "我对抽象的游戏理论感兴趣",
      dimension: "N",
      reverse: false,
    },
    {
      id: 24,
      text: "具体问题比宏大构想更吸引我",
      dimension: "S",
      reverse: true,
    },
    {
      id: 25,
      text: "在游戏中做决策时，我优先考虑逻辑和效率",
      dimension: "T",
      reverse: false,
    },
    {
      id: 26,
      text: "我很难对朋友的请求说'不'，即使会影响我的进度",
      dimension: "F",
      reverse: false,
    },
    {
      id: 27,
      text: "服务器规则应该严格执行，无论对谁",
      dimension: "T",
      reverse: false,
    },
    {
      id: 28,
      text: "我更看重团队和谐而非个人胜利",
      dimension: "F",
      reverse: false,
    },
    {
      id: 29,
      text: "批评别人的建筑时，我会直接指出问题",
      dimension: "T",
      reverse: false,
    },
    {
      id: 30,
      text: "我更在意他人感受而非客观事实",
      dimension: "F",
      reverse: false,
    },
    {
      id: 31,
      text: "资源分配应该基于贡献度而非需求",
      dimension: "T",
      reverse: false,
    },
    {
      id: 32,
      text: "我会为了帮助新手而牺牲自己的游戏时间",
      dimension: "F",
      reverse: false,
    },
    {
      id: 33,
      text: "争吵应该以谁对谁错来解决",
      dimension: "T",
      reverse: false,
    },
    {
      id: 34,
      text: "理解他人的立场比证明自己正确更重要",
      dimension: "F",
      reverse: false,
    },
    {
      id: 35,
      text: "我倾向于用客观标准评价一切",
      dimension: "T",
      reverse: false,
    },
    {
      id: 36,
      text: "我很容易因为朋友的遭遇而产生情绪波动",
      dimension: "F",
      reverse: false,
    },
    {
      id: 37,
      text: "我习惯在开始大工程前制定详细计划",
      dimension: "J",
      reverse: false,
    },
    { id: 38, text: "我喜欢保持选择的开放性", dimension: "P", reverse: false },
    {
      id: 39,
      text: "我的背包和箱子都有严格分类",
      dimension: "J",
      reverse: false,
    },
    {
      id: 40,
      text: "我享受即兴冒险而非按计划行事",
      dimension: "P",
      reverse: false,
    },
    {
      id: 41,
      text: "完成任务比享受过程更重要",
      dimension: "J",
      reverse: false,
    },
    {
      id: 42,
      text: "我倾向于灵活应变而非坚持原计划",
      dimension: "P",
      reverse: false,
    },
    {
      id: 43,
      text: "截止日期和目标对我很有激励作用",
      dimension: "J",
      reverse: false,
    },
    { id: 44, text: "我喜欢同时进行多个项目", dimension: "P", reverse: false },
    { id: 45, text: "我重视条理和条理性", dimension: "J", reverse: false },
    {
      id: 46,
      text: "严格的时间表会限制我的创造力",
      dimension: "P",
      reverse: true,
    },
    { id: 47, text: "我倾向于迅速做出决定", dimension: "J", reverse: false },
    {
      id: 48,
      text: "我需要充分信息才会感到满意",
      dimension: "P",
      reverse: false,
    },
  ],
  types: {
    INTJ: {
      name: "战略建筑师",
      description: "你是富有远见的战略家，擅长规划复杂项目...",
    },
    INTP: { name: "红石工程师", description: "你是逻辑与创意的化身..." },
    ENTJ: { name: "团队领袖", description: "你是天生的领导者..." },
    ENTP: { name: "发明探险家", description: "你充满创意与好奇心..." },
    INFJ: { name: "世界构建者", description: "你是富有远见的叙事大师..." },
    INFP: { name: "艺术建筑师", description: "你是感性的创作者..." },
    ENFJ: { name: "社区组织者", description: "你是温暖的主持人..." },
    ENFP: { name: "活动策划者", description: "你是活力四射的活动家..." },
    ISTJ: { name: "效率专家", description: "你是可靠的执行者..." },
    ISFJ: { name: "守护建筑师", description: "你是温柔的守护者..." },
    ESTJ: { name: "项目管理者", description: "你是高效的管理者..." },
    ESFJ: { name: "社区守护者", description: "你是热情的主人..." },
    ISTP: { name: "技术工匠", description: "你是冷静的技师..." },
    ISFP: { name: "自然艺术家", description: "你是自由的创作者..." },
    ESTP: { name: "速建专家", description: "你是行动派建造者..." },
    ESFP: { name: "娱乐大师", description: "你是欢乐的源泉..." },
  },
};

// 状态管理
const currentPage = ref(0);
const questionsPerPage = 6;
const answers = ref({});
const testStarted = ref(false);
const showResult = ref(false);
const resultType = ref("");
const resultName = ref("");
const resultDesc = ref("");
const scores = ref({ E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 });

// 计算属性
const totalPages = computed(() =>
  Math.ceil(testData.questions.length / questionsPerPage)
);
const progress = computed(() => {
  return (Object.keys(answers.value).length / testData.questions.length) * 100;
});

// 选择选项
const selectOption = (qid, score) => {
  answers.value[qid] = score;
};

// 开始测试
const startTest = () => {
  testStarted.value = true;
};

// 分页控制
const changePage = (direction) => {
  if (direction === -1 && currentPage.value > 0) currentPage.value--;
  if (direction === 1 && currentPage.value < totalPages.value - 1)
    currentPage.value++;
};

// 计算结果
const calculateResult = () => {
  if (Object.keys(answers.value).length < testData.questions.length) {
    alert("请完成所有题目后再查看结果");
    return;
  }

  // 初始化分数
  scores.value = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  testData.questions.forEach((q) => {
    const score = answers.value[q.id];
    const finalScore = q.reverse ? 6 - score : score;
    scores.value[q.dimension] += finalScore;
  });

  // 确定MBTI类型
  const type =
    (scores.value.E >= scores.value.I ? "E" : "I") +
    (scores.value.S >= scores.value.N ? "S" : "N") +
    (scores.value.T >= scores.value.F ? "T" : "F") +
    (scores.value.J >= scores.value.P ? "J" : "P");

  // 获取类型数据
  const typeData = testData.types[type];
  resultType.value = type;
  resultName.value = typeData.name;
  resultDesc.value = typeData.description;
  showResult.value = true;
};

// 重新开始
const restartTest = () => {
  answers.value = {};
  currentPage.value = 0;
  testStarted.value = false;
  showResult.value = false;
  resultType.value = "";
  resultName.value = "";
  resultDesc.value = "";
  scores.value = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
};

// 分享结果
const shareResult = () => {
  const text = `我在方块之家的专业MBTI测试中是：${resultType.value} - ${resultName.value}！快来测测你的方块人格吧！`;

  if (navigator.share) {
    navigator.share({
      title: "方块之家MBTI测试",
      text,
      url: location.href,
    });
  } else {
    alert(text + "\n\n" + location.href);
  }
};

// 页面加载完成
onMounted(() => {
  // 初始化
});
</script>

<style scoped>
/* ===== 移动端优化核心样式 ===== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent; /* 移除点击高亮 */
}

.mbti-test {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  background: linear-gradient(135deg, #1a1f2d 0%, #0d1117 100%);
  color: #fff;
  min-height: 100vh;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 进度条 */
.progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, #4ade80 0%, #22c55e 100%);
  transition: width 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
  z-index: 1000;
  border-radius: 0 2px 2px 0;
  width: 0%;
}

/* 顶部透明毛玻璃横条样式 */
.top-glass-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.page-title {
  color: #4ade80;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin: 0;
}

/* 返回首页按钮样式 */
.back-home-btn {
  padding: 0.6rem 1.2rem;
  background-color: rgba(102, 126, 234, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px;
  color: white;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s ease;
  font-size: 0.9rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  border: none;
  cursor: pointer;
}

.back-home-btn:hover {
  background-color: rgba(102, 126, 234, 1);
  border-color: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
  color: white;
}

.container {
  max-width: 100%;
  margin: 0 auto;
  padding: 0 16px;
}

/* 主内容区域 */
.main-content {
  padding: 80px 0 40px;
  min-height: calc(100vh - 70px);
  padding-bottom: env(safe-area-inset-bottom); /* iPhone X+ 底部适配 */
}

/* 测试卡片 - 移动端优化 */
.test-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px 16px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.test-header {
  text-align: center;
  margin-bottom: 28px;
}

.test-title {
  font-size: 24px;
  color: #fff;
  margin-bottom: 8px;
  line-height: 1.2;
}

.test-subtitle {
  color: #9ca3af;
  font-size: 14px;
}

/* 题目列表 - 移动端优化 */
.question-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  display: none;
}

.question-item.active {
  display: block;
  animation: fadeInUp 0.4s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.question-number {
  color: #4ade80;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  display: block;
}

.question-text {
  font-size: 16px;
  line-height: 1.5;
  margin-bottom: 16px;
  color: #e5e7eb;
}

/* 5点量表 - 移动端优化 */
.likert-scale {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.likert-option {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 14px 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: #d1d5db;
  user-select: none; /* 防止长按选中 */
  min-height: 48px; /* 增加点击区域 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.likert-option:active {
  transform: scale(0.95); /* 点击反馈 */
}

.likert-option:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.likert-option.selected {
  background: rgba(74, 222, 128, 0.15);
  border-color: #4ade80;
  color: #4ade80;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.25);
}

.likert-labels {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}

/* 分页控制 - 移动端优化 */
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-info {
  color: #9ca3af;
  font-size: 13px;
  width: 100%;
  text-align: center;
  order: 1;
  margin-top: 12px;
}

.nav-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
  justify-content: space-between;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px 20px;
  color: #e5e7eb;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 15px;
  flex: 1;
  text-align: center;
  min-height: 44px; /* 提高可点击区域 */
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-btn.primary {
  background: rgba(74, 222, 128, 0.15);
  border-color: #4ade80;
  color: #4ade80;
  font-weight: 600;
}

.nav-btn.primary:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.25);
  border-color: #6ee7b7;
  transform: translateY(-2px);
}

/* 结果页 - 移动端优化 */
.result-container {
  margin-top: 24px;
}

.result-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.mbti-type {
  font-size: 48px;
  font-weight: 700;
  color: #4ade80;
  margin: 16px 0;
  letter-spacing: -1px;
  text-shadow: 0 0 32px rgba(74, 222, 128, 0.25);
}

.type-name {
  font-size: 20px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 20px;
  letter-spacing: -0.5px;
}

.type-description {
  color: #d1d5db;
  line-height: 1.8;
  font-size: 14px;
  margin-bottom: 28px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dimension-scores {
  margin: 24px 0;
  text-align: left;
}

.dimension-item {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dimension-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.dimension-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.dimension-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80 0%, #22c55e 100%);
  border-radius: 4px;
  transition: width 0.8s ease;
}

.trait-grid {
  display: none;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin: 24px 0;
}

.accuracy-notice {
  background: rgba(255, 217, 0, 0.1);
  border: 1px solid rgba(255, 217, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
  margin: 24px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #fef3c7;
  text-align: left;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.result-actions button {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 12px 20px;
  color: #e5e7eb;
  margin: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  width: calc(100% - 12px);
  max-width: 280px;
}

@media (min-width: 480px) {
  .result-actions button {
    width: auto;
  }
}

/* 页脚 */
footer {
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  padding: 24px 16px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  font-size: 12px;
  padding-bottom: env(safe-area-inset-bottom);
}

/* iOS Safari 特殊优化 */
@supports (-webkit-touch-callout: none) {
  .main-content {
    min-height: -webkit-fill-available;
  }
}

/* 防止页面缩放 */
input,
textarea,
select {
  font-size: 16px; /* 防止iOS自动缩放 */
}
</style>
