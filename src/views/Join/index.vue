<template>
  <div class="join-page" :data-dir="stepDir" :style="pageStyle">
    <input
      ref="avatarInputRef"
      type="file"
      class="join-file"
      accept="image/*"
      @change="handleAvatarFileChange"
    />

    <div class="join-stage">
      <!-- 管理员跳步预览（仅生产环境 + role=admin）。
           能跳过验证码直达完成页的入口本质上是一个验证旁路，所以三重条件必须
           同时成立才渲染（见 probeAdmin 注释）。
           ⚠️ 它放在 .join-stage 的**流内第一个节点**，不是 fixed 浮层 ——
           浮层无论贴哪条边都会盖住某段内容（旧版贴顶盖住了字标），
           做成 flex 项只是把卡片压矮一点，物理上不可能遮挡。 -->
      <div
        v-if="isAdminPreviewReady"
        class="join-admin-preview"
        role="group"
        aria-label="管理员预览"
      >
        <span class="join-admin-preview-label">预览</span>
        <!-- 完成页用 step: 0 作哨兵值 —— 它不是第 7 个"步骤"（用户在那里不做任何决定），
             adminPreviewJump 见到 0 就置 isDone，不写进 currentStep。
             ⚠️ 写成 7 会被 Math.min(TOTAL_STEPS, …) 截成 6，
             表现是「点了欢迎页却停在第⑥屏」。 -->
        <button
          v-for="item in [
            { step: 1, label: '① 邮箱' },
            { step: 2, label: '② 验证码' },
            { step: 3, label: '③ 建号' },
            { step: 4, label: '④ 生日' },
            { step: 5, label: '⑤ 头像' },
            { step: 6, label: '⑥ 密钥' },
            { step: 0, label: '⑦ 欢迎' },
          ]"
          :key="item.step"
          type="button"
          class="join-admin-preview-btn"
          :class="{ 'is-now': adminPreviewStep === item.step }"
          @click="adminPreviewJump(item.step)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="join-card">
        <!-- 纯极简外壳：只有字标 + 一条发丝线，不放图、不放玻璃、不放统计数字。
             右栏（表单）就是页面主体，桌面只把内容收在 420px 里居中。 -->
        <header class="join-head">
          <span class="join-wordmark">BOH</span>
          <span class="join-head-sub">方块之家</span>
        </header>

        <main class="join-main">
          <template v-if="!isDone">
            <div ref="mainRef" class="join-inner">
              <div class="join-progress">
                <div class="join-progress-dots">
                  <!-- 四段细线，靠间距表达分隔。不再插连接线元素：
                       线本身已经是连续的量尺，再插一条 26px 的灰线会把它们连成一条灰带，
                       且多一层 DOM 就意味着多一处可以错位的地方。 -->
                  <span
                    v-for="n in TOTAL_STEPS"
                    :key="n"
                    class="join-dot"
                    :class="{ 'is-done': n < currentStep, 'is-now': n === currentStep }"
                    :data-dot="n"
                  ></span>
                </div>
                <!-- 「第 1 步 / 共 6 步」信息量其实只有「1」和「6」两个数字，
                     中文那些字都是语法填充。视觉上收成 1/6；
                     但 data-step / data-total 保留完整语义，探针读它们而不是
                     去解析可见文本 —— 否则文案一改，整套探针的 waitStep 全废。 -->
                <div class="join-progress-text" :data-step="currentStep" :data-total="TOTAL_STEPS">
                  <span class="join-progress-num">{{ currentStep }}</span>
                  <span class="join-progress-sep">/</span>
                  <span class="join-progress-total">{{ TOTAL_STEPS }}</span>
                </div>
              </div>

              <div v-if="alerts.length" class="join-alerts" role="alert">
                <p>还有几处需要处理</p>
                <ul>
                  <li v-for="(item, i) in alerts" :key="i">
                    <button type="button" @click="focusField(item.field)">· {{ item.text }}</button>
                  </li>
                </ul>
              </div>

              <form autocomplete="on" novalidate @submit.prevent="handleNext">
                <div
                  ref="viewportRef"
                  class="join-viewport"
                  :style="{ height: viewportHeight + 'px' }"
                >
                  <!-- 第 ① 屏：邮箱 + 协议勾选。
                       为什么协议在这一屏而不是单独一屏：账号要到第 ② 屏验证通过才建立，
                       所以「同意」正好落在「账户创建」之前 —— 这个位置在合规上是站得住的，
                       不是把协议塞到第一屏图省事。
                       勾选结果会随 signInWithOtp 的 options.data 一次性写进
                       profiles.terms_accepted_at / terms_version，不依赖前端事后补写。 -->
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 1 }"
                    :inert="currentStep !== 1 || undefined"
                    aria-label="邮箱"
                  >
                    <h2>连接到 BOH 社区</h2>
                    <p class="join-lead">先验证你的邮箱。验证通过后才会创建账户。</p>

                    <div class="join-fld" :class="fieldClass('email')" data-field="email">
                      <label class="join-label" for="joinEmail"
                        >电子邮件<span class="join-tag join-tag-req">必填</span></label
                      >
                      <div class="join-ctrl">
                        <input
                          id="joinEmail"
                          v-model="formData.email"
                          type="email"
                          name="email"
                          autocomplete="email"
                          placeholder="you@example.com"
                          aria-describedby="joinMsgEmail joinHintEmail"
                          :aria-invalid="!!fieldMsg.email"
                          @input="onEmailInput"
                          @blur="validateEmailField"
                        />
                        <span
                          v-if="emailStateText"
                          class="join-state"
                          :class="'is-' + emailState"
                          >{{ emailStateText }}</span
                        >
                      </div>
                      <p id="joinMsgEmail" class="join-msg">{{ fieldMsg.email }}</p>
                      <!-- 原来这里写「用于登录与找回密码，不会出现在你的公开主页上」——
                           和上面引导句是同一件事的两种说法，属于同屏重复。现在只留
                           那条引导句；这里改说「谁会看到」，是真正补充的信息。 -->
                      <p id="joinHintEmail" class="join-hint">
                        仅你本人可见，不会出现在公开主页上。
                      </p>
                    </div>

                    <!-- 协议：这一屏的必选项。两个链接都可点开 -->
                    <div class="join-consent" :class="{ 'is-invalid': termsInvalid }">
                      <label class="join-consent-row">
                        <input
                          v-model="formData.agreedToTerms"
                          type="checkbox"
                          @change="onAgreeChange"
                        />
                        <span class="join-consent-text">
                          我已阅读并同意
                          <a href="#" @click.prevent="openAgreementModal('user')">用户服务协议</a>
                          和
                          <a href="#" @click.prevent="openAgreementModal('privacy')">隐私政策</a>
                        </span>
                      </label>
                      <p class="join-consent-note">{{ termsNote }}</p>
                    </div>
                  </section>

                  <!-- 第 ② 屏：邮箱验证码。
                       业界主流顺序（Instagram / Razer 实测）都是「验证在前、密码在后」：
                       Razer 的可用性测试发现，让用户在验证邮箱之前先建 ID 和密码，
                       是放弃率最高的时刻 —— 「一个还没证明属于你的邮箱，不值得我投入」。
                       反过来，验证过了就是一次真实承诺，后面的表更好填。 -->
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 2 }"
                    :inert="currentStep !== 2 || undefined"
                    aria-label="验证邮箱"
                  >
                    <h2>验证你的邮箱</h2>
                    <p class="join-lead">
                      我们已向 <strong class="join-email-em">{{ formData.email }}</strong> 发送了
                      {{ OTP_LENGTH }} 位验证码，请查收后填入下方。
                    </p>

                    <div class="join-fld" :class="{ 'is-err': !!otpError }" data-field="otp">
                      <label class="join-label" for="joinOtp"
                        >验证码<span class="join-tag join-tag-req">必填</span></label
                      >
                      <OtpCodeInput
                        id="joinOtp"
                        ref="otpInputRef"
                        v-model="otpCode"
                        :length="OTP_LENGTH"
                        :disabled="isSubmitting || isVerifying"
                        :error="!!otpError"
                        @complete="onOtpComplete"
                      />
                      <p class="join-msg" :class="{ 'is-warn-on': !!otpError }">{{ otpError }}</p>
                      <p class="join-hint">
                        验证码 {{ OTP_TTL_MINUTES }} 分钟内有效，仅可使用一次。
                      </p>
                    </div>

                    <div class="join-otp-actions">
                      <button
                        type="button"
                        class="join-mini"
                        :disabled="otpResendCooldown > 0 || isSubmitting || isResending"
                        @click="handleResendOtp"
                      >
                        {{
                          isResending
                            ? '正在发送…'
                            : otpResendCooldown > 0
                              ? `${otpResendCooldown} 秒后可重发`
                              : '没收到？重新发送'
                        }}
                      </button>
                      <!-- 这一屏是唯一允许回退的地方：账号还没建，改邮箱零代价。
                           第 ③ 屏之后账号已经存在，回退会造出孤儿账号。 -->
                      <button
                        type="button"
                        class="join-mini join-mini-quiet"
                        :disabled="isSubmitting || isResending"
                        @click="backToEditEmail"
                      >
                        邮箱填错了
                      </button>
                    </div>
                  </section>

                  <!-- 第 ③ 屏：确认建号（BOH ID + 密码）。
                       标题刻意不叫「设置密码」——Razer 的可用性测试发现，验证过邮箱的
                       用户仍然需要一个**明确的「账号已建成」节点**，否则他们不确定自己
                       到底注册成功了没有。这一屏承担的正是那个确认感，不只是收集字段。
                       邮箱在这里是只读展示：账号已按它建好，改邮箱等于换账号。 -->
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 3 }"
                    :inert="currentStep !== 3 || undefined"
                    aria-label="确认建号"
                  >
                    <h2>创建你的 BOH ID</h2>

                    <!-- 已验证邮箱（只读）—— 给「账号是拿哪个邮箱建的」一个明确交代 -->
                    <div class="join-verified">
                      <span class="join-verified-mark" aria-hidden="true"></span>
                      <span class="join-verified-text">
                        <strong>{{ formData.email }}</strong>
                        <span class="join-verified-sub">已验证</span>
                      </span>
                    </div>

                    <div class="join-fld" :class="fieldClass('account')" data-field="account">
                      <label class="join-label" for="joinAccount"
                        >方块 ID<span class="join-tag join-tag-req">必填</span></label
                      >
                      <div class="join-ctrl">
                        <input
                          id="joinAccount"
                          v-model="formData.account"
                          type="text"
                          name="username"
                          autocomplete="username"
                          placeholder="例如 bolek_2026"
                          maxlength="20"
                          aria-describedby="joinMsgAccount joinHintAccount"
                          :aria-invalid="!!fieldMsg.account || accountState === 'err'"
                          @input="onAccountInput"
                          @blur="onAccountBlur"
                        />
                        <span
                          v-if="accountState"
                          class="join-state"
                          :class="'is-' + accountState"
                          >{{ accountStateText }}</span
                        >
                      </div>
                      <div v-if="accountSuggestions.length" class="join-suggest">
                        <span>已被占用，试试：</span>
                        <button
                          v-for="s in accountSuggestions"
                          :key="s"
                          type="button"
                          @click="applySuggestion(s)"
                        >
                          {{ s }}
                        </button>
                      </div>
                      <p id="joinMsgAccount" class="join-msg">{{ fieldMsg.account }}</p>
                      <p id="joinHintAccount" class="join-hint">
                        3–20 个字符，支持中英文、数字、下划线和连字符。之后可以改。
                      </p>
                    </div>

                    <div class="join-fld" :class="fieldClass('password')" data-field="password">
                      <label class="join-label" for="joinPassword"
                        >密码<span class="join-tag join-tag-req">必填</span></label
                      >
                      <div class="join-ctrl">
                        <input
                          id="joinPassword"
                          v-model="formData.password"
                          :type="showPassword ? 'text' : 'password'"
                          name="password"
                          autocomplete="new-password"
                          placeholder="至少 8 位"
                          aria-describedby="joinMsgPassword joinPwRules"
                          :aria-invalid="!!fieldMsg.password"
                          @input="onPasswordInput"
                        />
                        <button
                          type="button"
                          class="join-toggle"
                          @click="showPassword = !showPassword"
                        >
                          {{ showPassword ? '隐藏' : '显示' }}
                        </button>
                      </div>
                      <div class="join-meter" :data-level="passwordLevel">
                        <i></i><i></i><i></i>
                      </div>
                      <div class="join-meter-label">强度：{{ passwordLevelText }}</div>
                      <ul id="joinPwRules" class="join-rules">
                        <li
                          v-for="rule in passwordRules"
                          :key="rule.key"
                          :class="{ 'is-hit': rule.hit }"
                        >
                          {{ rule.label }}
                        </li>
                      </ul>
                      <p id="joinMsgPassword" class="join-msg">{{ fieldMsg.password }}</p>
                    </div>

                    <!-- 人机验证（ALTCHA）：它是「创建账号」这一动作的反滥用闸门，
                         语义上属于第 ③ 屏 —— 所以必须写在第 ③ 屏的 section 里面，
                         不能另起一个 section（另起会与第 ⑥ 屏同用 currentStep===6，
                         两段同时 is-active，内容直接叠在一起）。 -->
                    <div v-if="altchaEnabled" class="join-altcha">
                      <button
                        v-if="!altchaMounted"
                        type="button"
                        class="join-altcha-idle"
                        @click="altchaMounted = true"
                      >
                        <span class="join-altcha-cb" aria-hidden="true"></span>
                        <span>我不是机器人</span>
                        <span class="join-altcha-brand">ALTCHA</span>
                      </button>
                      <template v-else>
                        <AltchaWidget
                          ref="altchaWidgetRef"
                          v-model="altchaPayload"
                          :challenge="altchaChallengeUrl"
                          :disabled="isSubmitting"
                          auto="off"
                          @statechange="handleAltchaStateChange"
                          @verified="handleAltchaVerified"
                          @expired="handleAltchaExpired"
                        />
                        <p class="join-altcha-status" :class="{ 'is-error': !!altchaError }">
                          {{ altchaError || altchaStatusMessage }}
                        </p>
                        <button
                          v-if="altchaError || altchaState === 'expired'"
                          type="button"
                          class="join-mini"
                          :disabled="isSubmitting"
                          @click="retryAltcha"
                        >
                          重新加载人机验证
                        </button>
                      </template>
                    </div>
                  </section>

                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 4 }"
                    :inert="currentStep !== 4 || undefined"
                    aria-label="生日"
                  >
                    <h2>生日</h2>
                    <p class="join-lead">只用于生日祝福，不会公开展示。</p>

                    <div class="join-fld" :class="fieldClass('birth')" data-field="birth">
                      <label class="join-label" for="joinBirthMonth"
                        >生日<span class="join-tag join-tag-opt">选填</span></label
                      >
                      <div class="join-birth">
                        <select
                          id="joinBirthMonth"
                          v-model="formData.birth_month"
                          autocomplete="bday-month"
                          aria-label="出生月份"
                          @change="onBirthMonthChange"
                        >
                          <option value="">选择月份</option>
                          <option v-for="m in 12" :key="m" :value="String(m)">{{ m }} 月</option>
                        </select>
                        <select
                          v-model="formData.birth_day"
                          autocomplete="bday-day"
                          aria-label="出生日期"
                        >
                          <option value="">选择日期</option>
                          <option v-for="d in birthDayCount" :key="d" :value="String(d)">
                            {{ d }} 日
                          </option>
                        </select>
                      </div>
                      <p class="join-msg" :class="{ 'is-warn-on': !!fieldMsg.birth }">
                        {{ fieldMsg.birth }}
                      </p>
                      <!-- 这里原本还有一条 .join-hint「只用于生日祝福，不会公开展示。」
                           与上面第 ④ 屏的 .join-lead 一字不差 —— 同一句话在一屏里
                           出现两次，第一次读是信息、第二次读就是噪音。已删。 -->
                    </div>
                  </section>

                  <!-- 第 ⑤ 屏：头像。独立一屏是因为它需要「选图 → 裁切 → 预览」三步交互，
                       和生日那种两个下拉框放在一起会把第 ④ 屏撑得很长。 -->
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 5 }"
                    :inert="currentStep !== 5 || undefined"
                    aria-label="头像"
                  >
                    <h2>挑一个头像</h2>

                    <div class="join-fld" data-field="avatar">
                      <span class="join-label"
                        >头像<span class="join-tag join-tag-opt">选填</span></span
                      >
                      <div class="join-avatar-row">
                        <div class="join-avatar-drop">
                          <img
                            v-if="formData.avatarPreview"
                            :src="formData.avatarPreview"
                            alt="头像预览"
                            loading="lazy"
                          />
                          <svg
                            v-else
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                              fill="currentColor"
                            />
                          </svg>
                        </div>
                        <div class="join-avatar-side">
                          <div class="join-avatar-btns">
                            <button type="button" class="join-mini" @click="handleAvatarClick">
                              选择图片
                            </button>
                            <button
                              v-if="formData.avatarPreview"
                              type="button"
                              class="join-mini"
                              @click="clearAvatar"
                            >
                              移除
                            </button>
                          </div>
                          <p class="join-hint">选好后会弹出裁切框，拖动即可定圆心。</p>
                        </div>
                      </div>
                      <p class="join-msg">{{ avatarError }}</p>
                    </div>
                  </section>

                  <!-- 第 ⑥ 屏：通行密钥。用户要求独立一屏，但两个按钮必须等权重 ——
                       「稍后再说」如果做成浅灰小字，那不叫可跳过，叫「你最好点这个」。
                       另外 ceremony 失败（浏览器不支持 / 用户取消 / 超时）必须能退回来，
                       并且「跳过」仍然可点，否则用户卡在第七步出不去。 -->
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 6 }"
                    :inert="currentStep !== 6 || undefined"
                    aria-label="通行密钥"
                  >
                    <h2>在这台设备上快速登录</h2>
                    <p class="join-lead">
                      通行密钥让你下次登录不用输密码，直接用指纹或面容。密钥只保存在这台设备上，BOH
                      只拿到公钥。
                    </p>

                    <div v-if="passkeySupported" class="join-fld" data-field="passkey">
                      <label class="join-switch-row">
                        <input
                          v-model="passkeyOptIn"
                          type="checkbox"
                          class="join-switch-input"
                          role="switch"
                          aria-describedby="joinPasskeyHint"
                        />
                        <span class="join-switch-track" aria-hidden="true"
                          ><span class="join-switch-knob"></span
                        ></span>
                        <span class="join-switch-copy">
                          <span class="join-switch-title">为这台设备添加通行密钥</span>
                          <span class="join-switch-desc"
                            >开启后，下一次登录会直接调用本机的指纹 / 面容验证。</span
                          >
                        </span>
                      </label>
                      <p id="joinPasskeyHint" class="join-hint">
                        也可以稍后在 设置 → 账户安全 里添加或删除。
                      </p>
                    </div>

                    <p v-else class="join-lead join-passkey-unsupported">
                      这台设备不支持通行密钥，跳过即可。
                    </p>
                  </section>
                </div>

                <div class="join-actions">
                  <!-- 返回规则（结构决定的，不是随意取舍）：
                       ② 可回 ①（账号还没建，改邮箱零代价，也最需要）
                       ③ 无返回（账号已按那个邮箱建好，改邮箱＝换账号 ⇒ 孤儿号）
                       ④⑤⑥ 均可回上一步 -->
                  <button
                    v-if="canGoBack"
                    type="button"
                    class="join-btn join-btn-ghost"
                    @click="goBack"
                  >
                    上一步
                  </button>
                  <button type="submit" class="join-btn join-btn-primary" :disabled="isSubmitting">
                    {{ nextLabel }}
                  </button>
                  <button
                    v-if="currentStep === 4 || currentStep === 5 || currentStep === 6"
                    type="button"
                    class="join-btn join-btn-ghost"
                    :disabled="isSubmitting"
                    @click="handleSkip"
                  >
                    跳过
                  </button>
                </div>
              </form>
            </div>

            <!-- 协议条常驻卡底的行为已下线：协议现在是第 ① 屏的必选项（带两个可点链接）。
                 留着这条常驻条会让人以为「协议可以在最后再补勾」，而实际上
                 账号在第 ② 屏验证通过时就建立了 —— 那时协议必须已经同意过。 -->
          </template>

          <div v-else class="join-done">
            <div class="join-done-mark" aria-hidden="true"></div>
            <template v-if="signupNeedsEmailConfirmation">
              <h2>注册成功，还差一步</h2>
              <p>
                验证邮件已发送至 <strong>{{ formData.email }}</strong
                >，请查收并点击邮件里的确认链接，然后回来登录。
              </p>
              <div class="join-done-actions">
                <button
                  type="button"
                  class="join-btn join-btn-ghost"
                  :disabled="isResending || resendRemainingSeconds > 0"
                  @click="handleResendConfirmation"
                >
                  {{
                    isResending
                      ? '正在重发…'
                      : resendRemainingSeconds > 0
                        ? `重新发送（${resendRemainingSeconds}s）`
                        : '没收到？重新发送验证邮件'
                  }}
                </button>
                <router-link to="/login" class="join-btn join-btn-primary">去登录</router-link>
              </div>
              <p v-if="resendStatus === 'sent'" class="join-resend-note is-ok">
                已重新发送，请查收（注意垃圾箱）。
              </p>
              <p v-else-if="resendStatus === 'error'" class="join-resend-note is-err">
                {{ resendErrorMessage }}
              </p>
              <p v-if="passkeySupported" class="join-passkey-deferred">
                邮箱验证完成后，可以在这台设备上添加通行密钥，之后免密码登录（设置 → 账户安全）。
              </p>
            </template>
            <template v-else>
              <h2>注册成功</h2>
              <p>
                欢迎加入方块之家！你的 BOH 身份
                <strong>{{ formData.account }}</strong> 已创建完成，现在可以直接登录。
              </p>

              <div v-if="showPasskeyCard" class="join-passkey-card">
                <div class="join-passkey-head">
                  <span class="join-passkey-ico" aria-hidden="true"></span>
                  <div>
                    <strong class="join-passkey-title">为这台设备添加通行密钥</strong>
                    <p class="join-passkey-desc">
                      这样下次登录不用输密码 —— 直接用指纹 / 面容。密钥只保存在本机，BOH
                      拿不到你的指纹数据。
                    </p>
                  </div>
                </div>
                <div v-if="passkeyState !== 'ok'" class="join-passkey-actions">
                  <button
                    type="button"
                    class="join-btn join-btn-primary"
                    :disabled="passkeyState === 'running'"
                    @click="addPasskey"
                  >
                    {{
                      passkeyState === 'running'
                        ? '请在设备上完成验证…'
                        : passkeyState === 'error'
                          ? '重试'
                          : '用指纹 / 面容添加'
                    }}
                  </button>
                  <button
                    type="button"
                    class="join-btn join-btn-ghost"
                    :disabled="passkeyState === 'running'"
                    @click="showPasskeyCard = false"
                  >
                    以后再说
                  </button>
                </div>
                <div v-else class="join-passkey-ok" aria-live="polite">
                  <span class="join-tick" aria-hidden="true"></span
                  ><span>已添加，下次可以直接用指纹 / 面容登录。</span>
                </div>
                <p class="join-passkey-state" aria-live="polite">{{ passkeyError }}</p>
              </div>

              <div class="join-done-actions">
                <router-link to="/login" class="join-btn join-btn-primary">去登录</router-link>
              </div>
            </template>
          </div>
        </main>
      </div>
    </div>

    <AvatarCropModal
      v-model:visible="showCropModal"
      :image-src="cropImageSrc"
      :loading="isProcessingCrop"
      @confirm="handleCropConfirm"
    />

    <AgreementModal
      :visible="showAgreementModal"
      :title="agreementModalTitle"
      @update:visible="(val) => (showAgreementModal = val)"
      @close="closeAgreementModal"
    >
      <div v-html="agreementModalContent"></div>
    </AgreementModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import AltchaWidget from '@/components/AltchaWidget.vue';
