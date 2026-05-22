<template>
  <div class="studio-hub-page">
    <UnifiedNavbar />

    <div class="studio-shell">
      <header class="studio-header">
        <div class="header-copy">
          <span class="section-kicker">Create Studio</span>
          <h1>创作工作台</h1>
          <p>废弃编辑器入口已经下线，当前页面作为创作模块的稳定占位和后续新工具入口保留。</p>
        </div>

        <div class="header-meta" aria-label="Studio 摘要">
          <div class="meta-pill">
            <strong>0</strong>
            <span>可用入口</span>
          </div>
          <div class="meta-pill">
            <strong>Clean</strong>
            <span>废弃入口已清理</span>
          </div>
        </div>
      </header>

      <main class="studio-main">
        <section class="hero-panel">
          <div class="hero-copy">
            <span class="hero-tag">Archived</span>
            <h2>旧编辑器入口已移除</h2>
            <p>Simple Editor、Video Script Editor 和 BOH Desktop 已从路由中删除，避免继续暴露废弃工作流。</p>
          </div>
        </section>

        <section class="tools-section">
          <div class="section-heading">
            <div>
              <span class="section-kicker">Workspace</span>
              <h2>暂无可用编辑器</h2>
            </div>
            <p>后续接入新工具时，可以在这里重新添加入口。</p>
          </div>

          <div class="empty-tools">
            <strong>已完成废弃入口清理</strong>
            <p>这里不会再跳转到已删除的 Vue 页面。</p>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import UnifiedNavbar from '../../../../components/UnifiedNavbar/index.vue';
</script>

<style scoped src="./style.scoped.css"></style>
