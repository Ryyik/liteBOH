<template>
  <div class="tutorial-page">
    <!-- 引入统一导航栏 -->
    <UnifiedNavbar />

    <!-- 移动端目录切换按钮 -->
    <button 
      class="mobile-toc-trigger" 
      @click="isMobileTocOpen = !isMobileTocOpen"
      :class="{ 'active': isMobileTocOpen }"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>

    <!-- 顶部搜索栏 -->
    <header class="tutorial-header">
      <div class="search-container">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索教程内容..." 
            @input="handleSearch"
            @focus="isSearchFocused = true"
            @blur="handleSearchBlur"
          />
          <!-- 搜索结果下拉列表 -->
          <transition name="fade">
            <div 
              class="search-results-dropdown" 
              v-if="searchQuery && isSearchFocused && flattenedResults.length > 0"
            >
              <div 
                v-for="item in flattenedResults" 
                :key="item.id" 
                class="search-result-item"
                @mousedown="selectSearchResult(item.id)"
              >
                <span class="result-question">{{ item.question }}</span>
                <span class="result-section">{{ item.sectionTitle }}</span>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <div class="tutorial-container">
      <!-- 移动端侧拉遮罩 -->
      <transition name="fade">
        <div 
          class="sidebar-overlay" 
          v-if="isMobileTocOpen" 
          @click="isMobileTocOpen = false"
        ></div>
      </transition>

      <!-- 左侧目录栏 -->
      <aside class="tutorial-sidebar" :class="{ 'mobile-open': isMobileTocOpen }">
        <nav class="toc-nav">
          <div v-for="(section, sIndex) in filteredContent" :key="sIndex" class="toc-section">
            <h3 class="toc-section-title">{{ section.title }}</h3>
            <ul class="toc-list">
              <li 
                v-for="(item, iIndex) in section.items" 
                :key="iIndex"
                :class="{ active: activeId === item.id }"
                @click="handleTocClick(item.id)"
              >
                {{ item.question }}
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- 右侧内容栏 -->
      <main class="tutorial-content" ref="contentRef" @scroll="handleScroll">
        <div v-if="filteredContent.length === 0" class="no-results">
          未找到相关内容
        </div>
        <div v-else v-for="(section, sIndex) in filteredContent" :key="sIndex" class="content-section">
          <h2 class="section-title">{{ section.title }}</h2>
          <div v-for="(item, iIndex) in section.items" :key="iIndex" :id="item.id" class="qa-item">
            <h4 class="qa-question">{{ item.question }}</h4>
            <div class="qa-answer">
              <div v-if="item.coreSteps" class="answer-block">
                <span class="block-label">核心步骤</span>
                <p>{{ item.coreSteps }}</p>
              </div>
              <div v-if="item.extraInfo" class="answer-block supplementary">
                <span class="block-label">补充说明</span>
                <p>{{ item.extraInfo }}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import UnifiedNavbar from '../components/UnifiedNavbar.vue';

const searchQuery = ref('');
const activeId = ref('');
const contentRef = ref(null);
const isMobileTocOpen = ref(false);
const isSearchFocused = ref(false);

