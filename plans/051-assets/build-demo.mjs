import fs from 'node:fs';
import path from 'node:path';

const dir = '/Users/ryyik/.gemini/antigravity/brain/1eda08c6-41de-474a-af3d-5144424d992b/scratch';
const posts = JSON.parse(fs.readFileSync(path.join(dir, 'real-posts.json'), 'utf8'));
const safeJson = JSON.stringify(posts).replace(/<\/script/gi, '<\\/script');

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BOH 论坛 · Apple 极简风格卡片 Demo（真实帖子数据）</title>
  <style>
    :root {
      --bg-canvas: #F5F5F7;
      --bg-card: #FFFFFF;
      --bg-card-hover: #FFFFFF;
      --bg-subtle: #F2F2F7;
      --bg-nav: rgba(245, 245, 247, 0.78);
      --text-primary: #1D1D1F;
      --text-body: #3A3A3C;
      --text-secondary: #6E6E73;
      --text-tertiary: #86868B;
      --accent-blue: #0071E3;
      --accent-red: #FF3B30;
      --border-hairline: rgba(0, 0, 0, 0.06);
      --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.02);
      --shadow-card-hover: 0 2px 6px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(0, 0, 0, 0.04);
      --segment-bg: rgba(118, 118, 128, 0.12);
      --segment-active: #FFFFFF;
      --segment-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    }

    html[data-theme="dark"] {
      --bg-canvas: #000000;
      --bg-card: #1C1C1E;
      --bg-card-hover: #222224;
      --bg-subtle: #2C2C2E;
      --bg-nav: rgba(0, 0, 0, 0.78);
      --text-primary: #F5F5F7;
      --text-body: #D1D1D6;
      --text-secondary: #98989D;
      --text-tertiary: #636366;
      --accent-blue: #0A84FF;
      --accent-red: #FF453A;
      --border-hairline: rgba(255, 255, 255, 0.08);
      --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.3);
      --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.45);
      --segment-bg: rgba(118, 118, 128, 0.24);
      --segment-active: #636366;
      --segment-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      background-color: var(--bg-canvas);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", sans-serif;
      transition: background-color 0.28s ease, color 0.28s ease;
    }

    /* 顶部极简导航栏 */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: var(--bg-nav);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--border-hairline);
    }

    .top-bar-inner {
      max-width: 680px;
      margin: 0 auto;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .brand-sub {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Apple Segmented Control */
    .segmented {
      display: inline-flex;
      background: var(--segment-bg);
      padding: 2px;
      border-radius: 9px;
      gap: 2px;
    }

    .segmented button {
      border: 0;
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .segmented button.active {
      background: var(--segment-active);
      color: var(--text-primary);
      box-shadow: var(--segment-shadow);
    }

    .refresh-btn {
      border: 0;
      background: var(--bg-subtle);
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      transition: opacity 0.2s ease, transform 0.15s ease;
    }
    .refresh-btn:hover { opacity: 0.8; }
    .refresh-btn:active { transform: scale(0.96); }

    /* 信息流容器 */
    .feed-container {
      max-width: 640px;
      margin: 0 auto;
      padding: 20px 16px 80px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Apple 极简帖子卡片（同心圆角：外22px，内padding 20px，内块12px） */
    .apple-card {
      background: var(--bg-card);
      border-radius: 22px;
      padding: 20px;
      box-shadow: var(--shadow-card);
      transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.25s ease, background-color 0.25s ease;
      position: relative;
      cursor: pointer;
    }

    .apple-card:hover {
      background: var(--bg-card-hover);
      box-shadow: var(--shadow-card-hover);
    }

    .apple-card:active {
      transform: scale(0.988);
    }

    /* 1. 单行微元信息头部 */
    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .meta-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-subtle);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      overflow: hidden;
      flex-shrink: 0;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .meta-line {
      font-size: 13px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .author-name {
      font-weight: 500;
      color: var(--text-secondary);
    }

    .meta-dot {
      color: var(--text-tertiary);
    }

    .meta-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .kind-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-blue);
      display: inline-block;
    }

    /* 2. 标题与正文：排版即结构 */
    .card-title {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.34;
      letter-spacing: -0.015em;
      color: var(--text-primary);
    }

    .card-body {
      margin: 0;
      font-size: 15px;
      font-weight: 400;
      line-height: 1.58;
      color: var(--text-body);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .card-body.is-clamped {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .expand-link {
      display: inline-block;
      margin-top: 4px;
      font-size: 14px;
      font-weight: 500;
      color: var(--accent-blue);
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .expand-link:hover { text-decoration: underline; }

    /* 3. Apple 极简横向滚动图片条 */
    .media-strip-wrap {
      position: relative;
      margin-top: 12px;
    }

    .media-strip-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 4;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(29, 29, 31, 0.56);
      backdrop-filter: saturate(180%) blur(12px);
      -webkit-backdrop-filter: saturate(180%) blur(12px);
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em;
      pointer-events: none;
    }

    .media-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      -ms-overflow-style: none;
      border-radius: 12px;
    }

    .media-strip::-webkit-scrollbar {
      display: none;
    }

    .media-item {
      position: relative;
      flex: 0 0 auto;
      width: clamp(200px, 68%, 340px);
      aspect-ratio: 4 / 3;
      border-radius: 12px;
      background: var(--bg-subtle);
      overflow: hidden;
      scroll-snap-align: start;
      cursor: zoom-in;
    }

    .media-strip.is-single {
      overflow-x: hidden;
      scroll-snap-type: none;
    }

    .media-strip.is-single .media-item {
      width: 100%;
      aspect-ratio: auto;
      max-height: 420px;
    }

    .media-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      opacity: 0;
      transition: opacity 0.35s ease, transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .media-item img.loaded {
      opacity: 1;
    }

    .media-item:hover img.loaded {
      transform: scale(1.02);
    }

    /* 4. 转发引用：iMessage / Notes 式降阶嵌套 */
    .quote-block {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--bg-subtle);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .quote-author {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .quote-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.35;
    }

    .quote-body {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* 5. 无分割线操作栏 */
    .card-actions {
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .actions-left {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .actions-right {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
    }

    .action-btn {
      border: 0;
      background: transparent;
      padding: 4px 2px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--text-tertiary);
      font-size: 13px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: color 0.18s ease, transform 0.18s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .action-btn:hover {
      color: var(--text-primary);
    }

    .action-btn svg {
      width: 17px;
      height: 17px;
      stroke-width: 1.65;
    }

    .action-btn.is-liked {
      color: var(--accent-red);
    }

    .action-btn.is-liked svg {
      fill: currentColor;
      animation: heartPop 0.34s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes heartPop {
      0% { transform: scale(1); }
      45% { transform: scale(1.28); }
      100% { transform: scale(1); }
    }

    /* Popover 菜单 */
    .popover-menu {
      position: absolute;
      right: 0;
      bottom: 32px;
      min-width: 150px;
      background: var(--bg-card);
      border: 1px solid var(--border-hairline);
      border-radius: 14px;
      padding: 6px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
      z-index: 20;
      display: none;
      flex-direction: column;
      gap: 2px;
    }

    .popover-menu.open {
      display: flex;
      animation: popIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popIn {
      from { opacity: 0; transform: scale(0.92) translateY(4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .popover-item {
      border: 0;
      background: transparent;
      color: var(--text-primary);
      font-size: 13px;
      text-align: left;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .popover-item:hover {
      background: var(--bg-subtle);
    }

    /* 6. 卡片内展开评论区（去框 + 缩进层级） */
    .inline-comments {
      display: none;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border-hairline);
    }

    .inline-comments.open {
      display: block;
      animation: slideDown 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 12px;
    }

    .comment-row {
      display: flex;
      gap: 9px;
      align-items: flex-start;
    }

    .comment-row.is-child {
      padding-left: 29px;
    }

    .comment-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--bg-subtle);
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .comment-main {
      flex: 1;
      min-width: 0;
    }

    .comment-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      line-height: 1.3;
    }

    .comment-author {
      font-weight: 600;
      color: var(--text-primary);
    }

    .comment-reply-target {
      color: var(--text-tertiary);
      font-weight: 400;
    }

    .comment-time {
      color: var(--text-tertiary);
    }

    .comment-text {
      margin: 3px 0 4px;
      font-size: 14px;
      line-height: 1.48;
      color: var(--text-body);
    }

    .comment-ops {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .comment-op-btn {
      border: 0;
      background: transparent;
      padding: 0;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-tertiary);
      cursor: pointer;
    }
    .comment-op-btn:hover { color: var(--text-primary); }

    .view-all-comments {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border: 0;
      background: transparent;
      padding: 2px 0 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--accent-blue);
      cursor: pointer;
    }

    /* 7. iMessage 风格内联快速回复 */
    .reply-drawer {
      display: none;
      margin-top: 10px;
    }

    .reply-drawer.open {
      display: block;
      animation: slideDown 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .reply-target-chip {
      display: none;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
      padding-left: 4px;
    }
    .reply-target-chip.show { display: inline-flex; }
    .reply-target-clear {
      border: 0;
      background: var(--bg-subtle);
      color: var(--text-secondary);
      width: 16px;
      height: 16px;
      border-radius: 50%;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
    }

    /* 8. Apple 极简详情页视图 */
    .detail-view {
      display: none;
      min-height: 100vh;
      background: var(--bg-card);
      padding-bottom: 96px;
    }

    .detail-view.open {
      display: block;
      animation: detailEnter 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    }

    @keyframes detailEnter {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .detail-nav {
      position: sticky;
      top: 0;
      z-index: 60;
      background: var(--bg-nav);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--border-hairline);
    }

    .detail-nav-inner {
      max-width: 680px;
      margin: 0 auto;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .detail-back {
      border: 0;
      background: transparent;
      color: var(--accent-blue);
      font-size: 15px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px 4px 0;
      cursor: pointer;
    }

    .detail-nav-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      max-width: 55%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .detail-article {
      max-width: 680px;
      margin: 0 auto;
      padding: 28px 20px 24px;
    }

    .detail-kicker {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-blue);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .detail-title {
      margin: 0 0 16px;
      font-size: 25px;
      font-weight: 700;
      line-height: 1.28;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .detail-author-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
    }

    .detail-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bg-subtle);
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
    }
    .detail-avatar img { width: 100%; height: 100%; object-fit: cover; }

    .detail-author-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .detail-author-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .detail-author-sub {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .detail-body {
      font-size: 16px;
      line-height: 1.68;
      color: var(--text-body);
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0 0 18px;
    }

    .detail-comments-section {
      max-width: 680px;
      margin: 12px auto 0;
      padding: 22px 20px 0;
      border-top: 1px solid var(--border-hairline);
    }

    .detail-comments-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }

    .detail-comments-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .detail-bottom-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 65;
      background: var(--bg-nav);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-top: 1px solid var(--border-hairline);
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
    }

    .detail-bottom-inner {
      max-width: 680px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .detail-bottom-inner .imessage-box {
      flex: 1;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .imessage-box {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      background: var(--bg-subtle);
      border-radius: 18px;
      padding: 6px 6px 6px 14px;
    }

    .imessage-input {
      flex: 1;
      border: 0;
      background: transparent;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 14px;
      line-height: 1.4;
      resize: none;
      outline: none;
      max-height: 100px;
      padding: 4px 0;
    }

    .imessage-input::placeholder {
      color: var(--text-tertiary);
    }

    .imessage-send {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 0;
      background: var(--text-tertiary);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: default;
      opacity: 0.4;
      flex-shrink: 0;
      transition: background-color 0.2s ease, opacity 0.2s ease, transform 0.15s ease;
    }

    .imessage-send.ready {
      background: var(--accent-blue);
      opacity: 1;
      cursor: pointer;
    }

    .imessage-send.ready:active {
      transform: scale(0.9);
    }

    .local-replies {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .local-reply-item {
      font-size: 13px;
      color: var(--text-body);
      padding: 6px 10px;
      border-radius: 10px;
      background: var(--bg-subtle);
    }

    /* 全屏沉浸大图查看器 */
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.92);
      backdrop-filter: blur(20px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .lightbox.open { display: flex; }

    .lightbox img {
      max-width: 100%;
      max-height: 88vh;
      border-radius: 12px;
      object-fit: contain;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .lightbox-close {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.16);
      color: #FFFFFF;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-counter {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 255, 255, 0.78);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      background: rgba(255, 255, 255, 0.12);
      padding: 4px 12px;
      border-radius: 999px;
    }

    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%) translateY(16px);
      background: rgba(29, 29, 31, 0.9);
      color: #FFFFFF;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      opacity: 0;
      pointer-events: none;
      transition: all 0.25s ease;
      z-index: 120;
    }
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>
  <header class="top-bar">
    <div class="top-bar-inner">
      <div class="brand">
        <span class="brand-title">方块之家 · Apple 极简卡片 Demo</span>
        <span class="brand-sub" id="dataStatus">已加载 16 条真实线上帖子</span>
      </div>
      <div class="controls">
        <div class="segmented" role="group" aria-label="外观模式">
          <button type="button" class="active" data-theme-btn="light">浅色</button>
          <button type="button" data-theme-btn="dark">深色</button>
        </div>
        <button type="button" class="refresh-btn" id="refreshLiveBtn">刷新实时数据</button>
      </div>
    </div>
  </header>

  <main class="feed-container" id="feed"></main>
  <section class="detail-view" id="detailView" aria-hidden="true"></section>

  <div class="lightbox" id="lightbox" aria-hidden="true">
    <button type="button" class="lightbox-close" id="lightboxClose" aria-label="关闭">✕</button>
    <img id="lightboxImg" src="" alt="" />
    <div class="lightbox-counter" id="lightboxCounter"></div>
  </div>

  <div class="toast" id="toast"></div>

  <script id="real-posts-data" type="application/json">${safeJson}</script>
  <script>
    const SUPABASE_URL = 'https://nplnlefdwfgtyimfkyih.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wbG5sZWZkd2ZndHlpbWZreWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MjYzMzYsImV4cCI6MjA4NjMwMjMzNn0.D5FDnW1Z3LBrbFce4BO2CLg3MTNII0zGq8YedDSGCN8';

    // 与项目 utils/db-image-url.js 同源：将 res.cloudinary.com 改写为国内可达 CDN
    function rewriteImageUrl(rawUrl, transform = 'f_auto,q_auto:good,c_limit,w_1080') {
      if (!rawUrl) return '';
      let url = String(rawUrl).replace('https://res.cloudinary.com', 'https://cdn.blockofhome.cn');
      if (url.includes('cdn.blockofhome.cn') && url.includes('/image/upload/') && !url.includes('/image/upload/f_auto')) {
        url = url.replace('/image/upload/', '/image/upload/' + transform + '/');
      }
      return url;
    }

    function formatTime(iso) {
      if (!iso) return '';
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return '刚刚';
      if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
      if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
      const d = new Date(iso);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function cleanPostText(post) {
      let title = (post.title || '').trim();
      let body = (post.body || post.content || '').trim();
      if (!title && body.startsWith('【')) {
        const m = body.match(/^【(.*?)】\\s*/);
        if (m) {
          title = m[1].trim();
          body = body.slice(m[0].length).trim();
        }
      } else if (title && body.startsWith('【' + title + '】')) {
        body = body.slice(('【' + title + '】').length).trim();
      }
      return { title, body };
    }

    function showToast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    }

    let currentPosts = JSON.parse(document.getElementById('real-posts-data').textContent || '[]');
    const likedSet = new Set();
    let lightboxImages = [];
    let lightboxIndex = 0;

    function openLightbox(images, index) {
      lightboxImages = images;
      lightboxIndex = index;
      updateLightbox();
      document.getElementById('lightbox').classList.add('open');
    }

    function updateLightbox() {
      const img = document.getElementById('lightboxImg');
      const counter = document.getElementById('lightboxCounter');
      img.src = rewriteImageUrl(lightboxImages[lightboxIndex], 'f_auto,q_auto:good,c_limit,w_1600');
      counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
    }

    function renderFeed(posts) {
      const feed = document.getElementById('feed');
      feed.innerHTML = '';

      posts.forEach((post) => {
        const { title, body } = cleanPostText(post);
        const images = (post.images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const avatarSrc = post.author_avatar_url ? rewriteImageUrl(post.author_avatar_url, 'f_auto,q_auto:good,c_fill,w_96,h_96') : '';
        const authorName = post.author_username || '方块之家';
        const isOfficial = post.post_kind === 'news' || post.post_kind === 'activity' || (!post.author_id && authorName === '方块之家');

        const card = document.createElement('article');
        card.className = 'apple-card';

        // 1. 单行微头部
        const metaTags = [];
        if (post.location_name) metaTags.push(post.location_name);
        if (post.tag) metaTags.push('#' + post.tag);

        const kindText = post.post_kind === 'news' ? '新闻' : post.post_kind === 'activity' ? '活动' : '';

        // 2. 横向滚动媒体条（全部图片均保留横向可滑，单图全宽）
        let mediaHtml = '';
        if (images.length > 0) {
          const isSingle = images.length === 1;
          mediaHtml = '<div class="media-strip-wrap">' +
            (!isSingle ? '<span class="media-strip-badge">1 / ' + images.length + '</span>' : '') +
            '<div class="media-strip ' + (isSingle ? 'is-single' : '') + '">' +
            images.map((img, idx) => {
              const src = rewriteImageUrl(img.url || img.image_url, isSingle ? 'f_auto,q_auto:good,c_limit,w_1200' : 'f_auto,q_auto:good,c_fill,w_720,h_540');
              return '<div class="media-item" data-img-idx="' + idx + '">' +
                '<img src="' + escapeHtml(src) + '" loading="lazy" alt="" onload="this.classList.add(\\'loaded\\')" />' +
              '</div>';
            }).join('') +
            '</div>' +
          '</div>';
        }

        // 3. 转发引用
        let quoteHtml = '';
        if (post.quotedPost) {
          const qt = cleanPostText(post.quotedPost);
          quoteHtml = '<div class="quote-block">' +
            '<span class="quote-author">@' + escapeHtml(post.quotedPost.author_username || '方块之家') + '</span>' +
            (qt.title ? '<span class="quote-title">' + escapeHtml(qt.title) + '</span>' : '') +
            (qt.body ? '<span class="quote-body">' + escapeHtml(qt.body) + '</span>' : '') +
          '</div>';
        }

        const isLiked = likedSet.has(post.id);
        const likeCount = (post.like_count || 0) + (isLiked ? 1 : 0);
        const commentCount = post.comment_count || 0;
        const isLong = body.length > 130 || body.split('\\n').length > 4;

        card.innerHTML =
          '<div class="card-meta">' +
            '<div class="meta-left">' +
              '<div class="avatar">' +
                (avatarSrc ? '<img src="' + escapeHtml(avatarSrc) + '" alt="" loading="lazy" />' : escapeHtml(authorName.charAt(0).toUpperCase())) +
              '</div>' +
              '<div class="meta-line">' +
                '<span class="author-name">' + escapeHtml(authorName) + '</span>' +
                '<span class="meta-dot">·</span>' +
                '<span>' + formatTime(post.created_at) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="meta-right">' +
              (kindText ? '<span class="kind-dot"></span><span>' + kindText + '</span>' : '') +
              (metaTags.length ? '<span>' + escapeHtml(metaTags.join(' · ')) + '</span>' : '') +
            '</div>' +
          '</div>' +
          (title ? '<h3 class="card-title">' + escapeHtml(title) + '</h3>' : '') +
          (body ? '<p class="card-body ' + (isLong ? 'is-clamped' : '') + '">' + escapeHtml(body) + '</p>' : '') +
          (isLong ? '<button type="button" class="expand-link">展开</button>' : '') +
          mediaHtml +
          quoteHtml +
          '<div class="card-actions">' +
            '<div class="actions-left">' +
              '<button type="button" class="action-btn like-btn ' + (isLiked ? 'is-liked' : '') + '" aria-label="点赞">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>' +
                '<span class="like-num">' + (likeCount > 0 ? likeCount : '') + '</span>' +
              '</button>' +
              '<button type="button" class="action-btn comment-btn" aria-label="评论">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>' +
                '<span>' + (commentCount > 0 ? commentCount : '') + '</span>' +
              '</button>' +
            '</div>' +
            '<div class="actions-right">' +
              '<button type="button" class="action-btn reply-toggle-btn" aria-label="快速回复" title="快速回复">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>' +
              '</button>' +
              '<button type="button" class="action-btn more-btn" aria-label="更多">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>' +
              '</button>' +
              '<div class="popover-menu">' +
                '<button type="button" class="popover-item copy-link-item">复制帖子链接</button>' +
                '<button type="button" class="popover-item view-id-item">查看帖子 ID</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="inline-comments">' +
            '<div class="comment-list"></div>' +
            (commentCount > 3 ? '<button type="button" class="view-all-comments">查看全部 ' + commentCount + ' 条评论 ›</button>' : '') +
            '<div class="reply-drawer">' +
              '<div class="reply-target-chip">正在回复 <strong class="reply-target-name"></strong> <button type="button" class="reply-target-clear">×</button></div>' +
              '<div class="imessage-box">' +
                '<textarea class="imessage-input" rows="1" placeholder="写下你的评论…"></textarea>' +
                '<button type="button" class="imessage-send" aria-label="发送">↑</button>' +
              '</div>' +
            '</div>' +
          '</div>';

        // 展开/收起长文
        const expandBtn = card.querySelector('.expand-link');
        const bodyEl = card.querySelector('.card-body');
        if (expandBtn && bodyEl) {
          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const clamped = bodyEl.classList.toggle('is-clamped');
            expandBtn.textContent = clamped ? '展开' : '收起';
          });
        }

        // 图片点击看大图 + 横向滚动更新页码
        const stripEl = card.querySelector('.media-strip');
        const badgeEl = card.querySelector('.media-strip-badge');
        if (stripEl && badgeEl && images.length > 1) {
          stripEl.addEventListener('scroll', () => {
            const firstItem = stripEl.querySelector('.media-item');
            const step = firstItem ? firstItem.offsetWidth + 8 : 1;
            let idx = Math.round(stripEl.scrollLeft / step);
            if (stripEl.scrollLeft + stripEl.clientWidth >= stripEl.scrollWidth - 8) {
              idx = images.length - 1;
            }
            idx = Math.min(Math.max(idx, 0), images.length - 1);
            badgeEl.textContent = (idx + 1) + ' / ' + images.length;
          }, { passive: true });
        }

        card.querySelectorAll('.media-item').forEach((item) => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(item.dataset.imgIdx || 0);
            openLightbox(images.map(i => i.url || i.image_url), idx);
          });
        });

        // 点赞交互
        const likeBtn = card.querySelector('.like-btn');
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (likedSet.has(post.id)) likedSet.delete(post.id);
          else likedSet.add(post.id);
          const nowLiked = likedSet.has(post.id);
          likeBtn.classList.toggle('is-liked', nowLiked);
          const count = (post.like_count || 0) + (nowLiked ? 1 : 0);
          likeBtn.querySelector('.like-num').textContent = count > 0 ? String(count) : '';
        });

        // 卡片内展开评论区 + iMessage 快速回复
        const inlineComments = card.querySelector('.inline-comments');
        const commentListEl = card.querySelector('.comment-list');
        const replyDrawer = card.querySelector('.reply-drawer');
        const input = card.querySelector('.imessage-input');
        const sendBtn = card.querySelector('.imessage-send');
        const targetChip = card.querySelector('.reply-target-chip');
        const targetNameEl = card.querySelector('.reply-target-name');
        let replyToName = '';
        let commentsLoaded = false;

        const renderCommentRows = (listEl, rows, onReplyClick) => {
          listEl.innerHTML = '';
          if (!rows.length) {
            listEl.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);padding:2px 0;">暂无评论，来抢个沙发</div>';
            return;
          }
          rows.forEach((c) => {
            const row = document.createElement('div');
            row.className = 'comment-row' + (c.parent_id ? ' is-child' : '');
            const uname = c.author_username || '社区成员';
            row.innerHTML =
              '<div class="comment-avatar">' + escapeHtml(uname.charAt(0).toUpperCase()) + '</div>' +
              '<div class="comment-main">' +
                '<div class="comment-head">' +
                  '<span class="comment-author">' + escapeHtml(uname) + '</span>' +
                  (c.reply_to_username ? '<span class="comment-reply-target">▸ @' + escapeHtml(c.reply_to_username) + '</span>' : '') +
                  '<span class="comment-time">' + formatTime(c.created_at) + '</span>' +
                '</div>' +
                '<p class="comment-text">' + escapeHtml(c.content) + '</p>' +
                '<div class="comment-ops">' +
                  '<button type="button" class="comment-op-btn">回复</button>' +
                '</div>' +
              '</div>';
            row.querySelector('.comment-op-btn').addEventListener('click', (ev) => {
              ev.stopPropagation();
              onReplyClick(uname);
            });
            listEl.appendChild(row);
          });
        };

        const ensureCommentsLoaded = async () => {
          if (commentsLoaded) return post.__comments || [];
          commentsLoaded = true;
          try {
            const res = await fetch(
              SUPABASE_URL + '/rest/v1/comments?select=id,content,author_username,created_at,parent_id,reply_to_username&post_id=eq.' + post.id + '&order=created_at.asc&limit=15',
              { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
            );
            const data = await res.json();
            post.__comments = Array.isArray(data) ? data : [];
          } catch {
            post.__comments = [];
          }
          return post.__comments;
        };

        const setReplyTarget = (name) => {
          replyToName = name || '';
          if (replyToName) {
            targetNameEl.textContent = '@' + replyToName;
            targetChip.classList.add('show');
            input.placeholder = '回复 @' + replyToName + '…';
          } else {
            targetChip.classList.remove('show');
            input.placeholder = '写下你的评论…';
          }
          input.focus();
        };

        card.querySelector('.reply-target-clear').addEventListener('click', (e) => {
          e.stopPropagation();
          setReplyTarget('');
        });

        card.querySelector('.comment-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          const opening = !inlineComments.classList.contains('open');
          inlineComments.classList.toggle('open');
          replyDrawer.classList.toggle('open', opening);
          if (opening) {
            commentListEl.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);">正在加载评论…</div>';
            const rows = await ensureCommentsLoaded();
            renderCommentRows(commentListEl, rows.slice(0, 4), setReplyTarget);
          }
        });

        card.querySelector('.reply-toggle-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          inlineComments.classList.add('open');
          replyDrawer.classList.add('open');
          const rows = await ensureCommentsLoaded();
          renderCommentRows(commentListEl, rows.slice(0, 4), setReplyTarget);
          input.focus();
        });

        inlineComments.addEventListener('click', (e) => e.stopPropagation());

        const viewAllBtn = card.querySelector('.view-all-comments');
        if (viewAllBtn) {
          viewAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDetail(post);
          });
        }

        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 100) + 'px';
          sendBtn.classList.toggle('ready', input.value.trim().length > 0);
        });

        sendBtn.addEventListener('click', () => {
          const val = input.value.trim();
          if (!val) return;
          post.__comments = post.__comments || [];
          post.__comments.push({
            id: 'local-' + Date.now(),
            author_username: '我',
            reply_to_username: replyToName || null,
            parent_id: replyToName ? 'local-parent' : null,
            content: val,
            created_at: new Date().toISOString()
          });
          renderCommentRows(commentListEl, post.__comments.slice(-4), setReplyTarget);
          input.value = '';
          input.style.height = 'auto';
          sendBtn.classList.remove('ready');
          setReplyTarget('');
          showToast('已模拟发送评论');
        });

        // 点击卡片空白区进入 Apple 极简详情页
        card.addEventListener('click', () => openDetail(post));

        // 更多菜单
        const moreBtn = card.querySelector('.more-btn');
        const popover = card.querySelector('.popover-menu');
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.popover-menu.open').forEach(p => { if (p !== popover) p.classList.remove('open'); });
          popover.classList.toggle('open');
        });
        card.querySelector('.copy-link-item').addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.remove('open');
          showToast('已复制帖子链接（Demo）');
        });
        card.querySelector('.view-id-item').addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.remove('open');
          showToast('ID: ' + post.id.slice(0, 8) + '…');
        });

        feed.appendChild(card);
      });
    }

    // 主题切换
    document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.themeBtn;
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // 关闭全局 popover & 灯箱
    document.addEventListener('click', () => {
      document.querySelectorAll('.popover-menu.open').forEach(p => p.classList.remove('open'));
    });

    document.getElementById('lightboxClose').addEventListener('click', () => {
      document.getElementById('lightbox').classList.remove('open');
    });
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') e.target.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      const lb = document.getElementById('lightbox');
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowRight' && lightboxIndex < lightboxImages.length - 1) {
        lightboxIndex++;
        updateLightbox();
      }
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
        lightboxIndex--;
        updateLightbox();
      }
    });

    // 实时拉取线上最新帖子
    document.getElementById('refreshLiveBtn').addEventListener('click', async () => {
      const statusEl = document.getElementById('dataStatus');
      statusEl.textContent = '正在拉取线上最新帖子…';
      try {
        const select = encodeURIComponent('*,images:forum_post_images(*)');
        const res = await fetch(
          SUPABASE_URL + '/rest/v1/posts?select=' + select + '&or=(status.is.null,status.eq.approved)&order=created_at.desc&limit=16',
          { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          currentPosts = data;
          async function openDetail(post) {
      const feedEl = document.getElementById('feed');
      const topBar = document.querySelector('.top-bar');
      const detailEl = document.getElementById('detailView');
      const { title, body } = cleanPostText(post);
      const images = (post.images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const avatarSrc = post.author_avatar_url ? rewriteImageUrl(post.author_avatar_url, 'f_auto,q_auto:good,c_fill,w_96,h_96') : '';
      const authorName = post.author_username || '方块之家';
      const isSingle = images.length === 1;

      const mediaHtml = images.length > 0
        ? '<div class="media-strip-wrap">' +
            (!isSingle ? '<span class="media-strip-badge">1 / ' + images.length + '</span>' : '') +
            '<div class="media-strip ' + (isSingle ? 'is-single' : '') + '">' +
              images.map((img, idx) => {
                const src = rewriteImageUrl(img.url || img.image_url, 'f_auto,q_auto:good,c_limit,w_1400');
                return '<div class="media-item" data-img-idx="' + idx + '"><img src="' + escapeHtml(src) + '" onload="this.classList.add(\\'loaded\\')" alt="" /></div>';
              }).join('') +
            '</div>' +
          '</div>'
        : '';

      const kickerParts = [];
      if (post.post_kind === 'news') kickerParts.push('新闻');
      else if (post.post_kind === 'activity') kickerParts.push('活动');
      if (post.tag) kickerParts.push('#' + post.tag);

      detailEl.innerHTML =
        '<nav class="detail-nav"><div class="detail-nav-inner">' +
          '<button type="button" class="detail-back" id="detailBackBtn">‹ 返回</button>' +
          '<span class="detail-nav-title">' + escapeHtml(title || authorName) + '</span>' +
          '<span style="width:44px;"></span>' +
        '</div></nav>' +
        '<article class="detail-article">' +
          (kickerParts.length ? '<div class="detail-kicker">' + escapeHtml(kickerParts.join(' · ')) + '</div>' : '') +
          (title ? '<h1 class="detail-title">' + escapeHtml(title) + '</h1>' : '') +
          '<div class="detail-author-bar">' +
            '<div class="detail-avatar">' + (avatarSrc ? '<img src="' + escapeHtml(avatarSrc) + '" alt="" />' : escapeHtml(authorName.charAt(0).toUpperCase())) + '</div>' +
            '<div class="detail-author-meta">' +
              '<span class="detail-author-name">' + escapeHtml(authorName) + '</span>' +
              '<span class="detail-author-sub">' + formatTime(post.created_at) + (post.location_name ? ' · ' + escapeHtml(post.location_name) : '') + '</span>' +
            '</div>' +
          '</div>' +
          (body ? '<p class="detail-body">' + escapeHtml(body) + '</p>' : '') +
          mediaHtml +
        '</article>' +
        '<section class="detail-comments-section">' +
          '<div class="detail-comments-header">' +
            '<span class="detail-comments-title">评论 <span style="color:var(--text-tertiary);font-weight:500;">' + (post.comment_count || 0) + '</span></span>' +
          '</div>' +
          '<div class="comment-list" id="detailCommentList"><div style="font-size:13px;color:var(--text-tertiary);">正在加载评论…</div></div>' +
        '</section>' +
        '<div class="detail-bottom-bar">' +
          '<div class="detail-bottom-inner">' +
            '<div class="imessage-box">' +
              '<textarea class="imessage-input" id="detailReplyInput" rows="1" placeholder="写下你的评论…"></textarea>' +
              '<button type="button" class="imessage-send" id="detailReplySend" aria-label="发送">↑</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      feedEl.style.display = 'none';
      topBar.style.display = 'none';
      detailEl.classList.add('open');
      window.scrollTo(0, 0);

      document.getElementById('detailBackBtn').addEventListener('click', () => {
        detailEl.classList.remove('open');
        feedEl.style.display = '';
        topBar.style.display = '';
      });

      detailEl.querySelectorAll('.media-item').forEach((item) => {
        item.addEventListener('click', () => openLightbox(images.map(i => i.url || i.image_url), Number(item.dataset.imgIdx || 0)));
      });

      const dStrip = detailEl.querySelector('.media-strip');
      const dBadge = detailEl.querySelector('.media-strip-badge');
      if (dStrip && dBadge && images.length > 1) {
        dStrip.addEventListener('scroll', () => {
          const first = dStrip.querySelector('.media-item');
          const step = first ? first.offsetWidth + 8 : 1;
          let idx = Math.round(dStrip.scrollLeft / step);
          if (dStrip.scrollLeft + dStrip.clientWidth >= dStrip.scrollWidth - 8) idx = images.length - 1;
          dBadge.textContent = (Math.min(Math.max(idx, 0), images.length - 1) + 1) + ' / ' + images.length;
        }, { passive: true });
      }

      if (!post.__comments) {
        try {
          const res = await fetch(
            SUPABASE_URL + '/rest/v1/comments?select=id,content,author_username,created_at,parent_id,reply_to_username&post_id=eq.' + post.id + '&order=created_at.asc&limit=30',
            { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
          );
          const rows = await res.json();
          post.__comments = Array.isArray(rows) ? rows : [];
        } catch {
          post.__comments = [];
        }
      }

      const dList = document.getElementById('detailCommentList');
      const dInput = document.getElementById('detailReplyInput');
      const dSend = document.getElementById('detailReplySend');
      let dReplyTo = '';

      const renderDetailComments = () => {
        dList.innerHTML = '';
        if (!post.__comments.length) {
          dList.innerHTML = '<div style="font-size:14px;color:var(--text-tertiary);">暂无评论，成为第一个评论的人吧</div>';
          return;
        }
        post.__comments.forEach((c) => {
          const row = document.createElement('div');
          row.className = 'comment-row' + (c.parent_id ? ' is-child' : '');
          const uname = c.author_username || '社区成员';
          row.innerHTML =
            '<div class="comment-avatar">' + escapeHtml(uname.charAt(0).toUpperCase()) + '</div>' +
            '<div class="comment-main">' +
              '<div class="comment-head">' +
                '<span class="comment-author">' + escapeHtml(uname) + '</span>' +
                (c.reply_to_username ? '<span class="comment-reply-target">▸ @' + escapeHtml(c.reply_to_username) + '</span>' : '') +
                '<span class="comment-time">' + formatTime(c.created_at) + '</span>' +
              '</div>' +
              '<p class="comment-text">' + escapeHtml(c.content) + '</p>' +
              '<div class="comment-ops"><button type="button" class="comment-op-btn">回复</button></div>' +
            '</div>';
          row.querySelector('.comment-op-btn').addEventListener('click', () => {
            dReplyTo = uname;
            dInput.placeholder = '回复 @' + uname + '…';
            dInput.focus();
          });
          dList.appendChild(row);
        });
      };

      renderDetailComments();

      dInput.addEventListener('input', () => {
        dInput.style.height = 'auto';
        dInput.style.height = Math.min(dInput.scrollHeight, 100) + 'px';
        dSend.classList.toggle('ready', dInput.value.trim().length > 0);
      });

      dSend.addEventListener('click', () => {
        const val = dInput.value.trim();
        if (!val) return;
        post.__comments.push({
          id: 'local-' + Date.now(),
          author_username: '我',
          reply_to_username: dReplyTo || null,
          parent_id: dReplyTo ? 'local-parent' : null,
          content: val,
          created_at: new Date().toISOString()
        });
        renderDetailComments();
        dInput.value = '';
        dInput.style.height = 'auto';
        dSend.classList.remove('ready');
        dReplyTo = '';
        dInput.placeholder = '写下你的评论…';
        showToast('已模拟发送评论');
      });
    }

    renderFeed(currentPosts);
          statusEl.textContent = '已刷新 · ' + data.length + ' 条实时线上帖子';
          showToast('已拉取最新真实帖子');
        } else {
          throw new Error('返回为空');
        }
      } catch (err) {
        statusEl.textContent = '实时拉取受限，已保留内置 16 条真实帖子';
        showToast('实时拉取失败，继续展示内置真实数据');
      }
    });

    async function openDetail(post) {
      const feedEl = document.getElementById('feed');
      const topBar = document.querySelector('.top-bar');
      const detailEl = document.getElementById('detailView');
      const { title, body } = cleanPostText(post);
      const images = (post.images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const avatarSrc = post.author_avatar_url ? rewriteImageUrl(post.author_avatar_url, 'f_auto,q_auto:good,c_fill,w_96,h_96') : '';
      const authorName = post.author_username || '方块之家';
      const isSingle = images.length === 1;

      const mediaHtml = images.length > 0
        ? '<div class="media-strip-wrap">' +
            (!isSingle ? '<span class="media-strip-badge">1 / ' + images.length + '</span>' : '') +
            '<div class="media-strip ' + (isSingle ? 'is-single' : '') + '">' +
              images.map((img, idx) => {
                const src = rewriteImageUrl(img.url || img.image_url, 'f_auto,q_auto:good,c_limit,w_1400');
                return '<div class="media-item" data-img-idx="' + idx + '"><img src="' + escapeHtml(src) + '" onload="this.classList.add(\\'loaded\\')" alt="" /></div>';
              }).join('') +
            '</div>' +
          '</div>'
        : '';

      const kickerParts = [];
      if (post.post_kind === 'news') kickerParts.push('新闻');
      else if (post.post_kind === 'activity') kickerParts.push('活动');
      if (post.tag) kickerParts.push('#' + post.tag);

      detailEl.innerHTML =
        '<nav class="detail-nav"><div class="detail-nav-inner">' +
          '<button type="button" class="detail-back" id="detailBackBtn">‹ 返回</button>' +
          '<span class="detail-nav-title">' + escapeHtml(title || authorName) + '</span>' +
          '<span style="width:44px;"></span>' +
        '</div></nav>' +
        '<article class="detail-article">' +
          (kickerParts.length ? '<div class="detail-kicker">' + escapeHtml(kickerParts.join(' · ')) + '</div>' : '') +
          (title ? '<h1 class="detail-title">' + escapeHtml(title) + '</h1>' : '') +
          '<div class="detail-author-bar">' +
            '<div class="detail-avatar">' + (avatarSrc ? '<img src="' + escapeHtml(avatarSrc) + '" alt="" />' : escapeHtml(authorName.charAt(0).toUpperCase())) + '</div>' +
            '<div class="detail-author-meta">' +
              '<span class="detail-author-name">' + escapeHtml(authorName) + '</span>' +
              '<span class="detail-author-sub">' + formatTime(post.created_at) + (post.location_name ? ' · ' + escapeHtml(post.location_name) : '') + '</span>' +
            '</div>' +
          '</div>' +
          (body ? '<p class="detail-body">' + escapeHtml(body) + '</p>' : '') +
          mediaHtml +
        '</article>' +
        '<section class="detail-comments-section">' +
          '<div class="detail-comments-header">' +
            '<span class="detail-comments-title">评论 <span style="color:var(--text-tertiary);font-weight:500;">' + (post.comment_count || 0) + '</span></span>' +
          '</div>' +
          '<div class="comment-list" id="detailCommentList"><div style="font-size:13px;color:var(--text-tertiary);">正在加载评论…</div></div>' +
        '</section>' +
        '<div class="detail-bottom-bar">' +
          '<div class="detail-bottom-inner">' +
            '<div class="imessage-box">' +
              '<textarea class="imessage-input" id="detailReplyInput" rows="1" placeholder="写下你的评论…"></textarea>' +
              '<button type="button" class="imessage-send" id="detailReplySend" aria-label="发送">↑</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      feedEl.style.display = 'none';
      topBar.style.display = 'none';
      detailEl.classList.add('open');
      window.scrollTo(0, 0);

      document.getElementById('detailBackBtn').addEventListener('click', () => {
        detailEl.classList.remove('open');
        feedEl.style.display = '';
        topBar.style.display = '';
      });

      detailEl.querySelectorAll('.media-item').forEach((item) => {
        item.addEventListener('click', () => openLightbox(images.map(i => i.url || i.image_url), Number(item.dataset.imgIdx || 0)));
      });

      const dStrip = detailEl.querySelector('.media-strip');
      const dBadge = detailEl.querySelector('.media-strip-badge');
      if (dStrip && dBadge && images.length > 1) {
        dStrip.addEventListener('scroll', () => {
          const first = dStrip.querySelector('.media-item');
          const step = first ? first.offsetWidth + 8 : 1;
          let idx = Math.round(dStrip.scrollLeft / step);
          if (dStrip.scrollLeft + dStrip.clientWidth >= dStrip.scrollWidth - 8) idx = images.length - 1;
          dBadge.textContent = (Math.min(Math.max(idx, 0), images.length - 1) + 1) + ' / ' + images.length;
        }, { passive: true });
      }

      if (!post.__comments) {
        try {
          const res = await fetch(
            SUPABASE_URL + '/rest/v1/comments?select=id,content,author_username,created_at,parent_id,reply_to_username&post_id=eq.' + post.id + '&order=created_at.asc&limit=30',
            { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
          );
          const rows = await res.json();
          post.__comments = Array.isArray(rows) ? rows : [];
        } catch {
          post.__comments = [];
        }
      }

      const dList = document.getElementById('detailCommentList');
      const dInput = document.getElementById('detailReplyInput');
      const dSend = document.getElementById('detailReplySend');
      let dReplyTo = '';

      const renderDetailComments = () => {
        dList.innerHTML = '';
        if (!post.__comments.length) {
          dList.innerHTML = '<div style="font-size:14px;color:var(--text-tertiary);">暂无评论，成为第一个评论的人吧</div>';
          return;
        }
        post.__comments.forEach((c) => {
          const row = document.createElement('div');
          row.className = 'comment-row' + (c.parent_id ? ' is-child' : '');
          const uname = c.author_username || '社区成员';
          row.innerHTML =
            '<div class="comment-avatar">' + escapeHtml(uname.charAt(0).toUpperCase()) + '</div>' +
            '<div class="comment-main">' +
              '<div class="comment-head">' +
                '<span class="comment-author">' + escapeHtml(uname) + '</span>' +
                (c.reply_to_username ? '<span class="comment-reply-target">▸ @' + escapeHtml(c.reply_to_username) + '</span>' : '') +
                '<span class="comment-time">' + formatTime(c.created_at) + '</span>' +
              '</div>' +
              '<p class="comment-text">' + escapeHtml(c.content) + '</p>' +
              '<div class="comment-ops"><button type="button" class="comment-op-btn">回复</button></div>' +
            '</div>';
          row.querySelector('.comment-op-btn').addEventListener('click', () => {
            dReplyTo = uname;
            dInput.placeholder = '回复 @' + uname + '…';
            dInput.focus();
          });
          dList.appendChild(row);
        });
      };

      renderDetailComments();

      dInput.addEventListener('input', () => {
        dInput.style.height = 'auto';
        dInput.style.height = Math.min(dInput.scrollHeight, 100) + 'px';
        dSend.classList.toggle('ready', dInput.value.trim().length > 0);
      });

      dSend.addEventListener('click', () => {
        const val = dInput.value.trim();
        if (!val) return;
        post.__comments.push({
          id: 'local-' + Date.now(),
          author_username: '我',
          reply_to_username: dReplyTo || null,
          parent_id: dReplyTo ? 'local-parent' : null,
          content: val,
          created_at: new Date().toISOString()
        });
        renderDetailComments();
        dInput.value = '';
        dInput.style.height = 'auto';
        dSend.classList.remove('ready');
        dReplyTo = '';
        dInput.placeholder = '写下你的评论…';
        showToast('已模拟发送评论');
      });
    }

    renderFeed(currentPosts);
  </script>
</body>
</html>`;

const outPath = path.join(dir, 'apple-minimal-forum-demo.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Generated:', outPath, 'bytes:', Buffer.byteLength(html));
