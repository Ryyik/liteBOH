<template>
    <div class="birthday-page">
        <!-- 公共导航栏 -->
        <UnifiedNavbar />

        <!-- 背景光效 (Soft Light Blobs) -->
        <div class="light-blob blob-1"></div>
        <div class="light-blob blob-2"></div>
        <div class="grain-overlay"></div>

        <!-- Global Blessing Popup -->
        <div class="global-blessing-popup" :class="{ 'show': showGlobalBlessing }">
            <span class="author" v-if="globalBlessingAuthor">{{ globalBlessingAuthor }}</span>
            <span class="message">{{ globalBlessingText }}</span>
        </div>

        <!-- 阶段一：极简开场 (Minimalist Hero) -->
        <transition name="fade-slide" mode="out-in">
            <div v-if="currentStage === 0" class="stage intro-stage" key="intro">
                <div class="hero-content">
                    <div class="hero-badge">
                        <span class="emoji">✨</span> 特别的一天
                    </div>
                    <h1 class="hero-title">
                        生日<br>
                        <span class="highlight-text">快乐</span>
                    </h1>
                    <p class="hero-subtitle">
                        {{ username }}，准备好迎接你的年度惊喜了吗？
                    </p>
                    <button class="primary-btn" @click="nextStage(1)">
                        开启旅程
                        <span class="btn-icon">→</span>
                    </button>
                </div>
            </div>
        </transition>

        <!-- 阶段二：回忆长廊 (Memory Gallery) -->
        <transition name="fade-slide" mode="out-in">
            <div v-if="currentStage === 1" class="stage journey-stage" key="journey">
                <div class="stage-header">
                    <h2 class="section-title">时光印记</h2>
                    <p class="section-desc">每一个瞬间都值得铭记</p>
                </div>

                <div class="gallery-grid">
                    <div class="gallery-card card-1" style="--delay: 0.1s">
                        <div class="card-image gradient-1"></div>
                        <div class="card-info">
                            <span class="year">2023</span>
                            <h3>初次相遇</h3>
                        </div>
                    </div>
                    <div class="gallery-card card-2" style="--delay: 0.2s">
                        <div class="card-image gradient-2"></div>
                        <div class="card-info">
                            <span class="year">2024</span>
                            <h3>高光时刻</h3>
                        </div>
                    </div>
                    <div class="gallery-card card-3" style="--delay: 0.3s">
                        <div class="card-image gradient-3"></div>
                        <div class="card-info">
                            <span class="year">未来</span>
                            <h3>无限可能</h3>
                        </div>
                    </div>
                </div>

                <div class="typewriter-container">
                    <p class="typewriter-text">{{ typewriterText }}<span class="cursor">|</span></p>
                </div>

                <button class="floating-fab" @click="nextStage(2)">
                    继续
                </button>
            </div>
        </transition>

        <!-- 阶段三：极简蜡烛 (Minimal Candle) -->
        <transition name="fade-scale" mode="out-in">
            <div v-if="currentStage === 2" class="stage cake-stage" key="cake">
                <div class="candle-wrapper">
            <div class="flame-container" ref="flameRef" :class="{ 'blown': isCandleBlown, 'blowing': isBlowing }">
                <div class="flame-core"></div>
                <div class="flame-halo"></div>
            </div>
            <div class="smoke" :class="{ 'show-smoke': showSmoke }"></div>
            <div class="candle-stick"></div>
            <div class="candle-shadow"></div>
        </div>

        <div class="interaction-hint" :class="{ 'fade-out': isCandleBlown || isBlowing }">
            <h3>许个愿吧</h3>
            <p>正在为你吹灭蜡烛...</p>
        </div>
            </div>
        </transition>

        <!-- 新增阶段：互动祝福 (Interactive Blessings) -->
        <transition name="fade-slide" mode="out-in">
            <div v-if="currentStage === 3" class="stage interactive-stage" key="interactive">
                <div class="stage-header">
                    <h2 class="section-title">点亮祝福</h2>
                    <p class="section-desc">点击气球，收集你的专属祝福</p>
                </div>

                <div class="balloons-container">
                    <div v-for="(balloon, index) in balloons" :key="balloon.id" class="balloon-item"
                        :class="{ 'popped': balloon.popped }" :style="{
                            left: balloon.left + '%',
                            top: balloon.top + '%',
                            animationDelay: balloon.delay + 's',
                            animationDuration: balloon.duration + 's',
                            backgroundColor: balloon.color
                        }" @click="popBalloon(index, $event)">
                        <span class="balloon-string"></span>
                    </div>
                </div>

                <button class="floating-fab" @click="nextStage(4)" v-if="poppedCount >= 3">
                    继续
                </button>
            </div>
        </transition>

        <!-- 阶段四：祝福留言墙 (Wishes Wall - New Feature) -->
        <transition name="fade-slide" mode="out-in">
            <div v-if="currentStage === 4" class="stage wishes-stage" key="wishes">
                <div class="stage-header">
                    <h2 class="section-title">留下期许</h2>
                    <p class="section-desc">写下给明年自己的话</p>
                </div>

                <!-- Polaroid Stack -->
                <div class="polaroid-section" v-if="!showCamera">
                    <div class="polaroid-stack" @click="nextPolaroid">
                        <transition-group name="stack-card">
                            <div v-for="(photo, index) in visiblePolaroids" :key="photo.id" class="polaroid-card"
                                :style="{ zIndex: visiblePolaroids.length - index, '--rot': photo.rotation + 'deg' }">
                                <div class="photo-visual" :style="{ backgroundImage: `url(${photo.image})` }"></div>
                                <div class="photo-footer">
                                    <span class="photo-caption">{{ photo.caption }}</span>
                                    <span class="photo-date">{{ photo.date }}</span>
                                </div>
                            </div>
                        </transition-group>
                    </div>
                    <p class="polaroid-hint">点击翻阅美好瞬间</p>

                    <button class="secondary-btn" @click="activateCamera" style="margin-top: 30px;">
                        记录此刻
                    </button>
                </div>

                <!-- Camera Section -->
                <transition name="fade-slide">
                    <div v-if="showCamera" class="camera-section">
                        <div class="camera-body" @click="takePhoto" :class="{ 'flash-active': isFlashing }">
                            <div class="camera-lens">
                                <div class="lens-reflection"></div>
                            </div>
                            <div class="camera-flash"></div>
                            <div class="camera-shutter"></div>

                            <!-- Printed Photo -->
                            <div class="printed-photo" :class="{ 'printing': isPrinting }">
                                <div class="photo-content">
                                    <div class="photo-image">
                                        🎂
                                    </div>
                                    <div class="photo-text">
                                        <h2>生日快乐</h2>
                                        <p>{{ username }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p class="camera-hint" v-if="!isPrinting">点击相机拍照</p>

                        <div v-if="photoPrinted" class="camera-actions">
                            <button class="primary-btn" @click="nextStage(5)">
                                领取礼物 →
                            </button>
                        </div>
                    </div>
                </transition>

                <!-- Wishes List Hidden as per user request to focus on camera -->
                <div class="wishes-list" ref="wishesContainer" v-if="false">
                    <transition-group name="list">
                        <div v-for="wish in wishes" :key="wish.id" class="wish-card" :style="{ '--delay': wish.delay }">
                            <div class="wish-avatar">{{ wish.avatar }}</div>
                            <div class="wish-content">
                                <p class="wish-text">{{ wish.text }}</p>
                                <span class="wish-author">{{ wish.author }}</span>
                            </div>
                        </div>
                    </transition-group>
                </div>

                <div class="wish-input-area" v-if="false">
                    <input type="text" v-model="newWish" placeholder="输入你的愿望..." @keyup.enter="addWish"
                        :disabled="hasWished">
                    <button class="send-btn" @click="addWish" :disabled="!newWish || hasWished">
                        {{ hasWished ? '已发送' : '发送' }}
                    </button>
                </div>

                <div v-if="hasWished" class="continue-hint" @click="nextStage(5)">
                    查看礼物 →
                </div>
            </div>
        </transition>

        <!-- 阶段五：礼物卡片 (Gift Card) -->
        <transition name="flip-reveal" mode="out-in">
            <div v-if="currentStage === 5" class="stage climax-stage" key="climax">
                <div class="gift-container">
                    <h2 class="gift-title">你的专属礼物</h2>

                    <div class="premium-card">
                        <div class="card-shine"></div>
                        <div class="card-top">
                            <span class="brand">BOH CARD</span>
                            <span class="card-type">PLATINUM</span>
                        </div>

                        <div class="card-scratch-area">
                            <div class="card-code">
                                <span>BOH-2026-生日礼品卡</span>
                            </div>
                            <canvas ref="scratchCanvas" width="292" height="50" @mousedown="startScratch"
                                @mousemove="scratch" @mouseup="stopScratch" @touchstart="startScratch"
                                @touchmove="scratch" @touchend="stopScratch">
                            </canvas>
                        </div>

                        <div class="card-bottom">
                            <div class="card-holder">
                                <span class="label">MEMBER</span>
                                <span class="value">{{ username }}</span>
                            </div>
                            <div class="card-valid">
                                <span class="label">VALID THRU</span>

                            </div>
                        </div>
                    </div>

                    <p class="gift-hint">刮开涂层获取兑换码</p>

                    <div class="action-buttons">
                        <button class="secondary-btn" @click="openBlessingSelection" :disabled="isGeneratingPoster">
                            {{ isGeneratingPoster ? '生成中...' : '分享祝福' }}
                        </button>
                        <button class="secondary-btn" @click="restart">
                            重播回忆
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- Share Poster (Hidden for rendering) -->
        <div class="poster-container">
            <div ref="posterRef" class="share-poster">
                <div class="poster-bg"></div>
                <div class="poster-content">
                    <div class="poster-top">
                        <span class="poster-logo">BOH LITE</span>
                        <span class="poster-date">{{ currentDate }}</span>
                    </div>
                    <div class="poster-main">
                        <h1 class="poster-title">HAPPY BIRTHDAY</h1>
                        <h2 class="poster-name">{{ username }}</h2>
                        <div class="poster-divider"></div>
                        <p class="poster-blessing">{{ globalBlessingText || "愿你前程似锦，岁岁平安！" }}</p>
                    </div>
                    <div class="poster-bottom">
                        <div class="poster-code">
                            <div class="qr-placeholder">🎁</div>
                            <span>扫码领取</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Poster Modal -->
        <div v-if="showPosterModal" class="poster-modal" @click="closePosterModal">
            <div class="poster-preview" @click.stop>
                <img :src="posterImage" alt="Poster" />
                <p>长按保存图片</p>
                <button class="close-modal-btn" @click="closePosterModal">✕</button>
            </div>
        </div>

        <!-- Blessing Selection Modal -->
        <div v-if="showBlessingSelectModal" class="poster-modal" @click="closeBlessingSelectModal">
            <div class="blessing-select-panel" @click.stop>
                <h3>选择您的专属祝福</h3>
                <div class="blessing-list">
                    <div v-for="(wish, index) in wishes" :key="wish.id" class="blessing-option"
                        :class="{ 'selected': selectedBlessing === wish.text }" @click="selectedBlessing = wish.text">
                        <div class="blessing-text">{{ wish.text }}</div>
                        <div class="blessing-author">— {{ wish.author }}</div>
                    </div>
                </div>
                <div class="blessing-actions">
                    <button class="secondary-btn small" @click="closeBlessingSelectModal">取消</button>
                    <button class="primary-btn small" @click="confirmGeneratePoster" :disabled="isGeneratingPoster">
                        {{ isGeneratingPoster ? '生成中...' : '生成海报' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import UnifiedNavbar from "@/components/UnifiedNavbar.vue";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

// Utility: Delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Import polaroid images
import imgWanxia from "@/assets/images/26wanxia.webp";
import imgQiuqian from "@/assets/images/qiuqian.webp";
import imgShengri from "@/assets/images/2025-10-shengri.webp";
import imgHezhao from "@/assets/images/26hezhao1.webp";

// --- State ---
const currentStage = ref(0); // 0: Intro, 1: Journey, 2: Cake, 3: Wishes, 4: Climax
const username = computed(() => userInfo.value.username || '朋友');
const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const isCandleBlown = ref(false);
const isBlowing = ref(false);
const showSmoke = ref(false);
const typewriterText = ref("");

// Global Blessing State
const globalBlessingText = ref("");
const globalBlessingAuthor = ref("");
const showGlobalBlessing = ref(false);
let blessingTimer = null;

const triggerBlessing = (text = null, author = null) => {
    // If specific text/author provided (from balloon), use it.
    // Otherwise use random generic blessing.
    if (text) {
        globalBlessingText.value = text;
        globalBlessingAuthor.value = author || "";
    } else {
        const randomText = blessingList[Math.floor(Math.random() * blessingList.length)];
        globalBlessingText.value = randomText;
        globalBlessingAuthor.value = ""; // No author for generic
    }

    showGlobalBlessing.value = true;

    // Reset animation if needed
    showGlobalBlessing.value = false;
    nextTick(() => {
        showGlobalBlessing.value = true;
    });

    if (blessingTimer) clearTimeout(blessingTimer);
    blessingTimer = setTimeout(() => {
        showGlobalBlessing.value = false;
    }, 4000);
};

// Interactive Balloons
const balloons = ref([]);
const poppedCount = ref(0);
// Removed local currentBlessing
const blessingList = [
    "愿你每天开心快乐！",
    "心想事成，万事如意！",
    "身体健康，永远年轻！",
    "好运连连，惊喜不断！",
    "未来可期，光芒万丈！",
    "平安喜乐，岁岁无忧！"
];

const initBalloons = () => {
    // Generate balloons based on wishes
    // Only use default wishes (ID <= 6) for balloons to avoid user duplicates if re-entering
    const defaultWishes = wishes.value.filter(w => w.id <= 6);

    // Create a grid (2 rows x 3 cols) to avoid overlap
    const rows = 2;
    const cols = 3;
    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            cells.push({ r, c });
        }
    }

    // Shuffle grid cells
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    balloons.value = defaultWishes.map((wish, i) => {
        // Assign a random cell from shuffled list (loop if more balloons than cells)
        const cell = cells[i % cells.length];

        // Define grid area (10% to 90% width, 10% to 60% height)
        const areaW = 80; // percent width
        const areaH = 50; // percent height
        const startX = 10;
        const startY = 10;

        const cellW = areaW / cols;
        const cellH = areaH / rows;

        // Add random offset within the cell (padding 5% to avoid edge overlap)
        const offsetX = Math.random() * (cellW - 10) + 5;
        const offsetY = Math.random() * (cellH - 10) + 5;

        const left = startX + (cell.c * cellW) + offsetX;
        const top = startY + (cell.r * cellH) + offsetY;

        return {
            id: wish.id,
            wish: wish, // Store the wish object
            left: left,
            top: top,
            delay: Math.random() * 2, // Staggered start
            duration: Math.random() * 2 + 3, // Floating animation duration
            color: `hsl(${Math.random() * 360}, 85%, 65%)`,
            popped: false
        };
    });
    poppedCount.value = 0;
    showGlobalBlessing.value = false;
};

const popBalloon = (index, event) => {
    if (balloons.value[index].popped) return;

    balloons.value[index].popped = true;

    // Show specific wish blessing
    const wish = balloons.value[index].wish;
    triggerBlessing(wish.text, wish.author);

    poppedCount.value++;

    // Confetti burst at click position
    if (event) {
        const x = event.clientX / window.innerWidth;
        const y = event.clientY / window.innerHeight;
        confetti({
            particleCount: 30,
            spread: 50,
            origin: { x, y }
        });
    } else {
        // Fallback if no event
        confetti({
            particleCount: 30,
            spread: 50,
            origin: { y: 0.6 }
        });
    }
};

// Polaroid Logic
const polaroids = ref([
    { id: 1, caption: "初次相遇", date: "2025.08", image: imgWanxia, rotation: -2 },
    { id: 2, caption: "水牛派来袭", date: "2025.09", image: imgQiuqian, rotation: 3 },
    { id: 3, caption: "牛儿中奖", date: "2025.10", image: imgShengri, rotation: -4 },
    { id: 4, caption: "冬眠生存", date: "2026.01", image: imgHezhao, rotation: 2 }
]);

const visiblePolaroids = computed(() => {
    return polaroids.value.slice(0, 3); // Show top 3
});

const nextPolaroid = () => {
    // Move first item to end
    const first = polaroids.value.shift();
    // Randomize rotation slightly for natural feel when it comes back
    first.rotation = (Math.random() * 10) - 5;
    polaroids.value.push(first);
    // Removed blessing trigger as per user request for simpler interaction
};

const showCamera = ref(false);
const isFlashing = ref(false);
const isPrinting = ref(false);
const photoPrinted = ref(false);

const activateCamera = () => {
    showCamera.value = true;
};

const takePhoto = async () => {
    if (isPrinting.value || photoPrinted.value) return;

    // Flash effect
    isFlashing.value = true;
    await delay(100);
    isFlashing.value = false;

    // Start printing
    isPrinting.value = true;
    await delay(3000);

    photoPrinted.value = true;
    fireConfetti();
};

// Wishes State
const newWish = ref("");
const hasWished = ref(false);
const wishes = ref([
    { id: 1, text: "牛儿生日快乐！哞花，新的一岁语言系统请更加完善好吗。找完茬再说对不起？！谢谢。", author: "Ryyik", avatar: "R", delay: '0s' },
    { id: 2, text: "女孩子不要捡别人袜子了", author: "十一", avatar: "E", delay: '0.1s' },
    { id: 3, text: "李小姐生日快乐", author: "End", avatar: "End", delay: '0.2s' },
    { id: 4, text: "牟～牟，牟牟牟～牟，牟，牟～", author: "小牛无聊", avatar: "小牛", delay: '0.2s' },
    { id: 5, text: "女孩子生日快乐 刚认识就是你的生日我觉得也是一种缘分啦 和你在一起玩也很开心 很舒服很自在 还有幸当了一次情侣（狼人杀） 希望你的大学生涯很美满 也祝你天天开心 生日快乐啦", author: "橙子", avatar: "橙", delay: '0.2s' },
    { id: 6, text: "超搞笑级的女孩子继续懵逼的高高兴兴的活下去吧！", author: "LF", avatar: "L", delay: '0.2s' }
]);

// Typewriter Logic
const fullText = "时光荏苒，又是一年精彩。\n愿你的下一章更加辉煌。";
let typeInterval = null;

const nextStage = (next) => {
    currentStage.value = next;
    if (next === 1) {
        setTimeout(startTypewriter, 500);
    } else if (next === 2) {
        // Auto blow candle
        setTimeout(autoBlow, 500);
    } else if (next === 3) {
        // Init Balloons
        setTimeout(initBalloons, 100);
    } else if (next === 5) {
        nextTick(initScratchCard);
    }
};

const startTypewriter = () => {
    let i = 0;
    typewriterText.value = "";
    if (typeInterval) clearInterval(typeInterval);
    typeInterval = setInterval(() => {
        if (i < fullText.length) {
            typewriterText.value += fullText.charAt(i);
            i++;
        } else {
            clearInterval(typeInterval);
        }
    }, 50);
};

// Candle Logic
const autoBlow = () => {
    // 1. Wait for user to realize ("Make a wish")
    setTimeout(() => {
        // 2. Pre-blow animation (simulate breath / wind)
        isBlowing.value = true;
        
        // 3. Blow out
        setTimeout(() => {
            isBlowing.value = false;
            isCandleBlown.value = true;
            showSmoke.value = true; // Show smoke
            
            fireConfetti();
            
            // 4. Proceed to next stage
            setTimeout(() => {
                nextStage(3);
            }, 3000); // Give time for smoke to rise
        }, 1200); // Blowing duration
    }, 2000);
};

// Wish Logic
const addWish = () => {
    if (!newWish.value.trim() || hasWished.value) return;

    const wish = {
        id: Date.now(),
        text: newWish.value,
        author: username.value,
        avatar: "🎂",
        delay: '0s'
    };

    wishes.value.unshift(wish);
    newWish.value = "";
    hasWished.value = true;

    // Auto proceed after short delay
    setTimeout(() => {
        fireConfetti();
        triggerBlessing();
    }, 500);
};

// Scratch Card Logic
const scratchCanvas = ref(null);
let ctx = null;
let isScratching = false;

const initScratchCard = () => {
    if (!scratchCanvas.value) return;
    const canvas = scratchCanvas.value;
    ctx = canvas.getContext('2d');

    // Create foil effect
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#E0E0E0');
    gradient.addColorStop(0.5, '#FFFFFF');
    gradient.addColorStop(1, '#E0E0E0');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add pattern
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    for (let i = 0; i < canvas.width; i += 4) {
        ctx.fillRect(i, 0, 1, canvas.height);
    }

    // Text
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.fillText('刮开涂层', canvas.width / 2, canvas.height / 2 + 5);

    ctx.globalCompositeOperation = 'destination-out';
};

const getPos = (e) => {
    const canvas = scratchCanvas.value;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
};

const startScratch = (e) => { isScratching = true; scratch(e); };
const stopScratch = () => { isScratching = false; };
const scratch = (e) => {
    if (!isScratching || !ctx) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
    ctx.fill();
};

const restart = () => {
    currentStage.value = 0;
    isCandleBlown.value = false;
    isBlowing.value = false;
    showSmoke.value = false;
    hasWished.value = false;
    typewriterText.value = "";
    wishes.value = wishes.value.filter(w => w.id <= 6); // Reset to default wishes (IDs 1-6)

    // Clear global blessing
    showGlobalBlessing.value = false;
    globalBlessingText.value = "";

    // Ensure flame reset
    const flame = document.querySelector('.flame-container');
    if (flame) {
        flame.style = '';
        flame.classList.remove('blown');
    }
};

// Confetti
const fireConfetti = () => {
    const colors = ['#000000', '#FFD700', '#E5E5EA', '#FF3B30'];
    for (let i = 0; i < 100; i++) {
        const el = document.createElement('div');
        el.classList.add('confetti');
        document.body.appendChild(el);

        const x = Math.random() * 100;
        const color = colors[Math.floor(Math.random() * colors.length)];

        el.style.left = x + 'vw';
        el.style.backgroundColor = color;
        el.style.animationDuration = (Math.random() * 2 + 2) + 's';

        setTimeout(() => el.remove(), 4000);
    }
};

// --- Share Poster Logic ---
const posterRef = ref(null);
const posterImage = ref(null);
const showPosterModal = ref(false);
const isGeneratingPoster = ref(false);

// Blessing Selection Logic
const showBlessingSelectModal = ref(false);
const selectedBlessing = ref("");

const openBlessingSelection = () => {
    // Set default selection if none
    if (!selectedBlessing.value) {
        // Default to first user wish or global blessing if empty
        selectedBlessing.value = wishes.value.length > 0 ? wishes.value[0].text : blessingList[0];
    }
    showBlessingSelectModal.value = true;
};

const closeBlessingSelectModal = () => {
    showBlessingSelectModal.value = false;
};

const confirmGeneratePoster = () => {
    showBlessingSelectModal.value = false;
    // Use the selected blessing for the poster
    // We update the globalBlessingText temporarily for the poster generation
    // Ideally, the poster template should use selectedBlessing directly if available, or fall back to globalBlessingText
    // But modifying the template is cleaner.
    // Let's modify the template to use a computed property or just use selectedBlessing logic in generatePoster.
    // Actually, simply setting globalBlessingText works if we don't mind overwriting the last popped blessing.
    // Or better, let's make the poster use `posterBlessingText` computed property.

    // For simplicity and effectiveness, let's update globalBlessingText to selectedBlessing
    // But wait, the user might have popped a balloon and wants to keep that? 
    // The requirement is "give user a choice". So the user choice should override.
    globalBlessingText.value = selectedBlessing.value;

    generatePoster();
};

const generatePoster = async () => {
    if (isGeneratingPoster.value) return;
    isGeneratingPoster.value = true;

    try {
        await nextTick(); // Ensure DOM is ready
        // Wait a bit for images to load if any (though they should be loaded)
        await delay(500); // Increased delay for stability

        const canvasPromise = html2canvas(posterRef.value, {
            backgroundColor: '#ffffff',
            scale: 2, // High resolution
            useCORS: true,
            logging: true, // Enable logging for debugging
            allowTaint: false, // Must be false for toDataURL
        });

        // 10s timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("生成超时，请检查网络或重试")), 10000)
        );

        const canvas = await Promise.race([canvasPromise, timeoutPromise]);

        posterImage.value = canvas.toDataURL("image/png");
        showPosterModal.value = true;
    } catch (error) {
        console.error("Failed to generate poster:", error);
        triggerBlessing(error.message || "生成海报失败，请重试");
    } finally {
        isGeneratingPoster.value = false;
    }
};

