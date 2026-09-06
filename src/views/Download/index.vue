<template>
  <div class="resources-page">
    <!-- Hero -->
    <section class="hero-section">
      <div class="liquid-glass hero-glass">
        <span class="hero-label">RESOURCES</span>
        <h1 class="hero-title">资源中心</h1>
        <p class="hero-subtitle">客户端、服务端与地图资源下载，以及全方位的游戏教程支持</p>

        <!-- 分段控件：下载 / 教程（滑动式选择指示器） -->
        <div class="segmented liquid-glass--pill" role="tablist" ref="segmentedRef">
          <span class="segment-thumb" :style="thumbStyle" aria-hidden="true"></span>
          <button v-for="(seg, i) in segments" :key="seg.id" :ref="el => setSegmentBtn(el, i)" class="segment-btn"
            :class="{ active: activeSegment === seg.id }" role="tab" :aria-selected="activeSegment === seg.id"
            @click="switchSegment(seg.id)">
            {{ seg.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- ======================== 下载资源 ======================== -->
    <Transition name="seg" mode="out-in" @after-enter="onPanelEntered">
    <main v-if="activeSegment === 'download'" class="download-container">
      <!-- 类型筛选胶囊 -->
      <div class="filter-row">
        <div class="filter-glass liquid-glass--pill">
          <button v-for="tab in tabs" :key="tab.id" class="filter-tab" :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id">
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="download-grid">
        <div v-for="(item, index) in filteredDownloads" :key="item.id" class="download-card"
          :style="{ '--delay': index * 80 + 'ms' }">
          <div class="liquid-glass liquid-glass--interactive card-glass">
            <div class="card-top">
              <span class="card-badge" :class="item.type">{{ getTypeName(item.type) }}</span>
              <span class="card-size" v-if="item.size">{{ item.size }}</span>
            </div>

            <div class="card-content">
              <h3 class="item-name">{{ item.name }}</h3>
              <div class="version-glass liquid-glass--strong">
                <span class="version-label">Version</span>
                <span class="version-value">{{ item.version }}</span>
              </div>
              <p class="item-description" v-if="item.description">{{ item.description }}</p>
            </div>

            <div class="card-footer">
              <button class="download-btn" @click="handleDownload(item.url)">
                <span class="btn-text">立即下载</span>
                <span class="btn-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ======================== 教程中心 ======================== -->
    <main v-else class="tutorial-container">
      <!-- 工具行：搜索 + 类型筛选 -->
      <div class="tutorial-toolbar">
        <div class="search-box liquid-glass--strong">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" v-model="searchQuery" placeholder="搜索教程内容..." @input="handleSearch"
            @focus="isSearchFocused = true" @blur="handleSearchBlur" />
          <transition name="fade">
            <div class="liquid-glass search-results-dropdown" v-if="searchQuery && isSearchFocused && flattenedResults.length > 0">
              <div v-for="item in flattenedResults" :key="item.id" class="search-result-item"
                @mousedown="selectSearchResult(item.id)">
                <span class="result-question">{{ item.question }}</span>
                <span class="result-section">{{ item.sectionTitle }}</span>
              </div>
            </div>
          </transition>
        </div>

        <div class="filter-glass tutorial-type-pills liquid-glass--pill">
          <button v-for="t in tutorialTypes" :key="t.id" class="filter-tab" :class="{ active: tutorialType === t.id }"
            @click="tutorialType = t.id">
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="tutorial-layout" ref="tocLayoutRef">
        <!-- 移动端侧拉遮罩 -->
        <transition name="fade">
          <div class="sidebar-overlay" v-if="isMobileTocOpen" @click="isMobileTocOpen = false"></div>
        </transition>

        <!-- 左侧目录（滚动驱动停靠，见 tocTop/updateTocTop） -->
        <aside class="tutorial-sidebar liquid-glass--subtle" :class="{ 'mobile-open': isMobileTocOpen }"
          :style="{ '--toc-top': tocTop }">
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

        <!-- 右侧内容 -->
        <div class="tutorial-content" ref="contentRef">
          <div v-if="filteredContent.length === 0" class="no-results">未找到相关内容</div>
          <div v-else v-for="(section, sIndex) in filteredContent" :key="sIndex" class="content-section">
            <h2 class="section-title">{{ section.title }}</h2>
            <div v-for="(item, iIndex) in section.items" :key="iIndex" :id="item.id" class="qa-item"
              :style="{ '--rd': Math.min(iIndex * 50, 300) + sIndex * 80 + 'ms' }">
              <h4 class="qa-question">{{ item.question }}</h4>
              <div class="qa-answer">
                <div v-if="item.coreSteps" class="answer-block liquid-glass">
                  <span class="block-label">核心步骤</span>
                  <p>{{ item.coreSteps }}</p>
                </div>
                <div v-if="item.extraInfo" class="answer-block supplementary liquid-glass">
                  <span class="block-label">补充说明</span>
                  <p>{{ item.extraInfo }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- AI 提问卡片 -->
          <div class="ai-suggestion-section">
            <div class="ai-suggestion-card liquid-glass--subtle">
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
        </div>

        <!-- 移动端目录按钮 -->
        <button class="mobile-toc-trigger" @click="isMobileTocOpen = !isMobileTocOpen"
          :class="{ 'active': isMobileTocOpen }" aria-label="打开目录">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </main>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { downloadsData } from '@/data/downloads.js';

const router = useRouter();
const route = useRoute();

/* ---------- 导航高度同步（不写死 64/80px，灵动岛展开会变高） ---------- */
let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.resources-page');
  if (!nav || !page) return;
  page.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
};

/* ---------- 目录侧栏停靠：全局 body overflow-x:hidden(!important) 破坏了
   position:sticky，改用 fixed + 动态 top：
   top = max(导航下方, 目录自然位置)。页面在顶部时贴住自然位置不遮 Hero，
   向下滚动自动吸附到导航下方。 ---------- */
const tocLayoutRef = ref(null);
const tocTop = ref('160px');
const updateTocTop = () => {
  if (activeSegment.value !== 'tutorial' || !tocLayoutRef.value) return;
  const nav = document.getElementById('unified-nav-container');
  const dockTop = (nav ? nav.offsetHeight : 64) + 24;
  const rect = tocLayoutRef.value.getBoundingClientRect();
  tocTop.value = `${Math.max(dockTop, rect.top)}px`;
};

/* ---------- 顶层分段（带滑动指示器） ---------- */
const activeSegment = ref('download');
const segments = [
  { id: 'download', label: '下载资源' },
  { id: 'tutorial', label: '教程中心' }
];
const segmentedRef = ref(null);
const segmentBtnRefs = ref([]);
const setSegmentBtn = (el, i) => {
  if (el) segmentBtnRefs.value[i] = el;
};
const thumbStyle = ref({ width: '90px', transform: 'translateX(0px)' });
const updateThumb = () => {
  const i = segments.findIndex(s => s.id === activeSegment.value);
  const el = segmentBtnRefs.value[i];
  if (el) {
    thumbStyle.value = {
      width: `${el.offsetWidth}px`,
      transform: `translateX(${el.offsetLeft}px)`
    };
  }
};
const switchSegment = (id) => {
  activeSegment.value = id;
  nextTick(() => {
    updateThumb();
    updateTocTop();
  });
};

/* ---------- 下载资源 ---------- */
const activeTab = ref('all');
const tabs = [
  { id: 'all', label: '全部资源' },
  { id: 'client', label: '客户端' },
  { id: 'server', label: '服务端' },
  { id: 'map', label: '地图' }
];
const downloads = ref(downloadsData);
const filteredDownloads = computed(() => {
  if (activeTab.value === 'all') return downloads.value;
  return downloads.value.filter(item => item.type === activeTab.value);
});
const getTypeName = (type) => {
  const types = { client: '客户端', server: '服务端', map: '游戏/地图' };
  return types[type] || '其他';
};
const handleDownload = (_url) => {
  alert('该内容过大，请前往社群下载。');
};

/* ---------- 教程中心 ---------- */
const searchQuery = ref('');
const activeId = ref('');
const contentRef = ref(null);
const isMobileTocOpen = ref(false);
const isSearchFocused = ref(false);
const tutorialType = ref('all');
const tutorialTypes = [
  { id: 'all', label: '全部' },
  { id: 'client', label: '客户端' },
  { id: 'server', label: '服务端' }
];

const goToAiChat = () => {
  router.push('/ai-chat');
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
  let data = tutorialType.value === 'all'
    ? rawTutorialData
    : rawTutorialData.filter(section => {
      if (tutorialType.value === 'client') return section.title.includes('客户端');
      if (tutorialType.value === 'server') return section.title.includes('服务端');
      return true;
    });

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

const flattenedResults = computed(() => {
  if (!searchQuery.value) return [];
  const results = [];
  filteredContent.value.forEach(section => {
    section.items.forEach(item => {
      results.push({
        id: item.id,
        question: item.question,
        sectionTitle: section.title.split('、')[1] || section.title
      });
    });
  });
  return results;
});

const scrollToItem = (id) => {
  activeId.value = id;
  const element = document.getElementById(id);
  // 内容区跟随整页滚动，用 scrollIntoView + .qa-item 的 scroll-margin-top 避让导航
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const handleTocClick = (id) => {
  scrollToItem(id);
  isMobileTocOpen.value = false;
};

const handleSearchBlur = () => {
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 200);
};

const selectSearchResult = (id) => {
  scrollToItem(id);
  isSearchFocused.value = false;
};

const handleSearch = () => {
  if (filteredContent.value.length > 0 && filteredContent.value[0].items.length > 0) {
    activeId.value = filteredContent.value[0].items[0].id;
  }
};

const handleScroll = () => {
  updateTocTop();
  if (activeSegment.value !== 'tutorial' || !contentRef.value) return;

  // 整页滚动：按视口内谁越过阈值线来高亮目录
  const items = contentRef.value.querySelectorAll('.qa-item');
  const threshold = 180;
  let current = items.length ? items[0].id : '';

  for (const item of items) {
    if (item.getBoundingClientRect().top <= threshold) {
      current = item.id;
    } else {
      break;
    }
  }
  if (current) activeId.value = current;
};

onMounted(() => {
  // 支持 /download?tab=tutorial 直达教程分段
  if (route.query.tab === 'tutorial') {
    activeSegment.value = 'tutorial';
  }
  if (rawTutorialData.length > 0 && rawTutorialData[0].items.length > 0) {
    activeId.value = rawTutorialData[0].items[0].id;
  }
  nextTick(() => {
    updateThumb();
    updateTocTop();
  });
  syncNavHeight();
  const nav = document.getElementById('unified-nav-container');
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(() => {
      syncNavHeight();
      updateTocTop();
    });
    navResizeObserver.observe(nav);
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', onResize);
});

const onResize = () => {
  updateThumb();
  updateTocTop();
};

/* 面板过渡入场后重新测量（out-in 模式下新面板延迟进 DOM，nextTick 测不到） */
const onPanelEntered = () => {
  updateThumb();
  updateTocTop();
};

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', onResize);
  if (navResizeObserver) {
    navResizeObserver.disconnect();
    navResizeObserver = null;
  }
});
</script>

<style scoped>
/* ============================================================
   资源中心（下载 + 教程融合）— 统一液态玻璃
   玻璃一律走 tokens.css 的 --liquid-* / .liquid-glass 类库，
   页面内不写散装 backdrop-filter。
   ============================================================ */

.resources-page {
  --nav-h: 64px;
  --text-1: #1d1d1f;
  --text-2: #6e6e73;
  --text-3: #98a2b3;
  --spring: cubic-bezier(0.32, 0.72, 0, 1);

  min-height: 100vh;
  padding-top: calc(var(--nav-h) + 24px);
  color: var(--text-1);
  position: relative;
  /* 注意：不要加 overflow-x: hidden，会让侧栏 position:sticky 失效 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* ============================================================
   HERO
   ============================================================ */
.hero-section {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 40px 32px;
}

.hero-glass {
  padding: 44px 48px 40px;
  position: relative;
  overflow: hidden;
}

.hero-glass::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent);
}

