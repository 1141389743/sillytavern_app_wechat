# 更新日志 (CHANGELOG)

所有版本变更记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [v1.3.3] - 2026-06-20

### 修复
- **键盘自动收起**：发送消息后 `setData({ inputText: '' })` 清空文本时 `textarea` 失去焦点，键盘收起。改为先清空文字再在下一帧 `setTimeout` 恢复 `inputFocused: true`，保持键盘打开。

**涉及文件**：`pages/chat/chat.js`、`pages/chat/chat.wxml`

---

## [v1.3.2] - 2026-06-20

### 修复
- **聊天滚动体验**：发送消息或收到回复后需要手动下滑才能看到新消息。改为 `scroll-into-view` + `scroll-top` 双重滚动机制，先用 `scroll-into-view` 快速定位，再用 `scroll-top` 精确补偿，确保新消息始终可见。

**涉及文件**：`pages/chat/chat.js`、`pages/chat/chat.wxml`

---

## [v1.3.1] - 2026-06-20

### 修复
- **空 Key 覆盖 secrets**：用户保存配置时未重新输入 Key（已保存在 secrets 中，显示「已保存」），`config.apiKey` 为空 → `_saveApiKeyToSecrets` 用空值调用 → 跳过写入但缓存中 `_apiKey` 也为空。现仅当用户实际输入了 Key 时才更新 secrets。
- **proxy_password 为空**：未缓存 Key 时 `sendMessage` 传空 `proxy_password` → 端点用空字符串做 Authorization → DeepSeek 返回 Authorization Required。现空 Key 时不传 `proxy_password`，让端点从 secrets 读取已有密钥。

**涉及文件**：`services/sillytavern.js`

---

## [v1.3.0] - 2026-06-20

### 修复
- **聊天记录顺序**：进入聊天页面时不再显示最新记录。`/api/characters/chats` 返回的列表按文件名字母序排列，`chats[0]` 非最新。现改为按 `last_mes`（修改时间）降序排列，进入聊天默认加载最新会话。

**涉及文件**：`services/sillytavern.js`

---

## [v1.2.9] - 2026-06-20

### 新增
- 角色列表底部增加提示文字 `💡 长按角色卡片可编辑或删除`，改善删除/编辑功能的可发现性

**涉及文件**：`pages/characters/characters.wxml`、`pages/characters/characters.wxss`

---

## [v1.2.8] - 2026-06-20

### 修复
- **角色卡导入失败**：SillyTavern `/api/characters/import` 成功返回 `{ file_name: "xxx" }`，miniapp 判断条件为 `result.ok || result.avatar_name || result.character`，全不匹配 → 走入 PNG 的 UTF-8 回退解析 → 必然失败。现增加 `result.file_name` 判断，仅 JSON 文件做本地解析回退。

**涉及文件**：`pages/import/import.js`

---

## [v1.2.7] - 2026-06-20

### 修复
- **DeepSeek Authorization Required**：SillyTavern generate 端点 OpenAI handler 在 `reverse_proxy` 模式下从 `request.body.proxy_password` 读取 API Key（不从 secrets 读），miniapp 传了 `reverse_proxy` 但没传 `proxy_password`，导致 key 为空。现同时传 `proxy_password`，并在 `saveServerApiConfig` 中缓存 API Key 到 `_cachedSettings._apiKey`。

**涉及文件**：`services/sillytavern.js`

---

## [v1.2.6] - 2026-06-20

### 修复
- 登录页 `navigationBarTitleText` 和 logo 标题补充版本号

**涉及文件**：`pages/login/login.json`、`pages/login/login.wxml`

---

## [v1.2.5] - 2026-06-20

### 修复
- **有密码账号无法登录**：SillyTavern `/api/users/list` 返回的字段名是 `password`（boolean），miniapp 用的是 `hasPassword`，导致有密码用户被误判为无密码，直接用空密码登录 → 403 Incorrect credentials。修正为 `password`。

**涉及文件**：`pages/login/login.js`、`pages/login/login.wxml`

---

## [v1.2.4] - 2026-06-20

### 修复
- `import.js` URL 导入时 `fileName` 三元表达式两分支都是 `'character.json'` 的死代码，修正为 PNG → `'character.png'`

### 新增
- `app._cleanOldTempFiles()`：小程序启动时自动清理 7 天前的 `avatar_*/tmp_*` 临时文件，防止磁盘空间堆积

**涉及文件**：`pages/import/import.js`、`app.js`

---

## [v1.2.3] - 2026-06-20