const rawTutorialData = [
  {
    title: '一、版本安装相关',
    items: [
      {
        id: 'q1',
        question: '如何使用 BakaXL 启动器安装 Minecraft 版本？',
        coreSteps: '打开 BakaXL 启动器，点击「添加核心」按钮进入 “自动安装核心” 界面，选择需安装的 Minecraft 版本（如 1.19.3）及对应模组加载器，点击确认安装即可。安装完成后，启动游戏会生成多个核心文件夹，其中 logs 文件夹是游戏的日志文件夹，用于排查崩溃等问题；mods 文件夹专门存放 Mod 文件，需为 Jar 格式；resourcepacks 文件夹用于存放材质包（资源包），格式为压缩包；saves 文件夹是游戏存档的存放位置，为文件夹格式；shaderpacks 文件夹用于存放光影包，为压缩包格式；options.txt 是游戏基础设置的配置文件。',
        extraInfo: '选择模组加载器时，Forge 是老牌加载器，支持大量 “大型模组”（如科技类、魔法类），但版本更新较慢，适合 1.12.2、1.16.5 等经典版本；Fabric 是轻量加载器，支持快照版本，更新快且运行流畅，适合 1.20.1、1.21.10 等新版本，使用时需搭配「Fabric API」才能运行多数 Mod；Quilt 兼容 Fabric Mod，能修复部分兼容性问题；OptiFine 是单独优化画质的版本，支持安装光影，常与 Forge 或 Fabric 搭配使用。'
      },
      {
        id: 'q2',
        question: 'Java 版 Minecraft 不同版本需要匹配什么 Java 环境？',
        coreSteps: 'Java 版 Minecraft 必须依赖 Java 运行环境，不同游戏版本对 Java 版本要求严格，不匹配会导致启动失败。其中，1.12（17w13a）至 1.16.5 版本要求 Java 8 及以上，官方推荐 Oracle Java 1.8.0_51；1.17（21w19a）至 1.17.1 版本需 Java 16 及以上，推荐 Java 16.0.1；1.18（1.18-pre2）至 1.20.4 版本需 Java 17 及以上，推荐 Java 17 LTS；1.20.5（24w14a）及以上版本需 Java 21 及以上，推荐 Java 21 LTS。',
        extraInfo: '官方启动器会自动下载匹配的 Java 版本，第三方启动器（如 BakaXL、PCL2）需手动安装，建议选择 64 位 Java，避免设备内存不足；若下载速度慢，可从 OpenJDK 官网（如 Adoptium）下载对应版本，注意避开捆绑软件。'
      },
      {
        id: 'q3',
        question: 'Minecraft 有哪些常见启动器？官方与第三方启动器各有什么特点？',
        coreSteps: '启动器分为官方启动器和第三方启动器两类。官方启动器以 Minecraft 官方启动器为代表，安全可靠，仅支持正版登录，能自动匹配 Java 环境并更新游戏，但功能简洁，没有整合包和 Mod 管理功能。',
        extraInfo: '第三方启动器包括 BakaXL、PCL2、HMCL、MultiMC 等，支持离线登录（未购买正版也可体验）和正版登录，能便捷管理 Mod、整合包、材质光影，还可切换下载源（如 BMCLAPI）解决官方下载慢的问题。'
      },
      {
        id: 'q4',
        question: '如何使用 PCL 启动器安装 Minecraft 版本？',
        coreSteps: '打开 PCL 启动器（以 PCL2 为例），进入主界面后点击顶部「版本选择」按钮，在版本列表右侧找到「添加版本」选项并点击；进入版本安装界面后，先选择目标 Minecraft 版本（如 1.20.1、1.19.3 等，支持正式版、快照版），再选择对应的模组加载器（Forge、Fabric、Quilt、OptiFine 或原版），确认后点击「安装」。',
        extraInfo: '安装时需注意游戏路径设置，建议在 PCL「设置」→「游戏目录」中选择全英文路径（如 D:\\PCL\\Minecraft），避免中文路径导致启动失败或存档丢失。'
      }
    ]
  },
  {
    title: '二、材质、光影、Mod 安装相关',
    items: [
      {
        id: 'q5',
        question: '如何安装 Minecraft 光影？',
        coreSteps: '启动游戏后进入「选项」→「视频设置」→「光影」，点击「打开光影包文件夹」，将下载的光影压缩包（如 ComplementaryUnbound_r5.1.1.zip）直接拖入文件夹，返回游戏光影界面选中新增光影，点击「应用」即可生效。',
        extraInfo: '光影安装需满足依赖前提，Java 版需安装「OptiFine」（支持 Forge/Fabric）或「Iris 光影加载器」（仅 Fabric，更轻量）。'
      },
      {
        id: 'q6',
        question: '如何安装 Minecraft 材质包（资源包）？',
        coreSteps: '进入游戏「选项」→「资源包」，点击「打开资源包文件夹」，将材质包压缩包（如 enhanced_default_w1.12.zip）拖入，在资源包列表中把新增材质包从 “可用” 移到 “已选择”，点击「完成」即可。',
        extraInfo: '材质包需匹配游戏版本，且 Java 版与基岩版材质包格式不同（Java 版为 .zip，基岩版为 .mcpack）。'
      },
      {
        id: 'q7',
        question: '如何安装 Minecraft Mod？',
        coreSteps: '以 PCL 启动器为例：打开 PCL 启动器，进入「版本设置」→「Mod 管理」，点击「打开 Mod 文件夹」，将 Mod 文件（后缀为 .jar）拖入，重启游戏后 Mod 会自动加载。',
        extraInfo: '需注意加载器匹配（Forge vs Fabric）、版本匹配以及依赖前置（如 Fabric API）。'
      }
    ]
  },
  {
    title: '三、地图文件导入相关',
    items: [
      {
        id: 'q8',
        question: '如何导入 Java 版 Minecraft 地图？',
        coreSteps: '找到游戏版本目录，路径为：启动器对应的游戏目录 → versions → 目标版本文件夹 → saves，将下载的地图文件夹直接拖入 saves 文件夹，启动游戏后在 “单人游戏” 列表中即可看到。',
        extraInfo: '若地图不显示，检查是否存在嵌套文件夹，需确保地图根目录下直接包含 level.dat 文件。'
      },
      {
        id: 'q9',
        question: '基岩版 Minecraft 如何导入地图？',
        coreSteps: '自动安装推荐使用 .mcworld 格式，直接点击文件系统会自动调用 Minecraft 导入。手动安装需解压到 minecraftWorlds 文件夹。',
        extraInfo: 'Java 版地图转基岩版可使用 Chunker 或 MCCToolChest PE 等工具。'
      }
    ]
  },
  {
    title: '四、联机方法相关',
    items: [
      {
        id: 'q10',
        question: '如何用 BakaXL 启动器联机？',
        coreSteps: '主机在单人世界按「ESC」→「对局域网开放」；打开 BakaXL 进入「领域 / 联机大厅」，创建大厅获取编号并开启“中继连接”；加入者输入编号后加入。',
        extraInfo: '中继连接是解决无法建立直接连接的关键。'
      },
      {
        id: 'q11',
        question: '如何用 PCL 启动器联机？',
        coreSteps: '所有玩家需使用相同游戏版本；主机按「ESC」→「对局域网开放」，加入者在“多人游戏”中刷新即可看到，或输入主机 IP + 端口。',
        extraInfo: '若正版玩家与离线玩家联机，需在 PCL 设置中关闭“正版验证”。'
      },
      {
        id: 'q12',
        question: '樱花 Frp 远程联机教程',
        coreSteps: '① 官网注册账号并下载客户端；② 完成实名认证获取流量；③ 创建隧道，填写服务器地区、本地端口（Java 25565 / 基岩 19132）；④ 启动隧道生成公网地址；⑤ 队友输入公网地址连接。',
        extraInfo: '适用于玩家不在同一网络（如异地）的场景。'
      }
    ]
  },
  {
    title: '五、整合包安装相关',
    items: [
      {
        id: 'q13',
        question: '如何用 PCL 启动器安装 Minecraft 整合包？',
        coreSteps: '打开 PCL 启动器，进入「版本选择」→「添加或导入」→「导入整合包」，选择 .zip 文件，启动器会自动解析并安装。',
        extraInfo: '安装后建议检查 Java 环境是否匹配。'
      }
    ]
  }
];