import AgreementModal from '@/components/AgreementModal.vue';
import OtpCodeInput from '@/components/OtpCodeInput.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import DOMPurify from '@/utils/dompurify.js';
import {
  resendSignupConfirmation,
  verifySignupOtp,
  sendSignupOtp,
  checkSignupState,
  completeSignupIdentity,
  signOut,
  OTP_LENGTH,
  OTP_TTL_SECONDS,
  isUsernameAvailable,
  isEmailRegistered,
  getProfileRole,
  updateProfileFields,
  isPasskeySupported,
  registerPasskey,
  toPasskeyRegisterMessage,
} from '@/utils/api/auth-api.js';
import { supabase } from '@/utils/supabase-client.js';
import {
  prepareAvatarUpload,
  uploadAvatarFile,
  removeAvatarByPath,
} from '@/utils/api/avatar-storage.js';
import { logger } from '@/utils/logger.js';
import { getAltchaChallengeUrl, isAltchaEnabled } from '@/utils/altcha.js';

import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/utils/auth-validation.js';

/* ============================================================
   三步向导
   ————————————————————————————————————————————————————————————
   分步只是**前端分段收集**：提交语义没变，最后仍是一次 signUp()。
   三条外部硬约束决定了这个形态：
     1. registerPasskey() 是 authenticated API —— 必须有会话，
        所以仪式只能放在「注册已拿到 session」之后；
     2. WebAuthn create() 需要瞬时用户激活（≈5s）——
        提交点隔着一次网络往返，所以不顺手做，由完成页一个明确按钮触发；
     3. 生日只收月 / 日 —— profiles 只有 birth_month / birth_day，
        没有 birth_year（加年份需要一次迁移）。
   ============================================================ */

/* --join-nav-h：全局 .unified-nav 是 fixed 的，页面必须自己让位；
   写死高度会在导航改版后静默压住内容，所以挂载时实测一次（带 ResizeObserver 跟随）。 */
const navOffset = ref(78);
const pageStyle = computed(() => ({
  '--join-nav-h': `${navOffset.value}px`,
}));

/* 总步数：① 邮箱+协议 → ② 验证码 → ③ 建号(ID+密码) → ④ 生日 → ⑤ 头像 → ⑥ 通行密钥。
   第 ⑦ 态是完成页（isDone），不占步号 —— 它不是"一步"，用户不需要在这里做任何决定。

   为什么是这个顺序（不是拍脑袋）：Instagram、Razer ID 的实测流程都是「验证在前、密码在后」。
   Razer 的可用性测试原文指出，让用户在验证邮箱之前先建 ID 和密码是放弃率最高的时刻 ——
   "一个还没证明属于你的邮箱，不值得我投入"。反过来验证过了就是一次真实承诺，后面更好填。

   但 Razer 同时发现：验证之后**仍然需要一个明确的「账号已建成」节点**，
   否则用户不确定自己到底注册成功了没有。所以第 ③ 屏不叫「设置密码」而叫「创建你的 BOH ID」。 */
const TOTAL_STEPS = 6;

const currentStep = ref(1);
const isDone = ref(false);
const isSubmitting = ref(false);
const showPassword = ref(false);
const alerts = ref([]);
const fieldMsg = reactive({ account: '', email: '', password: '', birth: '' });

/* ---------------- 管理员跳步预览（仅生产环境） ----------------
 *
 * 为什么要有：这个注册流程有 4 步 + 完成页，共 5 个视觉状态，而每走一遍真实流程
 * 都要消耗一封认证邮件（线上 rate_limit_email_sent=15/小时）。做视觉评审时
 * 反复走一遍就要吃掉额度，还会在库里留下待验证账号。
 *
 * 为什么只在生产环境：开发环境（`import.meta.env.DEV`）本来就能热改代码，
 * 不需要这个入口；而如果它在开发环境也存在，很容易被当成正式功能误留。
 * 更关键的是——**它绝不能对普通用户出现**：能跳过验证码直达完成页的按钮，
 * 就是一个绕过邮箱验证的后门。所以三重条件缺一不可：
 *   ① 生产构建（非 DEV）
 *   ② 已登录 ③ role === 'admin'（走 RLS 能读到的自己的 profile，不额外开接口）
 */
const isAdminPreviewReady = ref(false);
const adminPreviewStep = ref(0);
let adminProbeSeq = 0;

const ADMIN_PREVIEW_ENABLED = !import.meta.env.DEV;

