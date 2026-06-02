// ============================================================
//  content.js — DOM 翻译执行器
//  视口优先 · 动态监听 · 进度指示 · 悬停查看原文
// ============================================================

// ---------- 配置 ----------

const TRANSLATED_ATTR = 'data-natural-translated';
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT',
  'TEXTAREA', 'INPUT', 'SVG', 'MATH', 'KBD', 'VAR', 'SAMP', 'TT',
  'IFRAME', 'CANVAS', 'AUDIO', 'VIDEO', 'OBJECT', 'EMBED',
]);
const SKIP_ATTRS = ['data-translated', 'translate', 'notranslate'];
const BATCH_SIZE = 20;      // 每批文本数
const DEBOUNCE_MS = 600;    // DOM 变化防抖
const VIEWPORT_MARGIN = 300; // 视口扩展边距（px），提前翻译即将可见内容

// ---------- 安全通信（带重试，应对 Service Worker 休眠后唤醒）----------

function sendToBackground(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        // SW 可能刚被 Chrome 唤醒，300ms 后再试一次
        setTimeout(() => {
          chrome.runtime.sendMessage(msg, (retryResp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(retryResp || null);
            }
          });
        }, 300);
      } else {
        resolve(response || null);
      }
    });
  });
}

// ---------- 全局状态 ----------

let settings = {
  enabled: true,
  targetLang: 'zh',
  sourceLang: 'auto',
  engine: 'deepseek',
  apiKey: '',
  style: 'casual',
};

let observer = null;
let pendingTimer = null;
let isTranslating = false;
let translateQueue = [];
let totalProcessed = 0;
let totalToProcess = 0;

// ---------- 进度指示器 ----------

function createProgressIndicator() {
  if (document.getElementById('__natrans_progress')) return;

  const container = document.createElement('div');
  container.id = '__natrans_progress';
  container.innerHTML = `
    <div class="nt-progress-inner">
      <span class="nt-progress-icon">🌐</span>
      <span class="nt-progress-text">翻译中...</span>
      <span class="nt-progress-count"></span>
      <div class="nt-progress-bar"><div class="nt-progress-fill"></div></div>
    </div>
  `;
  document.body.appendChild(container);
}

function showProgress(current, total) {
  createProgressIndicator();
  const el = document.getElementById('__natrans_progress');
  if (el) {
    el.classList.add('nt-visible');
    const countEl = el.querySelector('.nt-progress-count');
    const fillEl = el.querySelector('.nt-progress-fill');
    const textEl = el.querySelector('.nt-progress-text');
    if (countEl) countEl.textContent = `${current}/${total}`;
    if (fillEl) fillEl.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
    if (textEl) {
      textEl.textContent = current >= total ? '翻译完成 ✅' : '翻译中...';
    }
  }
}

function hideProgress(delay = 1500) {
  setTimeout(() => {
    const el = document.getElementById('__natrans_progress');
    if (el) el.classList.remove('nt-visible');
  }, delay);
}

// ---------- 悬停提示（显示原文）----------

function createTooltip() {
  if (document.getElementById('__natrans_tooltip')) return;
  const tooltip = document.createElement('div');
  tooltip.id = '__natrans_tooltip';
  tooltip.className = 'nt-tooltip';
  document.body.appendChild(tooltip);

  document.addEventListener('mouseover', onHover, true);
  document.addEventListener('mouseout', onHoverOut, true);
}

function onHover(e) {
  const target = e.target.closest(`[${TRANSLATED_ATTR}]`);
  if (!target) return;

  const original = target.getAttribute(TRANSLATED_ATTR);
  if (!original) return;

  const tooltip = document.getElementById('__natrans_tooltip');
  if (!tooltip) return;

  tooltip.textContent = `📝 原文: ${original}`;
  tooltip.classList.add('nt-visible');

  // 定位
  const rect = target.getBoundingClientRect();
  let left = rect.left + rect.width / 2;
  let top = rect.bottom + 6;

  // 防止溢出
  const tw = tooltip.offsetWidth || 200;
  if (left - tw / 2 < 8) left = tw / 2 + 8;
  if (left + tw / 2 > window.innerWidth - 8) left = window.innerWidth - tw / 2 - 8;
  if (top + 40 > window.innerHeight) top = rect.top - 40;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.transform = 'translateX(-50%)';
}

