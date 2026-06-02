// ============================================================
//  popup.js — 弹窗交互 · 引擎选择 · API Key · 用量统计 · 测试翻译
// ============================================================

// ---------- 引擎定义 ----------

const ENGINES = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔮',
    model: 'deepseek-chat',
    desc: '国产高性价比，翻译自然流畅',
    price: '¥0.0014/1K tokens',
    keyHint: '在 platform.deepseek.com 注册获取 API Key',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    model: 'gpt-3.5-turbo',
    desc: '全球领先大模型，口语化出色',
    price: '$0.0015/1K tokens',
    keyHint: '在 platform.openai.com/api-keys 获取',
    getKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    icon: '🧠',
    model: 'glm-4-flash',
    desc: '清华系大模型，中文理解力强',
    price: '¥0.001/1K tokens',
    keyHint: '在 open.bigmodel.cn 注册获取 API Key',
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    icon: '🚀',
    model: 'moonshot-v1-8k',
    desc: '长文本处理优秀，翻译准确',
    price: '¥0.001/1K tokens',
    keyHint: '在 platform.moonshot.cn 注册获取 API Key',
    getKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    name: '通义千问',
    icon: '☁️',
    model: 'qwen-turbo',
    desc: '阿里云大模型，中式语境好',
    price: '¥0.003/1K tokens',
    keyHint: '在 dashscope.aliyun.com 注册获取 API Key',
    getKeyUrl: 'https://dashscope.aliyun.com/',
  },
];

// ---------- DOM 引用 ----------

const toggleEnabled = document.getElementById('toggleEnabled');
const statusText = document.getElementById('statusText');
const engineGrid = document.getElementById('engineGrid');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyHint = document.getElementById('apiKeyHint');
const engineNameLabel = document.getElementById('engineNameLabel');
const toggleKeyVis = document.getElementById('toggleKeyVis');
const targetLangSelect = document.getElementById('targetLangSelect');
const sourceLangSelect = document.getElementById('sourceLangSelect');
const styleRadios = document.querySelectorAll('input[name="style"]');
const btnApply = document.getElementById('btnApply');
const btnRetranslate = document.getElementById('btnRetranslate');
const testInput = document.getElementById('testInput');
const btnTest = document.getElementById('btnTest');
const testResult = document.getElementById('testResult');
const testOriginal = document.getElementById('testOriginal');
const testTranslated = document.getElementById('testTranslated');
const testMeta = document.getElementById('testMeta');
const usageCalls = document.getElementById('usageCalls');
const usageTokens = document.getElementById('usageTokens');
const usageCost = document.getElementById('usageCost');
const btnRefreshUsage = document.getElementById('btnRefreshUsage');

// ---------- 当前设置 ----------

let currentSettings = {
  enabled: true,
  targetLang: 'zh',
  sourceLang: 'auto',
  engine: 'deepseek',
  apiKey: '',
  style: 'casual',
};

// 每个引擎独立保存 API Key
let engineKeys = {};

// ---------- 渲染引擎卡片 ----------

function renderEngineCards() {
  engineGrid.innerHTML = '';
  for (const eng of ENGINES) {
    const card = document.createElement('div');
    card.className = 'engine-card' + (currentSettings.engine === eng.id ? ' selected' : '');
    card.dataset.engineId = eng.id;
    card.innerHTML = `
      <span class="engine-icon">${eng.icon}</span>
      <span class="engine-info">
        <span class="engine-title">${eng.name}</span>
        <span class="engine-model">${eng.desc}</span>
      </span>
      <span class="engine-check">✓</span>
    `;
    card.addEventListener('click', () => selectEngine(eng.id));
    engineGrid.appendChild(card);
  }
  updateApiKeySection();
}

function selectEngine(id) {
  currentSettings.engine = id;
  // 更新卡片选中状态
  engineGrid.querySelectorAll('.engine-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.engineId === id);
  });

  // 加载该引擎的 API Key
  apiKeyInput.value = engineKeys[id] || '';
  updateApiKeySection();

  // 自动保存引擎选择
  saveEngine();
}