const closePosterModal = () => {
    showPosterModal.value = false;
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');

/* --- Global Blessing Popup (Minimalist Apple Style) --- */
.global-blessing-popup {
    position: fixed;
    top: 120px;
    left: 50%;
    transform: translateX(-50%) translateY(-20px);
    background: rgba(255, 255, 255, 0.85);
    padding: 16px 32px;
    border-radius: 100px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    font-size: 16px;
    color: #1d1d1f;
    opacity: 0;
    pointer-events: none;
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 100;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 0, 0, 0.05);
    text-align: center;
    max-width: 90%;
    display: flex;
    align-items: center;
    gap: 12px;
}

.global-blessing-popup .author {
    font-size: 13px;
    color: #86868b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
}

.global-blessing-popup .author::after {
    content: "|";
    margin-left: 12px;
    color: #e5e5e5;
    font-weight: 300;
}

.global-blessing-popup .message {
    font-size: 16px;
    font-weight: 500;
    color: #1d1d1f;
    line-height: 1.2;
}

.global-blessing-popup.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

/* --- Apple Style Camera Section --- */
.camera-section {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    /* Pure white background as requested */
}

.camera-body {
    width: 300px;
    height: 200px;
    background: #e5e5e5;
    border-radius: 40px;
    position: relative;
    box-shadow:
        0 20px 50px rgba(0, 0, 0, 0.15),
        inset 0 2px 5px rgba(255, 255, 255, 0.8),
        inset 0 -2px 5px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.camera-body:active {
    transform: scale(0.98);
}

.camera-lens {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: #1d1d1f;
    border: 8px solid #d2d2d7;
    position: relative;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    overflow: hidden;
}

.lens-reflection {
    position: absolute;
    top: 20%;
    right: 20%;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    filter: blur(2px);
}

.camera-flash {
    position: absolute;
    top: 20px;
    right: 30px;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
}

.camera-shutter {
    position: absolute;
    top: -10px;
    right: 60px;
    width: 40px;
    height: 20px;
    background: #ff3b30;
    border-radius: 10px 10px 0 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.flash-active::after {
    content: '';
    position: fixed;
    inset: 0;
    background: white;
    z-index: 999;
    animation: flash 0.1s ease-out;
}

@keyframes flash {
    0% {
        opacity: 0;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0;
    }
}

.printed-photo {
    position: absolute;
    bottom: 20px;
    width: 220px;
    height: 280px;
    background: white;
    padding: 15px 15px 40px 15px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
    transform: translateY(0) scale(0.8);
    opacity: 0;
    z-index: -1;
    transition: all 3s cubic-bezier(0.25, 1, 0.5, 1);
    display: flex;
    flex-direction: column;
}

.printed-photo.printing {
    transform: translateY(280px) scale(1);
    opacity: 1;
    z-index: 10;
}

.photo-image {
    flex: 1;
    background: #1d1d1f;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 60px;
    color: white;
    overflow: hidden;
}

.photo-text {
    text-align: center;
    margin-top: 15px;
}

.photo-text h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: #1d1d1f;
    font-family: 'SF Pro Display', sans-serif;
}

.photo-text p {
    font-size: 14px;
    color: #86868b;
    margin: 4px 0 0 0;
}

.camera-hint {
    margin-top: 40px;
    font-size: 16px;
    color: #86868b;
    font-weight: 500;
}

/* --- Mobile Adaptation & Camera Layout Fix --- */
@media (max-width: 768px) {
    .camera-body {
        width: 240px;
        height: 160px;
        border-radius: 30px;
        /* Move camera up slightly to make room for photo */
        transform: translateY(-40px);
    }

    .camera-lens {
        width: 100px;
        height: 100px;
        border-width: 6px;
    }

    .printed-photo {
        width: 180px;
        height: 230px;
        bottom: 10px;
        /* Adjust starting position relative to smaller camera */
    }

    .printed-photo.printing {
        /* Print out distance adapted for mobile */
        transform: translateY(220px) scale(1);
    }

    /* Fix Button Obstruction:
       Position button relative to the bottom of the viewport with high Z-index 
       and ensure it's visually distinct */
    .camera-actions {
        bottom: 80px;
        /* Higher up */
        z-index: 50;
        width: 100%;
        display: flex;
        justify-content: center;
    }

    .primary-btn {
        padding: 14px 32px;
        font-size: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        /* Stronger shadow for separation */
    }

    .global-blessing-popup {
        top: 100px;
        width: 85%;
        padding: 12px 20px;
        flex-direction: column;
        gap: 4px;
        border-radius: 20px;
        /* Less rounded on mobile for text space */
    }

    .global-blessing-popup .author::after {
        content: "";
        /* Remove separator on mobile vertical layout */
        margin: 0;
    }

    .global-blessing-popup .author {
        font-size: 12px;
        margin-bottom: 2px;
    }
}

/* Fix for desktop layout to avoid button overlap */
.camera-actions {
    position: absolute;
    bottom: 80px;
    /* Move up from 50px */
    z-index: 50;
    /* Ensure it's above other elements if needed, but below photo if we want photo to cover it? 
                    No, button should be clickable. */
    animation: fadeSlideUp 0.8s ease-out;
}

/* Make sure photo stays behind button if button is meant to be overlay, 
   OR move button lower. 
   Actually, if photo prints DOWN, it might cover button at bottom: 80px.
   Let's ensure the printed photo z-index is lower than button.
*/
.printed-photo {
    /* ... existing styles ... */
    z-index: 5;
    /* Lower than button (50) */
}

.printed-photo.printing {
    z-index: 20;
    /* When printing, it needs to be visible. 
                    If button is at z-index 50, button will float ON TOP of photo. 
                    This is acceptable and ensures clickability. */
}

/* --- Apple Style Enhancements --- */
.birthday-page {
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    background-color: #ffffff !important;
    /* Force white background */
    color: #1d1d1f;
    /* Dark text for white background */
    font-family: "SF Pro Text", "SF Pro Display", system-ui, -apple-system, sans-serif;
    letter-spacing: -0.022em;
    overflow-x: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    padding-top: 60px;
    /* Make space for navbar */
}

.primary-btn {
    background: #0071e3;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 980px;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(20px);
}

.primary-btn:hover {
    background: #0077ed;
    transform: scale(1.02);
}

.secondary-btn {
    background: rgba(29, 29, 31, 0.05);
    color: #1d1d1f;
    border: none;
    padding: 12px 24px;
    border-radius: 980px;
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(10px);
}

.secondary-btn:hover {
    background: rgba(29, 29, 31, 0.1);
}

.section-title {
    font-size: 40px;
    font-weight: 700;
    background: linear-gradient(135deg, #1d1d1f 0%, #434344 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
}

.section-desc {
    font-size: 21px;
    line-height: 1.4;
    font-weight: 400;
    color: #86868b;
}

/* Enhanced Polaroid Stack */
.polaroid-card {
    box-shadow:
        0 15px 35px rgba(0, 0, 0, 0.1),
        0 5px 15px rgba(0, 0, 0, 0.05);
    transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.polaroid-section {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.polaroid-hint {
    margin-top: 20px;
    color: #86868b;
    font-size: 14px;
    font-weight: 500;
    opacity: 0.8;
}

/* Background Effects */
.light-blob {
    display: none;
    /* Hidden for pure white background */
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: blobFloat 20s infinite alternate;
    pointer-events: none;
}

.blob-1 {
    top: -10%;
    right: -10%;
    width: 600px;
    height: 600px;
    background: #E0F2FE;
    /* Soft Blue */
}

.blob-2 {
    bottom: -10%;
    left: -10%;
    width: 500px;
    height: 500px;
    background: #F3E8FF;
    /* Soft Purple */
}

@keyframes blobFloat {
    0% {
        transform: translate(0, 0) scale(1);
    }

    100% {
        transform: translate(20px, 40px) scale(1.1);
    }
}

.grain-overlay {
    display: none;
    /* Hidden for pure white background */
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
}

/* Common Layout */
.stage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 1;
}

/* Stage 1: Intro */
.hero-content {
    text-align: center;
    max-width: 600px;
}

.hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #fff;
    border-radius: 100px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 24px;
    color: #555;
}

.hero-title {
    font-size: 72px;
    font-weight: 900;
    line-height: 0.95;
    letter-spacing: -3px;
    margin-bottom: 24px;
    color: #111;
}

.highlight-text {
    background: linear-gradient(120deg, #111 0%, #444 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

.hero-subtitle {
    font-size: 18px;
    color: #666;
    margin-bottom: 48px;
    font-weight: 500;
}

.primary-btn {
    padding: 18px 48px;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 100px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

.primary-btn:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

/* Stage 2: Journey */
.stage-header {
    text-align: center;
    margin-bottom: 40px;
}

.section-title {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -1px;
    margin-bottom: 8px;
}

.section-desc {
    color: #888;
    font-size: 15px;
}

.gallery-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    width: 100%;
    max-width: 800px;
    margin-bottom: 40px;
}

.gallery-card {
    background: #fff;
    border-radius: 24px;
    padding: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.02);
    animation: slideUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    animation-delay: var(--delay);
    opacity: 0;
    transform: translateY(30px);
}

.card-1 {
    grid-column: span 2;
}

.card-image {
    height: 140px;
    border-radius: 16px;
    margin-bottom: 12px;
}

.gradient-1 {
    background: linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%);
}

.gradient-2 {
    background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);
}

.gradient-3 {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
}

.card-info {
    padding: 0 8px 8px;
}

.year {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #aaa;
    margin-bottom: 4px;
}

.gallery-card h3 {
    font-size: 16px;
    font-weight: 700;
    margin: 0;
}

.floating-fab {
    position: absolute;
    bottom: 40px;
    padding: 16px 32px;
    background: #fff;
    border: 1px solid #eee;
    border-radius: 100px;
    font-weight: 600;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: transform 0.2s;
}

.floating-fab:hover {
    transform: translateY(-2px);
}

/* Stage 3: Cake */
.candle-wrapper {
    position: relative;
    width: 60px;
    height: 200px;
    margin-bottom: 40px;
    cursor: pointer;
}

/* --- Interactive Balloons Stage --- */
.interactive-stage {
    overflow: hidden;
    /* Ensure balloons don't overflow */
    position: absolute;
    width: 100%;
    height: 100%;
}

.balloons-container {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 10;
}

.balloon-item {
    position: absolute;
    /* Start position will be handled by 'top' in inline style */
    /* Remove bottom: -150px as we use top positioning now */
    width: 60px;
    height: 80px;
    border-radius: 50%;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.2s ease, opacity 0.2s ease;
    animation: floatHover ease-in-out infinite alternate;
    /* Changed animation */
    display: flex;
    justify-content: center;
    box-shadow: inset -5px -5px 10px rgba(0, 0, 0, 0.1), 2px 2px 5px rgba(0, 0, 0, 0.1);
}

.balloon-item.popped {
    animation-play-state: paused !important;
    transform: scale(1.5) !important;
    opacity: 0 !important;
    pointer-events: none;
    transition: all 0.2s ease-out;
}

.balloon-string {
    position: absolute;
    bottom: -60px;
    width: 2px;
    height: 60px;
    background: rgba(0, 0, 0, 0.3);
}

@keyframes floatHover {
    0% {
        transform: translateY(0) rotate(-2deg);
    }

    100% {
        transform: translateY(-20px) rotate(2deg);
    }
}

.blessing-popup {
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.9);
    padding: 16px 32px;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    font-size: 18px;
    font-weight: 700;
    color: #ff6b6b;
    opacity: 0;
    transition: all 0.5s ease;
    pointer-events: none;
}