/**
 * 开发环境额外允许 `?preview=1` 打开预览条。
 *
 * 为什么需要：这个流程有 5 个视觉状态，其中第 3 步（验证码）要真实发信才能到达，
 * 而线上每小时只有 15 封额度。做视觉迭代时不可能每改一次样式就消耗一封邮件。
 * 用 URL 参数而不是「DEV 下无条件显示」：默认干净的开发环境更容易发现
 * 「预览条压住了别的元素」这类布局问题。
 *
 * 🔴 这里踩过一次：项目用的是 **hash 路由**（`createWebHashHistory`），
 * 真实 URL 形如 `/#/join?preview=1` —— 查询串在 **hash 里面**，
 * `window.location.search` 永远是空串。所以旧写法即使加了参数也永远是 false，
 * 管理员在浏览器里怎么加都看不到入口。三个来源都要读：
 *   ① `location.search`     —— 万一将来换成 history 模式
 *   ② hash 里 `?` 之后的部分 —— 当前 hash 模式的真实位置
 *   ③ 兜底再看一眼整串      —— 防止手滑写成 `/?preview=1#/join`
 */
const hasPreviewFlag = () => {
  if (typeof window === 'undefined') return false;
  const { search, hash } = window.location;
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  return [search, hashQuery].some((qs) => new URLSearchParams(qs).get('preview') === '1');
};

const ADMIN_PREVIEW_FORCED = import.meta.env.DEV && hasPreviewFlag();

const probeAdmin = async () => {
  // 开发环境用 ?preview=1 时无条件放行（纯视觉迭代，不碰真实数据）
  if (ADMIN_PREVIEW_FORCED) {
    isAdminPreviewReady.value = true;
    return;
  }
  // 生产环境：必须已登录 + role=admin 才显示
  if (!ADMIN_PREVIEW_ENABLED) return;
  const seq = ++adminProbeSeq;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user?.id) return;
    // 只查自己那一行（RLS 保证），不做全表扫描；查询收口在 auth-api（分层棘轮）
    const { role } = await getProfileRole(authData.user.id);
    // 异步回来时可能已经 unmount 或被后续探测覆盖，丢弃过期结果
    if (seq !== adminProbeSeq) return;
    if (role === 'admin') {
      isAdminPreviewReady.value = true;
    }
  } catch {
    /* 探测失败就等于不可用，静默降级 —— 预览入口不值得报错打扰用户 */
  }
};

/** 跳到某一步做视觉检查。不改动任何真实数据，只切 currentStep。 */
const adminPreviewJump = (step) => {
  if (!isAdminPreviewReady.value) return;
  adminPreviewStep.value = step;
  alerts.value = [];
  // 预览时把关键字段填成示例值，否则第 ② 屏会渲染成
  // 「我们已向 发送了 8 位验证码」，中间空一格，看着像 bug；
  // 第 ③ 屏的 ID 输入框空着也看不出「可用」徽标长什么样。
  if (!formData.email) formData.email = 'bolek@example.com';
  if (!formData.account) formData.account = 'bolek_preview';
  if (!formData.password) formData.password = 'preview_2026';
  // 第 ⑦ 项是完成页（isDone），不占步号 —— 它不是一个"步骤"，
  // 用户在那里不需要做任何决定。
  if (step === 0) {
    isDone.value = true;
  } else {
    isDone.value = false;
    currentStep.value = Math.min(TOTAL_STEPS, Math.max(1, step));
  }
  nextTick(() => {
    syncHeight();
    mainRef.value?.scrollTo({ top: 0 });
  });
};

/* ---------------- 邮箱验证码 ---------------- */
const otpCode = ref('');
const otpError = ref('');
const otpInputRef = ref(null);
const isVerifying = ref(false);
/* isResending 复用下方「完成页重发」那一份（同一个动作，不该有两份状态） */
const otpResendCooldown = ref(0);
const OTP_TTL_MINUTES = Math.round(OTP_TTL_SECONDS / 60);
let otpResendTimer = null;

/** 提交成功后记录「邮箱已发出验证码」，用于回退时判断是否要重新发信 */
const otpSentAt = ref(0);
const otpSentTo = ref('');

/** 待补传头像的 userId：signUp 时记下，验证码通过（会话建立）后才真正上传 */
const pendingAvatarUserId = ref('');

/* 注：原左栏（图片 + 品牌面板 + 统计 + 每步标语 STEP_COPY/DONE_COPY）已随
   纯黑白极简外壳一起下线。步骤语义现在只由右栏的 <h2> 承载 —— 两处重复
   会让人以为是两套文案。 */

const formData = reactive({
  account: '',
  email: '',
  password: '',
  birth_month: '',
  birth_day: '',
  avatarPreview: '',
  avatarBlob: null,
  website: '', // honeypot
  agreedToTerms: false,
});

const nextLabel = computed(() => {
  if (isSubmitting.value) return '正在处理…';
  if (isVerifying.value) return '正在验证…';
  // 每一步的按钮文案都要说清「点下去会发生什么」，尤其前两步有副作用：
  //   ① 会真的发出一封邮件   ② 会真的建出账号   ③ 会真的把 ID 和密码写进库
  if (currentStep.value === 1) return '发送验证码';
  if (currentStep.value === 2) return '验证并继续';
  if (currentStep.value === 3) return '创建账户';
  if (currentStep.value === 6) return '完成';
  return '下一步';
});

/* 返回按钮的出现条件（结构决定的，见模板注释）：
   ② 可回 ①；③ 不可回（账号已按邮箱建好）；④⑤⑥ 可回上一步。 */
const canGoBack = computed(() => currentStep.value >= 4 || currentStep.value === 2);

/* ---------------- 滑屏高度：ResizeObserver 兜住「内容变高被裁掉」 ---------------- */
const viewportRef = ref(null);
const viewportHeight = ref(320);
let heightObserver = null;

const syncHeight = () => {
  const el = viewportRef.value;
  if (!el) return;
  const active = el.querySelector('.join-step.is-active');
  if (!active) return;
  const h = active.offsetHeight;
  // 只在真的变了才写，避免 ResizeObserver 自激
  if (h > 0 && Math.abs(h - viewportHeight.value) > 1) viewportHeight.value = h;
};

/* ---------------- 字段态 ---------------- */
const accountState = ref(''); // '' | checking | ok | err
const accountSuggestions = ref([]);
const avatarError = ref('');

const fieldClass = (name) => ({
  'is-invalid': ['account', 'email', 'password', 'birth'].includes(name) && !!fieldMsg[name],
  'is-valid':
    (name === 'account' && accountState.value === 'ok') ||
    // 邮箱的「已确认可用」必须来自真实查询结果 —— 原来是
    // 「!fieldMsg.email && !!formData.email」，那等于「填了就算可用」，
    // 随便输个 zzzz@example.com 也会变绿。现在只认 emailState === 'ok'。
    (name === 'email' && emailState.value === 'ok'),
});
const accountStateText = computed(
  () =>
    ({
      checking: '检查中…',
      ok: '可用',
      err: '不可用',
    })[accountState.value] || '',
);

/* 邮箱判定：与 accountState 同一套三态语义（checking / ok / err），
   只是文案不同 —— 「已被注册」比「不可用」更能说明下一步该做什么。 */
const emailState = ref(''); // '' | checking | ok | err
const emailStateText = computed(
  () =>
    ({
      checking: '检查中…',
      ok: '可用',
      err: '已注册',
    })[emailState.value] || '',
);

const clearFieldError = (name) => {
  fieldMsg[name] = '';
  alerts.value = alerts.value.filter((a) => a.field !== name);
};

let accountTimer = null;
let accountSeq = 0;
const ACCOUNT_DEBOUNCE_MS = 420;

const suggestNames = (raw) => {
  const base =
    String(raw || '')
      .trim()
      .replace(/[_\-.]+$/, '') || 'boh';
  const year = new Date().getFullYear();
  const out = [];
  [base + '_' + year, base + '_boh', base + '2'].forEach((s) => {
    const clean = s.replace(/[^A-Za-z0-9_\-\u4e00-\u9fa5]/g, '').slice(0, 20);
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean);
  });
  return out;
};

const checkAccountAvailability = async (immediate = false) => {
  if (accountTimer) window.clearTimeout(accountTimer);
  const value = String(formData.account || '').trim();
  accountSuggestions.value = [];
  if (!value) {
    accountState.value = '';
    clearFieldError('account');
    return;
  }
  const basic = validateUsername(value);
  if (basic) {
    // 格式 / 保留词：同步给结论，不必走网络。
    // 徽标「不可用」只表示「已被占用」，格式问题由 fieldMsg 说明 —— 否则
    // 输个 "a" 右侧就写「不可用」，看着像名字被人抢了。
    accountState.value = '';
    fieldMsg.account = basic;
    return;
  }
  accountState.value = 'checking';
  clearFieldError('account');
  const mySeq = ++accountSeq;
  accountTimer = window.setTimeout(
    async () => {
      const { ok, available } = await isUsernameAvailable(value);
      // 竞态护栏：期间又输入过就丢弃这次结果
      if (mySeq !== accountSeq) return;
      if (String(formData.account || '').trim() !== value) return;
      if (!ok) {
        // 查询失败既不冒充「可用」也不冒充「不可用」—— 交给提交时兜底
        accountState.value = '';
        return;
      }
      if (available) {
        accountState.value = 'ok';
        fieldMsg.account = '';
        return;
      }
      accountState.value = 'err';
      fieldMsg.account = '这个方块 ID 已经有人用了，换一个或者点下面的候选。';
      accountSuggestions.value = suggestNames(value);
    },
    immediate ? 0 : ACCOUNT_DEBOUNCE_MS,
  );
};

const onAccountInput = () => {
  alerts.value = alerts.value.filter((a) => a.field !== 'account');
  void checkAccountAvailability();
};
const onAccountBlur = () => {
  const value = String(formData.account || '').trim();
  if (value && !validateUsername(value)) void checkAccountAvailability(true);
};
const applySuggestion = (name) => {
  formData.account = name;
  void checkAccountAvailability(true);
};

let emailTimer = null;
let emailSeq = 0;
const EMAIL_DEBOUNCE_MS = 480;

/**
 * 邮箱字段校验 + **真实**的「是否已被注册」查询。
 *
 * 原来的实现只做本机格式校验，然后在模板里用
 * `!fieldMsg.email && formData.email` 直接点亮「可用」——
 * 那个徽标从来不代表任何服务端事实（用户口径：「我输入什么都可以判定可用」）。
 *
 * 现在分两层，互不冒充：
 *   ① 格式不合法 ⇒ 立刻给 fieldMsg，徽标清零（不说「已注册」，也不说「可用」）
 *   ② 格式合法 ⇒ 打 RPC 问服务端，结果只驱动 emailState
 * 查询失败（ok=false）时两样都不写 —— 宁可没有徽标，也不要给假结论。
 */
const checkEmailRegisteredState = (immediate = false) => {
  const value = String(formData.email || '').trim();
  if (!value) {
    emailState.value = '';
    clearFieldError('email');
    return;
  }
  const basic = validateEmail(value);
  if (basic) {
    emailState.value = '';
    fieldMsg.email = basic;
    return;
  }
  clearFieldError('email');
  emailState.value = 'checking';
  const mySeq = ++emailSeq;
  emailTimer = window.setTimeout(
    async () => {
      const { ok, registered } = await isEmailRegistered(value);
      // 竞态护栏：期间又输入过就丢弃这次结果（与 ID 查重同一纪律）
      if (mySeq !== emailSeq) return;
      if (String(formData.email || '').trim() !== value) return;
      if (!ok) {
        // 查询失败：不冒充「可用」，也不冒充「已注册」
        emailState.value = '';
        return;
      }
      if (registered) {
        emailState.value = 'err';
        fieldMsg.email = '这个邮箱已经注册过了。请直接用密码登录 —— 忘了密码可以在登录页重置。';
        return;
      }
      emailState.value = 'ok';
      fieldMsg.email = '';
    },
    immediate ? 0 : EMAIL_DEBOUNCE_MS,
  );
};

const validateEmailField = () => {
  checkEmailRegisteredState(true);
};

/* 输入时：先清错，再（防抖）重新判定 —— 但不要每敲一个字就打一次 RPC。
   「检查中…」只在真正发请求前的一瞬间出现，避免边打字边闪。 */
const onEmailInput = () => {
  // 边打字边报红是最烦人的：先把上一轮的结论（徽标与提示）清掉，
  // 等停手 EMAIL_DEBOUNCE_MS 之后再统一判定 —— 格式错也在这时候说，
  // 而不是在第一个字符就喊「邮箱无效」。
  clearFieldError('email');
  emailState.value = '';
  window.clearTimeout(emailTimer);
  emailSeq += 1; // 让在途请求作废，别让它回填旧结论
  const mySeq = emailSeq;
  emailTimer = window.setTimeout(() => {
    if (mySeq !== emailSeq) return;
    checkEmailRegisteredState(true);
  }, EMAIL_DEBOUNCE_MS);
};

/* ---------------- 密码 ---------------- */
const PW_RULES = [
  { key: 'len', label: '至少 8 个字符', test: (v) => v.length >= 8 },
  { key: 'mix', label: '包含字母和数字', test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v) },
  { key: 'case', label: '同时有大小写字母', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { key: 'sym', label: '包含一个符号', test: (v) => /[^A-Za-z0-9]/.test(v) },
];
const passwordRules = computed(() =>
  PW_RULES.map((r) => ({
    key: r.key,
    label: r.label,
    hit: r.test(formData.password || ''),
  })),
);
const passwordLevel = computed(() => {
  const value = formData.password || '';
  if (!value) return 0;
  const hit = PW_RULES.filter((r) => r.test(value)).length;
  if (value.length >= 12 && hit >= 3) return 3;
  return Math.max(1, Math.min(3, hit));
});
const passwordLevelText = computed(() => ['待评估', '弱', '中', '强'][passwordLevel.value]);
const onPasswordInput = () => {
  alerts.value = alerts.value.filter((a) => a.field !== 'password');
  const value = formData.password || '';
  fieldMsg.password = value ? validatePassword(value) : '';
};

/* ---------------- 生日（只有月 / 日 —— 库表没有 birth_year） ---------------- */
const birthDayCount = ref(31);
const refreshBirthDays = () => {
  const month = Number(formData.birth_month) || 0;
  // 用闰年算上限，让 2 月 29 日的生日可选
  birthDayCount.value = month ? new Date(2024, month, 0).getDate() : 31;
  if (Number(formData.birth_day) > birthDayCount.value) formData.birth_day = '';
};
const onBirthMonthChange = () => {
  refreshBirthDays();
  clearFieldError('birth');
};

/* ---------------- 人机验证：点击后才挂载，不再「进页面即解题」 ---------------- */
const altchaEnabled = computed(() => isAltchaEnabled());
const altchaChallengeUrl = computed(() => getAltchaChallengeUrl('signup'));
const altchaMounted = ref(false);
const altchaWidgetRef = ref(null);
const altchaPayload = ref('');
const altchaState = ref('unverified');
const altchaError = ref('');

