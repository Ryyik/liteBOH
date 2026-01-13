<template>
  <div class="health-container">
    <!-- 顶部透明毛玻璃横条 -->
    <div class="top-glass-bar">
      <router-link to="/" class="back-home-btn">返回首页</router-link>
    </div>

    <main class="container">
      <section
        class="hero-section"
        :data-bg-img="getImageUrl('@/assets/images/main2.webp')"
        ref="healthHeroSection"
      >
        <h1>健康CARE</h1>
        <p>
          我们关注你的健康，这是十分重要的，在这你可以计算BMI指数，了解运动建议，以及饮食建议。
        </p>
      </section>

      <div class="bmi-calculator-container">
        <div class="calculator-header">BMI和健康评估</div>
        <div class="calculator-description">
          计算您的体重指数和每日基础代谢率，获取个性化健康建议
        </div>
        <div class="bmi-inputs" id="bmiInputs">
          <div class="input-group">
            <label for="age">年龄</label>
            <input
              type="number"
              id="age"
              placeholder="请输入年龄"
              min="1"
              max="120"
              v-model.number="userInfo.age"
            />
          </div>
          <div class="input-group">
            <label for="height">身高 (cm)</label>
            <input
              type="number"
              id="height"
              placeholder="请输入身高"
              min="50"
              max="250"
              v-model.number="userInfo.height"
            />
          </div>
          <div class="input-group">
            <label for="weight">体重 (kg)「建议为早晨空腹体重」</label>
            <input
              type="number"
              id="weight"
              placeholder="请输入体重"
              min="10"
              max="200"
              step="0.1"
              v-model.number="userInfo.weight"
            />
          </div>
          <div class="input-group gender-group">
            <label for="gender">性别</label>
            <div class="gender-options">
              <div class="gender-option">
                <input
                  type="radio"
                  id="male"
                  name="gender"
                  value="male"
                  v-model="userInfo.gender"
                />
                <label for="male" class="gender-label">
                  <span class="gender-text">男</span>
                </label>
              </div>
              <div class="gender-option">
                <input
                  type="radio"
                  id="female"
                  name="gender"
                  value="female"
                  v-model="userInfo.gender"
                />
                <label for="female" class="gender-label">
                  <span class="gender-text">女</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="calculate-button-container">
          <button class="calculate-btn" id="calculateBMI" @click="calculateBMI">
            计算BMI
          </button>
        </div>
        <div class="bmi-results">
          <!-- BMI结果卡片 -->
          <div class="result-card">
            <div class="result-card-header">
              <h3>BMI值</h3>
              <span class="result-unit">身体质量指数</span>
            </div>
            <div class="result-card-content">
              <div class="result-main-value">
                <span id="bmiValue">{{ bmiResult.value }}</span>
                <span
                  class="bmi-category-indicator"
                  :class="bmiResult.categoryClass"
                  id="bmiCategory"
                  >{{ bmiResult.category }}</span
                >
              </div>
              <div class="bmi-progress-container">
                <div class="bmi-progress-bar">
                  <div
                    class="bmi-progress-fill"
                    :class="bmiResult.progressClass"
                    :style="{ width: bmiResult.progressWidth + '%' }"
                    id="bmiProgress"
                  ></div>
                </div>
                <div class="bmi-ranges">
                  <span>过轻</span>
                  <span>正常</span>
                  <span>超重</span>
                  <span>肥胖</span>
                </div>
              </div>
              <div class="result-interpretation">
                <p id="bmiInterpretation">{{ bmiResult.interpretation }}</p>
              </div>
            </div>
          </div>

          <!-- 基础代谢率结果卡片 -->
          <div class="result-card">
            <div class="result-card-header">
              <h3>基础代谢率</h3>
              <span class="result-unit">BMR</span>
            </div>
            <div class="result-card-content">
              <div class="result-main-value">
                <span id="bmrValue">{{ bmrResult.value }}</span>
                <span class="result-calories-unit">大卡/天</span>
              </div>
              <div class="result-interpretation">
                <p>基础代谢率是维持生命所需的最低能量消耗</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 运动推荐区域 -->
        <div class="recommendation-section">
          <div class="recommendation-header">运动推荐</div>
          <div id="exerciseRecommendations" class="recommendation-content">
            <p v-if="!bmiResult.calculated" class="recommendation-placeholder">
              请先计算BMI以获取个性化运动建议
            </p>
            <div v-else class="recommendation-card">
              <div class="recommendation-icon exercise-icon">🏃</div>
              <h4>{{ exerciseRecommendation.title }}</h4>
              <p class="recommendation-text">
                {{ exerciseRecommendation.description }}
              </p>
              <h5>推荐运动</h5>
              <ul class="recommendation-tips">
                <li v-for="tip in exerciseRecommendation.tips" :key="tip">
                  {{ tip }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 有氧运动介绍 -->
        <div class="recommendation-section">
          <div
            class="recommendation-header collapsible-header"
            :class="{ expanded: expandedSections.aerobic }"
            @click="toggleCollapse('aerobic')"
          >
            <span>有氧运动</span>
            <span class="collapse-icon">▼</span>
          </div>
          <div
            class="recommendation-card collapsible-content"
            :class="{ expanded: expandedSections.aerobic }"
          >
            <div class="recommendation-icon exercise-icon">🏃</div>
            <h4>什么是有氧运动？</h4>
            <p class="recommendation-text">
              有氧运动是一种低至中等强度、持续时间较长的运动方式，主要通过氧气参与能量代谢。这种训练方式可以提高心肺功能，增强耐力，促进脂肪燃烧，通常持续时间在15分钟以上。
            </p>

            <h5>主要益处</h5>
            <ul class="recommendation-tips">
              <li>增强心肺功能，提高氧气利用率</li>
              <li>促进脂肪燃烧，有助于体重管理</li>
              <li>降低血压和胆固醇水平</li>
              <li>改善睡眠质量，缓解压力</li>
              <li>增强免疫力，减少疾病风险</li>
              <li>提升身体耐力和持久力</li>
            </ul>

            <h5>常见训练方式</h5>
            <div class="recommendation-details">
              <div class="detail-item">
                <div class="detail-label">慢跑/跑步</div>
                <div class="detail-value">户外/跑步机</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">游泳</div>
                <div class="detail-value">自由泳、蛙泳</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">骑行</div>
                <div class="detail-value">户外/动感单车</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">有氧运动</div>
                <div class="detail-value">有氧操、跳绳</div>
              </div>
            </div>

            <h5>训练建议</h5>
            <p class="recommendation-text">
              建议每周进行3-5次有氧运动，每次持续20-60分钟。初学者可以从低强度开始，逐渐增加运动时间和强度，保持适当的心率区间以获得最佳效果。
            </p>
          </div>
        </div>

        <!-- 无氧力量训练介绍 -->
        <div class="recommendation-section">
          <div
            class="recommendation-header collapsible-header"
            :class="{ expanded: expandedSections.strength }"
            @click="toggleCollapse('strength')"
          >
            <span>无氧力量训练</span>
            <span class="collapse-icon">▼</span>
          </div>
          <div
            class="recommendation-card collapsible-content"
            :class="{ expanded: expandedSections.strength }"
          >
            <div class="recommendation-icon exercise-icon">🏋️</div>
            <h4>什么是无氧力量训练？</h4>
            <p class="recommendation-text">
              无氧力量训练是一种高强度、短时间的运动方式，主要通过肌肉收缩来增强力量、肌肉质量和骨密度。这种训练方式不需要大量氧气参与能量代谢，通常持续时间较短（30秒至2分钟）。
            </p>

            <h5>主要益处</h5>
            <ul class="recommendation-tips">
              <li>增强肌肉力量和耐力</li>
              <li>增加肌肉质量，提高基础代谢率</li>
              <li>改善骨密度，预防骨质疏松</li>
              <li>提升身体稳定性和平衡能力</li>
              <li>帮助塑造身材，改善身体线条</li>
              <li>增强关节健康和灵活性</li>
            </ul>

            <h5>常见训练方式</h5>
            <div class="recommendation-details">
              <div class="detail-item">
                <div class="detail-label">重量训练</div>
                <div class="detail-value">哑铃、杠铃</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">器械训练</div>
                <div class="detail-value">健身房器械</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">自重训练</div>
                <div class="detail-value">俯卧撑、深蹲</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">高强度间歇</div>
                <div class="detail-value">HIIT训练</div>
              </div>
            </div>

            <h5>训练建议</h5>
            <p class="recommendation-text">
              建议每周进行2-3次无氧力量训练，每次训练针对不同肌群。初学者应从较轻的重量开始，逐渐增加强度，并注意保持正确的姿势以避免受伤。
            </p>
          </div>
        </div>

        <!-- 饮食推荐区域 -->
        <div class="recommendation-section">
          <div class="recommendation-header">饮食推荐</div>
          <div id="dietRecommendations" class="recommendation-content">
            <p v-if="!bmiResult.calculated" class="recommendation-placeholder">
              请先计算BMI以获取个性化饮食建议
            </p>
            <div v-else class="recommendation-card">
              <div class="recommendation-icon diet-icon">🍎</div>
              <h4>{{ dietRecommendation.title }}</h4>
              <p class="recommendation-text">
                {{ dietRecommendation.description }}
              </p>
              <h5>饮食建议</h5>
              <ul class="recommendation-tips">
                <li v-for="tip in dietRecommendation.tips" :key="tip">
                  {{ tip }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="calculator-container">
        <div class="calculator-header">已选食物</div>
        <div class="calculator-description">查看您已选择的食物及其热量</div>
        <div class="selected-foods" id="selectedFoods">
          <div
            v-if="selectedFoods.length === 0"
            class="recommendation-placeholder"
          >
            您还没有选择任何食物
          </div>
          <div
            v-for="(food, index) in selectedFoods"
            :key="index"
            class="selected-food-item"
          >
            <div class="selected-food-info">
              <div>
                <div class="food-name">{{ food.name }}</div>
                <div class="food-calories">
                  {{ food.calories }} 大卡/{{ food.unit }}
                </div>
              </div>
              <div class="food-amount-control">
                <div class="unit-selector">
                  <div
                    class="unit-option"
                    :class="{ active: food.selectedUnit === 'g' }"
                    @click="food.selectedUnit = 'g'"
                  >
                    克
                  </div>
                  <div
                    class="unit-option"
                    :class="{ active: food.selectedUnit === 'unit' }"
                    @click="food.selectedUnit = 'unit'"
                  >
                    份
                  </div>
                </div>
                <input
                  type="number"
                  class="amount-input"
                  v-model.number="food.amount"
                  min="1"
                  @input="calculateTotalCalories"
                />
                <button class="remove-food-btn" @click="removeFood(index)">
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 总热量结果卡片 -->
      <div class="result-card calories-card">
        <div class="result-card-header">
          <h3>总热量</h3>
          <span class="result-unit">大卡</span>
        </div>
        <div class="result-card-content">
          <div class="result-main-value" id="totalCalories">
            {{ totalCalories }}
          </div>
          <div class="result-interpretation">
            <p>
              这是您选择的所有食物的总热量摄入。建议根据您的BMI和活动水平合理控制每日热量摄入。
            </p>
          </div>
        </div>
      </div>

      <div class="search-container">
        <input
          type="text"
          class="search-bar"
          placeholder="搜索食物..."
          id="foodSearch"
          v-model="searchQuery"
        />
      </div>

      <div class="category-tabs">
        <div
          class="category-tab"
          :class="{ active: activeCategory === 'all' }"
          @click="activeCategory = 'all'"
          data-category="all"
        >
          全部食物
        </div>
        <div
          class="category-tab"
          :class="{ active: activeCategory === 'healthy' }"
          @click="activeCategory = 'healthy'"
          data-category="healthy"
        >
          减脂推荐
        </div>
        <div
          class="category-tab"
          :class="{ active: activeCategory === 'moderate' }"
          @click="activeCategory = 'moderate'"
          data-category="moderate"
        >
          适度吃
        </div>
        <div
          class="category-tab"
          :class="{ active: activeCategory === 'unhealthy' }"
          @click="activeCategory = 'unhealthy'"
          data-category="unhealthy"
        >
          不建议吃
        </div>
      </div>

      <div class="food-grid" id="foodGrid">
        <div
          v-for="food in filteredFoods"
          :key="food.name"
          class="food-card"
          :class="{ selected: isFoodSelected(food.name) }"
          @click="toggleFoodSelection(food)"
        >
          <div class="food-category-tag" :class="`category-${food.category}`">
            {{
              food.category === "healthy"
                ? "减脂推荐"
                : food.category === "moderate"
                ? "适度吃"
                : "不建议吃"
            }}
          </div>
          <div class="food-name">{{ food.name }}</div>
          <div class="food-calories">
            {{ food.calories }} 大卡/{{ food.unit }}
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { getImageUrl } from "../utils/asset-helper.js";

// 添加ref引用
const healthHeroSection = ref(null);

// 背景图片懒加载
const loadBackgroundImage = (sectionRef, imgSrc) => {
  if (!sectionRef || !imgSrc) return;
  
  const img = new Image();
  img.onload = () => {
    sectionRef.style.backgroundImage = `
      linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)),
      url('${imgSrc}')
    `;
    sectionRef.style.backgroundSize = 'cover';
    sectionRef.style.backgroundPosition = 'center';
    sectionRef.style.backgroundRepeat = 'no-repeat';
  };
  img.src = imgSrc;
};

// 懒加载背景图片
const lazyLoadBackgroundImages = () => {
  if (typeof window !== 'undefined' && window.IntersectionObserver) {
    const options = {
      root: null,
      rootMargin: '50px',
      threshold: 0.1
    };
    
    window.healthObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const section = entry.target;
          const imgSrc = section.getAttribute('data-bg-img');
          if (imgSrc) {
            loadBackgroundImage(section, getImageUrl(imgSrc));
          }
          window.healthObserver.unobserve(section);
        }
      });
    }, options);
    
    // 观察健康页面英雄区
    if (healthHeroSection.value) {
      window.healthObserver.observe(healthHeroSection.value);
    }
  } else {
    // 降级处理：直接加载首屏图片
    if (healthHeroSection.value) {
      const imgSrc = healthHeroSection.value.getAttribute('data-bg-img');
      if (imgSrc) {
        loadBackgroundImage(healthHeroSection.value, getImageUrl(imgSrc));
      }
    }
  }
};