.blessing-popup.show {
    opacity: 1;
    top: 15%;
}

.candle-stick {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 30px;
    box-shadow:
        inset -10px 0 20px rgba(0, 0, 0, 0.05),
        0 20px 40px rgba(0, 0, 0, 0.1);
}

.flame-container {
    position: absolute;
    top: -50px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 60px;
    transition: all 0.3s;
}

.flame-core {
    width: 100%;
    height: 100%;
    background: linear-gradient(to bottom, #FFF5C3, #FF9F43);
    border-radius: 50% 50% 30% 30%;
    filter: blur(2px);
    animation: flicker 1s infinite alternate;
}

.flame-halo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 120px;
    height: 120px;
    background: radial-gradient(circle, rgba(255, 159, 67, 0.2) 0%, transparent 70%);
    border-radius: 50%;
}

.blown {
    opacity: 0;
    transform: translateY(-20px) scale(0.5);
}

/* Shaking/Blowing Animation */
@keyframes shake {
    0%, 100% { transform: translateX(-50%) rotate(0deg) skewX(0deg); }
    25% { transform: translateX(-50%) rotate(5deg) skewX(5deg); }
    50% { transform: translateX(-50%) rotate(-5deg) skewX(-5deg); }
    75% { transform: translateX(-50%) rotate(3deg) skewX(3deg); }
}