const altchaStatusMessage = computed(() => {
  if (!altchaEnabled.value) return '';
  if (altchaState.value === 'verified') return '人机验证已完成。';
  if (altchaState.value === 'verifying') return '人机验证进行中…';
  if (altchaState.value === 'expired') return '人机验证已过期，请重新完成。';
  if (altchaState.value === 'error') return '人机验证加载失败，请重试。';
  return '请先完成人机验证。';
});
const resetAltcha = async ({ unmount = false } = {}) => {
  altchaPayload.value = '';
  altchaState.value = 'unverified';
  altchaError.value = '';
  if (unmount) altchaMounted.value = false;
  await nextTick();
  await altchaWidgetRef.value?.reset?.();
};
const handleAltchaStateChange = (nextState) => {
  altchaState.value = String(nextState || '').trim() || 'unverified';
  if (altchaState.value === 'verified') {
    altchaError.value = '';
    return;
  }
  if (altchaState.value === 'expired') {
    altchaPayload.value = '';
    altchaError.value = '人机验证已过期，请重新完成。';
    return;
  }
  if (altchaState.value === 'error') {
    altchaPayload.value = '';
    altchaError.value = '人机验证加载失败，请点击重试。';
    return;
  }
  if (altchaState.value !== 'verifying') altchaPayload.value = '';
};
const handleAltchaVerified = () => {
  altchaError.value = '';
};
const handleAltchaExpired = () => {
  altchaPayload.value = '';
  altchaState.value = 'expired';
  altchaError.value = '人机验证已过期，请重新完成。';
};
const retryAltcha = async () => {
  await resetAltcha();
};

/* ---------------- 通行密钥 ---------------- */
const passkeySupported = ref(false);
const passkeyOptIn = ref(false);
const passkeyState = ref('idle'); // idle | running | ok | error
const passkeyError = ref('');
const showPasskeyCard = ref(false);

const addPasskey = async () => {
  if (passkeyState.value === 'running' || passkeyState.value === 'ok') return;
  passkeyState.value = 'running';
  passkeyError.value = '';
  try {
    const { error } = await registerPasskey();
    if (error) {
      passkeyState.value = 'error';
      passkeyError.value = toPasskeyRegisterMessage(error);
      return;
    }
    passkeyState.value = 'ok';
  } catch (error) {
    logger.warn('join', '通行密钥注册失败:', error);
    passkeyState.value = 'error';
    passkeyError.value = '通行密钥注册失败，请稍后再试。';
  }
};

/* ---------------- 头像 ---------------- */
const avatarInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const isProcessingCrop = ref(false);
const handleAvatarClick = () => avatarInputRef.value?.click();
const handleAvatarFileChange = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
};
const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  avatarError.value = '';
  try {
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const compressedFile = await prepareAvatarUpload(file);
    formData.avatarBlob = compressedFile;
    const reader = new FileReader();
    reader.onload = (e) => {
      formData.avatarPreview = e.target.result;
    };
    reader.readAsDataURL(compressedFile);
    showCropModal.value = false;
  } catch (error) {
    logger.error('join', '裁切处理失败:', error);
    avatarError.value = '头像处理出错，请重试。';
  } finally {
    isProcessingCrop.value = false;
  }
};
const clearAvatar = () => {
  formData.avatarBlob = null;
  formData.avatarPreview = '';
};

const uploadAvatarToSupabase = async (userId, blob = formData.avatarBlob) => {
  if (!blob) return { url: null, filePath: null };
  try {
    const { url, filePath } = await uploadAvatarFile(blob, userId);
    return { url, filePath };
  } catch (error) {
    logger.error('join', '上传头像失败:', error);
    return { url: null, filePath: null };
  }
};
const deleteAvatarFromSupabase = async (filePath) => {
  const error = await removeAvatarByPath(filePath);
  if (error) logger.warn('join', '删除头像失败（非致命）:', error);
};

/* ---------------- 协议（不再写 localStorage，避免与登录页互相影响） ---------------- */
const showAgreementModal = ref(false);
const agreementModalType = ref('user');
const termsInvalid = ref(false);
const TERMS_NOTE = '本次勾选只对当前这次注册有效，不会被带到其它页面。';
const termsNote = ref(TERMS_NOTE);
const agreementModalTitle = computed(() =>
  agreementModalType.value === 'user' ? '方块之家用户服务协议' : '方块之家隐私政策',
);
const agreementModalContent = computed(() =>
  DOMPurify.sanitize(
    agreementModalType.value === 'user' ? userAgreementContent : privacyPolicyContent,
  ),
);
const openAgreementModal = (type) => {
  agreementModalType.value = type;
  showAgreementModal.value = true;
};
const closeAgreementModal = () => {
  showAgreementModal.value = false;
};
const onAgreeChange = () => {
  if (formData.agreedToTerms) {
    termsInvalid.value = false;
    termsNote.value = TERMS_NOTE;
  }
};

/* ---------------- 完成页 / 重发验证邮件 ---------------- */
const signupNeedsEmailConfirmation = ref(false);
const isResending = ref(false);
const resendStatus = ref('');
const resendErrorMessage = ref('');
const RESEND_COOLDOWN_MS = 60 * 1000;
const resendRemainingSeconds = ref(0);
let resendCooldownTimer = null;

const clearResendCooldownTimer = () => {
  if (resendCooldownTimer !== null) {
    clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
  }
};
const startResendCooldown = () => {
  const endsAt = Date.now() + RESEND_COOLDOWN_MS;
  resendRemainingSeconds.value = Math.ceil(RESEND_COOLDOWN_MS / 1000);
  clearResendCooldownTimer();
  resendCooldownTimer = setInterval(() => {
    resendRemainingSeconds.value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (resendRemainingSeconds.value <= 0) clearResendCooldownTimer();
  }, 250);
};
const handleResendConfirmation = async () => {
  if (isResending.value || resendRemainingSeconds.value > 0) return;
  isResending.value = true;
  resendStatus.value = '';
  resendErrorMessage.value = '';
  try {
    const { ok, error } = await resendSignupConfirmation(formData.email);
    if (!ok) {
      const raw = String(error?.message || '');
      resendStatus.value = 'error';
      resendErrorMessage.value = /rate limit/i.test(raw)
        ? '发送过于频繁，请等待一分钟后再试。'
        : raw || '重发失败，请稍后再试。';
      return;
    }
    resendStatus.value = 'sent';
    startResendCooldown();
  } catch (err) {
    logger.warn('join', '重发验证邮件失败', err);
    resendStatus.value = 'error';
    resendErrorMessage.value = '重发失败，请稍后再试。';
  } finally {
    isResending.value = false;
  }
};

/* ---------------- 步骤导航 ---------------- */
const mainRef = ref(null);
/* 注：原来还有 termsRef —— 协议条常驻卡底时用它滚动到勾选框。
   协议移到第 ① 屏后不再需要，已删。 */

const focusField = (name) => {
  document
    .querySelector(`.join-fld[data-field="${name}"] input, .join-fld[data-field="${name}"] select`)
    ?.focus();
};
/* 步进方向：前进 / 后退要往相反方向滑，否则「按上一步」会像又往前走了一次。
   只给 CSS 用（.join-page[data-dir='back']），不参与任何业务判断。 */
const stepDir = ref('fwd');

const goStep = (next) => {
  const target = Math.min(TOTAL_STEPS, Math.max(1, next));
  if (target === currentStep.value) return;
  stepDir.value = target > currentStep.value ? 'fwd' : 'back';
  currentStep.value = target;
  mainRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
  nextTick(() => {
    syncHeight();
    document
      .querySelector('.join-step.is-active input, .join-step.is-active select')
      ?.focus({ preventScroll: true });
  });
};
const goBack = () => {
  alerts.value = [];
  goStep(currentStep.value - 1);
};

const validateStep = (step) => {
  const errs = [];
  if (step === 1) {
    const emailMsg = validateEmail(String(formData.email || '').trim());
    if (emailMsg) {
      fieldMsg.email = emailMsg;
      errs.push({ field: 'email', text: `电子邮件：${emailMsg}` });
    }
    if (!formData.agreedToTerms) {
      termsInvalid.value = true;
      termsNote.value = '需要先勾选协议才能继续 —— 账号会在这个邮箱验证通过时创建。';
      errs.push({ field: 'email', text: '协议：请勾选用户服务协议和隐私政策' });
    }
  }
  if (step === 3) {
    const account = String(formData.account || '').trim();
    const accountMsg = validateUsername(account);
    if (accountMsg) {
      // 徽标只有三种语义：检查中 / 可用 / 不可用（=已被占用）。
      // 空值或格式不合法属于「还没填对」，不该冒充「不可用」——清掉徽标，
      // 由 fieldMsg 说明具体哪里不对（截图里出现过空字段 + 红字「不可用」）。
      accountState.value = '';
      fieldMsg.account = accountMsg;
      errs.push({ field: 'account', text: `方块 ID：${accountMsg}` });
    }
    const passwordMsg = validatePassword(formData.password);
    if (passwordMsg) {
      fieldMsg.password = passwordMsg;
      errs.push({ field: 'password', text: `密码：${passwordMsg}` });
    }
  }
  if (step === 4) {
    // 生日是选填：填一半就整项跳过 —— 给软提示，不做硬拦截
    const month = String(formData.birth_month || '');
    const day = String(formData.birth_day || '');
    fieldMsg.birth =
      (month || day) && !(month && day) ? '月日没填全，这项会先跳过（之后可在用户中心补）。' : '';
  }
  return errs;
};

const handleNext = async () => {
  if (isSubmitting.value || isVerifying.value) return;

  // ① 第 1 屏：邮箱 + 协议。纯本地校验，但**会真的发出一封邮件**。
  if (currentStep.value === 1) {
    const errs = validateStep(1);
    if (errs.length) {
      alerts.value = errs;
      return;
    }
    alerts.value = [];
    termsInvalid.value = false;
    // 同一邮箱已经发过码就直接进第 ② 屏，不要重复发信：
    // 重复调用会撞 429 发信额度（线上每小时只有 15 封），
    // 而且用户会收到两封内容不同的邮件、分不清该用哪个码。
    if (otpSentAt.value && otpSentTo.value === normalizeEmail(formData.email)) {
      goStep(2);
      return;
    }
    await sendOtpForSignup();
    return;
  }

  // ② 第 2 屏：校验验证码 —— 通过即建立会话
  if (currentStep.value === 2) {
    await verifyOtpAndContinue();
    return;
  }

  // ③ 第 3 屏：确认建号（ID + 密码）—— 这一刻账号才真正可用
  if (currentStep.value === 3) {
    await completeIdentity();
    return;
  }

  // ④⑤⑥ 第 4~6 屏：资料 / 头像 / 通行密钥。都可跳过，逐屏推进。
  if (currentStep.value < TOTAL_STEPS) {
    const errs = validateStep(currentStep.value);
    if (errs.length) {
      alerts.value = errs;
      return;
    }
    alerts.value = [];
    // 从第 ⑤ 屏（头像）进第 ⑥ 屏时，把头像真正传上去 —— 此刻会话在，storage 才允许写
    if (currentStep.value === 5) await flushPendingAvatar();
    goStep(currentStep.value + 1);
    return;
  }

  // 第 ⑥ 屏的「完成」：收尾进欢迎页
  await finishAfterVerification();
};

/* ---------------- 验证码：校验 / 重发 / 回退改邮箱 ---------------- */

const startOtpCooldown = (seconds = 60) => {
  otpResendCooldown.value = Math.max(0, Number(seconds) || 60);
  if (otpResendTimer) clearInterval(otpResendTimer);
  otpResendTimer = setInterval(() => {
    otpResendCooldown.value -= 1;
    if (otpResendCooldown.value <= 0 && otpResendTimer) {
      clearInterval(otpResendTimer);
      otpResendTimer = null;
    }
  }, 1000);
};

const onOtpComplete = () => {
  // 填满即清掉上一次的错误提示 —— 否则用户改对了还看着红字
  otpError.value = '';
};

/**
 * 补传头像 —— 必须在会话建立之后调用（验证码通过 / 或注册即得会话两种路径）。
 *
 * 为什么单独抽出来：验证码模式下 signUp 的返回值没有 session，头像在那一刻传不上去；
 * 而验证码通过后用户可能已经走到第 4 步，「补传」发生在另一个时机。
 * 失败不抛错：头像属于可选资料，丢了不该阻断注册收尾。
 */
const flushPendingAvatar = async () => {
  const blob = formData.avatarBlob;
  if (!blob) return;

  /* userId 不能只靠 pendingAvatarUserId 那一个 ref：
     它是为「signUp 返回无 session」那套旧时序准备的，而当前流程的会话是在
     第 ② 屏 verifyOtp 时建立的 —— 那条路径上没人给它赋值。
     只读它会让 flushPendingAvatar 在第一行就 return，用户在 ⑤ 屏选好的头像
     **永远传不上去**，而且不报错、不留痕（真机上就是「选了头像但账户里没有」）。
     所以这里以「当前会话」为第一真源，ref 只作为兜底。 */
  let userId = pendingAvatarUserId.value;
  if (!userId) {
    const { data: authData } = await supabase.auth.getUser();
    userId = authData?.user?.id || '';
  }
  if (!userId) return;

  const { url: avatarUrl, filePath } = await uploadAvatarToSupabase(userId, blob);
  if (!avatarUrl || !filePath) return;

  try {
    const { ok: updated, error: updateError } = await updateProfileFields(userId, {
      avatar_url: avatarUrl,
    });
    if (!updated) {
      logger.error('join', '更新头像 URL 失败:', updateError);
      await deleteAvatarFromSupabase(filePath);
      return;
    }
    // 传成功了才清掉待办，避免「传上去了但下次又传一遍」
    pendingAvatarUserId.value = '';
  } catch (updateErr) {
    logger.error('join', '更新头像时出错:', updateErr);
    await deleteAvatarFromSupabase(filePath);
  }
};

