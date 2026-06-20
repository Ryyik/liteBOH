<template>
  <div class="tutorial-page">
    <!-- 引入统一导航栏 -->

    <!-- 问题类型选择页面 -->
    <div v-if="!selectedType" class="type-selection-page">
      <div class="selection-container">
        <h1 class="selection-title">选择问题类型</h1>
        <p class="selection-subtitle">请选择你需要查看的教程类别</p>
        <div class="type-cards">
          <div class="type-card client-card" @click="selectType('client')">
            <div class="card-icon">🎮</div>
            <h2 class="card-title">客户端问题</h2>
            <p class="card-desc">游戏安装、Mod、材质、联机等客户端相关教程</p>
            <div class="card-arrow">→</div>
          </div>
          <div class="type-card server-card" @click="selectType('server')">
            <div class="card-icon">🖥️</div>
            <h2 class="card-title">服务端相关</h2>
            <p class="card-desc">服务器搭建、配置、启动等服务端相关教程</p>
            <div class="card-arrow">→</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 教程内容页面 -->
    <div v-else>
      <!-- 返回按钮 -->
      <button class="back-button" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回选择
      </button>

      <!-- 移动端目录切换按钮 -->
      <button class="mobile-toc-trigger" @click="isMobileTocOpen = !isMobileTocOpen"
        :class="{ 'active': isMobileTocOpen }">
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
            <input type="text" v-model="searchQuery" placeholder="搜索教程内容..." @input="handleSearch"
              @focus="isSearchFocused = true" @blur="handleSearchBlur" />
            <!-- 搜索结果下拉列表 -->
            <transition name="fade">
              <div class="search-results-dropdown" v-if="searchQuery && isSearchFocused && flattenedResults.length > 0">
                <div v-for="item in flattenedResults" :key="item.id" class="search-result-item"
                  @mousedown="selectSearchResult(item.id)">
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
          <div class="sidebar-overlay" v-if="isMobileTocOpen" @click="isMobileTocOpen = false"></div>
        </transition>

        <!-- 左侧目录栏 -->
        <aside class="tutorial-sidebar" :class="{ 'mobile-open': isMobileTocOpen }">
          <nav class="toc-nav">
            <div v-for="(section, sIndex) in filteredContent" :key="sIndex" class="toc-section">
              <h3 class="toc-section-title">{{ section.title }}</h3>
              <ul class="toc-list">
                <li v-for="(item, iIndex) in section.items" :key="iIndex" :class="{ active: activeId === item.id }"
                  @click="handleTocClick(item.id)">
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

          <!-- AI Suggestion Section -->
          <div class="ai-suggestion-section">
            <div class="ai-suggestion-card">
              <div class="ai-icon-wrapper">AI</div>
              <div class="ai-text-content">
                <p class="ai-prompt-text">未找到你想找的内容？来问问BOH AI</p>
              </div>
              <button class="ai-action-btn" @click="goToAiChat">
                立即提问
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const searchQuery = ref('');
const activeId = ref('');
const contentRef = ref(null);
const isMobileTocOpen = ref(false);
const isSearchFocused = ref(false);
const selectedType = ref(null);

const goToAiChat = () => {
  router.push('/ai-chat');
};

const selectType = (type) => {
  selectedType.value = type;
  searchQuery.value = '';
};

const goBack = () => {
  selectedType.value = null;
};

const rawTutorialData = [
  {
    title: '一、客户端问题',
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
      },
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
      },
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
      },
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
      },
      {
        id: 'q13',
        question: '如何用 PCL 启动器安装 Minecraft 整合包？',
        coreSteps: '打开 PCL 启动器，进入「版本选择」→「添加或导入」→「导入整合包」，选择 .zip 文件，启动器会自动解析并安装。',
        extraInfo: '安装后建议检查 Java 环境是否匹配。'
      }
    ]
  },
  {
    title: '二、服务端相关',
    items: [
      {
        id: 'q14',
        question: '原生服务端下载与启动',
        coreSteps: '下载地址：https://getbukkit.org/download/spigot\n\n启动脚本（Windows）：\n@echo off\njava -Xmx1g -Xms1g -jar 这里是名字.jar\npause',
        extraInfo: '注意：请确保路径中无中文，所需环境为 JAVA 21'
      },
      {
        id: 'q15',
        question: 'Fabric 服务端下载与启动',
        coreSteps: '下载地址：fabricmc.net/use/server/\n\n启动命令：\njava -Xms6G -Xmx6G -jar server.jar nogui',
        extraInfo: '注意：请确保路径中无中文，所需环境为 JAVA 21'
      }
    ]
  }
];

