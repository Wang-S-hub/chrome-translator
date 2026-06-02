# 🌐 自然翻译 v2.0 — AI 大模型驱动的 Chrome 整页翻译插件

> 抛弃生硬的机器翻译，用 DeepSeek / OpenAI / 智谱 / Moonshot / 通义千问 等大模型，实现真正自然口语化的整页翻译。

## ✨ 核心特性

- **纯 AI 翻译**：全部使用大模型 API，不依赖任何传统翻译服务
- **5 大引擎一键切换**：
  - 🔮 **DeepSeek** — 国产高性价比，翻译自然流畅
  - 🤖 **OpenAI** — 全球领先大模型，口语化表达出色
  - 🧠 **智谱 GLM** — 清华系大模型，中文理解力强
  - 🚀 **Moonshot** — 长文本处理优秀
  - ☁️ **通义千问** — 阿里云大模型，中式语境好
- **三种翻译风格**：💬 日常口语 / 📄 正式书面 / 😄 幽默调侃
- **视口优先翻译**：先翻译屏幕可见内容，后翻译页面下方内容
- **右下角进度指示器**：实时显示翻译进度条和完成数量
- **悬停查看原文**：鼠标悬停在译文上，显示半透明提示层展示原文
- **动态内容监听**：MutationObserver 自动翻译无限滚动、AJAX 加载的新内容
- **每日用量统计**：今日调用次数、Token 消耗、预估费用一目了然
- **测试翻译**：输入一句话实时测试当前引擎和风格的翻译效果
- **15 种目标语言**：中英日韩法德西葡俄意阿泰越印尼土
- **引擎独立 Key**：每个引擎的 API Key 独立保存，切换引擎自动加载对应 Key

---

## 📦 安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `Translation/` 文件夹
5. 点击工具栏图标，填入 API Key 即可使用

---

## 🔑 获取 API Key

### 推荐：DeepSeek（性价比最高）

1. 访问 [platform.deepseek.com](https://platform.deepseek.com/)
2. 注册账号（支持手机号）
3. 进入 [API Keys](https://platform.deepseek.com/api_keys) 页面
4. 创建新 Key，复制后粘贴到插件
5. **价格**：¥1/M tokens（翻译一页网页约消耗几分钱）

### OpenAI

1. 访问 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. 注册并创建 API Key
3. 需要绑定海外信用卡或充值
4. **价格**：$0.0015/1K tokens

### 智谱 GLM

1. 访问 [open.bigmodel.cn](https://open.bigmodel.cn/)
2. 注册后进入 [API Keys](https://open.bigmodel.cn/usercenter/apikeys)
3. 新用户有免费额度
4. **价格**：¥0.001/1K tokens

### Moonshot

1. 访问 [platform.moonshot.cn](https://platform.moonshot.cn/)
2. 注册后进入 [API Keys](https://platform.moonshot.cn/console/api-keys)
3. **价格**：¥0.001/1K tokens

### 通义千问

1. 访问 [dashscope.aliyun.com](https://dashscope.aliyun.com/)
2. 阿里云账号登录，开通 DashScope 服务
3. **价格**：¥0.003/1K tokens

---

## 🎛️ 使用说明

| 区域 | 功能 |
|------|------|
| **翻译开关** | 一键开启/关闭整页自动翻译 |
| **引擎卡片** | 5 个引擎可视化选择，切换后自动加载对应 Key |
| **API Key** | 每个引擎独立存储 Key |
| **目标/源语言** | 15 种目标语言 + 自动检测原文 |
| **风格选择** | 日常口语 / 正式书面 / 幽默调侃 |
| **应用设置** | 保存并通知当前页面重新翻译 |
| **测试翻译** | 输入任意文本即时查看翻译效果 |
| **用量统计** | 今日调用次数 / Token 消耗 / 预估费用 |

---

## 🧠 技术架构

```
manifest.json     — Manifest V3，声明 host_permissions
background.js     — Service Worker，封装 5 个 AI API + 用量统计
content.js        — Content Script，TreeWalker + MutationObserver + 进度条 + 悬停提示
popup.html        — 弹窗 UI：引擎卡片 + Key 管理 + 测试 + 统计
popup.css         — 紫色渐变主题，引擎卡片 + 风格卡片
popup.js          — 弹窗逻辑：引擎切换、Key 独立存储、用量刷新
content.css       — 右下角进度条 + 悬停原文 tooltip
```

### 翻译流程

```
content.js 收集所有文本节点
  → 按视口距离排序（可见优先）
  → 分批（每批 20 条）发送 background.js
  → background.js 调用 AI API（OpenAI 兼容格式 + 翻译风格 prompt）
  → 解析 [N] 编号输出
  → 写回 DOM，标记 data-natural-translated
  → MutationObserver 监听新 DOM → 防抖 600ms → 翻译
```

### 翻译 Prompt 设计

每条翻译请求都附带精心设计的 system prompt：

- **日常口语**：要求使用当地人的日常口语、禁止直译、可用语气词和缩略语
- **正式书面**：要求用规范严谨的书面语、适合商务学术场合
- **幽默调侃**：要求用幽默俏皮语气、可玩梗和网络流行语

---

## 🐛 常见问题

**Q: 翻译没有生效？**
- 确认开关开启 + API Key 正确
- 部分引擎需要充值后才能调用（余额不足会报错）
- 点击「测试翻译」验证 Key 是否有效

**Q: 如何查看翻译效果对比？**
- 鼠标悬停在任何译文上，会弹出 tooltip 显示原文

**Q: 切换引擎后需要重新输入 Key？**
- 不需要。每个引擎的 Key 独立存储，切换自动加载

---

## 📄 许可证

MIT License