### 修复
- **generate 端点 400**：`sendMessage` 缺少 `chat_completion_source` 字段，SillyTavern generate 端点无法路由到正确的 AI 后端，`apiKey` 为 undefined → 返回 400。现从服务端设置读取 `main_api`，映射为正确的 `chat_completion_source`，附带 `reverse_proxy`/`custom_url`/`model` 字段。
- **Cookie 解析截断**：`Set-Cookie` 头按逗号分割，`expires=Thu, 21 Jan 2027...` 中的逗号导致截断，认证信息丢失。改用正则匹配 `name=value` 模式。
- **头像加载死循环**：`_loadAllAvatars` 中所有角色无头像时，while 循环 `continue` 跳过但 Promise 永不 resolve。改为循环结束后检查 `running === 0` 则立即 resolve。
- **开场白丢失**：加载聊天历史后开场白（greeting）不显示。无历史记录时将开场白作为首条助手消息插入。

### 变更
- 移除 `sendMessage` 中无用的 `char` 字段（generate 端点不使用）
- 设置页 API Key 存在 secrets 中读不到时显示 `已保存（留空则不更新）` 占位提示
- `getServerSettings` / `saveServerApiConfig` 同步缓存设置到 `globalData._cachedSettings`

**涉及文件**：`services/sillytavern.js`、`utils/api.js`、`pages/chat/chat.js`、`pages/characters/characters.js`、`pages/settings/settings.js`、`app.json`

---

## [v1.2.2] - 2026-06-20

### 新增
- 聊天页下拉刷新加载更早的聊天记录（上一条会话）
- 聊天会话索引显示 `(1/N)` 标记

**涉及文件**：`pages/chat/chat.js`、`pages/chat/chat.wxml`、`pages/chat/chat.json`

---

## [v1.2.1] - 2026-06-20

### 修复
- **API Key 存储位置**：generate 端点通过 `readSecret()` 从 `secrets.json` 读取 key，而非 `settings`。将 key 存入 `/api/secrets/write`（`api_key_openai` / `api_key_claude` 等），不再写入 `settings.oai_key`。
- 服务端测试连接改为通过 SillyTavern generate 端点发测试消息

**涉及文件**：`services/sillytavern.js`

---

## [v1.2.0] - 2026-06-20

### 修复
- 对话 HTTP 400 错误
- 聊天记录加载失败（兼容 `{messages:[...]}` 和 `{chat:[...]}` 格式）
- 输入 API Key 时被键盘遮挡（`onInputFocus` 滚动到可见区域）
- 服务端 Key 无法删除（`settings.oai_key` 置空）

**涉及文件**：`services/sillytavern.js`、`pages/chat/chat.js`、`pages/settings/settings.js`

---

## [v1.1.0] - 2026-06-20

### 新增
- 服务端 AI 配置增加 DeepSeek 选项（OpenAI 兼容模式）
- 服务端模式和直连模式均支持测试连接按钮
- 头像下载鉴权修复（`wx.request` + `arraybuffer` + Cookie 携带）

### 变更
- UI 全面美化（圆角卡片、渐变色、动画等）

**涉及文件**：全部页面

---

## [v1.0.0] - 2026-06-20

### 新增
- 初版发布
- 6 个页面：登录、角色列表、聊天、AI 配置、创建角色、导入角色
- 双模式：服务端模式（通过 SillyTavern 后端）+ 直连模式（独立调用 LLM API）
- CSRF Token + Session Cookie 认证
- 角色头像异步下载（并发控制）
- 支持 PNG/JSON 角色卡导入（文件/相册/URL）

---

[v1.3.3]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.3.2...v1.3.3
[v1.3.2]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.3.1...v1.3.2
[v1.3.1]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.3.0...v1.3.1
[v1.3.0]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.9...v1.3.0
[v1.2.9]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.8...v1.2.9
[v1.2.8]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.7...v1.2.8
[v1.2.7]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.6...v1.2.7
[v1.2.6]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.5...v1.2.6
[v1.2.5]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.4...v1.2.5
[v1.2.4]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.3...v1.2.4
[v1.2.3]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.2...v1.2.3
[v1.2.2]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.1...v1.2.2
[v1.2.1]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.2.0...v1.2.1
[v1.2.0]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.1.0...v1.2.0
[v1.1.0]: https://github.com/1141389743/sillytavern_app_wechat/compare/v1.0.0...v1.1.0
[v1.0.0]: https://github.com/1141389743/sillytavern_app_wechat/releases/tag/v1.0.0