@keyframes blow-out-sequence {
    0% { transform: translateX(-50%) scale(1) skewX(0); opacity: 1; }
    10% { transform: translateX(-50%) scale(0.95) skewX(5deg); opacity: 0.95; }
    20% { transform: translateX(-50%) scale(1.05) skewX(-5deg); opacity: 0.9; }
    30% { transform: translateX(-50%) scale(0.9) skewX(10deg); opacity: 0.85; }
    40% { transform: translateX(-50%) scale(1.1) skewX(-15deg); opacity: 0.8; }
    50% { transform: translateX(-50%) scale(0.8) skewX(20deg); opacity: 0.7; }
    60% { transform: translateX(-50%) scale(1.2) skewX(-20deg); opacity: 0.6; }
    70% { transform: translateX(-50%) scale(0.6) skewX(10deg); opacity: 0.5; }
    80% { transform: translateX(-50%) scale(0.4) skewX(5deg); opacity: 0.3; }
    100% { transform: translateX(-50%) scale(0); opacity: 0; }
}

.flame-container.blowing {
    animation: blow-out-sequence 1.2s cubic-bezier(0.36, 0, 0.66, -0.56) forwards !important;
}

.flame-container.shaking {
    animation: shake 0.1s infinite !important;
    opacity: 0.8;
}