function onHoverOut(e) {
  const tooltip = document.getElementById('__natrans_tooltip');
  if (tooltip) tooltip.classList.remove('nt-visible');
}

// ---------- 节点过滤 ----------

function isTranslatableNode(node) {
  if (!node || !node.parentElement) return false;
  const parent = node.parentElement;

  if (SKIP_TAGS.has(parent.tagName)) return false;
  if (parent.hasAttribute(TRANSLATED_ATTR)) return false;

  // 内容为空的跳过
  const text = node.nodeValue?.trim();
  if (!text) return false;

  // 纯数字/符号/空白
  if (/^[\d\s.,;:!?+\-*/=<>()[\]{}|&@#$%^~`'"\\/]+$/.test(text)) return false;

  // 单字符非中文
  if (text.length === 1 && !/[一-鿿]/.test(text)) return false;

  // URL
  if (/^(https?:|ftp:|mailto:|tel:)/i.test(text)) return false;

  // 检查父节点是否有跳过属性
  for (const attr of SKIP_ATTRS) {
    if (parent.hasAttribute(attr)) return false;
    if (parent.closest(`[${attr}]`)) return false;
  }

  return true;
}

// ---------- 文本收集（视口优先）----------

function collectAndSortTextNodes(root = document.body) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    { acceptNode: (n) => isTranslatableNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
  );

  const inView = [];
  const outView = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (isInOrNearViewport(node.parentElement)) {
      inView.push(node);
    } else {
      outView.push(node);
    }
  }

  return [...inView, ...outView];
}

function isInOrNearViewport(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight + VIEWPORT_MARGIN &&
    rect.bottom > -VIEWPORT_MARGIN &&
    rect.left < window.innerWidth + VIEWPORT_MARGIN &&
    rect.right > -VIEWPORT_MARGIN
  );
}

// ---------- 翻译执行 ----------

async function translateAll() {
  if (!settings.enabled || !settings.apiKey || isTranslating) return;

  const textNodes = collectAndSortTextNodes();
  if (textNodes.length === 0) return;

  isTranslating = true;
  totalProcessed = 0;
  totalToProcess = textNodes.length;
  showProgress(0, totalToProcess);

  // 分批并行处理
  const batches = [];
  for (let i = 0; i < textNodes.length; i += BATCH_SIZE) {
    batches.push(textNodes.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    if (!settings.enabled) break;

    const texts = batch.map(n => n.nodeValue.trim());

    try {
      const response = await sendToBackground({
        type: 'TRANSLATE',
        texts,
        targetLang: settings.targetLang,
        sourceLang: settings.sourceLang,
        engine: settings.engine,
        apiKey: settings.apiKey,
        style: settings.style,
      });

      if (response && response.success && response.translations) {
        applyTranslations(batch, texts, response.translations);
      }
      // 失败降级：保留原文不修改
    } catch (e) {
      // Service Worker 休眠是 Manifest V3 的正常行为，静默忽略
    }

    totalProcessed += batch.length;
    showProgress(totalProcessed, totalToProcess);

    // 批次间短暂延迟，避免 API 限流
    await sleep(100);
  }

  isTranslating = false;
  hideProgress();
}

function applyTranslations(nodes, originals, translations) {
  const fragment = document.createDocumentFragment(); // 未使用但保留用于未来批量 DOM 更新

  nodes.forEach((node, i) => {
    const translation = translations[i];
    if (!translation) return; // null = 保留原文

    const original = originals[i];
    if (!original || original === translation) return;

    // 节点可能在异步翻译期间被修改
    if (node.nodeValue?.trim() !== original) return;

    node.nodeValue = translation;
    node.parentElement.setAttribute(TRANSLATED_ATTR, original);
  });
}

// ---------- 动态内容监听 ----------

function setupObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!settings.enabled || !settings.apiKey) return;

    let hasNew = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && hasTranslatableContent(node)) {
            hasNew = true;
            break;
          } else if (node.nodeType === Node.TEXT_NODE && isTranslatableNode(node)) {
            hasNew = true;
            break;
          }
        }
      } else if (mutation.type === 'characterData') {
        if (isTranslatableNode(mutation.target)) {
          mutation.target.parentElement?.removeAttribute(TRANSLATED_ATTR);
          hasNew = true;
        }
      }
      if (hasNew) break;
    }

    if (hasNew) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(translateNewContent, DEBOUNCE_MS);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function hasTranslatableContent(element) {
  if (SKIP_TAGS.has(element.tagName)) return false;
  for (const attr of SKIP_ATTRS) {
    if (element.hasAttribute(attr) || element.closest(`[${attr}]`)) return false;
  }

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    { acceptNode: (n) => isTranslatableNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
  );
  return walker.nextNode() !== null;
}