// 用户信息
const userInfo = ref({
  age: null,
  height: null,
  weight: null,
  gender: "male",
});

// BMI结果
const bmiResult = ref({
  value: "-",
  category: "-",
  categoryClass: "",
  progressWidth: 0,
  progressClass: "",
  interpretation: "请先计算BMI以获取健康评估",
  calculated: false,
});

// BMR结果
const bmrResult = ref({
  value: "-",
});

// 运动推荐
const exerciseRecommendation = ref({
  title: "",
  description: "",
  tips: [],
});

// 饮食推荐
const dietRecommendation = ref({
  title: "",
  description: "",
  tips: [],
});

// 折叠展开状态
const expandedSections = ref({
  aerobic: false,
  strength: false,
});

// 食物数据
const foods = ref([
  // 减肥适合吃的食物 - 水果
  { name: "苹果", calories: 52, category: "healthy", unit: "100g" },
  { name: "香蕉", calories: 89, category: "healthy", unit: "100g" },
  { name: "橙子", calories: 47, category: "healthy", unit: "100g" },
  { name: "草莓", calories: 32, category: "healthy", unit: "100g" },
  { name: "蓝莓", calories: 57, category: "healthy", unit: "100g" },
  { name: "覆盆子", calories: 52, category: "healthy", unit: "100g" },
  { name: "黑莓", calories: 43, category: "healthy", unit: "100g" },
  { name: "柚子", calories: 32, category: "healthy", unit: "100g" },
  { name: "柠檬", calories: 29, category: "healthy", unit: "100g" },
  { name: "猕猴桃", calories: 61, category: "healthy", unit: "100g" },
  { name: "葡萄柚", calories: 32, category: "healthy", unit: "100g" },
  { name: "李子", calories: 39, category: "healthy", unit: "100g" },
  { name: "桃子", calories: 39, category: "healthy", unit: "100g" },
  { name: "梨", calories: 57, category: "healthy", unit: "100g" },
  { name: "樱桃", calories: 50, category: "healthy", unit: "100g" },
  { name: "芒果", calories: 60, category: "healthy", unit: "100g" },
  { name: "菠萝", calories: 50, category: "healthy", unit: "100g" },
  { name: "西瓜", calories: 30, category: "healthy", unit: "100g" },
  { name: "哈密瓜", calories: 34, category: "healthy", unit: "100g" },
  { name: "甜瓜", calories: 36, category: "healthy", unit: "100g" },
  { name: "枇杷", calories: 47, category: "healthy", unit: "100g" },
  { name: "火龙果", calories: 51, category: "healthy", unit: "100g" },
  { name: "山竹", calories: 69, category: "healthy", unit: "100g" },
  { name: "杨桃", calories: 31, category: "healthy", unit: "100g" },
  { name: "番石榴", calories: 41, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 蔬菜
  { name: "菠菜", calories: 23, category: "healthy", unit: "100g" },
  { name: "西兰花", calories: 34, category: "healthy", unit: "100g" },
  { name: "胡萝卜", calories: 41, category: "healthy", unit: "100g" },
  { name: "西红柿", calories: 18, category: "healthy", unit: "100g" },
  { name: "黄瓜", calories: 16, category: "healthy", unit: "100g" },
  { name: "生菜", calories: 15, category: "healthy", unit: "100g" },
  { name: "白菜", calories: 17, category: "healthy", unit: "100g" },
  { name: "娃娃菜", calories: 15, category: "healthy", unit: "100g" },
  { name: "芹菜", calories: 16, category: "healthy", unit: "100g" },
  { name: "莴笋", calories: 14, category: "healthy", unit: "100g" },
  { name: "芦笋", calories: 20, category: "healthy", unit: "100g" },
  { name: "秋葵", calories: 37, category: "healthy", unit: "100g" },
  { name: "茄子", calories: 25, category: "healthy", unit: "100g" },
  { name: "青椒", calories: 20, category: "healthy", unit: "100g" },
  { name: "彩椒", calories: 31, category: "healthy", unit: "100g" },
  { name: "洋葱", calories: 40, category: "healthy", unit: "100g" },
  { name: "大蒜", calories: 149, category: "healthy", unit: "100g" },
  { name: "姜", calories: 80, category: "healthy", unit: "100g" },
  { name: "蘑菇", calories: 22, category: "healthy", unit: "100g" },
  { name: "金针菇", calories: 32, category: "healthy", unit: "100g" },
  { name: "香菇", calories: 21, category: "healthy", unit: "100g" },
  { name: "平菇", calories: 20, category: "healthy", unit: "100g" },
  { name: "木耳", calories: 21, category: "healthy", unit: "100g" },
  { name: "银耳", calories: 200, category: "healthy", unit: "100g" },
  { name: "海带", calories: 13, category: "healthy", unit: "100g" },
  { name: "紫菜", calories: 207, category: "healthy", unit: "100g" },
  { name: "白菜苔", calories: 20, category: "healthy", unit: "100g" },
  { name: "菜心", calories: 13, category: "healthy", unit: "100g" },
  { name: "芥蓝", calories: 19, category: "healthy", unit: "100g" },
  { name: "空心菜", calories: 19, category: "healthy", unit: "100g" },
  { name: "油麦菜", calories: 15, category: "healthy", unit: "100g" },
  { name: "茼蒿", calories: 21, category: "healthy", unit: "100g" },
  { name: "苦菜", calories: 35, category: "healthy", unit: "100g" },
  { name: "马齿苋", calories: 25, category: "healthy", unit: "100g" },
  { name: "蒲公英", calories: 45, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 肉类/海鲜
  { name: "鸡蛋", calories: 155, category: "healthy", unit: "100g" },
  { name: "鸡蛋蛋白", calories: 15, category: "healthy", unit: "100g" },
  { name: "鸡胸肉", calories: 165, category: "healthy", unit: "100g" },
  { name: "鸡腿肉（去皮）", calories: 181, category: "healthy", unit: "100g" },
  { name: "鸭胸肉", calories: 173, category: "healthy", unit: "100g" },
  { name: "鸭腿肉（去皮）", calories: 201, category: "healthy", unit: "100g" },
  { name: "鸽肉", calories: 142, category: "healthy", unit: "100g" },
  { name: "鹌鹑肉", calories: 110, category: "healthy", unit: "100g" },
  { name: "兔肉", calories: 105, category: "healthy", unit: "100g" },
  { name: "鱼肉", calories: 208, category: "healthy", unit: "100g" },
  { name: "三文鱼", calories: 208, category: "healthy", unit: "100g" },
  { name: "鳕鱼", calories: 82, category: "healthy", unit: "100g" },
  { name: "金枪鱼", calories: 184, category: "healthy", unit: "100g" },
  { name: "龙利鱼", calories: 88, category: "healthy", unit: "100g" },
  { name: "鲈鱼", calories: 105, category: "healthy", unit: "100g" },
  { name: "鲫鱼", calories: 108, category: "healthy", unit: "100g" },
  { name: "草鱼", calories: 113, category: "healthy", unit: "100g" },
  { name: "鲤鱼", calories: 109, category: "healthy", unit: "100g" },
  { name: "鲶鱼", calories: 146, category: "healthy", unit: "100g" },
  { name: "虾仁", calories: 99, category: "healthy", unit: "100g" },
  { name: "虾", calories: 99, category: "healthy", unit: "100g" },
  { name: "螃蟹", calories: 103, category: "healthy", unit: "100g" },
  { name: "扇贝", calories: 60, category: "healthy", unit: "100g" },
  { name: "生蚝", calories: 73, category: "healthy", unit: "100g" },
  { name: "鱿鱼", calories: 75, category: "healthy", unit: "100g" },
  { name: "章鱼", calories: 70, category: "healthy", unit: "100g" },
  { name: "海蜇", calories: 33, category: "healthy", unit: "100g" },
  { name: "螺肉", calories: 110, category: "healthy", unit: "100g" },
  { name: "蛤蜊", calories: 62, category: "healthy", unit: "100g" },
  { name: "淡菜", calories: 124, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 豆类/豆制品
  { name: "豆腐", calories: 70, category: "healthy", unit: "100g" },
  { name: "嫩豆腐", calories: 45, category: "healthy", unit: "100g" },
  { name: "老豆腐", calories: 72, category: "healthy", unit: "100g" },
  { name: "豆浆", calories: 14, category: "healthy", unit: "100ml" },
  { name: "豆腐干", calories: 140, category: "healthy", unit: "100g" },
  { name: "豆腐皮", calories: 447, category: "healthy", unit: "100g" },
  { name: "腐竹", calories: 459, category: "healthy", unit: "100g" },
  { name: "鹰嘴豆", calories: 378, category: "healthy", unit: "100g" },
  { name: "黑豆", calories: 361, category: "healthy", unit: "100g" },
  { name: "红豆", calories: 309, category: "healthy", unit: "100g" },
  { name: "绿豆", calories: 316, category: "healthy", unit: "100g" },
  { name: "豌豆", calories: 81, category: "healthy", unit: "100g" },
  { name: "扁豆", calories: 86, category: "healthy", unit: "100g" },
  { name: "蚕豆", calories: 62, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 谷物/主食
  { name: "燕麦", calories: 389, category: "healthy", unit: "100g" },
  { name: "全麦面包", calories: 247, category: "healthy", unit: "100g" },
  { name: "糙米", calories: 111, category: "healthy", unit: "100g" },
  { name: "藜麦", calories: 371, category: "healthy", unit: "100g" },
  { name: "荞麦", calories: 343, category: "healthy", unit: "100g" },
  { name: "小米", calories: 358, category: "healthy", unit: "100g" },
  { name: "玉米", calories: 86, category: "healthy", unit: "100g" },
  { name: "红薯", calories: 86, category: "healthy", unit: "100g" },
  { name: "紫薯", calories: 82, category: "healthy", unit: "100g" },
  { name: "山药", calories: 56, category: "healthy", unit: "100g" },
  { name: "芋头", calories: 74, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 乳制品
  { name: "牛奶", calories: 61, category: "healthy", unit: "100ml" },
  { name: "脱脂牛奶", calories: 35, category: "healthy", unit: "100ml" },
  { name: "酸奶", calories: 59, category: "healthy", unit: "100g" },
  { name: "脱脂酸奶", calories: 33, category: "healthy", unit: "100g" },
  { name: "奶酪", calories: 402, category: "healthy", unit: "100g" },
  { name: "低脂奶酪", calories: 330, category: "healthy", unit: "100g" },

  // 减肥适合吃的食物 - 坚果/种子
  { name: "杏仁", calories: 579, category: "healthy", unit: "100g" },
  { name: "核桃", calories: 654, category: "healthy", unit: "100g" },
  { name: "花生", calories: 567, category: "healthy", unit: "100g" },
  { name: "瓜子", calories: 597, category: "healthy", unit: "100g" },
  { name: "芝麻", calories: 559, category: "healthy", unit: "100g" },
  { name: "亚麻籽", calories: 534, category: "healthy", unit: "100g" },
  { name: "奇亚籽", calories: 486, category: "healthy", unit: "100g" },

  // 适度吃的食物 - 谷物/主食
  { name: "米饭", calories: 116, category: "moderate", unit: "100g" },
  { name: "面条", calories: 138, category: "moderate", unit: "100g" },
  { name: "面包", calories: 264, category: "moderate", unit: "100g" },
  { name: "馒头", calories: 221, category: "moderate", unit: "100g" },
  { name: "包子", calories: 227, category: "moderate", unit: "100g" },
  { name: "饺子", calories: 253, category: "moderate", unit: "100g" },
  { name: "馄饨", calories: 249, category: "moderate", unit: "100g" },
  { name: "烧麦", calories: 220, category: "moderate", unit: "100g" },
  { name: "粽子", calories: 186, category: "moderate", unit: "100g" },
  { name: "汤圆", calories: 311, category: "moderate", unit: "100g" },
  { name: "年糕", calories: 154, category: "moderate", unit: "100g" },
  { name: "糍粑", calories: 257, category: "moderate", unit: "100g" },
  { name: "土豆", calories: 77, category: "moderate", unit: "100g" },
  { name: "玉米", calories: 86, category: "moderate", unit: "100g" },
  { name: "南瓜", calories: 26, category: "moderate", unit: "100g" },
  { name: "藕", calories: 73, category: "moderate", unit: "100g" },
  { name: "菱角", calories: 98, category: "moderate", unit: "100g" },

  // 适度吃的食物 - 肉类
  { name: "牛里脊肉", calories: 195, category: "moderate", unit: "100g" },
  { name: "牛腱子肉", calories: 190, category: "moderate", unit: "100g" },
  { name: "牛腩", calories: 190, category: "moderate", unit: "100g" },
  { name: "牛排", calories: 250, category: "moderate", unit: "100g" },
  { name: "牛肉", calories: 250, category: "moderate", unit: "100g" },
  { name: "牛肚", calories: 72, category: "moderate", unit: "100g" },
  { name: "牛肝", calories: 135, category: "moderate", unit: "100g" },
  { name: "牛心", calories: 106, category: "moderate", unit: "100g" },
  { name: "猪里脊肉", calories: 158, category: "moderate", unit: "100g" },
  { name: "猪腿肉", calories: 190, category: "moderate", unit: "100g" },
  { name: "猪肉", calories: 320, category: "moderate", unit: "100g" },
  { name: "排骨", calories: 264, category: "moderate", unit: "100g" },
  { name: "猪排", calories: 240, category: "moderate", unit: "100g" },
  { name: "猪蹄", calories: 260, category: "moderate", unit: "100g" },
  { name: "猪皮", calories: 363, category: "moderate", unit: "100g" },
  { name: "猪肝", calories: 129, category: "moderate", unit: "100g" },
  { name: "猪心", calories: 119, category: "moderate", unit: "100g" },
  { name: "猪肚", calories: 110, category: "moderate", unit: "100g" },
  { name: "羊里脊", calories: 190, category: "moderate", unit: "100g" },
  { name: "羊腿肉", calories: 200, category: "moderate", unit: "100g" },
]);

// 搜索查询
const searchQuery = ref("");

// 活动分类
const activeCategory = ref("all");

// 已选食物
const selectedFoods = ref([]);

// 总热量
const totalCalories = ref(0);

// 筛选食物
const filteredFoods = computed(() => {
  let result = foods.value;

  // 按分类筛选
  if (activeCategory.value !== "all") {
    result = result.filter((food) => food.category === activeCategory.value);
  }

  // 按搜索词筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((food) => food.name.toLowerCase().includes(query));
  }

  return result;
});

// 切换折叠状态
const toggleCollapse = (section) => {
  expandedSections.value[section] = !expandedSections.value[section];
};

// 计算BMI
const calculateBMI = () => {
  if (!userInfo.value.age || !userInfo.value.height || !userInfo.value.weight) {
    alert("请输入完整的个人信息");
    return;
  }

  // 计算BMI
  const heightInMeters = userInfo.value.height / 100;
  const bmi = userInfo.value.weight / (heightInMeters * heightInMeters);
  const roundedBMI = bmi.toFixed(1);

  // 计算BMR (基础代谢率) 使用Mifflin-St Jeor公式
  let bmr;
  if (userInfo.value.gender === "male") {
    bmr =
      10 * userInfo.value.weight +
      6.25 * userInfo.value.height -
      5 * userInfo.value.age +
      5;
  } else {
    bmr =
      10 * userInfo.value.weight +
      6.25 * userInfo.value.height -
      5 * userInfo.value.age -
      161;
  }

  // 确定BMI分类
  let category, categoryClass, progressWidth, progressClass, interpretation;

  if (bmi < 18.5) {
    category = "过轻";
    categoryClass = "bmi-underweight";
    progressWidth = 20;
    progressClass = "progress-underweight";
    interpretation =
      "您的体重过轻，建议适当增加营养摄入，多食用富含蛋白质和健康脂肪的食物，同时进行适当的力量训练来增加肌肉量。";

    // 运动推荐
    exerciseRecommendation.value = {
      title: "增重训练计划",
      description: "针对体重过轻人群，建议以力量训练为主，配合适量有氧运动",
      tips: [
        "每周进行3-4次力量训练，重点训练大肌群",
        "每次训练45-60分钟，每组动作8-12次",
        "力量训练后补充蛋白质，促进肌肉生长",
        "适量进行有氧运动，每周1-2次，每次20-30分钟",
        "保证充足的睡眠，促进身体恢复和肌肉生长",
      ],
    };

    // 饮食推荐
    dietRecommendation.value = {
      title: "增重饮食建议",
      description: "增加热量摄入，保证营养均衡，重点增加蛋白质和健康脂肪",
      tips: [
        "每日热量摄入比基础代谢率多300-500大卡",
        "每餐增加蛋白质摄入（鸡胸肉、鱼类、豆类等）",
        "适量增加健康脂肪（坚果、牛油果、橄榄油等）",
        "多食用全谷物和复合碳水化合物",
        "每日饮用牛奶或蛋白质奶昔",
        "少量多餐，每日5-6餐",
      ],
    };
  } else if (bmi >= 18.5 && bmi < 24) {
    category = "正常";
    categoryClass = "bmi-normal";
    progressWidth = 50;
    progressClass = "progress-normal";
    interpretation =
      "您的体重正常，继续保持健康的生活方式和饮食习惯，定期进行体检。";

    // 运动推荐
    exerciseRecommendation.value = {
      title: "保持体型训练计划",
      description: "针对体重正常人群，建议结合有氧运动和力量训练，保持身体健康",
      tips: [
        "每周进行3-5次运动，包括2-3次力量训练和2-3次有氧运动",
        "力量训练重点保持肌肉量和线条",
        "有氧运动可以选择跑步、游泳、骑行等",
        "每周进行1-2次柔韧性训练，如瑜伽或拉伸",
        "保持规律的运动习惯",
      ],
    };

    // 饮食推荐
    dietRecommendation.value = {
      title: "保持健康饮食建议",
      description: "保持均衡饮食，控制热量摄入，保证营养全面",
      tips: [
        "每日热量摄入与基础代谢率相当",
        "保证蛋白质、碳水化合物、脂肪的均衡摄入",
        "多食用新鲜蔬菜和水果",
        "控制精制糖和加工食品的摄入",
        "保持充足的水分摄入",
      ],
    };
  } else if (bmi >= 24 && bmi < 28) {
    category = "超重";
    categoryClass = "bmi-overweight";
    progressWidth = 75;
    progressClass = "progress-overweight";
    interpretation =
      "您的体重超重，建议适当控制饮食，增加运动量，减少高热量食物的摄入，多进行有氧运动。";

    // 运动推荐
    exerciseRecommendation.value = {
      title: "减重训练计划",
      description: "针对超重人群，建议以有氧运动为主，配合适量力量训练",
      tips: [
        "每周进行4-5次运动，其中3-4次有氧运动",
        "每次有氧运动30-45分钟，保持中等强度",
        "每周进行2次力量训练，增加肌肉量，提高基础代谢率",
        "可以选择快走、游泳、骑行等低冲击有氧运动",
        "逐渐增加运动强度和时间",
      ],
    };

    // 饮食推荐
    dietRecommendation.value = {
      title: "减重饮食建议",
      description: "控制热量摄入，调整饮食结构，减少高热量食物",
      tips: [
        "每日热量摄入比基础代谢率少300-500大卡",
        "减少精制碳水化合物和糖的摄入",
        "增加蔬菜和水果的比例",
        "选择低脂肪、高蛋白的食物",
        "控制餐量，避免暴饮暴食",
        "多喝水，减少饮料摄入",
      ],
    };
  } else {
    category = "肥胖";
    categoryClass = "bmi-obese";
    progressWidth = 100;
    progressClass = "progress-obese";
    interpretation =
      "您的体重肥胖，建议咨询医生或营养师，制定科学的减重计划，结合饮食控制和适量运动，逐步达到健康体重。";

    // 运动推荐
    exerciseRecommendation.value = {
      title: "肥胖减重训练计划",
      description: "针对肥胖人群，建议从低强度运动开始，逐渐增加运动量",
      tips: [
        "每周进行3-5次运动，从低强度开始",
        "每次运动20-30分钟，逐渐增加到45-60分钟",
        "选择低冲击运动，如快走、游泳、椭圆机等",
        "每周进行1-2次力量训练，重点训练大肌群",
        "运动前后进行充分的热身和拉伸",
        "保持运动的持续性，避免中断",
      ],
    };

    // 饮食推荐
    dietRecommendation.value = {
      title: "肥胖减重饮食建议",
      description: "严格控制热量摄入，调整饮食结构，养成健康的饮食习惯",
      tips: [
        "在医生或营养师指导下控制热量摄入",
        "采用低热量、高纤维的饮食模式",
        "增加蔬菜和水果的摄入，减少肉类和油脂",
        "避免食用油炸食品和高糖饮料",
        "采用少食多餐的方式",
        "保持饮食规律，避免暴饮暴食",
        "记录每日饮食，监控热量摄入",
      ],
    };
  }

  // 更新结果
  bmiResult.value = {
    value: roundedBMI,
    category: category,
    categoryClass: categoryClass,
    progressWidth: progressWidth,
    progressClass: progressClass,
    interpretation: interpretation,
    calculated: true,
  };

  // 更新BMR
  bmrResult.value = {
    value: Math.round(bmr),
  };
};

// 检查食物是否已选中
const isFoodSelected = (foodName) => {
  return selectedFoods.value.some((food) => food.name === foodName);
};

// 切换食物选择
const toggleFoodSelection = (food) => {
  const index = selectedFoods.value.findIndex((f) => f.name === food.name);

  if (index > -1) {
    // 移除食物
    selectedFoods.value.splice(index, 1);
  } else {
    // 添加食物
    selectedFoods.value.push({
      ...food,
      amount: 100,
      selectedUnit: "g",
    });
  }

  // 重新计算总热量
  calculateTotalCalories();
};

// 移除食物
const removeFood = (index) => {
  selectedFoods.value.splice(index, 1);
  calculateTotalCalories();
};

// 计算总热量
const calculateTotalCalories = () => {
  let total = 0;

  selectedFoods.value.forEach((food) => {
    if (food.selectedUnit === "g") {
      // 如果是克，计算每克热量
      const caloriesPerGram =
        food.calories / (food.unit.includes("g") ? parseInt(food.unit) : 100);
      total += caloriesPerGram * food.amount;
    } else {
      // 如果是份，直接乘以数量
      total += food.calories * food.amount;
    }
  });

  totalCalories.value = Math.round(total);
};

onMounted(() => {
  // 懒加载背景图片
  lazyLoadBackgroundImages();
});

onUnmounted(() => {
  // 清理资源
  if (window.healthObserver) {
    window.healthObserver.disconnect();
  }
});
</script>

<style scoped>
/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.health-container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
    Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
  position: relative;
  min-height: 100vh;
}

/* 主内容样式 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 2rem 2rem;
  position: relative;
}

.hero-section {
  text-align: center;
  margin-bottom: 3rem;
  padding: 3rem 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-image: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url("@/assets/images/main2.webp");
  color: white;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  border-radius: 15px;
  overflow: hidden;
  position: relative;
}

.hero-section::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1;
}

.hero-section h1,
.hero-section p,
.hero-section .back-home-btn {
  position: relative;
  z-index: 2;
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
}

.back-home-btn:hover {
  background-color: rgba(102, 126, 234, 1);
  border-color: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
  color: white;
  text-decoration: none;
}

.hero-section h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: white;
}

.hero-section p {
  font-size: 1.1rem;
  color: white;
}

/* 搜索栏样式 */
.search-container {
  margin-bottom: 2rem;
  display: flex;
  justify-content: center;
}

.search-bar {
  width: 100%;
  max-width: 600px;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 25px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.search-bar:focus {
  outline: none;
  border-color: #007aff;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
}

/* 分类标签样式 */
.category-tabs {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.category-tab {
  padding: 0.8rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  color: #666;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.category-tab.active {
  background-color: #007aff;
  color: #fff;
  border-color: #007aff;
}

.category-tab:hover {
  background-color: #f0f7ff;
  border-color: #007aff;
  color: #007aff;
}

/* 食物卡片网格样式 */
.food-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.food-card {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  padding: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  position: relative;
}

.food-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
}

.food-card.selected {
  border: 2px solid #007aff;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.food-name {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
}

.food-calories {
  color: #888;
  font-size: 0.9rem;
}

.food-category-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 0.3rem 0.6rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 500;
}

.category-healthy {
  background-color: #e6f7ef;
  color: #00a86b;
}

.category-moderate {
  background-color: #fff3e0;
  color: #ff9800;
}

.category-unhealthy {
  background-color: #ffebee;
  color: #f44336;
}

/* 计算区域样式 */
.calculator-container {
  background: rgba(255, 248, 240, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  margin-bottom: 2rem;
}

/* 计算区域样式 */
.calculator-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
}

/* BMI计算器卡片样式 */
.bmi-calculator-container {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  padding: 2rem;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
  margin-bottom: 1.5rem; /* 增加与已选食物卡片的间距 */
}

/* BMI结果区域样式 */
.bmi-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

/* 结果卡片样式 */
.result-card {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
  padding: 1.5rem;
  transition: all 0.3s ease;
}

/* 结果卡片头部 */
.result-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid #f0f0f0;
}

.result-card-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #333;
}

.result-unit {
  font-size: 0.85rem;
  color: #888;
  background-color: #f5f5f5;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
}

/* 结果卡片内容 */
.result-card-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 主要数值显示 */
.result-main-value {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 2.5rem;
  font-weight: 700;
  color: #2196f3;
  margin: 0.5rem 0;
}

.result-calories-unit {
  font-size: 1rem;
  color: #888;
  font-weight: 400;
}

/* BMI分类指示器 */
.bmi-category-indicator {
  font-size: 1rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* BMI进度条容器 */
.bmi-progress-container {
  width: 100%;
  margin: 0.5rem 0;
}

/* BMI进度条 */
.bmi-progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

/* BMI进度填充 */
.bmi-progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: all 0.5s ease;
  background-color: #2196f3;
}

/* BMI范围标签 */
.bmi-ranges {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #666;
}

/* 结果解读 */
.result-interpretation {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #2196f3;
}

.result-interpretation p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
}