/* Smoke Animation */
.smoke {
    position: absolute;
    top: -60px;
    left: 50%;
    transform: translateX(-50%) scale(0.5);
    width: 20px;
    height: 80px;
    background: radial-gradient(ellipse at center, rgba(180, 180, 180, 0.8) 0%, rgba(255, 255, 255, 0) 70%);
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
    filter: blur(8px);
}

.smoke.show-smoke {
    animation: smoke-rise 2.5s ease-out forwards;
}

@keyframes smoke-rise {
    0% {
        opacity: 0.6;
        transform: translateX(-50%) translateY(0) scale(0.5);
    }
    30% {
        opacity: 0.4;
        transform: translateX(-50%) translateY(-40px) scale(1.5);
    }
    100% {
        opacity: 0;
        transform: translateX(-50%) translateY(-80px) scale(2.5);
    }
}

/* Stage 4: Polaroid Stack */
.polaroid-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 30px;
}

.polaroid-stack {
    position: relative;
    width: 220px;
    height: 280px;
    cursor: pointer;
    perspective: 1000px;
}

.polaroid-card {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #fff;
    padding: 12px 12px 30px 12px;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    transform-origin: center center;
    transform: rotate(var(--rot)) translateY(0) scale(1);
    transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.photo-visual {
    width: 100%;
    height: 200px;
    background: #eee;
    background-size: cover;
    background-position: center;
    margin-bottom: 12px;
    border: 1px solid rgba(0, 0, 0, 0.03);
}

/* Polaroid Gradients */
.p-grad-1 {
    background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
}

.p-grad-2 {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
}

.p-grad-3 {
    background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);
}

