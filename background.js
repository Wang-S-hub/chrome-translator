// ============================================================
//  background.js — AI 翻译引擎 (Service Worker)
//  支持: DeepSeek / OpenAI / 智谱GLM / Moonshot / 通义千问
// ============================================================

// ---------- 语言名称映射 ----------

const LANG_NAME = {
  zh: '简体中文',
  'zh-TW': '繁体中文（台湾）',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
  it: 'Italiano',
  ar: 'العربية',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  auto: '自动检测',
};

// ---------- 翻译风格 Prompt ----------

const STYLE_PROMPTS = {
  casual: [
    '请使用当地人的日常口语表达来翻译，就像朋友之间聊天一样自然。',
    '禁止生硬的直译，要把意思用地道的说法重新表达出来。',
    '可以适当使用语气词、口头禅、缩略语，让译文读起来"有温度"。',
    '不要添加任何解释，只输出译文。',
  ].join(' '),
  formal: [
    '请使用正式、规范、严谨的书面语来翻译。',
    '用词要准确精准，适合商务、学术或官方场合。',
    '句子结构清晰完整，避免口语化和随意表达。',
    '不添加解释，只输出译文。',
  ].join(' '),
  humorous: [
    '请用幽默、调侃、俏皮的语气来翻译。',
    '可以适当玩梗、用网络流行语、加入趣味性的表达。',
    '保持原意的前提下，让读者会心一笑。',
    '不添加解释，只输出译文。',
  ].join(' '),
};

// ---------- 引擎配置 ----------

const ENGINES = {
  deepseek: {
    name: 'DeepSeek',
    icon: '🔮',
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    pricePer1K: 0.00014,  // ¥0.0014/1K tokens → $0.00014/1K tokens approx
    currency: '¥',
    buildRequest: (texts, targetLang, sourceLang, style) => buildOpenAIRequest(texts, targetLang, sourceLang, style),
    parseResponse: parseOpenAIResponse,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    pricePer1K: 0.0015,   // $0.0015/1K tokens
    currency: '$',
    buildRequest: (texts, targetLang, sourceLang, style) => buildOpenAIRequest(texts, targetLang, sourceLang, style),
    parseResponse: parseOpenAIResponse,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  zhipu: {
    name: '智谱 GLM',
    icon: '🧠',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    pricePer1K: 0.0001,   // ¥0.001/1K tokens
    currency: '¥',
    buildRequest: (texts, targetLang, sourceLang, style) => buildOpenAIRequest(texts, targetLang, sourceLang, style),
    parseResponse: parseOpenAIResponse,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  moonshot: {
    name: 'Moonshot',
    icon: '🚀',
    url: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    pricePer1K: 0.0001,   // ¥0.001/1K tokens
    currency: '¥',
    buildRequest: (texts, targetLang, sourceLang, style) => buildOpenAIRequest(texts, targetLang, sourceLang, style),
    parseResponse: parseOpenAIResponse,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  qwen: {
    name: '通义千问',
    icon: '☁️',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-turbo',
    pricePer1K: 0.0003,   // ¥0.003/1K tokens
    currency: '¥',
    buildRequest: (texts, targetLang, sourceLang, style) => buildOpenAIRequest(texts, targetLang, sourceLang, style),
    parseResponse: parseOpenAIResponse,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
};

// ---------- 构建 OpenAI 兼容请求 ----------

function buildOpenAIRequest(texts, targetLang, sourceLang, style) {
  const targetName = LANG_NAME[targetLang] || targetLang;
  const sourceName = sourceLang === 'auto' ? '原文' : (LANG_NAME[sourceLang] || sourceLang);
  const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.casual;

  const systemPrompt = [
    `你是一个顶级的专业翻译助手。请将文本从${sourceName}翻译成${targetName}。`,
    stylePrompt,
    '输出格式要求：严格按照输入的 [N] 编号对应输出，每行格式为 "[N] 译文内容"。不要有任何额外的解释、说明或编号缺失。',
  ].join('\n');

  // 将多条文本编号后合并
  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n\n');

  return {
    model: null, // 引擎自行填充
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: numbered },
    ],
    temperature: 0.8,
    max_tokens: 4096,
  };
}

// ---------- 解析 OpenAI 兼容响应 ----------

function parseOpenAIResponse(json) {
  const content = json.choices?.[0]?.message?.content || '';
  return parseNumberedOutput(content);
}

function parseNumberedOutput(content) {
  const resultMap = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[(\d+)\]\s*(.+)/);
    if (match) {
      resultMap[parseInt(match[1])] = match[2];
    }
  }
  return resultMap;
}

