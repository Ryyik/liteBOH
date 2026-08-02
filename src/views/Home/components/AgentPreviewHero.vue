<template>
  <section class="agent-hero" aria-label="BOH Agent Preview">
    <div class="agent-hero-content">
      <p class="agent-hero-eyebrow">BOH Agent · Preview</p>
      <h1 class="agent-hero-title">Introducing<br>BOH Agent Preview</h1>
      <p class="agent-hero-subtitle">强大 Pro 模型与多模态，Free 开放。</p>

      <div class="agent-hero-actions">
        <button type="button" class="agent-hero-button is-primary" @click="onExperienceAgent">
          <span>体验 Agent</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { toggleHiagentChat } from "@/utils/hiagent-widget.js";

const onExperienceAgent = () => {
  toggleHiagentChat();
};
</script>

<style scoped>
.agent-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  min-height: clamp(440px, 62svh, 680px);
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: clamp(72px, 9vw, 128px) clamp(22px, 6vw, 88px);
  text-align: center;
  background: #000;
  border-radius: 0;
}

.agent-hero-content {
  position: relative;
  z-index: 1;
  width: min(100%, 920px);
}

.agent-hero-eyebrow,
.agent-hero-title,
.agent-hero-subtitle,
.agent-hero-actions {
  animation: agentReveal 0.95s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.agent-hero-eyebrow {
  margin: 0 0 18px;
  color: rgba(255, 255, 255, 0.72);
  font-size: clamp(13px, 1.4vw, 16px);
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.agent-hero-title {
  margin: 0;
  color: #fff;
  font-size: clamp(40px, 6.4vw, 84px);
  font-weight: 760;
  line-height: 1.04;
  letter-spacing: -0.02em;
  text-wrap: balance;
  animation-delay: 80ms;
}

.agent-hero-subtitle {
  max-width: 640px;
  margin: 20px auto 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: clamp(17px, 2vw, 23px);
  font-weight: 450;
  line-height: 1.45;
  animation-delay: 160ms;
}

.agent-hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 34px;
  animation-delay: 240ms;
}

.agent-hero-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 0 28px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 980px;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 260ms ease,
    border-color 260ms ease,
    box-shadow 260ms ease;
}

.agent-hero-button.is-primary {
  color: #0a1030;
  background: linear-gradient(135deg, #ffffff 0%, #e8edff 100%);
  border-color: transparent;
  box-shadow: 0 12px 40px rgba(77, 124, 255, 0.4), inset 0 1px rgba(255, 255, 255, 0.8);
}

.agent-hero-button.is-primary svg {
  transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@media (hover: hover) {
  .agent-hero-button.is-primary:hover {
    transform: translateY(-2px) scale(1.015);
    box-shadow: 0 18px 50px rgba(77, 124, 255, 0.52), inset 0 1px rgba(255, 255, 255, 0.9);
  }

  .agent-hero-button.is-primary:hover svg {
    transform: translateX(4px);
  }
}

.agent-hero-button.is-primary:active {
  transform: scale(0.96);
}

.agent-hero-button:focus-visible {
  outline: 3px solid rgba(120, 160, 255, 0.9);
  outline-offset: 3px;
}

@keyframes agentReveal {
  from { opacity: 0; transform: translateY(26px); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@media (max-width: 768px) {
  .agent-hero {
    min-height: clamp(420px, 70svh, 560px);
    padding: 56px 20px;
  }

  .agent-hero-title {
    font-size: 40px;
  }

  .agent-hero-subtitle {
    font-size: 17px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-hero-eyebrow,
  .agent-hero-title,
  .agent-hero-subtitle,
  .agent-hero-actions {
    animation: none;
  }

  .agent-hero-button {
    transition: none;
  }
}
</style>