.p-grad-4 {
    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
}

.photo-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
}

.photo-caption {
    font-family: inherit;
    font-weight: 600;
    font-size: 14px;
    color: #333;
}

.photo-date {
    font-size: 12px;
    color: #999;
    font-family: inherit;
    font-weight: 500;
}

.polaroid-hint {
    margin-top: 15px;
    font-size: 12px;
    color: #999;
    letter-spacing: 1px;
}

/* Stack Animation */
.stack-card-move {
    transition: transform 0.5s;
}

.stack-card-leave-active {
    transition: all 0.4s ease-in;
    position: absolute;
    z-index: 100 !important;
}

.stack-card-leave-to {
    transform: translateX(150px) rotate(20deg) !important;
    opacity: 0;
}

.stack-card-enter-from {
    opacity: 0;
    transform: scale(0.8);
}

/* Stage 4: Wishes */
.wishes-list {
    width: 100%;
    max-width: 500px;
    height: 300px;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
}

.wish-card {
    background: #fff;
    padding: 16px;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

/* --- Share Poster Styles --- */
.action-buttons {
    display: flex;
    gap: 16px;
    margin-top: 24px;
    justify-content: center;
}

.poster-container {
    position: fixed;
    top: 0;
    left: -9999px;
    width: 375px;
    height: 667px;
    z-index: -100;
    visibility: visible;
}

.share-poster {
    width: 375px;
    height: 667px;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    position: relative;
    padding: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: "SF Pro Display", sans-serif;
}

.poster-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: url('@/assets/images/2025-10-shengri.webp') no-repeat center center;
    background-size: cover;
    opacity: 0.1;
    z-index: 0;
}

