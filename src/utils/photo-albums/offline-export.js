/**
 * 影集离线 HTML 导出引擎（设计文档 §7）
 *
 * - ≤40 张：单文件 HTML，图片 base64 内嵌，断网可看、可打印
 * - >40 张：ZIP（index.html + images/），相对路径引用
 * - 仿 Lab html-renderer.js：Blob + a.download
 * - 配文纯文本 → 必须 HTML escape（XSS 硬约束）
 */

import { getLayout } from './layouts.js';
import { isNoteSheetPage, resolveNoteContent } from './note-sheet.js';
import { getCloudinaryTransformedUrl } from '../cloudinary-client.js';

const SINGLE_FILE_PHOTO_LIMIT = 40;
// 导出用降采样：源图上限 2048px，导出 1600px/q_auto:eco 足够屏显与打印
const EXPORT_TRANSFORM = 'f_auto,q_auto:eco,w_1600';

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchAsDataUrl(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`图片拉取失败（${response.status}）`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片编码失败'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsBlob(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`图片拉取失败（${response.status}）`);
  return response.blob();
}

function extFromDataUrl(dataUrl) {
  const match = /^data:image\/([a-z0-9+.-]+);/i.exec(dataUrl || '');
  const type = (match?.[1] || 'webp').toLowerCase();
  if (type === 'jpeg') return 'jpg';
  if (type === 'svg+xml') return 'svg';
  return type;
}

/**
 * 页面主体渲染（单文件与 ZIP 共用同一套结构）
 */