const verifyOtpAndContinue = async () => {
  if (isVerifying.value) return;
  const code = String(otpCode.value || '').replace(/\D/g, '');
  if (code.length !== OTP_LENGTH) {
    otpError.value = `请输入完整的 ${OTP_LENGTH} 位验证码`;
    otpInputRef.value?.focus();
    return;
  }

  otpError.value = '';
  isVerifying.value = true;
  try {
    const { ok, error } = await verifySignupOtp(formData.email, code);
    if (!ok) {
      otpError.value = error?.message || '验证失败，请稍后重试。';
      // 过期/不匹配时清空，逼用户重新输 —— 留着旧值他会以为还能再点一次
      otpCode.value = '';
      otpInputRef.value?.focus();
      // 若服务端说是配额/频率问题，给重发按钮也上锁，别让他连续点
      if (error?.code === 'EMAIL_QUOTA_EXCEEDED') startOtpCooldown(60);
      return;
    }

    /* 验证成功，会话已建立。此刻必须判一件事：这个会话背后是「本次新建的空壳」
       还是「一个已经建完的老账号」。
       signInWithOtp 对已注册邮箱的语义是**登录** —— 如果放行，第 ③ 屏会把
       老用户的方块 ID 和密码整个改写掉，而用户完全不会察觉。
       判据是 profiles.signup_completed_at（迁移 2026112503）：
         为 NULL     ⇒ 上次停在半路，允许继续（否则他的邮箱永久失效：没密码也登不进来）
         非 NULL     ⇒ 真老用户，挡回去登录
       checkSignupState 拿不到数据时返回 incomplete:true（fail-open）——
       宁可让极少数老用户多填一屏，也不要让正常新用户卡死在这里。 */
    const state = await checkSignupState();
    if (state.ok && state.incomplete === false) {
      otpError.value = '这个邮箱已经注册过了。请直接用密码登录 —— 如果忘了密码，可以在登录页重置。';
      otpCode.value = '';
      // 立刻退掉这个会话：留着它等于「以老用户身份登录着却在注册页」，
      // 后续任何写入都会作用到那个老账号上。
      await signOut().catch(() => {});
      return;
    }

    // 新账号或半成品账号 → 进第 ③ 屏确认建号
    goStep(3);
  } catch (err) {
    logger.warn('join', '验证码校验异常:', err);
    otpError.value = '验证失败，请检查网络后重试。';
  } finally {
    isVerifying.value = false;
  }
};

const handleResendOtp = async () => {
  if (isResending.value || otpResendCooldown.value > 0) return;
  isResending.value = true;
  otpError.value = '';
  try {
    const { ok, error, retryAfterSeconds } = await resendSignupConfirmation(formData.email);
    if (!ok) {
      otpError.value = error?.message || '发送失败，请稍后再试。';
      // 429 时必须听服务端给的秒数，不能一律 60 秒 ——
      // 额度型限流是整小时的，写死 60 秒会让用户每分钟重试一次、每次都失败。
      startOtpCooldown(retryAfterSeconds || 60);
      return;
    }
    startOtpCooldown(60);
    otpCode.value = '';
    otpInputRef.value?.focus();
  } catch (err) {
    logger.warn('join', '重发验证码异常:', err);
    otpError.value = '发送失败，请稍后再试。';
  } finally {
    isResending.value = false;
  }
};

/** 邮箱填错：回第 1 步。同时清掉「已发码」标记，避免改完邮箱后跳过 signUp */
const backToEditEmail = () => {
  otpSentAt.value = 0;
  otpSentTo.value = '';
  otpCode.value = '';
  otpError.value = '';
  goStep(1);
  nextTick(() => {
    document.getElementById('joinEmail')?.focus();
  });
};

/** 「跳过」：第 ④⑤⑥ 屏各自的可选项清掉，直接进欢迎页。
 *  三屏的跳过语义不同，所以分开清：
 *    ④ 生日 —— 清月日（库里已是 NULL，这里只是别把半填的值带下去）
 *    ⑤ 头像 —— 撤销预览与 blob，别留下「选过但没传」的悬空状态
 *    ⑥ 通行密钥 —— 不勾就是不建，什么都不用做
 */
const handleSkip = async () => {
  if (isSubmitting.value) return;
  if (currentStep.value === 4) {
    formData.birth_month = '';
    formData.birth_day = '';
    refreshBirthDays();
  } else if (currentStep.value === 5) {
    clearAvatar();
  } else if (currentStep.value === 6) {
    passkeyOptIn.value = false;
  }
  await finishAfterVerification();
};

/**
 * 收尾：进欢迎页（第 ⑦ 态）。
 *
 * 到这一步账号已经完全可用了 —— ID、密码、signup_completed_at 都在第 ③ 屏写好了。
 * 这里只剩「把第 ④⑤ 屏的选填项补上」和「把通行密钥的选择兑现成一次 ceremony」。
 * 所以任何一步失败都**不该阻断**欢迎页：用户已经注册成功了，
 * 因为头像上传失败就把人拦在注册流程里是荒唐的。
 */
const finishAfterVerification = async () => {
  if (isSubmitting.value) return;

  const month = String(formData.birth_month || '');
  const day = String(formData.birth_day || '');
  const hasBirth = Boolean(month && day);

  isSubmitting.value = true;
  try {
    const { data: sessionData } = await supabase.auth.getUser();
    const uid = sessionData?.user?.id;
    if (!uid) {
      // 走到这里说明会话丢了（换标签页、清了 storage）。不能假装成功。
      alerts.value = [{ field: 'email', text: '登录状态已失效，请重新验证邮箱。' }];
      otpCode.value = '';
      goStep(2);
      return;
    }

    if (hasBirth) {
      const { error: birthError } = await updateProfileFields(uid, {
        birth_month: month,
        birth_day: day,
      });
      // 生日是可选项，写失败不阻断注册 —— 但必须留痕，否则「用户说填了却没生效」查不出因
      if (birthError) logger.warn('join', '写入生日失败（非致命）:', birthError);
    }

    // 头像：第 ⑤ 屏若选了图，blob 还在内存里（第 ⑤ → ⑥ 过渡时已尝试上传过一次，
    // 这里是兜底 —— 用户可能在主按钮路径之外到达本函数）
    await flushPendingAvatar();

    // 通行密钥：authenticated API，此刻会话确实在，可以真正调用
    showPasskeyCard.value = Boolean(passkeyOptIn.value) && passkeySupported.value;
    passkeyState.value = 'idle';
    passkeyError.value = '';
    signupNeedsEmailConfirmation.value = false;

    isDone.value = true;
    await nextTick();
    mainRef.value?.scrollTo({ top: 0 });
  } catch (err) {
    logger.error('join', '收尾失败:', err);
    alerts.value = [{ field: 'account', text: '保存失败，请稍后重试。' }];
  } finally {
    isSubmitting.value = false;
  }
};

/* ---------------- 第 ① 屏：发码（实际上就是建号 + 发信）---------------- */

/**
 * 第 ① 屏的提交：只凭邮箱建账号 + 发 8 位验证码。
 *
 * 与旧实现（signUp 一次提交邮箱+密码+ID）的区别：
 *   signUp 是原子操作，必须三样齐全才能调；而新流程第 ① 屏还拿不到后两样。
 *   所以这里走 `signInWithOtp({ shouldCreateUser: true })` —— 它只要邮箱。
 *
 * 协议同意随 `options.data` 一起进去，由 auth.users 上的触发器一次性写进
 * `profiles.terms_accepted_at / terms_version`。**故意不在前端事后补写**：
 * 用户验证完就关页面的话，那次补写永远不会发生，等于没有同意记录。
 */
const sendOtpForSignup = async () => {
  const normalizedEmail = normalizeEmail(formData.email);

  // honeypot：机器人填了这个隐藏字段就直接静默失败，不告诉它哪里露了馅
  if (String(formData.website || '').trim()) {
    alerts.value = [{ field: 'email', text: '注册请求异常，请稍后重试。' }];
    return;
  }

  isSubmitting.value = true;
  try {
    const { ok, error, retryAfterSeconds } = await sendSignupOtp(normalizedEmail, {
      termsAcceptedAt: new Date().toISOString(),
    });

    if (!ok) {
      // 已注册的邮箱：这里**不能**直接放行去验证 —— 那会把老用户送进第 ③ 屏
      // 改写他的 ID 和密码。但也不能一律拒绝：用户上次可能刚好停在半路
      // （账号建了、密码没设），那种情况必须允许继续。
      // 分辨靠 `checkSignupState`，但那时还没有会话 —— 所以先发码，
      // 等第 ② 屏验证通过拿到会话后再判（见 verifyOtpAndContinue）。
      alerts.value = [
        {
          field: 'email',
          text: `电子邮件：${error?.message || '发送失败，请稍后重试。'}`,
        },
      ];
      if (retryAfterSeconds > 0) startOtpCooldown(retryAfterSeconds);
      return;
    }

    otpSentAt.value = Date.now();
    otpSentTo.value = normalizedEmail;
    otpCode.value = '';
    otpError.value = '';
    // 服务端 60 秒内不允许重发，界面倒计时跟着走，避免用户点了没反应
    startOtpCooldown(60);
    goStep(2);
  } catch (err) {
    logger.warn('join', '发送注册验证码异常:', err);
    alerts.value = [{ field: 'email', text: '发送失败，请检查网络后重试。' }];
  } finally {
    isSubmitting.value = false;
  }
};

/* ---------------- 第 ③ 屏：确认建号（ID + 密码）---------------- */

/**
 * 把 ID / 生日 / 密码写进去，然后进第 ④ 屏。
 *
 * 这一屏是整条流程的**分水岭**：在此之前账号是空壳（无密码、ID 是占位），
 * 在此之后是一个能登录的正常账号。所以它不叫「设置密码」而叫「创建你的 BOH ID」——
 * Razer 的可用性测试发现，验证过邮箱的用户仍然需要一个明确的「账号已建成」节点。
 */
const completeIdentity = async () => {
  if (isSubmitting.value) return;

  const errs = validateStep(3);
  if (errs.length) {
    alerts.value = errs;
    // ID 出错时顺手刷一次字段态与候选（防抖可能还没跑完就被点了提交）。
    // ⚠️ 必须判断「有值」：checkAccountAvailability 在空值时会把字段错误
    //    和摘要一起清掉（它认为空值等于「还没填，不用报错」），
    //    于是空提交时 ID 的错误会被自己刚刚设的校验擦掉。
    if (String(formData.account || '').trim() && errs.some((e) => e.field === 'account')) {
      void checkAccountAvailability(true);
    }
    return;
  }

  // 人机验证（若启用）：账号创建是反滥用闸门，必须在真正写库之前过。
  // 放在这一屏而不是第 ① 屏，是因为第 ① 屏只发信、失败代价低；
  // 而这一屏会往 profiles 写真实数据。
  if (altchaEnabled.value && altchaState.value !== 'verified') {
    alerts.value = [{ field: 'account', text: '人机验证：请先完成「我不是机器人」验证。' }];
    return;
  }

  alerts.value = [];
  isSubmitting.value = true;
  try {
    const { ok, error, step } = await completeSignupIdentity({
      username: formData.account,
      password: formData.password,
      birthMonth: formData.birth_month,
      birthDay: formData.birth_day,
    });

    if (!ok) {
      const message = error?.message || '保存失败，请重试。';
      if (step === 'username') {
        fieldMsg.account = message;
        alerts.value = [{ field: 'account', text: `方块 ID：${message}` }];
        if (error?.code === 'USERNAME_TAKEN') {
          accountState.value = 'err';
          accountSuggestions.value = suggestNames(String(formData.account || '').trim());
        }
      } else if (step === 'password') {
        fieldMsg.password = message;
        alerts.value = [{ field: 'password', text: `密码：${message}` }];
      } else if (step === 'session') {
        // 会话丢了（换标签页 / 清了 storage / 验证码已用过）：只能回第 ② 屏重验。
        // 不能假装成功 —— 用户会以为自己注册好了，其实密码还是空的。
        otpCode.value = '';
        otpError.value = '';
        alerts.value = [{ field: 'email', text: message }];
        goStep(2);
      } else {
        alerts.value = [{ field: 'account', text: message }];
      }
      return;
    }

    // 建号完成 → 进第 ④ 屏（生日）
    goStep(4);
  } catch (err) {
    logger.error('join', '创建账户异常:', err);
    alerts.value = [{ field: 'account', text: '保存失败，请稍后重试。' }];
  } finally {
    isSubmitting.value = false;
  }
};
/* ---------------- 生命周期 ---------------- */
let navObserver = null;
const measureNav = () => {
  const nav = document.querySelector('.unified-nav');
  const h = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  const next = h > 0 ? h : 0;
  if (next !== navOffset.value) navOffset.value = next;
};

onMounted(() => {
  refreshBirthDays();
  void isPasskeySupported().then((supported) => {
    passkeySupported.value = supported;
  });
  // 管理员预览探测：非生产环境内部直接 return，零开销
  void probeAdmin();

  measureNav();
  const nav = document.querySelector('.unified-nav');
  if (nav) {
    navObserver = new ResizeObserver(measureNav);
    navObserver.observe(nav);
  }

  heightObserver = new ResizeObserver(() => syncHeight());
  document.querySelectorAll('.join-step').forEach((el) => heightObserver.observe(el));
  window.addEventListener('resize', syncHeight);
  nextTick(syncHeight);
});

onUnmounted(() => {
  heightObserver?.disconnect();
  heightObserver = null;
  navObserver?.disconnect();
  navObserver = null;
  window.removeEventListener('resize', syncHeight);
  if (accountTimer) window.clearTimeout(accountTimer);
  clearResendCooldownTimer();
  if (otpResendTimer) {
    clearInterval(otpResendTimer);
    otpResendTimer = null;
  }
});

watch(currentStep, () => {
  nextTick(syncHeight);
});
</script>

<style scoped>
/* ============================================================
   纯极简黑白（2026-11-25 用户口径）
   ─────────────────────────────────────────────────────────────
   一句话：这一页只有**墨色和底色两色**，没有第三种颜色、没有图片、
   没有毛玻璃、没有阴影。层级靠**字重 / 透明度 / 发丝线 / 位置**表达。

   为什么放弃原来的「照片 + 液态玻璃 + 蓝色强调」：
     · 玻璃要有一张可模糊的底图才有意义，而极简页不该有底图 ⇒ 材质没了依据；
     · 蓝色强调是「动作色」，一屏出现 4~6 处（进度点、链接、按钮、开关、
       强度条）就变成装饰色 —— 用户要的是黑白，那就一个彩点都不留。

   两条实现纪律（踩过的）：
     ① **零裸色值**。全部派生自 `--boh-gate-bg` / `--boh-gate-ink` 这一对，
        它们亮暗成对定义在 `tokens.css`（`themes/dark-mode.css` 是懒加载的，
        写那儿在非暗色首屏会解析成空串 ⇒ 元素直接隐形）。所以本文件
        没有任何 `[data-theme="dark"]` 覆盖块，暗色自动跟随。
     ② **只用色相无关的表达方式**：错误态靠「描边加粗 + 字重 + 文案」而不是红色，
        密码强度靠「亮起的条数」而不是红黄绿。这不只是审美 —— 纯色表达
        本来就不该依赖颜色（色弱用户读不出来的东西，就不算有效反馈）。
   ============================================================ */