const filteredContent = computed(() => {
  if (!searchQuery.value) return rawTutorialData;
  
  const query = searchQuery.value.toLowerCase();
  return rawTutorialData.map(section => {
    const matchedItems = section.items.filter(item => 
      item.question.toLowerCase().includes(query) || 
      item.coreSteps.toLowerCase().includes(query) ||
      (item.extraInfo && item.extraInfo.toLowerCase().includes(query))
    );
    return { ...section, items: matchedItems };
  }).filter(section => section.items.length > 0);
});

// 扁平化搜索结果用于下拉展示
const flattenedResults = computed(() => {
  if (!searchQuery.value) return [];
  const results = [];
  filteredContent.value.forEach(section => {
    section.items.forEach(item => {
      results.push({
        id: item.id,
        question: item.question,
        sectionTitle: section.title.split('、')[1] || section.title // 简化分类名称
      });
    });
  });
  return results;
});

const scrollToItem = (id) => {
  activeId.value = id;
  const element = document.getElementById(id);
  if (element && contentRef.value) {
    const offset = 100; // 考虑顶部搜索栏高度
    const bodyRect = contentRef.value.getBoundingClientRect().top;
    const elementRect = element.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition + contentRef.value.scrollTop - offset;

    contentRef.value.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
};

const handleTocClick = (id) => {
  scrollToItem(id);
  isMobileTocOpen.value = false;
};

const handleSearchBlur = () => {
  // 延迟关闭，以便点击事件能被触发
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 200);
};

const selectSearchResult = (id) => {
  scrollToItem(id);
  isSearchFocused.value = false;
};

// 监听搜索，重置激活项
const handleSearch = () => {
  if (filteredContent.value.length > 0 && filteredContent.value[0].items.length > 0) {
    activeId.value = filteredContent.value[0].items[0].id;
  }
};

const handleScroll = () => {
  if (!contentRef.value) return;
  
  const items = document.querySelectorAll('.qa-item');
  const scrollPosition = contentRef.value.scrollTop + 120;

  for (const item of items) {
    if (item.offsetTop <= scrollPosition && item.offsetTop + item.offsetHeight > scrollPosition) {
      activeId.value = item.id;
      break;
    }
  }
};