function updateApiKeySection() {
  const eng = ENGINES.find(e => e.id === currentSettings.engine);
  if (!eng) return;

  engineNameLabel.textContent = `（${eng.name}）`;
  apiKeyHint.textContent = eng.keyHint;

  // 更新 placeholder
  apiKeyInput.placeholder = `输入 ${eng.name} API Key…`;
}

// ---------- 加载 / 保存 ----------

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    'enabled', 'targetLang', 'sourceLang', 'engine', 'style'
  ]);
  // 加载各引擎 API Key
  const keyData = await chrome.storage.sync.get('engineKeys');

  currentSettings.enabled = stored.enabled !== false;
  currentSettings.targetLang = stored.targetLang || 'zh';
  currentSettings.sourceLang = stored.sourceLang || 'auto';
  currentSettings.engine = stored.engine || 'deepseek';
  currentSettings.style = stored.style || 'casual';
  engineKeys = keyData.engineKeys || {};

  toggleEnabled.checked = currentSettings.enabled;
  targetLangSelect.value = currentSettings.targetLang;
  sourceLangSelect.value = currentSettings.sourceLang;

  // 设置当前引擎的 API Key
  apiKeyInput.value = engineKeys[currentSettings.engine] || '';
  currentSettings.apiKey = engineKeys[currentSettings.engine] || '';

  // 风格单选
  const styleRadio = document.querySelector(`input[name="style"][value="${currentSettings.style}"]`);
  if (styleRadio) styleRadio.checked = true;

  renderEngineCards();
  updateStatusText();
  updateApiKeySection();
}

async function saveSettings() {
  // 保存引擎独立 Key
  engineKeys[currentSettings.engine] = apiKeyInput.value.trim();
  currentSettings.apiKey = engineKeys[currentSettings.engine];

  await chrome.storage.sync.set({
    enabled: currentSettings.enabled,
    targetLang: currentSettings.targetLang,
    sourceLang: currentSettings.sourceLang,
    engine: currentSettings.engine,
    apiKey: currentSettings.apiKey,
    style: currentSettings.style,
    engineKeys: engineKeys,
  });
}

async function saveEngine() {
  engineKeys[currentSettings.engine] = apiKeyInput.value.trim();
  currentSettings.apiKey = engineKeys[currentSettings.engine];

  await chrome.storage.sync.set({
    engine: currentSettings.engine,
    apiKey: currentSettings.apiKey,
    engineKeys: engineKeys,
  });
}

// ---------- 通知 content script ----------

async function notifyContent(type, data = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type, ...data });
    }
  } catch (e) {
    // 忽略
  }
}

// ---------- UI 更新 ----------

function updateStatusText() {
  statusText.textContent = currentSettings.enabled ? '🟢 翻译已开启' : '⚪ 翻译已暂停';
}

// ---------- 用量统计 ----------

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n, currency) {
  return currency + n.toFixed(4);
}

async function loadUsageStats() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_USAGE' });
    if (!resp || !resp.success) {
      showUsageEmpty();
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayStats = resp.stats[today] || {};

    // 汇总所有引擎
    let totalCalls = 0, totalTokens = 0, totalCost = 0;
    for (const [engId, s] of Object.entries(todayStats)) {
      totalCalls += s.calls || 0;
      totalTokens += s.tokens || 0;
      totalCost += s.cost || 0;
    }

    usageCalls.textContent = totalCalls || '--';
    usageTokens.textContent = totalTokens ? formatNumber(totalTokens) : '--';
    usageCost.textContent = totalCost ? '$' + totalCost.toFixed(4) : '--';
  } catch (e) {
    showUsageEmpty();
  }
}

function showUsageEmpty() {
  usageCalls.textContent = '--';
  usageTokens.textContent = '--';
  usageCost.textContent = '--';
}

// ---------- 测试翻译 ----------