/* BMI分类颜色 */
.bmi-underweight {
  background-color: #e3f2fd;
  color: #1976d2;
}

.bmi-normal {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.bmi-overweight {
  background-color: #fff3e0;
  color: #ef6c00;
}

.bmi-obese {
  background-color: #ffebee;
  color: #c62828;
}

/* 计算按钮容器 */
.calculate-button-container {
  display: flex;
  justify-content: center;
  margin: 2rem 0;
}

/* 计算按钮样式 */
.calculate-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 25px;
  padding: 15px 40px;
  color: white;
  text-decoration: none;
  font-size: 1.1rem;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  display: inline-block;
  min-width: 200px;
}

/* 计算按钮悬停效果 */
.calculate-btn:hover {
  background: linear-gradient(135deg, #5a6fd8 0%, #6a408e 100%);
  transform: translateY(-3px);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
  color: white;
}

/* BMI进度条颜色 */
.progress-underweight {
  background-color: #1976d2;
}

.progress-normal {
  background-color: #4caf50;
}

.progress-overweight {
  background-color: #ff9800;
}

.progress-obese {
  background-color: #f44336;
}

/* 总热量卡片样式 */
.calories-card {
  margin-bottom: 2rem;
}

/* 总热量数值样式 */
.calories-card .result-main-value {
  color: #ff9800;
}

/* 总热量结果解读样式 */
.calories-card .result-interpretation {
  border-left-color: #ff9800;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .bmi-results {
    grid-template-columns: 1fr;
  }

  .result-main-value {
    font-size: 2rem;
  }
}