.join-page {
  /* 唯一两个色源 */
  --j-bg: var(--boh-gate-bg, #ffffff);
  --j-ink: var(--boh-gate-ink, #0a0a0a);
  /* 派生：72% 用于正文次级，58% 用于提示。
     ⚠️ 58% 是**实测**下界，不是估的：55% 在白底上只有 4.40:1，够不着 AA 的 4.5
     （`probe-join-real.mjs` 场景 1 量出来的；初见时注释里写的「约 4.7」是错的）。
     58% → 白底 ≈ 4.92:1、黑底 ≈ 5.3:1，两边都过 —— 这条提示线就是本页最低对比度，
     再淡一点 11.5px 的小字就该判不合格了。 */
  --j-ink-2: color-mix(in srgb, var(--j-ink) 72%, var(--j-bg));
  --j-ink-3: color-mix(in srgb, var(--j-ink) 58%, var(--j-bg));
  --j-line: color-mix(in srgb, var(--j-ink) 16%, transparent);
  --j-line-2: color-mix(in srgb, var(--j-ink) 9%, transparent);
  --j-line-strong: color-mix(in srgb, var(--j-ink) 34%, transparent);
  --j-fill: color-mix(in srgb, var(--j-ink) 4%, transparent);
  --j-fill-strong: color-mix(in srgb, var(--j-ink) 8%, transparent);
  --j-radius-input: 10px;
  --j-radius-btn: 999px;

  /* ---------------- 字号 / 字重 / 间距：三套阶梯 ----------------
     改版前是「随手取字号」：同一页面上出现过 10 / 10.5 / 11 / 11.5 / 12 / 12.5 /
     13 / 14.5 八档，字重 400/500/600/700/800 五档。单看每一处都合理，合起来
     就是「说不清哪里不对但就是不干净」—— 因为 0.5px 的差别不构成层级，只构成噪点。
     现在收敛成三档字号 + 两档字重（字标自己那一档另算），语义按「角色」分：

       --j-fs-sm   11.5px  辅助：提示 / 说明 / 进度 / 规则
       --j-fs-md   13px    正文：引导句 / 段落
       --j-fs-lg   14.5px  控件：输入框 / 按钮
       （标题用 21px 直接写在 .join-step h2 上，因为它只有一个使用者）

     字重只有 normal(400) 与 semibold(600) 两档；标题用 700 是刻意破例 ——
     它是页面上唯一需要「压住」的东西，和正文同档会读成普通段落。 */
  --j-fs-sm: 11.5px;
  --j-fs-md: 13px;
  --j-fs-lg: 14.5px;
  --j-fw-normal: 400;
  --j-fw-medium: 600;

  /* 间距：只有三档，按「从属关系」分而不是按像素随手定
     · tight  6~8px   —— 标签与它描述的控件之间（说明"这是同一个东西"）
     · block  14px    —— 同组内的行与行
     · group  28px    —— 语义块之间（字段 ↔ 字段 ↔ 协议 ↔ 按钮）*/
  --j-gap-tight: 8px;
  --j-gap-block: 14px;
  --j-gap-group: 28px;

  min-height: 100vh;
  /* .unified-nav 是 fixed 的，必须自己让位（高度实测，见 navOffset） */
  padding: calc(var(--join-nav-h, 78px) + 22px) 24px 24px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--j-ink);
  font-family:
    -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  background: var(--j-bg);
}

/* 隐藏的原生文件输入（头像）*/
.join-file {
  display: none;
}

/* ---------------- 舞台：单列 460px ----------------
   `.join-stage` 是整页唯一的宽度来源。内部每个块都不写 max-width，
   这样左边缘（字标 / 表单 / 协议勾选）在同一条竖线上，
   不会出现「表单 412、协议 460」那种错位。 */
.join-stage {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---------------- 字标 ---------------- */
.join-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 0 0 6px;
}
.join-wordmark {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  /* 负字距：大号粗体加正字距会散成三个独立方块 */
  letter-spacing: -0.04em;
  user-select: none;
}
.join-head-sub {
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-normal);
  /* 正字距 + 左补齐，让中文三个字看起来是「一个标签」而不是三个字 */
  letter-spacing: 0.22em;
  padding-left: 0.22em;
  color: var(--j-ink-3);
}

/* ---------------- 卡片：只是一个定高的列，没有面 ----------------
   为什么还要给它固定高度：协议条必须永远在视野里（它的两个链接是
   注册前的法律必读项）。卡片 = 「刚好一屏」⇒ 内容在 .join-inner 里滚，
   协议条不动。min-height 会让它长出 5~6px 把协议条挤到折线以下，所以用 height。 */
.join-card {
  display: flex;
  flex-direction: column;
  height: clamp(520px, calc(100vh - var(--join-nav-h, 78px) - 96px), 800px);
  min-height: 0;
  /* 没有任何背景/描边/圆角/阴影 —— 纯白页上的一个"区域"不需要被画出来 */
}

/* ---------------- 右栏（唯一内容栏）----------------
   滚动分工：.join-main 只做纵向排布、不滚；真正滚的是 .join-inner。
   现在 .join-inner 是 .join-main 里**唯一**的子节点（协议条已移进第 ① 屏），
   所以「兄弟节点永不遮挡」这条约束变成了结构性的 —— 不再需要专门防它。
   （历史教训留着：协议条曾经是 position:sticky 且位于滚动区内部，
     390×844 实测压住「下一步」按钮 182px，只有滚到底才露出来。） */
.join-main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.join-inner {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 滚动条不画出来（用户口径：「删除滚动条」）。
     仍然可滚 —— 只是那条 10px 的灰槽不占视觉。
     ⚠️ 两件事必须一起做，少一件就有副作用：
       · `scrollbar-width: none`（Firefox）
       · `::-webkit-scrollbar { display: none }`（Chrome/Safari 系，见下）
     并保留 scrollbar-gutter: stable —— 不预留槽位时，内容一超出容器宽度
     就会横向抖一下（第 1 步和第 3 步来回切时尤其明显）。隐藏的是**画出来的那条**，
     不是**它占的位置**。 */
  scrollbar-width: none;
  scrollbar-gutter: stable;
  padding: 30px 0 26px;
  display: flex;
  flex-direction: column;
}
.join-inner::-webkit-scrollbar {
  display: none;
}

/* ---------------- 进度：四段细线 ----------------
   用「线段」而不是「圆点」：线段天然是一条量尺，圆点读起来像四个状态灯。
   已走过的段落降低对比（0.34）、当前段满墨、未到的用发丝线。 */
.join-progress {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: var(--j-gap-group);
}
.join-progress-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}
.join-dot {
  width: 24px;
  height: 2px;
  border-radius: 1px;
  background: var(--j-line);
  transition:
    background 0.3s,
    opacity 0.3s;
}
.join-dot.is-done {
  background: var(--j-ink);
  opacity: 0.34;
}
.join-dot.is-now {
  background: var(--j-ink);
}
.join-progress-text {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: var(--j-fs-sm);
  /* 当前步更重、总数更淡 —— 眼睛扫一眼就知道「走到哪了」，
     不需要读完"第几步共几步"这句话 */
  font-weight: var(--j-fw-medium);
  color: var(--j-ink-3);
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
}
/* 当前步满墨、总数更淡：不用读整句话也能看出进度 */
.join-progress-num {
  color: var(--j-ink);
}
.join-progress-sep,
.join-progress-total {
  color: var(--j-ink-3);
  font-weight: var(--j-fw-normal);
}

/* ---------------- 错误汇总 ----------------
   没有红色：1.5px 满墨描边 + 满墨文字，本身就是页面上对比最强的元素。
   刻意不加底色 —— 极简页里一块浅色底会被读成"另一个区块"。 */
.join-alerts {
  margin-bottom: 20px;
  padding: 12px 14px;
  border: 1.5px solid var(--j-ink);
  border-radius: var(--j-radius-input);
}
.join-alerts p {
  margin: 0 0 8px;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
  letter-spacing: 0.01em;
}
.join-alerts ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.join-alerts button {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: var(--j-fs-sm);
  line-height: 1.5;
  color: var(--j-ink-2);
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: var(--j-line-strong);
  text-underline-offset: 3px;
}
.join-alerts button:hover {
  color: var(--j-ink);
  text-decoration-color: var(--j-ink);
}

/* ---------------- 步骤切换 ---------------- */
/* ---------------- 步间过渡：慢、有方向、带一点上浮 ----------------
   之前是 opacity 0.3s + translateX(14px) —— 「能用但廉价」：太快（眼睛还没跟上
   就切完了）、位移太近（读不出方向感）、且前进/后退往同一个方向滑（按「上一步」
   的操作手感是错的）。

   现在三件事：
     ① **时长 620ms**，缓动走 ease-out-quint（0.22, 1, 0.36, 1）：
        起步快、尾巴长，所以「切过去」这件事有明确的落点感，而不是滑完还在飘。
     ② **方向**由根节点的 data-dir 决定：前进从右侧 24px 滑入，后退从左侧 24px
        滑入 —— 与用户的心智模型一致（往回走 = 内容从左边回来）。
     ③ **轻微上浮 6px 回落**（translateY）给深度，但幅度刻意小于位移一半 ——
        再大就会读成「卡片弹了一下」，那是另一种更吵的动效。

   ⚠️ 只对 opacity / transform 做动画：两者都是合成层属性，不触发重排，
   6 屏叠在一起也不会掉帧。（height 那条仍单独走，它必须重排，改不了。） */
.join-viewport {
  position: relative;
  overflow: hidden;
  /* 高度跟着内容变（各屏字段数不同），这条没法用合成层，
     但它是容器高度不是内容尺寸，代价可接受 */
  transition: height 0.62s cubic-bezier(0.22, 1, 0.36, 1);
}
.join-step {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
  /* 非当前屏停在"等会儿要来的那个方向"上，且稍微下沉一点。
     ⚠️ 这里用 translate()（2D）而不是 translate3d()：3D 位移会建立独立的
     合成层，父级 .join-viewport 的 overflow:hidden **裁不住**它 ——
     6 个非激活屏各向左右探出 24px，于是整个 .join-inner 有了横向滚动范围，
     390×844 实测报出 join-step/H2/.join-lead 右边界 394 > 视口 390。
     2D 位移仍在合成层上跑（性能一样），但会被正常裁剪。 */
  transform: translate(24px, 6px);
  transition:
    opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.62s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}
/* 后退：待入的屏从左边来 */
.join-page[data-dir='back'] .join-step {
  transform: translate(-24px, 6px);
}
.join-step.is-active {
  opacity: 1;
  pointer-events: auto;
  transform: translate(0, 0);
}

/* 屏内元素依次浮入（stagger）：标题 → 引导句 → 字段 → 按钮。
   为什么值得做：整屏一起淡入时，眼睛必须先看清「哪句是标题」才开始读；
   有了 60ms 的错开，视线会自然被领着往下走，读起来更顺。
   ⚠️ 只给三个层级、不超过 180ms 总延迟 —— 再长就成了「等动画放完」，
   而注册流程每一步都该让用户立刻能动手。 */
.join-step.is-active h2,
.join-step.is-active .join-lead,
.join-step.is-active .join-fld,
.join-step.is-active .join-consent,
.join-step.is-active .join-verified {
  animation: join-rise 0.52s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.join-step.is-active .join-lead {
  animation-delay: 0.05s;
}
.join-step.is-active .join-fld,
.join-step.is-active .join-consent,
.join-step.is-active .join-verified {
  animation-delay: 0.1s;
}
@keyframes join-rise {
  from {
    opacity: 0;
    transform: translate(0, 8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.join-step h2 {
  margin: 0 0 10px;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.022em;
  line-height: 1.3;
}
.join-lead {
  margin: 0 0 32px;
  font-size: var(--j-fs-md);
  line-height: 1.65;
  color: var(--j-ink-2);
}

/* ---------------- 字段 ---------------- */
.join-fld {
  margin-bottom: var(--j-gap-group);
}
.join-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
  letter-spacing: 0.01em;
  margin-bottom: var(--j-gap-tight);
}
.join-tag {
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-normal);
  letter-spacing: 0.02em;
}
/* 必填 / 选填：**不带框**，只用墨色深浅区分。
   原来两个小标各带一圈 1px 描边，在 12px 字旁边等于凭空多出两个小盒子 ——
   页面上一共六个字段，就是六对盒子，把本来很干净的标签行搅碎。
   语义不靠框也能读：满墨 = 必填，灰 = 选填，而「必填」这两个字本身已经说明了。 */
.join-tag-req {
  color: var(--j-ink);
}
.join-tag-opt {
  color: var(--j-ink-3);
}

.join-ctrl {
  position: relative;
  display: flex;
  align-items: center;
}
.join-ctrl input,
.join-birth select {
  width: 100%;
  font: inherit;
  font-size: var(--j-fs-lg);
  color: var(--j-ink);
  /* 透明底 + 单发丝线：极简页的输入框靠"边界"存在，靠"填充"会变卡片 */
  background: transparent;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  padding: 12px 13px;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
}
.join-ctrl input::placeholder {
  color: var(--j-ink-3);
}
/* 聚焦用 inset shadow 而不是加粗 border：后者会改变盒模型宽度，
   输入框会整体位移 1px（在同一行上下切换时看得很明显） */
.join-ctrl input:focus,
.join-birth select:focus {
  outline: none;
  border-color: var(--j-ink);
  box-shadow: 0 0 0 3px var(--j-fill-strong);
}
/* 错误态：满墨描边 + 3px 墨色光环。不用红色，见文件头第 ② 条 */
.join-fld.is-invalid .join-ctrl input,
.join-fld.is-invalid .join-birth select {
  border-color: var(--j-ink);
  box-shadow: inset 0 0 0 1px var(--j-ink);
}
.join-fld.is-valid .join-ctrl input {
  border-color: var(--j-line-strong);
}

.join-state {
  position: absolute;
  right: 12px;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-normal);
  pointer-events: none;
  background: var(--j-bg);
  padding: 0 4px;
}
.join-state.is-checking {
  color: var(--j-ink-3);
}
.join-state.is-ok {
  color: var(--j-ink);
  font-weight: var(--j-fw-medium);
}
.join-state.is-err {
  color: var(--j-ink);
  font-weight: var(--j-fw-medium);
}
/* 「不可用」要读得出和「可用」不是同一件事：加一条删除线 */
.join-state.is-err::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--j-ink);
}