async function doTestTranslate() {
  const text = testInput.value.trim();
  if (!text) return;

  // 更新当前 API Key
  currentSettings.apiKey = apiKeyInput.value.trim();

  if (!currentSettings.apiKey) {
    showTestError('请先填写 API Key');
    return;
  }

  // 显示加载状态
  testResult.style.display = 'block';
  testOriginal.textContent = `原文: ${text}`;
  testTranslated.textContent = '翻译中...';
  testTranslated.innerHTML = '<span class="loading"></span> 正在调用 AI 翻译...';
  testMeta.textContent = '';

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'TEST_TRANSLATE',
      engine: currentSettings.engine,
      text: text,
      targetLang: currentSettings.targetLang,
      sourceLang: currentSettings.sourceLang,
      apiKey: currentSettings.apiKey,
      style: currentSettings.style,
    });

    if (resp && resp.success) {
      testTranslated.textContent = resp.translated || '(空)';
      const usage = resp.usage || {};
      testMeta.textContent = [
        `引擎: ${ENGINES.find(e => e.id === currentSettings.engine)?.name || currentSettings.engine}`,
        `Token: ${formatNumber(usage.totalTokens || 0)}`,
        `费用: ${(usage.currency || '$')}${(usage.cost || 0).toFixed(6)}`,
        `延迟: ${usage.latency || 0}ms`,
      ].join(' · ');
    } else {
      showTestError(resp?.error || '翻译失败');
    }
  } catch (e) {
    showTestError(`通信异常: ${e.message}`);
  }

  // 刷新用量
  loadUsageStats();
}

function showTestError(msg) {
  testResult.style.display = 'block';
  testTranslated.innerHTML = `<span class="test-error">❌ ${msg}</span>`;
  testMeta.textContent = '';
}

// ---------- 事件绑定 ----------

toggleEnabled.addEventListener('change', async () => {
  currentSettings.enabled = toggleEnabled.checked;
  updateStatusText();
  await saveSettings();
  notifyContent('TOGGLE_TRANSLATION', { enabled: currentSettings.enabled });
});

targetLangSelect.addEventListener('change', () => {
  currentSettings.targetLang = targetLangSelect.value;
});

sourceLangSelect.addEventListener('change', () => {
  currentSettings.sourceLang = sourceLangSelect.value;
});

document.querySelectorAll('input[name="style"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) currentSettings.style = radio.value;
  });
});

// API Key 输入变更
apiKeyInput.addEventListener('input', () => {
  engineKeys[currentSettings.engine] = apiKeyInput.value.trim();
  currentSettings.apiKey = engineKeys[currentSettings.engine];
  // 自动保存
  chrome.storage.sync.set({ engineKeys, apiKey: currentSettings.apiKey });
});

toggleKeyVis.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleKeyVis.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleKeyVis.textContent = '👁️';
  }
});

btnApply.addEventListener('click', async () => {
  currentSettings.targetLang = targetLangSelect.value;
  currentSettings.sourceLang = sourceLangSelect.value;
  const styleRadio = document.querySelector('input[name="style"]:checked');
  if (styleRadio) currentSettings.style = styleRadio.value;
  currentSettings.apiKey = apiKeyInput.value.trim();
  engineKeys[currentSettings.engine] = currentSettings.apiKey;

  await saveSettings();

  // 先清缓存，再通知页面重新翻译
  chrome.runtime.sendMessage({ type: 'CLEAR_PAGE_CACHE' }).catch(() => {});
  await notifyContent('SETTINGS_UPDATED', {
    changes: {
      enabled: currentSettings.enabled,
      targetLang: currentSettings.targetLang,
      sourceLang: currentSettings.sourceLang,
      engine: currentSettings.engine,
      apiKey: currentSettings.apiKey,
      style: currentSettings.style,
    },
  });

  btnApply.textContent = '✅ 已应用';
  setTimeout(() => { btnApply.textContent = '✅ 应用设置'; }, 1500);
});

btnRetranslate.addEventListener('click', async () => {
  currentSettings.apiKey = apiKeyInput.value.trim();
  engineKeys[currentSettings.engine] = currentSettings.apiKey;
  await saveSettings();
  chrome.runtime.sendMessage({ type: 'CLEAR_PAGE_CACHE' }).catch(() => {});
  await notifyContent('RETRANSLATE');

  btnRetranslate.textContent = '🔄 翻译中…';
  setTimeout(() => { btnRetranslate.textContent = '🔄 重新翻译'; }, 2000);
});

btnTest.addEventListener('click', doTestTranslate);

// 回车键触发测试
testInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doTestTranslate();
});

btnRefreshUsage.addEventListener('click', loadUsageStats);

// ---------- 初始化 ----------

async function init() {
  await loadSettings();
  await loadUsageStats();
}

init();