/* 推荐区域样式 */
.recommendation-section {
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 15px;
  padding: 1.5rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

/* 推荐区域标题 */
.recommendation-header {
  font-size: 1.3rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #f0f0f0;
}

/* 可折叠标题样式 */
.collapsible-header {
  cursor: pointer;
  justify-content: space-between;
  transition: all 0.3s ease;
}

.collapsible-header:hover {
  color: #007aff;
  border-bottom-color: #007aff;
}

/* 折叠图标样式 */
.collapse-icon {
  transition: transform 0.3s ease;
  font-size: 1rem;
}

/* 折叠内容样式 */
.collapsible-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
  opacity: 0;
  transform: translateY(-10px);
  transition: all 0.3s ease;
}

/* 展开状态 */
.collapsible-content.expanded {
  max-height: 2000px;
  opacity: 1;
  transform: translateY(0);
  margin-top: 1rem;
}

/* 展开时的图标旋转 */
.collapsible-header.expanded .collapse-icon {
  transform: rotate(180deg);
}

/* 推荐卡片 */
.recommendation-card {
  background: rgba(249, 249, 249, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  padding: 1.5rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #5cb85c;
  /* 推荐图标 */
  .recommendation-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
    font-size: 1.5rem;
  }

  .exercise-icon {
    background-color: rgba(92, 184, 92, 0.1);
    color: #5cb85c;
  }

  .diet-icon {
    background-color: rgba(240, 173, 78, 0.1);
    color: #f0ad4e;
  }

  /* 推荐内容标题 */
  .recommendation-card h4 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .recommendation-card h5 {
    font-size: 1rem;
    font-weight: 600;
    color: #555;
    margin: 1rem 0 0.5rem;
  }

  /* 推荐文本 */
  .recommendation-text {
    color: #666;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  /* 推荐详情 */
  .recommendation-details {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 120px;
    background-color: white;
    padding: 0.8rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .detail-label {
    font-size: 0.8rem;
    color: #888;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-value {
    font-size: 0.95rem;
    font-weight: 500;
    color: #333;
  }

  /* 推荐建议列表 */
  .recommendation-tips {
    list-style-type: none;
    padding: 0;
    margin: 0;
  }

  .recommendation-tips li {
    padding: 0.5rem 0;
    padding-left: 1.5rem;
    position: relative;
    color: #666;
    line-height: 1.5;
  }

  .recommendation-tips li::before {
    content: "•";
    color: #5cb85c;
    font-weight: bold;
    font-size: 1.5rem;
    position: absolute;
    left: 0;
    top: -0.2rem;
  }

  /* 推荐占位符样式 */
  .recommendation-placeholder {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 2rem;
    background-color: #f5f5f5;
    border-radius: 8px;
  }
}

/* 计算器标题样式 */
.calculator-header {
  font-size: 1.8rem;
  font-weight: 700;
  color: #333;
  text-align: center;
  margin-bottom: 0.8rem;
}

/* 计算器说明文字样式 */
.calculator-description {
  text-align: center;
  color: #888888;
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

/* BMI计算器标题 */
.bmi-calculator-container h2 {
  color: #333;
  margin-bottom: 1.5rem;
  text-align: center;
}

/* BMI表单样式 */
.bmi-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

/* 表单组样式 */
.form-group,
.input-group {
  display: flex;
  flex-direction: column;
}

/* 标签样式 */
.form-group label,
.input-group label {
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #555;
  font-size: 0.95rem;
}

/* 输入框样式 */
.form-group input[type="number"],
.input-group input[type="number"] {
  padding: 0.85rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  transition: all 0.3s ease;
  background-color: #fafafa;
  color: #333;
}

/* 输入框焦点样式 */
.form-group input[type="number"]:focus,
.input-group input[type="number"]:focus {
  outline: none;
  border-color: #007aff;
  background-color: #ffffff;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

/* 输入框占位符样式 */
.form-group input[type="number"]::placeholder,
.input-group input[type="number"]::placeholder {
  color: #cccccc;
}

/* 性别选择样式 */
.gender-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.gender-options {
  display: flex;
  width: 100%;
  gap: 0;
  align-items: center;
  flex-wrap: nowrap;
}

.gender-option {
  position: relative;
  width: 50%;
}

/* 隐藏原生radio按钮 */
.gender-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

/* 自定义gender-label样式 */
.gender-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem 1.5rem;
  background-color: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  gap: 0.5rem;
}

/* 悬停效果 */
.gender-label:hover {
  background-color: #e3f2fd;
  border-color: #90caf9;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(144, 202, 249, 0.3);
}

/* 选中状态 */
.gender-option input[type="radio"]:checked + .gender-label {
  background-color: #e3f2fd;
  border-color: #2196f3;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

/* 文字样式 */
.gender-text {
  font-size: 1rem;
  font-weight: 500;
  color: #495057;
  text-align: center;
}

/* 选中状态的文字颜色 */
.gender-option input[type="radio"]:checked + .gender-label .gender-text {
  color: #2196f3;
  font-weight: 600;
}

/* 计算按钮样式 */
.calculate-btn {
  width: 100%;
  padding: 1rem;
  background-color: #007aff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease;
  margin-bottom: 2rem;
}

/* 计算按钮悬停样式 */
.calculate-btn:hover {
  background-color: #0056b3;
}

/* 选择的食物项样式 */
.selected-food-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.selected-food-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.food-amount-control {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.amount-input {
  width: 60px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 5px;
  text-align: center;
}

.unit-selector {
  display: flex;
  border: 1px solid #ddd;
  border-radius: 5px;
  overflow: hidden;
  width: 100%;
}

.unit-option {
  flex: 1;
  padding: 0.5rem;
  cursor: pointer;
  background-color: #fff;
  color: #666;
  transition: all 0.3s ease;
  text-align: center;
  margin: 0;
  width: 50%;
  box-sizing: border-box;
}

.unit-option.active {
  background-color: #007aff;
  color: #fff;
}

.remove-food-btn {
  background-color: #ff3b30;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .container {
    padding: 80px 1rem 1rem;
  }

  .hero-section h1 {
    font-size: 2rem;
  }

  .food-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .selected-food-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .food-amount-control {
    width: 100%;
    justify-content: space-between;
  }

  /* 调整hero-section在移动设备上的背景图片 */
  .hero-section {
    padding: 2rem 0;
    background-position: center center;
  }

  /* BMI计算器响应式样式 */
  .bmi-calculator-container {
    padding: 1.5rem;
  }

  .bmi-inputs {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .gender-options {
    flex-direction: row;
    justify-content: space-between;
    gap: 1rem;
  }

  .gender-label {
    padding: 0.75rem 1rem;
    min-width: 80px;
  }
}
</style>