function renderPageMarkup(page, index, photoById, imageSrc, album = null) {
  const layout = getLayout(page.layoutId);
  const refs = page.photoRefs || [];
  const slots = refs
    .map((id, slotIndex) => {
      const photo = photoById.get(String(id));
      const caption = photo ? escapeHtml(photo.caption) : '';
      const media = photo
        ? `<figure class="slot" style="grid-area:p${slotIndex}"><img src="${imageSrc(photo)}" alt="${escapeHtml(caption || '照片')}" loading="lazy"><figcaption>${caption}</figcaption></figure>`
        : `<div class="slot slot-empty" style="grid-area:p${slotIndex}"></div>`;
      return media;
    })
    .join('');

  if (page.pageType === 'cover') {
    const coverPhoto = photoById.get(String(refs[0] || ''));
    return `
      <section class="page page-cover" data-page="${index}">
        <div class="cover-inner">
          ${coverPhoto ? `<img class="cover-photo" src="${imageSrc(coverPhoto)}" alt="封面">` : '<div class="cover-photo cover-placeholder"></div>'}
          <h1 class="cover-title">${escapeHtml(page.chapterTitle || '')}</h1>
          ${page.note ? `<p class="cover-subtitle">${escapeHtml(page.note)}</p>` : ''}
        </div>
      </section>`;
  }

  if (page.pageType === 'chapter') {
    return `
      <section class="page page-chapter" data-page="${index}">
        <div class="chapter-inner">
          <span class="chapter-kicker">CHAPTER</span>
          <h2 class="chapter-title">${escapeHtml(page.chapterTitle || '')}</h2>
          ${page.note ? `<p class="chapter-note">${escapeHtml(page.note)}</p>` : ''}
        </div>
      </section>`;
  }

  if (page.pageType === 'end') {
    return `
      <section class="page page-end" data-page="${index}">
        <div class="end-inner">
          <span class="end-mark">FIN</span>
          <p class="end-note">${escapeHtml(page.note || '感谢翻阅')}</p>
        </div>
      </section>`;
  }

  // 笔记版式（与阅读页同一套解析与排版）
  if (isNoteSheetPage(page)) {
    const note = resolveNoteContent({ page, photos: [...photoById.values()], album });
    const meta = [note.dateText, note.placeText].filter(Boolean).join(' ');
    const photoHtml = note.photos.length
      ? `<figure class="note-photo${note.isPair ? ' is-pair' : ''}">${note.photos
          .map(
            (photo) =>
              `<img src="${imageSrc(photo)}" alt="${escapeHtml(photo.caption || note.headline || '照片')}" loading="lazy">`,
          )
          .join('')}</figure>`
      : '<figure class="note-photo note-photo-empty"></figure>';
    const bodyHtml = [
      ...note.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`),
      ...note.captions.map((text) => `<p class="note-caption">${escapeHtml(text)}</p>`),
    ].join('');
    return `
      <section class="page page-note" data-page="${index}">
        <div class="note-sheet${note.isPortrait ? ' is-portrait' : ''}">
          ${photoHtml}
          <header class="note-head">
            <h1 class="note-title">${escapeHtml(note.headline || '未命名')}</h1>
            ${meta ? `<p class="note-meta">${escapeHtml(meta)}</p>` : ''}
          </header>
          <div class="note-body">${bodyHtml || '<p class="note-body-empty">这一页还没有文字</p>'}</div>
        </div>
      </section>`;
  }

  const textPhotos = refs.map((id) => photoById.get(String(id))).filter(Boolean);
  const textHtml =
    layout.textArea || layout.heroText
      ? `<aside class="page-text" style="grid-area:t">
        ${page.note ? `<p class="page-note">${escapeHtml(page.note)}</p>` : ''}
        ${textPhotos
          .filter((p) => p.caption)
          .map((p) => `<p class="page-caption">${escapeHtml(p.caption)}</p>`)
          .join('')}
      </aside>`
      : '';

  return `
    <section class="page page-content" data-page="${index}">
      <div class="page-grid" style="grid-template-areas:${layout.gridAreas};grid-template-rows:${layout.gridRows};grid-template-columns:${layout.gridColumns};gap:var(--album-gap)">
        ${slots || ''}
        ${textHtml}
      </div>
    </section>`;
}

function buildAlbumDocument({ album, pagesMarkup, tocMarkup, inlineCss, inlineJs }) {
  const title = escapeHtml(album.title || '我的影集');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${inlineCss}</style>
</head>
<body>
<header class="album-toolbar">
  <span class="album-title">${title}</span>
  <span class="album-tools">
    <button type="button" id="mode-flip">翻页</button>
    <button type="button" id="mode-scroll">滚动</button>
    <button type="button" id="print-btn">打印</button>
  </span>
</header>
<nav class="album-toc">
  <button type="button" class="toc-toggle" id="toc-toggle">目录</button>
  <div class="toc-list" id="toc-list" hidden>${tocMarkup}</div>
</nav>
<main class="album-book" id="book">
${pagesMarkup}
</main>
<footer class="album-footer">
  <button type="button" class="nav-btn" id="prev-btn">‹ 上一页</button>
  <span class="page-counter" id="page-counter">1 / 1</span>
  <button type="button" class="nav-btn" id="next-btn">下一页 ›</button>
</footer>
<script>${inlineJs}<\/script>
</body>
</html>`;
}

const ALBUM_EXPORT_CSS = `
:root{--album-gap:14px;--ink:#1a1a1a;--paper:#f4f4f4;--card:#fff;--muted:#6f6f6f;--accent:#1a1a1a;--album-serif:"Songti SC","STSong","Songti TC","Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC","SimSun",serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--album-serif)}
img{display:block;max-width:100%}
.album-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:rgba(247,244,238,.92);backdrop-filter:blur(8px);border-bottom:1px solid #e4ddd0}
.album-title{font-size:15px;letter-spacing:.08em}
.album-tools button,.toc-toggle,.nav-btn{font:inherit;font-size:13px;padding:6px 12px;margin-left:8px;border:1px solid #d8d0c0;background:var(--card);border-radius:999px;cursor:pointer;color:var(--ink)}
.album-tools button:hover,.toc-toggle:hover,.nav-btn:hover{border-color:var(--accent)}
.album-toc{position:relative;padding:10px 18px 0}
.toc-list{position:absolute;left:18px;right:18px;top:44px;z-index:30;background:var(--card);border:1px solid #e4ddd0;border-radius:14px;padding:10px 14px;box-shadow:0 12px 32px rgba(40,30,10,.12);max-height:50vh;overflow:auto}
.toc-list a{display:flex;justify-content:space-between;gap:16px;padding:7px 4px;color:var(--ink);text-decoration:none;border-bottom:1px dashed #eee5d4;font-size:14px}
.toc-list a:last-child{border-bottom:0}
.album-book{max-width:820px;margin:0 auto;padding:18px 18px 90px}
body[data-mode="flip"] .page{display:none;min-height:calc(100vh - 210px)}
body[data-mode="flip"] .page.is-active{display:block;animation:fadeIn .28s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.page{background:#fff;border:0;border-radius:0;padding:0;margin:0 0 24px;box-shadow:none}
.page-content{padding:16px}
.page-cover,.page-chapter,.page-end{padding:22px}
.page-grid{display:grid;height:100%;min-height:52vh}
.slot{position:relative;overflow:hidden;border-radius:12px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0}
.slot img{flex:1 1 auto;min-height:0;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:8px}
.slot figcaption{flex-shrink:0;padding:6px 4px 0;font-size:12px;color:#6f6f6f;text-align:center;line-height:1.5}
.slot-empty{border:1.5px dashed #d8d0c0}
.page-text{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:6px 4px}
.page-note{font-size:16px;line-height:1.95}
.page-caption{font-size:14px;line-height:1.85;color:#6f6f6f}
.page-cover,.page-chapter,.page-end{display:flex;align-items:center;justify-content:center;text-align:center;min-height:56vh}
.cover-photo{width:min(520px,86%);aspect-ratio:4/3;object-fit:cover;border-radius:16px;margin:0 auto 26px;box-shadow:0 18px 44px rgba(50,35,10,.18)}
.cover-placeholder{background:#efe9dc}
.cover-title{font-size:34px;letter-spacing:.14em;margin-bottom:10px}
.cover-subtitle,.chapter-note,.end-note{font-size:15px;color:var(--muted);letter-spacing:.12em}
.chapter-kicker,.end-mark{display:block;font-size:12px;letter-spacing:.5em;color:var(--accent);margin-bottom:14px}
.chapter-title{font-size:28px;letter-spacing:.2em}
/* ---------- 笔记版式（与阅读页同规格） ---------- */
.page-note{container-type:inline-size;background:#fff}
.note-sheet{display:grid;grid-template-areas:'photo photo' 'head body';grid-template-columns:minmax(84px,30%) minmax(0,1fr);column-gap:24px;row-gap:18px;align-items:start;padding:56px 44px 88px;background:#fff;color:#1a1a1a;font-family:var(--album-serif)}
.note-photo{grid-area:photo;margin:0;background:#fff}
.note-photo.is-pair{display:grid;grid-template-columns:1fr;gap:8px}
.note-photo img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.note-sheet.is-portrait .note-photo img{width:100%;max-width:100%;height:auto;max-height:62vh;aspect-ratio:auto;margin:0 auto;object-fit:contain}
.note-photo-empty{aspect-ratio:4/3;background:#f7f7f8}
.note-head{grid-area:head;min-width:0}
.note-title{margin:0;font-size:clamp(22px,6.2cqi,32px);font-weight:700;line-height:1.3;letter-spacing:.01em;word-break:break-word}
.note-meta{margin:10px 0 0;font-size:clamp(11px,3cqi,13px);line-height:1.5;letter-spacing:.02em;color:#6f6f6f}
.note-body{grid-area:body;min-width:0;font-size:clamp(14px,3.8cqi,16.5px);line-height:1.95;letter-spacing:.01em}
.note-body p{margin:0 0 1em;word-break:break-word}
.note-body p:last-child{margin-bottom:0}
.note-caption{font-size:.84em;line-height:1.8;color:#6f6f6f}
.note-body-empty{color:#b3b3b8}
@container (min-width:720px){
  .note-sheet.is-portrait{grid-template-areas:'photo head' 'photo body';grid-template-columns:52% minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);column-gap:36px;row-gap:10px}
  .note-sheet.is-portrait .note-photo{align-self:start}
  .note-sheet.is-portrait .note-photo img{max-height:72vh}
}
.album-footer{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:center;align-items:center;gap:14px;padding:12px;background:rgba(247,244,238,.94);backdrop-filter:blur(8px);border-top:1px solid #e4ddd0}
.page-counter{font-size:13px;color:var(--muted);letter-spacing:.1em;min-width:70px;text-align:center}
body[data-mode="scroll"] .album-footer{display:none}
@media print{
  .album-toolbar,.album-toc,.album-footer{display:none!important}
  body[data-mode] .page{display:block!important;break-after:page;box-shadow:none;border:0;border-radius:0;min-height:auto}
  body{background:#fff}
  .album-book{max-width:none;padding:0}
}
@media (max-width:640px){
  .album-book{padding:12px 10px 90px}
  .page{padding:0;border-radius:0}
  .page-content{padding:0 10px}
  .note-sheet{padding:28px 18px 64px;column-gap:22px;row-gap:16px;grid-template-columns:minmax(78px,32%) minmax(0,1fr)}
  .note-photo img{aspect-ratio:4/3}
  .note-sheet.is-portrait .note-photo img{max-height:62vh}
  .page-grid{min-height:auto;grid-template-rows:initial!important;grid-template-columns:initial!important;grid-template-areas:initial!important}
  .page-grid .slot{grid-area:auto!important;aspect-ratio:4/3;margin-bottom:10px}
  .page-grid .page-text{grid-area:auto!important}
  .cover-title{font-size:26px}
}
`;

const ALBUM_EXPORT_JS = `
(function(){
  var book=document.getElementById('book');
  var pages=Array.prototype.slice.call(book.querySelectorAll('.page'));
  var counter=document.getElementById('page-counter');
  var prev=document.getElementById('prev-btn');
  var next=document.getElementById('next-btn');
  var current=0;
  function pad(i){return i+1+' / '+pages.length}
  function show(i){
    if(!pages.length)return;
    current=Math.max(0,Math.min(pages.length-1,i));
    pages.forEach(function(p,idx){p.classList.toggle('is-active',idx===current)});
    counter.textContent=pad(current);
    try{if(location.hash!=='#p'+(current+1)) history.replaceState(null,'','#p'+(current+1))}catch(e){}
  }
  function mode(name){
    document.body.setAttribute('data-mode',name);
    try{localStorage.setItem('album-mode',name)}catch(e){}
    if(name==='flip'){show(current)}else{pages.forEach(function(p){p.classList.remove('is-active')});counter.textContent='—'}
  }
  prev.addEventListener('click',function(){mode('flip');show(current-1)});
  next.addEventListener('click',function(){mode('flip');show(current+1)});
  document.getElementById('mode-flip').addEventListener('click',function(){mode('flip')});
  document.getElementById('mode-scroll').addEventListener('click',function(){mode('scroll')});
  document.getElementById('print-btn').addEventListener('click',function(){window.print()});
  var tocToggle=document.getElementById('toc-toggle');
  var tocList=document.getElementById('toc-list');
  tocToggle.addEventListener('click',function(){tocList.hidden=!tocList.hidden});
  tocList.addEventListener('click',function(e){
    var a=e.target.closest('a');if(!a)return;
    e.preventDefault();tocList.hidden=true;mode('flip');
    var idx=Number(a.getAttribute('data-index'));show(idx);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'){mode('flip');show(current-1)}
    if(e.key==='ArrowRight'){mode('flip');show(current+1)}
  });
  var touchX=null;
  book.addEventListener('touchstart',function(e){touchX=e.touches[0].clientX},{passive:true});
  book.addEventListener('touchend',function(e){
    if(touchX===null)return;
    var dx=e.changedTouches[0].clientX-touchX;touchX=null;
    if(Math.abs(dx)<48)return;
    mode('flip');show(dx<0?current+1:current-1);
  },{passive:true});
  var hashIndex=Number((location.hash.match(/^#p(\\d+)$/)||[])[1]);
  try{mode(localStorage.getItem('album-mode')||'flip')}catch(e){mode('flip')}
  show(Number.isFinite(hashIndex)&&hashIndex>0?hashIndex-1:0);
})();`;
// 注意：上面的 `<\/script>` 转义只针对模板里内嵌 script；JS 字符串本身在 .js 文件中不构成标签

function buildToc(pages) {
  const items = [];
  pages.forEach((page, index) => {
    if (page.pageType === 'cover') {
      items.push(`<a href="#p1" data-index="0"><span>封面</span><span>01</span></a>`);
    } else if (page.pageType === 'chapter') {
      items.push(
        `<a href="#p${index + 1}" data-index="${index}"><span>${escapeHtml(page.chapterTitle || '章节')}</span><span>${String(index + 1).padStart(2, '0')}</span></a>`,
      );
    }
  });
  return items.join('') || '<a href="#p1" data-index="0"><span>开始阅读</span><span>01</span></a>';
}

/**
 * 构建离线 HTML 字符串
 * @param {object} payload {album, photos, pages}
 * @param {object} options {mode:'single'|'zip', onProgress?(done,total), signal}
 */
export async function buildAlbumExportHtml(payload, options = {}) {
  const { album, photos, pages } = payload;
  const mode = options.mode === 'zip' ? 'zip' : 'single';
  const photoList = photos || [];
  const photoById = new Map(photoList.map((p) => [String(p.id), p]));
  const exportUrl = (photo) =>
    getCloudinaryTransformedUrl(photo.url, EXPORT_TRANSFORM) || photo.url;

  const safePages = (pages || []).filter(Boolean);
  const total = mode === 'single' ? photoList.length : 0;
  let done = 0;
  const report = () => {
    if (typeof options.onProgress === 'function') options.onProgress(done, Math.max(total, 1));
  };
  report();

  const imageMap = new Map();
  if (mode === 'single') {
    for (const photo of photoList) {
      const dataUrl = await fetchAsDataUrl(exportUrl(photo), options.signal);
      imageMap.set(String(photo.id), dataUrl);
      done += 1;
      report();
    }
  } else {
    for (const photo of photoList) {
      imageMap.set(String(photo.id), `images/${String(photo.id)}.${extFromDataUrl('image/webp')}`);
    }
  }

  const imageSrcSingle = (photo) => imageMap.get(String(photo.id)) || exportUrl(photo);
  const pagesMarkup = safePages
    .map((page, index) => renderPageMarkup(page, index, photoById, imageSrcSingle, album))
    .join('\n');

  const html = buildAlbumDocument({
    album,
    pagesMarkup,
    tocMarkup: buildToc(safePages),
    inlineCss: ALBUM_EXPORT_CSS,
    inlineJs: ALBUM_EXPORT_JS,
  });
  return { html, imageMap, exportUrl };
}

function sanitizeFileName(title = '') {
  return (
    String(title)
      .trim()
      .replace(/[\\/:*?"<>|\s]+/g, '_') || '我的影集'
  ).slice(0, 60);
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 导出影集（自动分流单文件 / ZIP）
 * @returns {Promise<{kind:'single'|'zip', fileName:string, size:number}>}
 */
export async function exportAlbumOffline({ album, photos, pages }, options = {}) {
  const photoCount = (photos || []).length;
  const useZip = photoCount > SINGLE_FILE_PHOTO_LIMIT;
  const baseName = sanitizeFileName(album?.title);
  const report = typeof options.onProgress === 'function' ? options.onProgress : null;

  if (!useZip) {
    const { html } = await buildAlbumExportHtml(
      { album, photos, pages },
      { mode: 'single', onProgress: report, signal: options.signal },
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const fileName = `${baseName}.html`;
    downloadBlob(blob, fileName);
    return { kind: 'single', fileName, size: blob.size };
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const { html, imageMap, exportUrl } = await buildAlbumExportHtml(
    { album, photos, pages },
    { mode: 'zip', signal: options.signal },
  );
  zip.file('index.html', html);

  const imagesFolder = zip.folder('images');
  const list = photos || [];
  let done = 0;
  for (const photo of list) {
    const blob = await fetchAsBlob(exportUrl(photo), options.signal);
    imagesFolder.file(imageMap.get(String(photo.id)).replace('images/', ''), blob);
    done += 1;
    if (report) report(done, list.length);
  }
  zip.file(
    'README.txt',
    `${album?.title || '我的影集'}\n\n用浏览器打开 index.html 即可翻阅；连接打印机可直接打印成册。`,
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const fileName = `${baseName}.zip`;
  downloadBlob(blob, fileName);
  return { kind: 'zip', fileName, size: blob.size };
}