async function translateNewContent() {
  await translateAll();
}

// ---------- 清理/重置 ----------

function removeAllTranslations() {
  const nodes = document.querySelectorAll(`[${TRANSLATED_ATTR}]`);
  for (const node of nodes) {
    const original = node.getAttribute(TRANSLATED_ATTR);
    if (original !== null && node.textContent !== original) {
      node.textContent = original;
    }
    node.removeAttribute(TRANSLATED_ATTR);
  }
}

// ---------- 消息处理 ----------

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_TRANSLATION') {
    settings.enabled = msg.enabled;
    if (msg.enabled) {
      translateAll();
    } else {
      removeAllTranslations();
    }
  } else if (msg.type === 'RETRANSLATE') {
    // 用户主动重新翻译：清理缓存 + 重新翻译
    sendToBackground({ type: 'CLEAR_PAGE_CACHE' }).catch(() => {});
    removeAllTranslations();
    translateAll();
  } else if (msg.type === 'SETTINGS_UPDATED') {
    // 引擎或设置变更
    const changed = msg.changes || {};
    const prev = {
      targetLang: settings.targetLang,
      style: settings.style,
      engine: settings.engine,
    };
    Object.assign(settings, changed);
    // 语言/风格/引擎变了才清缓存，仅开关/Key 变更不清
    if (
      prev.targetLang !== settings.targetLang ||
      prev.style !== settings.style ||
      prev.engine !== settings.engine
    ) {
      sendToBackground({ type: 'CLEAR_PAGE_CACHE' }).catch(() => {});
    }
    removeAllTranslations();
    translateAll();
  }
});

// ---------- 初始化 ----------

async function init() {
  const stored = await chrome.storage.sync.get([
    'enabled', 'targetLang', 'sourceLang', 'engine', 'apiKey', 'style'
  ]);
  settings.enabled = stored.enabled !== false;
  settings.targetLang = stored.targetLang || 'zh';
  settings.sourceLang = stored.sourceLang || 'auto';
  settings.engine = stored.engine || 'deepseek';
  settings.apiKey = stored.apiKey || '';
  settings.style = stored.style || 'casual';

  // 创建 UI 组件
  createTooltip();

  if (settings.enabled && settings.apiKey) {
    setupObserver();
    // 延迟启动，避免阻塞页面渲染
    setTimeout(() => translateAll(), 800);
  }

  // 监听存储变化
  chrome.storage.onChanged.addListener((changes) => {
    let shouldRetranslate = false;
    let shouldClearCache = false;
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
      if (settings.enabled) {
        setupObserver();
        shouldRetranslate = true;
      } else {
        if (observer) { observer.disconnect(); observer = null; }
        removeAllTranslations();
      }
    }
    if (changes.targetLang) { settings.targetLang = changes.targetLang.newValue; shouldRetranslate = true; shouldClearCache = true; }
    if (changes.sourceLang) { settings.sourceLang = changes.sourceLang.newValue; shouldRetranslate = true; shouldClearCache = true; }
    if (changes.engine)    { settings.engine = changes.engine.newValue; shouldRetranslate = true; shouldClearCache = true; }
    if (changes.style)     { settings.style = changes.style.newValue; shouldRetranslate = true; shouldClearCache = true; }
    // 仅 API Key 变更不清缓存

    if (shouldRetranslate && settings.enabled && settings.apiKey) {
      if (shouldClearCache) {
        sendToBackground({ type: 'CLEAR_PAGE_CACHE' }).catch(() => {});
      }
      removeAllTranslations();
      translateAll();
    }
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------- 启动 ----------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