// ---------- 翻译缓存 ----------

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟
const CACHE_MAX = 5000;
let translationCache = new Map();

// SW 启动时从 storage 恢复缓存
(async function restoreCache() {
  try {
    const stored = await chrome.storage.local.get('translationCache');
    if (stored.translationCache && Array.isArray(stored.translationCache)) {
      const now = Date.now();
      for (const [key, val] of stored.translationCache) {
        if (now - val.ts < CACHE_TTL_MS) {
          translationCache.set(key, val);
        }
      }
      if (translationCache.size > 0) {
        console.log('[自然翻译] 从 storage 恢复', translationCache.size, '条缓存');
      }
    }
  } catch (e) { /* 忽略 */ }
})();

// 每隔 5 分钟将缓存落地到 storage
setInterval(async function () {
  try {
    const arr = [...translationCache].slice(0, CACHE_MAX);
    await chrome.storage.local.set({ translationCache: arr });
  } catch (e) { /* 忽略 */ }
}, 5 * 60 * 1000);

function makeCacheKey(text, targetLang, style) {
  return text + '|' + targetLang + '|' + style;
}

function queryCache(texts, targetLang, style) {
  const cached = [];
  const missedTexts = [];
  const missedIndices = [];
  const now = Date.now();
  for (let i = 0; i < texts.length; i++) {
    const entry = translationCache.get(makeCacheKey(texts[i], targetLang, style));
    if (entry && (now - entry.ts) < CACHE_TTL_MS) {
      cached[i] = entry.val;
    } else {
      cached[i] = undefined;
      missedTexts.push(texts[i]);
      missedIndices.push(i);
    }
  }
  return { cached, missedTexts, missedIndices };
}

function writeCache(texts, translations, targetLang, style) {
  const now = Date.now();
  for (let i = 0; i < texts.length; i++) {
    if (translations[i]) {
      translationCache.set(makeCacheKey(texts[i], targetLang, style), { val: translations[i], ts: now });
    }
  }
  if (translationCache.size > CACHE_MAX) {
    const sorted = [...translationCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < sorted.length - CACHE_MAX; i++) {
      translationCache.delete(sorted[i][0]);
    }
  }
}

async function clearCache() {
  translationCache.clear();
  try { await chrome.storage.local.remove('translationCache'); } catch (e) { /* 忽略 */ }
}

// ---------- 通用翻译调用 ----------