.hero-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--text-3);
  margin-bottom: 18px;
  text-transform: uppercase;
  padding: 7px 15px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 12px;
  color: var(--text-1);
}

.hero-subtitle {
  font-size: 16px;
  color: var(--text-2);
  max-width: 480px;
  line-height: 1.6;
  font-weight: 400;
  margin-bottom: 28px;
}

/* ---------- 分段控件（iOS 风格 + 滑动指示器） ---------- */
.segmented {
  position: relative;
  display: inline-flex;
  gap: 4px;
  padding: 5px;
  background: rgba(255, 255, 255, 0.55);
}

.segment-thumb {
  position: absolute;
  top: 5px;
  left: 0;
  height: calc(100% - 10px);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: transform 0.45s var(--spring), width 0.45s var(--spring);
  will-change: transform;
}

.segment-btn {
  position: relative;
  z-index: 1;
  padding: 11px 28px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: color 0.3s var(--spring);
}

.segment-btn:hover {
  color: var(--text-1);
}

.segment-btn.active {
  color: var(--text-1);
  font-weight: 700;
}

/* ============================================================
   下载资源
   ============================================================ */
.download-container {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 40px 100px;
}

.filter-row {
  display: flex;
  justify-content: center;
  margin-bottom: 36px;
}

.filter-glass {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 5px;
  background: rgba(255, 255, 255, 0.55);
  width: fit-content;
}