const filteredContent = computed(() => {
  let data = selectedType.value
    ? rawTutorialData.filter(section => {
      if (selectedType.value === 'client') {
        return section.title.includes('客户端');
      } else if (selectedType.value === 'server') {
        return section.title.includes('服务端');
      }
      return true;
    })
    : rawTutorialData;

  if (!searchQuery.value) return data;

  const query = searchQuery.value.toLowerCase();
  return data.map(section => {
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
/* 类型选择页面样式 */
.type-selection-page {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  overflow-y: auto;
  min-height: 0;
}

.selection-container {
  max-width: 900px;
  width: 100%;
  text-align: center;
  padding: 40px 0;
}

.selection-title {
  font-size: 42px;
  font-weight: 800;
  color: #1d1d1f;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.selection-subtitle {
  font-size: 18px;
  color: #86868b;
  margin-bottom: 60px;
  font-weight: 500;
}

.type-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
}

.type-card {
  background: white;
  border-radius: 28px;
  padding: 40px 32px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  border: 2px solid transparent;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  text-align: left;
  position: relative;
  overflow: hidden;
}

.type-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #1d1d1f, #434345);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.type-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.06);
}

.type-card:hover::before {
  opacity: 1;
}

.card-icon {
  font-size: 48px;
  margin-bottom: 20px;
  display: inline-block;
}

.card-title {
  font-size: 24px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}

.card-desc {
  font-size: 15px;
  color: #424245;
  line-height: 1.6;
  font-weight: 400;
}

.card-arrow {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24px;
  color: #86868b;
  opacity: 0;
  transition: all 0.3s ease;
}

.type-card:hover .card-arrow {
  opacity: 1;
  right: 20px;
  color: #1d1d1f;
}

/* 返回按钮样式 */
.back-button {
  position: fixed;
  top: 80px;
  left: 30px;
  z-index: 100;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 100px;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.back-button:hover {
  background: #1d1d1f;
  color: white;
  transform: translateX(-4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.tutorial-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: #fbfbfc;
  color: #1a1a1a;
  padding-top: 64px;
  /* 与 UnifiedNavbar 高度一致 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* 顶部搜索区域 - 更加简洁、通透 */
.tutorial-header {
  height: 90px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 40px;
  z-index: 90;
  flex-shrink: 0;
}

.search-container {
  width: 100%;
  max-width: 720px;
  perspective: 1000px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  transform: translateY(0);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-icon {
  position: absolute;
  left: 20px;
  width: 20px;
  height: 20px;
  color: #a1a1a6;
  pointer-events: none;
}

.search-box input {
  width: 100%;
  padding: 16px 20px 16px 56px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 20px;
  font-size: 16px;
  font-weight: 500;
  background: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
  outline: none;
  color: #1d1d1f;
}

.search-box input:focus {
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.search-box input::placeholder {
  color: #86868b;
  font-weight: 400;
}

/* 搜索结果下拉列表 - 毛玻璃效果 */
.search-results-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  max-height: 450px;
  overflow-y: auto;
  z-index: 1000;
  padding: 12px;
  scrollbar-width: none;
}

.search-results-dropdown::-webkit-scrollbar {
  display: none;
}

.search-result-item {
  padding: 14px 20px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}

.search-result-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.result-question {
  font-size: 15px;
  font-weight: 600;
  color: #1d1d1f;
  line-height: 1.4;
}

.result-section {
  font-size: 11px;
  color: #86868b;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tutorial-container {
  display: flex;
  flex: 1;
  position: relative;
  padding: 0 20px 20px;
  min-height: 0;
}

/* 移动端侧拉按钮 - 现代悬浮样式 */
.mobile-toc-trigger {
  display: none;
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #1d1d1f;
  color: white;
  border: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 1001;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-toc-trigger:active {
  transform: scale(0.9);
}

.mobile-toc-trigger svg {
  width: 24px;
  height: 24px;
}

/* 左侧目录栏 - 侧边导航美化 */
.tutorial-sidebar {
  width: 300px;
  background: transparent;
  overflow-y: auto;
  padding: 20px 10px;
  flex-shrink: 0;
  scrollbar-width: none;
}

.tutorial-sidebar::-webkit-scrollbar {
  display: none;
}

.toc-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toc-section {
  margin-bottom: 24px;
}

.toc-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
  padding-left: 20px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-list li {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #424245;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.4;
  margin-bottom: 4px;
}

.toc-list li:hover {
  background-color: rgba(0, 0, 0, 0.03);
  color: #1d1d1f;
}

.toc-list li.active {
  background-color: #1d1d1f;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 右侧内容栏 - 卡片式布局 */
.tutorial-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 40px;
  scroll-behavior: smooth;
  background: white;
  border-radius: 32px;
  margin-left: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.02);
}

.content-section {
  max-width: 840px;
  margin: 0 auto 80px;
}

.section-title {
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 40px;
  color: #1d1d1f;
  letter-spacing: -0.02em;
}

.qa-item {
  margin-bottom: 64px;
  scroll-margin-top: 120px;
}

.qa-question {
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 24px;
  line-height: 1.3;
  display: flex;
  align-items: flex-start;
  letter-spacing: -0.01em;
}

.qa-question::before {
  content: "Q";
  color: white;
  background: linear-gradient(135deg, #1d1d1f 0%, #434345 100%);
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  margin-right: 18px;
  margin-top: 1px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.qa-answer {
  padding-left: 50px;
}

.answer-block {
  background: white;
  border-radius: 24px;
  padding: 32px;
  margin-bottom: 24px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.answer-block:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.04);
}

.supplementary {
  background-color: #fbfbfc;
  border-left: 4px solid #1d1d1f;
}

.block-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  color: #1d1d1f;
  background: #f5f5f7;
  padding: 4px 12px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.supplementary .block-label {
  background: #1d1d1f;
  color: #f5f5f7;
}

.answer-block p {
  font-size: 16px;
  line-height: 1.8;
  color: #424245;
  margin: 0;
  font-weight: 400;
}

/* 强调文字样式 */
.answer-block p b,
.answer-block p strong {
  color: #1d1d1f;
  font-weight: 700;
}

.no-results {
  text-align: center;
  padding: 120px 0;
  color: #86868b;
  font-size: 18px;
  font-weight: 500;
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .tutorial-sidebar {
    width: 260px;
  }

  .tutorial-content {
    padding: 20px 30px;
  }
}

@media (max-width: 992px) {
  .tutorial-container {
    padding: 0 16px 16px;
  }

  .tutorial-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    background: white;
    z-index: 1000;
    transform: translateX(-100%);
    box-shadow: 20px 0 50px rgba(0, 0, 0, 0.1);
    padding-top: 80px;
  }

  .tutorial-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-toc-trigger {
    display: flex;
  }

  .tutorial-content {
    margin-left: 0;
    padding: 30px 20px;
    border-radius: 24px;
  }

  .tutorial-header {
    padding: 0 20px;
  }
}

@media (max-width: 640px) {
  .section-title {
    font-size: 24px;
  }

  .qa-question {
    font-size: 18px;
  }

  .qa-answer {
    padding-left: 0;
  }

  .qa-question::before {
    margin-right: 12px;
  }

  .answer-block {
    padding: 20px;
    border-radius: 16px;
  }

  .selection-title {
    font-size: 32px;
  }

  .selection-subtitle {
    font-size: 16px;
  }

  .type-card {
    padding: 32px 24px;
  }

  .card-icon {
    font-size: 40px;
  }

  .card-title {
    font-size: 20px;
  }

  .back-button {
    left: 20px;
    top: 76px;
    padding: 10px 18px;
    font-size: 13px;
  }
}

/* 动画效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* AI Suggestion Section Styles */
.ai-suggestion-section {
  margin-top: 60px;
  padding-bottom: 40px;
}

.ai-suggestion-card {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  border-radius: 24px;
  padding: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  transition: all 0.3s ease;
}

.ai-suggestion-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.ai-icon-wrapper {
  width: 48px;
  height: 48px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 18px;
  color: #1d1d1f;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.ai-text-content {
  flex: 1;
}

.ai-prompt-text {
  font-size: 18px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 0;
  letter-spacing: -0.01em;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #000;
  color: #fff;
  border: none;
  padding: 14px 28px;
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.ai-action-btn:hover {
  background: #333;
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .ai-suggestion-card {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .ai-text-content {
    margin: 16px 0 24px;
  }

  .ai-action-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