.join-toggle {
  position: absolute;
  right: 6px;
  border: 0;
  background: transparent;
  color: var(--j-ink-2);
  font: inherit;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
  padding: 7px 9px;
  border-radius: 7px;
  cursor: pointer;
}
.join-toggle:hover {
  background: var(--j-fill);
  color: var(--j-ink);
}

.join-msg {
  margin: 10px 0 0;
  font-size: var(--j-fs-sm);
  line-height: 1.5;
  font-weight: var(--j-fw-normal);
  color: var(--j-ink);
}
.join-msg:empty {
  display: none;
}
/* 「提示级」的 msg（如验证码过期）与硬错误同色不同重 */
.join-msg.is-warn-on {
  font-weight: var(--j-fw-normal);
  color: var(--j-ink-2);
}
.join-hint {
  margin: 10px 0 0;
  font-size: var(--j-fs-sm);
  line-height: 1.6;
  color: var(--j-ink-3);
}
.join-suggest {
  margin: 10px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.join-suggest span {
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
}
.join-suggest button {
  border: 1px solid var(--j-line);
  background: transparent;
  color: var(--j-ink-2);
  font: inherit;
  font-size: var(--j-fs-sm);
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    border-color 0.16s,
    color 0.16s;
}
.join-suggest button:hover {
  border-color: var(--j-ink);
  color: var(--j-ink);
}

/* ---------------- 密码强度：只靠亮起的条数 ----------------
   原设计是红 / 橙 / 绿三色，纯黑白下这套语义必然失效；改成
   「亮几格」本身携带信息（1 格弱、2 格中、3 格强），文案同步着色不参与判断。 */
.join-meter {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}
.join-meter i {
  flex: 1;
  height: 2px;
  border-radius: 1px;
  background: var(--j-line);
  transition: background 0.3s;
}
.join-meter[data-level='1'] i:nth-child(-n + 1) {
  background: var(--j-ink);
  opacity: 0.45;
}
.join-meter[data-level='2'] i:nth-child(-n + 2) {
  background: var(--j-ink);
  opacity: 0.7;
}
.join-meter[data-level='3'] i {
  background: var(--j-ink);
}
.join-meter-label {
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
  margin-top: 7px;
}
.join-rules {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 14px;
}
.join-rules li {
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
  display: flex;
  align-items: center;
  gap: 7px;
  transition: color 0.2s;
}
/* 未满足 = 空心方框，满足 = 实心方块。形状差异比颜色差异更抗环境（投影仪/低端屏） */
.join-rules li::before {
  content: '';
  width: 5px;
  height: 5px;
  border: 1px solid var(--j-line-strong);
  flex: none;
  box-sizing: border-box;
}
.join-rules li.is-hit {
  color: var(--j-ink);
}
.join-rules li.is-hit::before {
  background: var(--j-ink);
  border-color: var(--j-ink);
}

.join-birth {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.join-avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.join-avatar-drop {
  width: 62px;
  height: 62px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: transparent;
  border: 1px dashed var(--j-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--j-ink-3);
}
.join-avatar-drop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.join-avatar-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.join-avatar-btns {
  display: flex;
  gap: 8px;
}

/* 次级按钮（选择图片 / 移除 / 重发验证码 …）：描边、透明底、小号 */
.join-mini {
  border: 1px solid var(--j-line);
  background: transparent;
  color: var(--j-ink);
  font: inherit;
  font-size: var(--j-fs-sm);
  padding: 7px 13px;
  /* 高度补到 44px：7px 上下内距 + 12.5px 行高只有 40px，
     差 4px 就够不着触控底线（AA 24px 是过了，但这一排是本页唯一的
     "次要动作"入口，手机上点偏一次就会重发一封邮件）。 */
  min-height: 44px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    border-color 0.16s,
    background 0.16s;
}
.join-mini:hover:not(:disabled) {
  border-color: var(--j-ink);
  background: var(--j-fill);
}
.join-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 验证码步骤 ─────────────────────────────────────────────── */
.join-email-em {
  font-weight: var(--j-fw-medium);
  color: var(--j-ink);
  /* 长邮箱不撑破容器：允许任意字符处换行，否则窄屏会横向溢出 */
  word-break: break-all;
}
.join-otp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
/* 「邮箱填错了」是纠正操作，不是主路径 —— 去掉描边，只留文字 */
.join-mini-quiet {
  border-color: transparent;
  background: transparent;
  color: var(--j-ink-3);
}
.join-mini-quiet:hover:not(:disabled) {
  border-color: transparent;
  background: transparent;
  color: var(--j-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
/* 第 3 步的字段容器留出与其它步骤一致的间距 */
.join-step[aria-label='验证邮箱'] .join-fld {
  margin-top: 24px;
}

/* ── 通行密钥开关：轨道 + 圆钮，纯黑白 ── */
.join-switch-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 13px;
  cursor: pointer;
  padding: 14px 0;
  border-top: 1px solid var(--j-line-2);
  border-bottom: 1px solid var(--j-line-2);
}
.join-switch-input {
  position: absolute;
  left: 0;
  top: 16px;
  width: 38px;
  height: 22px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}
.join-switch-track {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--j-line-strong);
  position: relative;
  flex: none;
  transition:
    background 0.2s,
    border-color 0.2s;
}
.join-switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--j-ink-3);
  transition:
    transform 0.2s cubic-bezier(0.32, 0.72, 0, 1),
    background 0.2s;
}
.join-switch-input:checked + .join-switch-track {
  background: var(--j-ink);
  border-color: var(--j-ink);
}
.join-switch-input:checked + .join-switch-track .join-switch-knob {
  background: var(--j-bg);
  transform: translateX(16px);
}
.join-switch-input:focus-visible + .join-switch-track {
  box-shadow: 0 0 0 3px var(--j-fill-strong);
}
.join-switch-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.join-switch-title {
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
}
.join-switch-desc {
  font-size: var(--j-fs-sm);
  line-height: 1.6;
  color: var(--j-ink-3);
}

/* ── ALTCHA 人机验证 ── */
.join-altcha {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.join-altcha-idle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  padding: 11px 13px;
  background: transparent;
  font: inherit;
  font-size: var(--j-fs-md);
  color: var(--j-ink);
}
.join-altcha-idle:hover {
  border-color: var(--j-ink);
}
.join-altcha-cb {
  width: 15px;
  height: 15px;
  border-radius: 3px;
  border: 1px solid var(--j-line-strong);
  flex: none;
}
.join-altcha-brand {
  margin-left: auto;
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
  letter-spacing: 0.04em;
}
.join-altcha-status {
  margin: 0;
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
}
.join-altcha-status.is-error {
  color: var(--j-ink);
  font-weight: var(--j-fw-medium);
}

/* ---------------- 动作 ---------------- */
.join-actions {
  display: flex;
  gap: 10px;
  padding: 34px 0 6px;
}
.join-btn {
  font: inherit;
  font-size: var(--j-fs-lg);
  font-weight: var(--j-fw-medium);
  border-radius: var(--j-radius-btn);
  padding: 13px 22px;
  cursor: pointer;
  transition:
    opacity 0.16s,
    background 0.16s,
    color 0.16s,
    border-color 0.16s;
  text-align: center;
  text-decoration: none;
  display: block;
  box-sizing: border-box;
}
/* 主操作：实心满墨（亮色黑底白字 / 暗色白底黑字）—— 与登录页同一套按钮语言 */
.join-btn-primary {
  flex: 1;
  border: 1px solid var(--j-ink);
  background: var(--j-ink);
  color: var(--j-bg);
}
.join-btn-primary:hover:not(:disabled) {
  opacity: 0.86;
}
.join-btn-primary:active:not(:disabled) {
  transform: scale(0.99);
}
.join-btn-ghost {
  flex: none;
  border: 1px solid var(--j-line);
  background: transparent;
  color: var(--j-ink-2);
}
.join-btn-ghost:hover:not(:disabled) {
  border-color: var(--j-ink);
  color: var(--j-ink);
}
.join-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---------------- 协议勾选（第 ① 屏）----------------
   原来是常驻卡底的独立条，现在并进第 ① 屏 —— 因为账号在第 ② 屏验证通过时
   就建立了，那时协议必须已经同意过；放在卡底会让人以为「最后再补勾也行」。

   为什么不用底色块把它框起来：极简页里每一块浅底都会被读成「另一个区块」，
   而协议在这里是**必选项**，不是补充说明 —— 靠一条上发丝线分隔就够，
   勾选框和文字本身的存在感足够。 */
.join-consent {
  /* 原来这里有一条 border-top 发丝线，用来把「协议」从表单里切出来。
     但它把一屏切成上下两个独立区块 —— 而协议本来就是这个表单的最后一项，
     不是另一件事。去掉之后靠间距（28px）分组，视觉上少一道横线、
     少一个"区块边界"，页面对齐关系反而更干净。
     （这条线是 grep 出来的"最后一个可见分隔"，删它是极简改造的收尾。） */
  margin-top: 0;
}
.join-consent-row {
  display: flex;
  /* 勾选框与首行文字对齐（不是整块垂直居中）—— 文字换行时勾选框留在首行 */
  align-items: flex-start;
  gap: 9px;
  cursor: pointer;
  user-select: none;
  /* 触控目标：勾选框本身只有 16px、整行原本 20px 高，都够不着
     WCAG 2.5.8 的 24px 底线（手机点起来经常误触到旁边的链接）。
     把可点区撑到 44px，再用等量负外边距抵消 —— 视觉位置与行高都不变，
     扩的只是命中区。
     ⚠️ 用 min-height 而不是只靠 padding：横屏那一档字号被压小
     （12.5 → 更小），同样 12px 内距只有 42px —— 差 2px 就又掉到线下。
     ⚠️ 外框向下多出的 12px 会压住 `.join-consent-note` —— 实测
     row.bottom=467.1 / note.top=462.1，那 5px 被说明文字盖住，
     名义 44px 实际只有 39px 可点。所以下面那条 margin 同步放到 12px，
     让说明文字从外框底部之后才开始（视觉间距只多 5px，肉眼无感）。
     （`probe-join-mobile-metrics.mjs` 量 `.join-consent-row` 的实物尺寸，
      这条就是它报出来的 20px。） */
  min-height: 44px;
  padding: 12px 0;
  margin: -12px 0;
  box-sizing: border-box;
}
.join-consent-row input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  /* 勾选框跟着墨色走（暗色下自动反相） */
  accent-color: var(--j-ink);
  flex: none;
  cursor: pointer;
}
.join-consent-text {
  font-size: var(--j-fs-sm);
  line-height: 1.65;
  color: var(--j-ink-2);
}
.join-consent-text a {
  color: var(--j-ink);
  text-decoration: underline;
  text-decoration-color: var(--j-line-strong);
  text-underline-offset: 2px;
}
.join-consent-text a:hover {
  text-decoration-color: var(--j-ink);
}
.join-consent-note {
  /* 12px 而不是 7px：.join-consent-row 用负外边距把 44px 命中区向下延了
     12px，这里要让过那 12px，否则说明文字会盖住命中区底部（实测 5px）。 */
  margin: 12px 0 0;
  /* 与勾选框文字左对齐：勾选框 16px + gap 9px */
  padding-left: 25px;
  font-size: var(--j-fs-sm);
  line-height: 1.6;
  color: var(--j-ink-3);
}
/* 未勾选被拦下：文字加深加粗 + 勾选框描一圈墨色。
   不用红色的理由见文件头 —— 纯黑白表达不依赖色相。 */
.join-consent.is-invalid .join-consent-text,
.join-consent.is-invalid .join-consent-note {
  color: var(--j-ink);
}
.join-consent.is-invalid .join-consent-text {
  font-weight: var(--j-fw-normal);
}
.join-consent.is-invalid .join-consent-row input {
  outline: 2px solid var(--j-ink);
  outline-offset: 1px;
  border-radius: 3px;
}

/* ---------------- 第 ③ 屏：已验证邮箱（只读）----------------
   这一行承担的是「账号是拿哪个邮箱建的」这个交代 ——
   账号已按它建好，改邮箱等于换账号，所以这里不给编辑入口，
   只把事实摆在最显眼的位置。 */