async function callEngine(engineId, texts, targetLang, sourceLang, apiKey, style) {
  const engine = ENGINES[engineId];
  if (!engine) return null;

  const body = engine.buildRequest(texts, targetLang, sourceLang, style);
  body.model = engine.model;

  try {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s 超时
    const res = await fetch(engine.url, {
      method: 'POST',
      headers: engine.headers(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[自然翻译] ${engine.name} API 错误 (${res.status}):`, errText);
      return { success: false, error: `API 错误 ${res.status}: ${errText.substring(0, 100)}` };
    }

    const json = await res.json();
    const resultMap = engine.parseResponse(json);

    // 计算 token 用量
    const usage = json.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
    const cost = (totalTokens / 1000) * (engine.pricePer1K || 0);

    const translations = texts.map((_, i) => resultMap[i] || null);

    return {
      success: true,
      translations,
      usage: {
        engine: engineId,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        currency: engine.currency,
        latency,
      },
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error(`[自然翻译] ${engine.name} 请求超时`);
      return { success: false, error: '请求超时（30s）' };
    }
    console.error(`[自然翻译] ${engine.name} 网络错误:`, e.message);
    return { success: false, error: `网络错误: ${e.message}` };
  }
}

// ---------- 测试翻译 ----------

async function testTranslate(engineId, text, targetLang, sourceLang, apiKey, style) {
  const result = await callEngine(engineId, [text], targetLang, sourceLang, apiKey, style);
  if (!result || !result.success) {
    return result;
  }
  return {
    success: true,
    original: text,
    translated: result.translations[0],
    usage: result.usage,
  };
}

// ---------- 用量统计存储 ----------

async function getUsageStats() {
  const stored = await chrome.storage.local.get('usageStats');
  return stored.usageStats || {};
}

async function recordUsage(engineId, usage) {
  const stats = await getUsageStats();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (!stats[today]) {
    stats[today] = {};
    // 清理超过 30 天的记录
    const keys = Object.keys(stats).sort();
    while (keys.length > 30) {
      delete stats[keys.shift()];
    }
  }

  if (!stats[today][engineId]) {
    stats[today][engineId] = { chars: 0, tokens: 0, cost: 0, calls: 0 };
  }

  stats[today][engineId].tokens += usage.totalTokens || 0;
  stats[today][engineId].cost += usage.cost || 0;
  stats[today][engineId].calls += 1;

  await chrome.storage.local.set({ usageStats: stats });
  return stats;
}

// ---------- 消息路由 ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE') {
    handleTranslate(message).then(sendResponse);
    return true;
  }
  if (message.type === 'TEST_TRANSLATE') {
    handleTestTranslate(message).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_USAGE') {
    getUsageStats().then(stats => sendResponse({ success: true, stats }));
    return true;
  }
  if (message.type === 'CLEAR_PAGE_CACHE') {
    clearCache();
    sendResponse({ success: true });
    return false;
  }
  return false;
});

async function handleTranslate({ texts, targetLang, sourceLang, engine, apiKey, style }) {
  if (!apiKey) {
    return { success: false, error: '未配置 API Key' };
  }
  if (!ENGINES[engine]) {
    return { success: false, error: `未知引擎: ${engine}` };
  }

  // 过滤空文本
  const validTexts = [];
  const validIndices = [];
  for (let i = 0; i < texts.length; i++) {
    const t = (texts[i] || '').trim();
    if (t.length > 0) {
      validTexts.push(t);
      validIndices.push(i);
    }
  }

  const results = new Array(texts.length).fill(null);
  if (validTexts.length === 0) {
    return { success: true, translations: results, usage: null };
  }

  // 1. 查缓存
  const { cached, missedTexts, missedIndices } = queryCache(validTexts, targetLang, style);

  // 2. 全部命中 → 直接返回
  if (missedTexts.length === 0) {
    for (let j = 0; j < validTexts.length; j++) {
      results[validIndices[j]] = cached[j] || null;
    }
    return { success: true, translations: results, usage: null, fromCache: true };
  }

  // 3. 只对未命中的调 API
  const result = await callEngine(engine, missedTexts, targetLang, sourceLang, apiKey, style);

  if (result && result.success && result.usage) {
    await recordUsage(engine, result.usage);
  }

  // 4. 写入缓存
  if (result && result.success && result.translations) {
    writeCache(missedTexts, result.translations, targetLang, style);
  }

  // 5. 合并返回
  for (let j = 0; j < validTexts.length; j++) {
    if (cached[j] !== undefined) {
      results[validIndices[j]] = cached[j];
    }
  }
  for (let k = 0; k < missedIndices.length; k++) {
    const j = missedIndices[k];
    results[validIndices[j]] = (result && result.success && result.translations)
      ? result.translations[k]
      : null;
  }

  return {
    success: result ? result.success : false,
    translations: results,
    usage: result ? result.usage : null,
    fromCache: missedTexts.length < validTexts.length,
  };
}

async function handleTestTranslate({ engine, text, targetLang, sourceLang, apiKey, style }) {
  if (!apiKey) {
    return { success: false, error: '请先填写 API Key' };
  }
  if (!ENGINES[engine]) {
    return { success: false, error: `未知引擎: ${engine}` };
  }

  const result = await testTranslate(engine, text, targetLang, sourceLang, apiKey, style);

  if (result && result.success && result.usage) {
    await recordUsage(engine, result.usage);
  }

  return result;
}