.poster-content {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.poster-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 16px;
}

.poster-logo {
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 1px;
}

.poster-date {
    font-size: 12px;
    color: #666;
}

.poster-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.poster-title {
    font-size: 32px;
    font-weight: 900;
    color: #333;
    margin: 0;
    letter-spacing: 2px;
}

.poster-name {
    font-size: 48px;
    font-weight: 300;
    margin: 16px 0;
    color: #ffffff;
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.poster-divider {
    width: 40px;
    height: 4px;
    background: #333;
    margin: 24px 0;
}

.poster-blessing {
    font-size: 18px;
    line-height: 1.6;
    color: #555;
    max-width: 80%;
}

.poster-bottom {
    display: flex;
    justify-content: center;
    padding-top: 24px;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.poster-code {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #888;
}

.qr-placeholder {
    width: 60px;
    height: 60px;
    background: #fff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Modal */
.poster-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(10px);
}

.poster-preview {
    position: relative;
    max-width: 85%;
    max-height: 85%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.poster-preview img {
    max-width: 100%;
    max-height: 70vh;
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.poster-preview p {
    color: white;
    font-size: 14px;
    opacity: 0.8;
}

.close-modal-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.close-modal-btn:hover {
    background: rgba(255, 255, 255, 0.4);
}

/* Blessing Select Panel */
.blessing-select-panel {
    background: #fff;
    padding: 24px;
    border-radius: 20px;
    width: 90%;
    max-width: 400px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.blessing-select-panel h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    color: #1d1d1f;
}

.blessing-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px;
}

.blessing-option {
    padding: 16px;
    border-radius: 12px;
    background: #f5f5f7;
    color: #333;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    text-align: left;
}

.blessing-text {
    font-size: 15px;
    margin-bottom: 4px;
    line-height: 1.4;
}

.blessing-author {
    font-size: 12px;
    color: #888;
    text-align: right;
}

.blessing-option:hover {
    background: #e5e5ea;
}

.blessing-option.selected {
    background: #fff;
    border-color: #0071e3;
    color: #0071e3;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15);
}

.blessing-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.secondary-btn.small {
    padding: 8px 16px;
    font-size: 14px;
}

.primary-btn.small {
    padding: 8px 16px;
    font-size: 14px;
}

.wish-avatar {
    width: 40px;
    height: 40px;
    background: #F5F5F7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
}

.wish-content {
    flex: 1;
    text-align: left;
}

.wish-text {
    font-size: 15px;
    margin: 0 0 4px;
    color: #333;
    font-weight: 500;
}

.wish-author {
    font-size: 12px;
    color: #999;
}

.wish-input-area {
    width: 100%;
    max-width: 500px;
    margin-top: 20px;
    display: flex;
    gap: 12px;
}

input {
    flex: 1;
    padding: 16px 24px;
    border: none;
    border-radius: 100px;
    background: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    font-size: 16px;
    font-family: inherit;
    outline: none;
    transition: box-shadow 0.2s;
}

input:focus {
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}

.send-btn {
    padding: 0 32px;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 100px;
    font-weight: 600;
    cursor: pointer;
}

.send-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
}

.continue-hint {
    margin-top: 20px;
    font-size: 14px;
    color: #666;
    cursor: pointer;
    text-decoration: underline;
    opacity: 0.8;
}

/* Stage 5: Gift */
.premium-card {
    width: 340px;
    height: 200px;
    background: linear-gradient(135deg, #222, #000);
    border-radius: 20px;
    padding: 24px;
    color: #fff;
    position: relative;
    overflow: hidden;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.card-shine {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, transparent 40%, rgba(255, 255, 255, 0.1) 50%, transparent 60%);
    transform: translateX(-100%);
    animation: shine 3s infinite;
}

@keyframes shine {
    to {
        transform: translateX(100%);
    }
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.brand {
    font-weight: 800;
    letter-spacing: 1px;
}

.card-type {
    font-size: 10px;
    opacity: 0.7;
    letter-spacing: 2px;
}

.card-scratch-area {
    position: relative;
    height: 50px;
    background: #333;
    border-radius: 8px;
    overflow: hidden;
    margin: 10px 0;
}

.card-scratch-area canvas {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
}

.card-code {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
    font-size: 18px;
    letter-spacing: 2px;
    color: #fff;
}

.card-bottom {
    display: flex;
    justify-content: space-between;
}

.label {
    display: block;
    font-size: 8px;
    opacity: 0.5;
    margin-bottom: 2px;
}

.value {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
}

.secondary-btn {
    margin-top: 40px;
    background: transparent;
    border: 1px solid #ddd;
    padding: 12px 32px;
    border-radius: 100px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s;
}

.secondary-btn:hover {
    border-color: #111;
    color: #111;
}

/* Animations */
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.6s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateY(40px);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateY(-40px);
}

.list-enter-active,
.list-leave-active {
    transition: all 0.5s ease;
}

.list-enter-from {
    opacity: 0;
    transform: translateX(-30px);
}

@keyframes flicker {
    0% {
        transform: scale(1);
        opacity: 1;
    }

    100% {
        transform: scale(1.1);
        opacity: 0.8;
    }
}

:global(.confetti) {
    position: fixed;
    width: 10px;
    height: 10px;
    top: -10px;
    z-index: 999;
    animation: fall linear forwards;
}

@keyframes fall {
    to {
        transform: translateY(100vh) rotate(720deg);
    }
}

@media (max-width: 600px) {
    .hero-title {
        font-size: 48px;
    }

    .gallery-grid {
        grid-template-columns: 1fr;
    }

    .card-1 {
        grid-column: span 1;
    }
}

/* Landscape Optimization */
@media (orientation: landscape) and (max-height: 600px) {
    .hero-content {
        transform: scale(0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
    }

    .hero-title {
        font-size: 48px;
        margin: 10px 0;
        line-height: 1.1;
    }

    .primary-btn {
        margin-top: 20px;
        padding: 10px 32px;
        font-size: 14px;
    }

    .floating-fab {
        bottom: 20px;
        right: 20px;
        left: auto;
        transform: none;
        padding: 12px 24px;
        font-size: 14px;
    }

    .wishes-list {
        height: 180px;
    }

    .wish-input-area {
        margin-top: 10px;
        padding-bottom: 10px;
    }

    .send-btn {
        padding: 0 24px;
        font-size: 14px;
    }

    .secondary-btn {
        margin-top: 20px;
        padding: 10px 24px;
        font-size: 14px;
    }

    .polaroid-stack {
        transform: scale(0.7);
        margin-bottom: 10px;
    }

    .section-title {
        font-size: 24px;
        margin-bottom: 4px;
    }
}
</style>