.join-verified {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 var(--j-gap-group);
  /* 不带框：原来是一圈 1px 圆角描边 + 11/13 内距，等于在页面里又套了一张
     小卡片 —— 而且它下面紧跟着输入框，两个圆角矩形叠在一起最难看清层次。
     改成左侧一根 2px 竖线：仍然读得出「这一行是独立的一条事实」，
     但不占视觉重量。（勾选框已经是实心方块，够醒目了。） */
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--j-ink);
}
/* 对勾：一个纯几何的勾，不引图标库 */
.join-verified-mark {
  width: 15px;
  height: 15px;
  flex: none;
  border-radius: 4px;
  background: var(--j-ink);
  position: relative;
}
.join-verified-mark::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 3px;
  height: 7px;
  border: solid var(--j-bg);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.join-verified-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: var(--j-fs-sm);
  color: var(--j-ink);
}
.join-verified-text strong {
  font-weight: var(--j-fw-medium);
  /* 长邮箱不撑破容器 */
  word-break: break-all;
}
.join-verified-sub {
  font-size: var(--j-fs-sm);
  color: var(--j-ink-3);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* 第 ⑥ 屏：浏览器不支持通行密钥时的说明 —— 不该长得像错误 */
.join-passkey-unsupported {
  color: var(--j-ink-3);
}

/* ---------------- 完成页 ---------------- */
.join-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 0 40px;
  margin: auto 0;
  /* .join-main 不滚（滚动交给 .join-inner），完成页自己当滚动容器，
     否则矮屏上「去登录」按钮会被裁掉且滚不到 */
  min-height: 0;
  overflow-y: auto;
  /* 同 .join-inner：可滚但不画滚动条 */
  scrollbar-width: none;
  scrollbar-gutter: stable;
}
.join-done::-webkit-scrollbar {
  display: none;
}
/* 完成标记：满墨方块 + 底色的勾。没有绿色 —— 形状本身就是"完成" */
.join-done-mark {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--j-ink);
  position: relative;
  flex: none;
  margin-bottom: 24px;
}
.join-done-mark::after {
  content: '';
  position: absolute;
  left: 20px;
  top: 13px;
  width: 12px;
  height: 23px;
  border: solid var(--j-bg);
  border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg);
}
.join-done h2 {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.022em;
}
.join-done p {
  margin: 0 0 8px;
  font-size: var(--j-fs-md);
  line-height: 1.68;
  color: var(--j-ink-2);
}
.join-done p strong {
  color: var(--j-ink);
  font-weight: var(--j-fw-medium);
}
.join-done-actions {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.join-done-actions .join-btn {
  width: 100%;
  font-size: var(--j-fs-lg);
}
.join-resend-note {
  font-size: var(--j-fs-sm);
  margin-top: 10px;
}
.join-resend-note.is-ok,
.join-resend-note.is-err {
  color: var(--j-ink-2);
}
.join-passkey-deferred {
  margin-top: 20px;
  font-size: var(--j-fs-sm);
  line-height: 1.65;
  color: var(--j-ink-3);
}

.join-passkey-card {
  margin-top: 24px;
  width: 100%;
  text-align: left;
  padding: 16px;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
}
.join-passkey-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
/* 钥匙图标：纯几何，两笔就够（一个圆 + 一根杆） */
.join-passkey-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--j-fill-strong);
  flex: none;
  position: relative;
}
.join-passkey-ico::after {
  content: '';
  position: absolute;
  left: 8px;
  top: 6px;
  width: 11px;
  height: 13px;
  border-radius: 5px 5px 2px 2px;
  border: 1.6px solid var(--j-ink);
  border-bottom-width: 3px;
}
.join-passkey-title {
  font-size: var(--j-fs-md);
  font-weight: var(--j-fw-medium);
  display: block;
  margin-bottom: 5px;
}
.join-passkey-desc {
  margin: 0;
  font-size: var(--j-fs-sm);
  line-height: 1.62;
  color: var(--j-ink-3);
}
.join-passkey-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.join-passkey-actions .join-btn {
  padding: 11px 18px;
  font-size: var(--j-fs-md);
}
.join-passkey-actions .join-btn-primary {
  flex: 1;
}
.join-passkey-ok {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
  margin-top: 14px;
}
.join-tick {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  background: var(--j-ink);
  position: relative;
  flex: none;
}
.join-tick::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 3px;
  height: 7px;
  border: solid var(--j-bg);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.join-passkey-state {
  margin: 12px 0 0;
  font-size: var(--j-fs-sm);
  line-height: 1.6;
  color: var(--j-ink-2);
}
.join-passkey-state:empty {
  display: none;
}

/* ── 管理员跳步预览 ──────────────────────────────────────────
   流内元素（.join-stage 的第一个 flex 项），不是 fixed 浮层 ——
   浮层贴哪条边都会盖住某块内容（旧版贴顶就直接压掉了字标）。
   做成普通项只是让卡片矮 40px，物理上不可能遮挡。 */
.join-admin-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  border: 1px dashed var(--j-line-strong);
  border-radius: 999px;
  /* 不抢焦点、不拦滚动 —— 它只是调试面板 */
  flex-wrap: wrap;
}
.join-admin-preview-label {
  padding: 0 6px 0 8px;
  font-size: var(--j-fs-sm);
  font-weight: var(--j-fw-medium);
  letter-spacing: 0.04em;
  color: var(--j-ink-3);
}
.join-admin-preview-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--j-ink-2);
  font: inherit;
  font-size: var(--j-fs-sm);
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.16s,
    color 0.16s;
}
.join-admin-preview-btn:hover {
  background: var(--j-fill);
  color: var(--j-ink);
}
/* 当前所在步：反相（满墨底 + 底色字）—— 黑白里最强的"选中"表达 */
.join-admin-preview-btn.is-now {
  background: var(--j-ink);
  border-color: var(--j-ink);
  color: var(--j-bg);
  font-weight: var(--j-fw-medium);
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 900px) {
  .join-page {
    /* 窄屏卡片贴满整屏：不留左右边距（.join-stage 自己给 20px） */
    padding: var(--join-nav-h, 78px) 20px 0;
    align-items: stretch;
  }
  /* 高度交给 flex 分配，不再写「100vh - nav - 34」这种减常量：
     常量减法是错的 —— 预览条（管理员才有）和字标都会占掉一部分高度，
     844 屏实测卡片底部越界 17px，协议栏最后一行备注被裁掉半行。
     改成「舞台撑满可用高度 → 卡片吃掉剩下的」，预览条多高都不会越界。
     dvh 优先（软键盘弹起时 vh 不缩，卡片会把协议栏推到屏幕外）。 */
  .join-stage {
    max-width: none;
    gap: 10px;
    height: calc(100vh - var(--join-nav-h, 78px) - 22px);
    height: calc(100dvh - var(--join-nav-h, 78px) - 22px);
    min-height: 0;
  }
  .join-card {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }
  .join-admin-preview {
    flex: 0 0 auto;
  }
  .join-head {
    flex: 0 0 auto;
    padding-top: 6px;
  }
  .join-inner {
    padding: 18px 0 16px;
  }
  .join-terms {
    padding: 13px 0 15px;
  }
  .join-done {
    padding: 36px 0 28px;
  }
  .join-step h2 {
    font-size: 19px;
  }
  .join-lead {
    margin-bottom: 22px;
  }
}

@media (max-width: 560px) {
  /* 预览条在窄屏换行时不要撑高太多：字标那一行已经占了垂直空间 */
  .join-admin-preview {
    gap: 2px;
    padding: 4px;
  }
  .join-admin-preview-label {
    display: none;
  }
  .join-admin-preview-btn {
    padding: 4px 7px;
    font-size: var(--j-fs-sm);
  }
}

/* ---------------- 横屏：从导航岛长出来 ----------------
   用户口径（2026-11-25）：「横屏用岛注册」。
   与登录页横屏同一套形态（见 views/Login/style.scoped.css 的
   `(orientation: landscape) and (min-width: 769px)` 块）：导航胶囊先收拢成浮岛，
   注册卡从它的底边沿同一条中心轴展开，两半拼成一整张岛。

   ⚠️ 为什么必须专门写：不写的时候横屏只是「把竖版卡片压扁」。
   844×390 实测：卡片被压成 804×290、内容 440px 塞进 252px 的滚动区里、
   输入框横向拉满 800px —— 看起来像一张 404 页，而不是一个可以填的注册流程。

   宽度走 --boh-login-island-width（与导航上半岛同一个 token），
   写死 720 或 100% 都会让两半一宽一窄、岛形断裂。

   🔴 **必须带 max-height**（与登录页那条同款）。只写 orientation: landscape
   时**每一块桌面屏都是 landscape** —— 实测 1280×900 / 1440×960 / iPad 横屏
   1024×768 全部命中，桌面端因此被强行套上「720 宽白底 + 24/70 大投影」的
   手机横屏岛外形。而真正的手机横屏 667×375 因为宽度 < 769 反而不命中。
   判据错位得刚好相反：桌面最厚、小屏最素。
   620 是「横屏手机」的上界（iPhone 横屏最高 430，iPad 横屏 768 → 已被
   下面 769 宽度门槛排除），620~768 之间的矮桌面不属于岛形态。 */
@media (orientation: landscape) and (min-width: 769px) and (max-height: 620px) {
  .join-page {
    /* 岛自己贴在导航下方，页面不再叠额外上边距 —— 上边距由 .join-card 的
       margin-top 承担（要正好接住导航上半岛的底边） */
    padding: 0 12px 0;
    align-items: flex-start;
    justify-content: center;
  }

  .join-stage {
    width: var(--boh-login-island-width);
    max-width: var(--boh-login-island-width);
    gap: 0;
    /* 顶部 72px = 导航上半岛高度（与登录岛同一值）。
       ⚠️ 这里不能用 --join-nav-h：横屏导航收成 72px 胶囊后，实测那个变量
       仍是 78（测量发生在收拢之前），差 6px 就会露一条缝。 */
    margin-top: 72px;
    height: auto;
    max-height: calc(100dvh - 84px);
    min-height: 0;
  }

  /* 预览条在横屏会占掉宝贵的高度（390-72=318 可用），压成一行更小的 */
  .join-admin-preview {
    flex: 0 0 auto;
    margin-bottom: 8px;
    padding: 3px;
  }
  .join-admin-preview-label {
    display: none;
  }
  .join-admin-preview-btn {
    padding: 3px 7px;
    font-size: var(--j-fs-sm);
  }

  /* 下半岛：与导航上半岛同宽同材质，圆角只留下面两角 */
  .join-card {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--liquid-border-hairline);
    border-top: 0;
    border-radius: 0 0 30px 30px;
    background: var(--boh-login-island-bg);
    /* Overlap 导航 4px：两个面贴在一起会留下采样缝（导航底边 74 = 64 高 + 10 偏移，
       .join-stage 上 margin-top 给 72，这里再 -2 —— 实际重叠 4px）。
       ⚠️ 注释曾经写「2px」，但那是把 72 当成 74 算的：真正生效的是
       stage(72) 与 nav.bottom(74) 之差。probe-join-real 场景 8 量出来才发现的，
       所以断言改成「不露缝（gap ≤ 0）」而不是钉死某个像素值 ——
       纵向位置会被导航高度调整带偏，重叠量不是契约，无缝才是。 */
    margin-top: -2px;
    padding-top: 2px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
    overflow: hidden;
  }

  /* 字标在横屏收窄成一枚角标：这一屏垂直空间只有 ~318px，
     38px 的字标行占掉 12% 而信息量为零 */
  .join-head {
    flex: 0 0 auto;
    padding: 14px 26px 0;
    gap: 8px;
  }
  .join-wordmark {
    font-size: 15px;
  }
  .join-head-sub {
    font-size: 9.5px;
  }

  .join-main {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* 横屏内容不居中在 412px，而是铺满岛宽（岛本身已经限到 720），
     左右各留 26px 呼吸 —— 否则会出现「一张 720 宽的岛里嵌一块 412 的内容」 */
  .join-inner {
    padding: 16px 26px 18px;
    max-width: none;
  }

  /* 横屏纵向空间紧：把每步的头部开销压一档，让「标题+两个字段+按钮」能一屏放下 */
  .join-progress {
    margin-bottom: 16px;
  }
  .join-step h2 {
    font-size: 18px;
    margin-bottom: 5px;
  }
  .join-lead {
    margin-bottom: 16px;
    font-size: var(--j-fs-sm);
  }
  .join-fld {
    margin-bottom: 15px;
  }
  .join-actions {
    padding: 16px 0 2px;
  }
  .join-btn {
    padding: 11px 20px;
    font-size: 13.5px;
  }
  .join-rules {
    grid-template-columns: repeat(4, 1fr);
    gap: 5px 10px;
  }
  .join-meter {
    margin-top: 7px;
  }
  .join-consent {
    margin-top: 2px;
    padding-top: 13px;
  }
  .join-done {
    padding: 28px 26px 26px;
  }
}

/* 更矮的横屏（≤430px 高，如 iPhone 横屏 390）：这一档只有 ~310px 可用高度，
   必须把「进度 / 字标 / 说明」这些非输入内容压到最低，让「字段 + 按钮」
   能在一屏内看到 —— 实测未压缩时要滚 94px 才见到主按钮，
   等于用户一进来先看到一个没有按钮的表单。 */
@media (orientation: landscape) and (min-width: 769px) and (max-height: 430px) {
  .join-stage {
    max-height: calc(100dvh - 80px);
  }
  /* 字标在这一档直接让位：岛的上半部分是导航，品牌信息已经由它承担了，
     再重复一行 BOH 就是纯浪费高度 */
  .join-head {
    display: none;
  }
  .join-inner {
    padding: 12px 26px 14px;
  }
  .join-progress {
    margin-bottom: 10px;
  }
  /* 进度文案挪进进度条那一行（本来就并排），字号再降 */
  .join-progress-text {
    font-size: var(--j-fs-sm);
  }
  .join-step h2 {
    font-size: 16px;
    margin-bottom: 4px;
  }
  /* 说明文字在这一档只留一行：完整句子在竖屏能读，横屏先保证按钮可见 */
  .join-lead {
    margin-bottom: 11px;
    font-size: var(--j-fs-sm);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .join-fld {
    margin-bottom: 11px;
  }
  .join-label {
    margin-bottom: 5px;
    font-size: var(--j-fs-sm);
  }
  .join-ctrl input,
  .join-birth select {
    padding: 9px 12px;
    font-size: 13.5px;
  }
  .join-hint {
    margin-top: 5px;
    font-size: var(--j-fs-sm);
    line-height: 1.45;
  }
  .join-consent {
    padding-top: 11px;
  }
  .join-consent-text {
    font-size: var(--j-fs-sm);
  }
  .join-consent-note {
    display: none;
  }
  .join-actions {
    padding: 12px 0 0;
  }
  .join-btn {
    padding: 10px 18px;
    font-size: var(--j-fs-md);
  }
  /* 密码强度条 + 规则四列一行：竖屏那套两列会多占两行（≈40px） */
  .join-rules {
    grid-template-columns: repeat(4, 1fr);
    gap: 4px 8px;
    margin-top: 8px;
  }
  .join-rules li {
    font-size: var(--j-fs-sm);
  }
  .join-meter {
    margin-top: 6px;
  }
  .join-meter-label {
    margin-top: 5px;
    font-size: var(--j-fs-sm);
  }
  .join-done {
    padding: 22px 26px 22px;
  }
  .join-done-mark {
    width: 46px;
    height: 46px;
    border-radius: 13px;
    margin-bottom: 14px;
  }
  .join-done-mark::after {
    left: 16px;
    top: 10px;
  }
  .join-done h2 {
    font-size: 18px;
    margin-bottom: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* 前庭功能敏感的用户会被位移动画直接弄晕 —— 这里不是"减弱"而是"取消"：
     过渡时长归零后 is-active 立即生效，等于硬切，但我们仍然保留 opacity 的
     瞬时变化（否则会出现一帧两屏同时可见）。 */
  .join-viewport,
  .join-step,
  .join-dot,
  .join-switch-knob,
  .join-meter i {
    transition-duration: 0.01ms;
  }
  .join-step,
  .join-page[data-dir='back'] .join-step {
    transform: none;
  }
  .join-step.is-active h2,
  .join-step.is-active .join-lead,
  .join-step.is-active .join-fld,
  .join-step.is-active .join-consent,
  .join-step.is-active .join-verified {
    animation: none;
  }
}
</style>