.filter-tab {
  position: relative;
  padding: 10px 22px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: all 0.3s var(--spring);
  white-space: nowrap;
}

.filter-tab:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.6);
}

.filter-tab.active {
  color: var(--text-1);
  background: #ffffff;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.download-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 24px;
}

.download-card {
  position: relative;
  animation: cardFadeIn 0.6s ease forwards;
  animation-delay: var(--delay);
  opacity: 0;
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-glass {
  padding: 32px;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.card-badge {
  display: inline-flex;
  align-items: center;
  padding: 7px 15px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-2);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.card-badge.client {
  color: var(--text-1);
}

.card-size {
  font-size: 13px;
  color: var(--text-3);
  font-weight: 500;
}

.card-content {
  flex-grow: 1;
}

.item-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 20px;
  line-height: 1.4;
  color: var(--text-1);
}

.version-glass {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
  padding: 18px 24px;
  border-radius: 16px;
}

.version-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.version-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: -0.02em;
  font-feature-settings: 'tnum';
}

.item-description {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.7;
  margin: 0;
}

.card-footer {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.download-btn {
  width: 100%;
  padding: 15px 28px;
  background: #1d1d1f;
  color: #ffffff;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s var(--spring);
  position: relative;
  overflow: hidden;
}

.download-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transition: left 0.5s ease;
}