onMounted(() => {
  if (rawTutorialData.length > 0 && rawTutorialData[0].items.length > 0) {
    activeId.value = rawTutorialData[0].items[0].id;
  }
});
</script>

<style scoped>
.tutorial-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8f9fa;
  color: #2c3e50;
  overflow: hidden;
  padding-top: 70px; /* 统一导航栏高度 */
}

/* 顶部搜索栏 */
.tutorial-header {
  height: 70px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 40px;
  z-index: 90;
  flex-shrink: 0;
}

.search-container {
  width: 100%;
  max-width: 600px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 16px;
  width: 18px;
  height: 18px;
  color: #94a3b8;
}

.search-box input {
  width: 100%;
  padding: 12px 16px 12px 48px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  font-size: 15px;
  background: white;
  transition: all 0.3s ease;
  outline: none;
}

.search-box input:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

/* 搜索结果下拉列表 */
.search-results-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
  padding: 8px;
}

.search-result-item {
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-result-item:hover {
  background: rgba(0, 123, 255, 0.08);
}

.result-question {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  line-height: 1.4;
}

.result-section {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.tutorial-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* 移动端侧拉按钮 */
.mobile-toc-trigger {
  display: none;
  position: fixed;
  bottom: 30px;
  right: 30px;
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background: #007bff;
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
  z-index: 1001;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.mobile-toc-trigger svg {
  width: 24px;
  height: 24px;
}

.mobile-toc-trigger.active {
  transform: rotate(90deg);
  background: #1e293b;
}

/* 遮罩层 */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 999;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 左侧目录栏 */
.tutorial-sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  overflow-y: auto;
  padding: 32px 20px;
  flex-shrink: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toc-section {
  margin-bottom: 32px;
}

.toc-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding-left: 12px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-list li {
  padding: 10px 12px;
  font-size: 14px;
  color: #475569;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.5;
  margin-bottom: 2px;
}

.toc-list li:hover {
  background-color: #f1f5f9;
  color: #007bff;
}

.toc-list li.active {
  background-color: rgba(0, 123, 255, 0.1);
  color: #007bff;
  font-weight: 500;
}

/* 右侧内容栏 */
.tutorial-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px 60px 80px;
  scroll-behavior: smooth;
}

.content-section {
  max-width: 900px;
  margin-bottom: 60px;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1e293b;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 12px;
}

.qa-item {
  margin-bottom: 48px;
  scroll-margin-top: 100px;
}

.qa-question {
  font-size: 18px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 20px;
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
}

.qa-question::before {
  content: "Q:";
  color: #007bff;
  margin-right: 12px;
  font-weight: 800;
}

.qa-answer {
  padding-left: 32px;
}

.answer-block {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid rgba(0, 0, 0, 0.03);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.supplementary {
  background-color: #f8fafc;
  border-left: 4px solid #94a3b8;
}

.block-label {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 12px;
  text-transform: uppercase;
}

.supplementary .block-label {
  background: #e2e8f0;
  color: #475569;
}

.answer-block p {
  font-size: 15px;
  line-height: 1.7;
  color: #475569;
  margin: 0;
}

.no-results {
  text-align: center;
  padding: 100px 0;
  color: #94a3b8;
  font-size: 16px;
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .tutorial-sidebar {
    width: 240px;
  }
  .tutorial-content {
    padding: 32px 40px;
  }
}

@media (max-width: 768px) {
  .mobile-toc-trigger {
    display: flex;
  }

  .tutorial-sidebar {
    position: fixed;
    top: 70px;
    left: 0;
    bottom: 0;
    z-index: 1000;
    transform: translateX(-100%);
    width: 280px;
    box-shadow: 10px 0 25px rgba(0, 0, 0, 0.1);
  }

  .tutorial-sidebar.mobile-open {
    transform: translateX(0);
  }

  .tutorial-header {
    padding: 0 16px;
    height: 60px;
  }

  .search-box input {
    padding: 10px 12px 10px 40px;
    font-size: 14px;
  }

  .search-icon {
    left: 12px;
    width: 16px;
    height: 16px;
  }

  .tutorial-content {
    padding: 24px 20px 100px;
  }

  .qa-item {
    scroll-margin-top: 140px; /* 考虑导航栏 + 搜索栏高度 */
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 20px;
    margin-bottom: 24px;
  }

  .qa-question {
    font-size: 16px;
  }

  .qa-answer {
    padding-left: 0;
  }
}
</style>
