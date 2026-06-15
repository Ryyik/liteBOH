<template>
  <div class="boh-8-years-event">
    <!-- 公共导航栏 -->
    <UnifiedNavbar />

    <!-- 主内容区域 -->
    <main class="main-content">
      <!-- 周年标题区 -->
      <section class="anniversary-hero" ref="heroRef">
        <div class="hero-badge">8th Anniversary</div>
        <h2 class="hero-title">
          <span class="title-number">8</span>
          <span class="title-text">周年</span>
        </h2>
        <p class="hero-subtitle">与方块之家共同走过的第八年</p>
      </section>

      <!-- 卡片网格 -->
      <section class="cards-section">
        <!-- 卡片1：八周年特别海报 -->
        <article class="glass-card poster-card" ref="posterCardRef">
          <div class="card-header">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <h3 class="card-title">八周年特别海报</h3>
          </div>

          <div class="card-content">
            <!-- 卡片介绍 -->
            <div class="card-intro">
              <p class="intro-text">
                八周年海报将采用哈比快车谋杀案的布局方式，可选电子版与邮寄海报！
              </p>
            </div>

            <div class="poster-info">
              <p class="info-text credit-text">海报制作感谢 @小牛无聊</p>

              <!-- 流程图 UI -->
              <div class="flow-chart">
                <!-- Step 1 -->
                <div class="flow-step">
                  <div class="step-number">1</div>
                  <div class="step-content">
                    <h4 class="step-title">注册或登录你的方块账户</h4>
                    <div class="step-actions">
                      <template v-if="!isLoggedIn">
                        <router-link to="/join" class="step-btn primary">注册</router-link>
                        <span class="step-or">或</span>
                        <a href="javascript:;" class="step-btn secondary" @click="showLoginModal = true">登录</a>
                      </template>
                      <template v-else>
                        <span class="step-completed">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          已完成
                        </span>
                      </template>
                    </div>
                  </div>
                </div>

                <!-- 连接线 -->
                <div class="flow-connector">
                  <div class="connector-line"></div>
                </div>

                <!-- Step 2 -->
                <div class="flow-step">
                  <div class="step-number">2</div>
                  <div class="step-content">
                    <h4 class="step-title">上传你的个人 MC 皮肤</h4>
                    <p class="step-desc">若是 Little Skin 皮肤站用户，请先下载皮肤文件</p>
                    <div class="step-actions">
                      <a href="https://docs.qq.com/form/page/DRUJMRWNYTVBOckFS" target="_blank"
                        rel="noopener noreferrer" class="step-btn primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        上传皮肤
                      </a>
                      <a href="https://littleskin.cn" target="_blank" rel="noopener noreferrer" class="step-link">
                        Little Skin 下载皮肤 →
                      </a>
                    </div>
                  </div>
                </div>

                <!-- 连接线 -->
                <div class="flow-connector">
                  <div class="connector-line"></div>
                </div>

                <!-- Step 3 -->
                <div class="flow-step">
                  <div class="step-number">3</div>
                  <div class="step-content">
                    <h4 class="step-title">管理邮寄地址</h4>
                    <p class="step-desc">若为邮寄海报选项，请管理你的收货地址</p>
                    <div class="step-actions">
                      <a href="javascript:;" class="step-btn primary" @click="handleAddressClick">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        管理个人地址
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- 卡片2：八周年活动地图 -->
        <article class="glass-card map-card" ref="mapCardRef">
          <div class="card-header">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </div>
            <h3 class="card-title">八周年活动地图</h3>
          </div>

          <div class="card-content">
            <div class="map-preview" role="img" aria-label="活动地图预览">
              <div class="map-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span class="map-status">暂定</span>
              </div>
            </div>

            <div class="map-info">
              <p class="info-text">活动地图即将上线，敬请期待</p>
            </div>
          </div>
        </article>

        <!-- 卡片3：哈比快车海报角色表 -->
        <article class="glass-card character-table-card">
          <div class="card-header">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 class="card-title">哈比快车海报角色表</h3>
          </div>

          <div class="card-content">
            <div v-if="habitTrainPosterCharacters.length" class="character-table-wrap">
              <table class="character-table">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th>成员</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="character in habitTrainPosterCharacters" :key="character.id">
                    <td>{{ character.role }}</td>
                    <td>{{ character.member }}</td>
                    <td>{{ character.note }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span class="empty-title">暂时为空</span>
              <p class="empty-desc">角色分配确认后会在这里展示。</p>
            </div>
          </div>
        </article>

        <!-- 卡片4：校园设定集 -->
        <article class="glass-card campus-setting-card">
          <div class="card-header">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
                <path d="M22 10v6" />
              </svg>
            </div>
            <h3 class="card-title">校园设定集</h3>
          </div>

          <div class="card-content">
            <div v-if="campusSettingItems.length" class="setting-grid">
              <article v-for="item in campusSettingItems" :key="item.id" class="setting-item">
                <h4 class="setting-title">{{ item.title }}</h4>
                <p class="setting-desc">{{ item.description }}</p>
              </article>
            </div>
            <div v-else class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
                <path d="M9 9v.01" />
                <path d="M9 12v.01" />
                <path d="M9 15v.01" />
                <path d="M9 18v.01" />
              </svg>
              <span class="empty-title">暂时为空</span>
              <p class="empty-desc">校园世界观、场景与设定资料会在这里整理。</p>
            </div>
          </div>
        </article>

        <!-- 卡片5：拼豆 MC 皮肤 -->
        <article class="glass-card bead-skin-card">
          <div class="card-header">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <h3 class="card-title">拼豆 MC 皮肤</h3>
          </div>

          <div class="card-content">
            <div class="bead-skin-panel">
              <div class="bead-skin-copy">
                <span class="bead-skin-label">免费领取</span>
                <p class="bead-skin-text">上传你的 PCL 截图，即可免费获得拼豆。</p>
                <p class="bead-skin-credit">拼豆感谢 @橙子</p>
              </div>
              <a href="https://docs.qq.com/form/page/DVHRidUdzVnp2S1dm" target="_blank" rel="noopener noreferrer"
                class="step-btn primary bead-skin-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                上传 PCL 截图
              </a>
            </div>
          </div>
        </article>
      </section>

      <!-- 底部装饰 -->
      <footer class="page-footer">
        <p class="footer-text">Block of Home · 2018-2026</p>
      </footer>
    </main>

    <!-- 海报详情弹窗 -->
    <Transition name="modal">
      <div v-if="showPosterModal" class="modal-overlay" @click.self="closePosterDetail" role="dialog" aria-modal="true"
        aria-labelledby="poster-modal-title">
        <div class="modal-container glass-modal">
          <div class="modal-header">
            <h3 id="poster-modal-title" class="modal-title">八周年特别海报</h3>
            <button class="modal-close" @click="closePosterDetail" aria-label="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="poster-fullview">
              <div class="poster-full-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span>海报完整展示区域</span>
              </div>
            </div>
            <div class="modal-actions">
              <a href="https://docs.qq.com/form/page/DRUJMRWNYTVBOckFS" target="_blank" rel="noopener noreferrer"
                class="modal-btn primary">
                上传自定义海报
              </a>
              <button class="modal-btn secondary" @click="closePosterDetail">
                关闭
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const { isLoggedIn, showLoginModal } = storeToRefs(authStore)

// 响应式状态
const showPosterModal = ref(false)
const heroRef = ref(null)
const posterCardRef = ref(null)
const mapCardRef = ref(null)
const habitTrainPosterCharacters = [
  { id: 'ryyik-conductor', role: '列车长', member: 'ryyik', note: '' },
  { id: 'xiaoniu-coroner', role: '验尸官', member: '小牛', note: '' },
  { id: 'lf-rewinder', role: '回溯者', member: 'LF', note: '' },
  { id: 'end-assassin', role: '刺客', member: 'end', note: '' },
  { id: 'hamburger-arsonist', role: '纵火犯', member: '汉堡', note: '' },
  { id: 'baicheng-phantom', role: '幻灵', member: '百城', note: '' },
  { id: 'eleven-vulture', role: '秃鹫', member: '十一', note: '' },
  { id: 'yufuqu-physician-lover', role: '医师', member: 'yufuqu', note: '恋人' },
  { id: 'chengzi-fanatic-lover', role: '狂信者', member: '橙子', note: '恋人' },
  { id: 'teacher-ding-vigilante', role: '义警', member: '丁老师', note: '' },
  { id: 'baiye-bartender', role: '酒保', member: '白烨', note: '' },
  { id: '93-detective', role: '侦探', member: '93', note: '' },
  { id: 'chengyan-spy', role: '间谍', member: '程言', note: '' },
  { id: 'pufferfish-voodoo', role: '巫毒师', member: '河豚', note: '' },
  { id: 'heibai-bell-ringer', role: '敲钟人', member: '黑白', note: '' },
  { id: '91-apothecary', role: '制药师', member: '91', note: '' }
]
const campusSettingItems = []

//  Intersection Observer 实例
let observer = null

// 处理地址管理点击
const handleAddressClick = () => {
  if (isLoggedIn.value) {
    router.push('/user-space/gifts')
  } else {
    showLoginModal.value = true
  }
}

// 打开海报详情
const _openPosterDetail = () => {
  showPosterModal.value = true
  document.body.style.overflow = 'hidden'
}

// 关闭海报详情
const closePosterDetail = () => {
  showPosterModal.value = false
  document.body.style.overflow = ''
}

// 初始化滚动动画
const initScrollAnimations = () => {
  if (!window.IntersectionObserver) return

  const options = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  }

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in')
        observer.unobserve(entry.target)
      }
    })
  }, options)

  // 观察需要动画的元素
  const animatedElements = document.querySelectorAll('.glass-card')
  animatedElements.forEach((el) => {
    el.classList.add('animate-ready')
    observer.observe(el)
  })
}

// 键盘导航支持
const handleKeydown = (e) => {
  if (e.key === 'Escape' && showPosterModal.value) {
    closePosterDetail()
  }
}

onMounted(() => {
  initScrollAnimations()
  document.addEventListener('keydown', handleKeydown)

  // 初始动画
  if (heroRef.value) {
    heroRef.value.classList.add('animate-in')
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
@import './style.scoped.css';
</style>