.download-btn:hover {
  background: #000000;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.download-btn:hover::before {
  left: 100%;
}

.download-btn:active {
  transform: translateY(0);
}

.btn-icon {
  display: flex;
  align-items: center;
  transition: transform 0.3s ease;
}

.download-btn:hover .btn-icon {
  transform: translateY(2px);
}

/* ============================================================
   教程中心
   ============================================================ */
.tutorial-container {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 40px 100px;
}

.tutorial-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 560px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  transition: box-shadow 0.3s var(--spring), transform 0.3s var(--spring);
}

.search-box:focus-within {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
}

.search-icon {
  position: absolute;
  left: 20px;
  width: 18px;
  height: 18px;
  color: var(--text-3);
  pointer-events: none;
}

.search-box input {
  width: 100%;
  padding: 14px 22px 14px 50px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  background: transparent;
  outline: none;
  color: var(--text-1);
}

.search-box input::placeholder {
  color: var(--text-3);
  font-weight: 400;
}

.search-results-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  border-radius: 24px;
  max-height: 420px;
  overflow-y: auto;
  z-index: 100;
  padding: 12px;
  scrollbar-width: none;
}

.search-results-dropdown::-webkit-scrollbar {
  display: none;
}

.search-result-item {
  padding: 13px 18px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 4px;
}

.search-result-item:hover {
  background: rgba(15, 23, 42, 0.05);
}

.result-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.4;
}

.result-section {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tutorial-type-pills {
  flex-shrink: 0;
}

.tutorial-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.sidebar-overlay {
  display: none;
}

.tutorial-sidebar {
  width: 300px;
  flex-shrink: 0;
  border-radius: 24px;
  overflow-y: auto;
  padding: 20px 12px;
  max-height: calc(100vh - var(--nav-h) - 48px);
  /* 全局 html/body overflow-x:hidden(!important) 使 sticky 失效，
     改为 fixed + JS 动态 --toc-top 停靠（见 updateTocTop） */
  position: fixed;
  top: var(--toc-top, 160px);
  /* 对齐 .tutorial-container（max-width 1200 + 40px 内边距）的内容起点 */
  left: max(64px, calc((100vw - 1120px) / 2));
  z-index: 5;
  scrollbar-width: none;
}

.tutorial-sidebar::-webkit-scrollbar {
  display: none;
}

.tutorial-content {
  flex: 1;
  min-width: 0;
  /* 给 fixed 侧栏让位 */
  margin-left: 320px;
  padding: 8px 0 40px;
  scroll-behavior: smooth;
}

.toc-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toc-section {
  margin-bottom: 20px;
}

.toc-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 10px;
  padding-left: 18px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-list li {
  padding: 11px 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.4;
  margin-bottom: 4px;
}

.toc-list li:hover {
  background-color: rgba(255, 255, 255, 0.7);
  color: var(--text-1);
}

.toc-list li.active {
  background-color: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.content-section {
  max-width: 840px;
  margin: 0 auto 64px;
}

.section-title {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 36px;
  color: var(--text-1);
  letter-spacing: -0.02em;
}

.qa-item {
  margin-bottom: 56px;
  /* 目录 scrollIntoView 跳转时避让固定导航栏 */
  scroll-margin-top: calc(var(--nav-h) + 36px);
  animation: riseIn 0.55s cubic-bezier(0.32, 0.72, 0, 1) both;
  animation-delay: var(--rd, 0ms);
}

@keyframes riseIn {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.qa-question {
  font-size: 21px;
  font-weight: 700;
  color: var(--text-1);
  margin-bottom: 22px;
  line-height: 1.3;
  display: flex;
  align-items: flex-start;
  letter-spacing: -0.01em;
}

.qa-question::before {
  content: "Q";
  color: #ffffff;
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
  margin-right: 16px;
  margin-top: 1px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.qa-answer {
  padding-left: 48px;
}

.answer-block {
  border-radius: 20px;
  padding: 26px 28px;
  margin-bottom: 20px;
  transition: transform 0.35s var(--spring), box-shadow 0.35s var(--spring);
}

.answer-block:hover {
  transform: translateY(-2px);
  box-shadow: var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)), inset 0 -1px 0 rgba(255, 255, 255, 0.22), 0 16px 40px rgba(15, 23, 42, 0.1);
}

.supplementary {
  border-left: 3px solid #1d1d1f;
}

.block-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-1);
  background: rgba(15, 23, 42, 0.06);
  padding: 4px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.supplementary .block-label {
  background: #1d1d1f;
  color: #f5f5f7;
}

.answer-block p {
  font-size: 15px;
  line-height: 1.8;
  color: #424245;
  margin: 0;
  font-weight: 400;
  white-space: pre-wrap;
}

.answer-block p b,
.answer-block p strong {
  color: var(--text-1);
  font-weight: 700;
}

.no-results {
  text-align: center;
  padding: 100px 0;
  color: var(--text-3);
  font-size: 17px;
  font-weight: 500;
}

/* ---------- AI 提问卡片 ---------- */
.ai-suggestion-section {
  max-width: 840px;
  margin: 0 auto;
  padding-bottom: 10px;
}

.ai-suggestion-card {
  border-radius: 24px;
  padding: 26px 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  transition: transform 0.3s var(--spring);
}

.ai-suggestion-card:hover {
  transform: translateY(-2px);
}

.ai-icon-wrapper {
  width: 48px;
  height: 48px;
  background: #1d1d1f;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 16px;
  flex-shrink: 0;
}

.ai-text-content {
  flex: 1;
}

.ai-prompt-text {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0;
  letter-spacing: -0.01em;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1d1d1f;
  color: #ffffff;
  border: none;
  padding: 13px 26px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s var(--spring);
  white-space: nowrap;
}

.ai-action-btn:hover {
  background: #000000;
  transform: scale(1.03);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
}

/* ---------- 移动端目录触发按钮 ---------- */
.mobile-toc-trigger {
  display: none;
  position: fixed;
  bottom: 32px;
  right: 24px;
  width: 54px;
  height: 54px;
  border-radius: 27px;
  background: rgba(29, 29, 31, 0.9);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #ffffff;
  border: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  z-index: 60;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: transform 0.35s var(--spring);
}

.mobile-toc-trigger:active {
  transform: scale(0.9);
}

.mobile-toc-trigger svg {
  width: 24px;
  height: 24px;
}

/* ============================================================
   响应式
   ============================================================ */
@media (max-width: 992px) {
  .hero-section {
    padding: 16px 20px 24px;
  }

  .hero-glass {
    padding: 32px 28px;
  }

  .hero-title {
    font-size: 36px;
  }

  .download-container,
  .tutorial-container {
    padding: 0 20px 80px;
  }

  .tutorial-toolbar {
    flex-wrap: wrap;
  }

  .search-box {
    max-width: none;
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 58;
  }

  .tutorial-sidebar {
    position: fixed;
    top: 0 !important;
    left: 0;
    bottom: 0;
    width: 300px;
    max-height: none;
    border-radius: 0 24px 24px 0;
    z-index: 59;
    transform: translateX(-100%);
    box-shadow: 20px 0 50px rgba(0, 0, 0, 0.12);
    padding-top: calc(var(--nav-h) + 16px);
    transition: transform 0.4s var(--spring);
  }

  .tutorial-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-toc-trigger {
    display: flex;
  }

  .tutorial-content {
    margin-left: 0;
    padding: 28px 22px;
  }
}

@media (max-width: 640px) {
  .hero-title {
    font-size: 30px;
  }

  .hero-subtitle {
    font-size: 14px;
  }

  .segment-btn {
    padding: 10px 20px;
    font-size: 13px;
  }

  .download-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .card-glass {
    padding: 24px;
  }

  .item-name {
    font-size: 18px;
  }

  .version-glass {
    padding: 14px 20px;
  }

  .version-value {
    font-size: 22px;
  }

  .download-btn {
    padding: 14px 20px;
  }

  .filter-tab {
    padding: 9px 16px;
    font-size: 13px;
  }

  .qa-answer {
    padding-left: 0;
  }

  .qa-question {
    font-size: 18px;
  }

  .qa-question::before {
    margin-right: 12px;
  }

  .answer-block {
    padding: 20px;
    border-radius: 16px;
  }

  .ai-suggestion-card {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .ai-text-content {
    margin: 14px 0 20px;
  }

  .ai-action-btn {
    width: 100%;
    justify-content: center;
  }
}

/* ---------- 过渡动画 ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 分段面板切换：旧的轻轻上浮淡出，新的自下而上淡入 */
.seg-enter-active {
  transition: opacity 0.4s var(--spring), transform 0.4s var(--spring);
}

.seg-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.seg-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.995);
}

.seg-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* 教程侧栏 / AI 卡入场（侧栏动画仅桌面端：移动端抽屉依赖 translateX 隐藏，
   动画的 transform 会把它覆盖成常开） */
@media (min-width: 993px) {
  .tutorial-sidebar {
    animation: riseIn 0.5s var(--spring) 0.05s both;
  }
}

.ai-suggestion-card {
  animation: riseIn 0.55s var(--spring) 0.12s both;
}

/* 弱动效偏好：全部动画退化为瞬时 */
@media (prefers-reduced-motion: reduce) {
  .resources-page *,
  .resources-page *::before,
  .resources-page *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
