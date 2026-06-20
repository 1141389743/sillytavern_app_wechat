# 酒馆AI 微信小程序版 (SillyTavern WeChat Mini Program)

> 将 [SillyTavern App (Flutter)](https://github.com/1141389743/sillytavern_app) 转换为微信小程序

一个连接 SillyTavern 服务端的微信小程序客户端，支持角色浏览、AI 对话、角色创建/导入等功能。

## 版本记录

| 版本 | 日期 | 更新内容 |
|---|---|---|
| v1.3.0 | 2026-06-20 | 修复进入聊天不是最新记录：按修改时间降序排列 |
| v1.2.9 | 2026-06-20 | 长按提示，改善删除/编辑可发现性 |
| v1.2.8 | 2026-06-20 | 修复角色卡导入失败（file_name 判断） |
| v1.2.7 | 2026-06-20 | 修复 DeepSeek Authorization Required |
| v1.2.6 | 2026-06-20 | 登录页补充版本号 |
| v1.2.5 | 2026-06-20 | 修复有密码账号无法登录 |
| v1.2.4 | 2026-06-20 | import 死代码修复 + 临时文件清理 |
| v1.2.3 | 2026-06-20 | 修复 generate 400 + Cookie 解析 + 头像死循环 + 开场白 |
| v1.2.2 | 2026-06-20 | 下拉刷新加载历史记录 |
| v1.2.1 | 2026-06-20 | API Key 存入 secrets；测试连接改用后端 |
| v1.2.0 | 2026-06-20 | 修复对话 400 + 聊天加载 + 键盘遮挡 + Key 删除 |
| v1.1.0 | 2026-06-20 | DeepSeek 配置 + 测试连接 + 头像鉴权 + UI 美化 |
| v1.0.0 | 2026-06-20 | 初版发布：6 页面，服务端 + 直连双模式 |

> 详细变更记录见 [CHANGELOG.md](./CHANGELOG.md)

## 功能一览

### 核心功能

| 功能 | 状态 | 说明 |
|---|---|---|
| 服务器连接 | ✅ | CSRF Token + Session Cookie 多用户登录 |
| 角色列表 | ✅ | 浏览、搜索、头像异步下载显示 |
| AI 对话 | ✅ | 通过 SillyTavern 后端 `/api/backends/chat-completions/generate` |
| 聊天历史 | ✅ | 从服务端加载 + 自动保存到服务端 |
| 创建角色 | ✅ | 头像选择 + 表单填写 + multipart 上传 |
| 编辑角色 | ✅ | 修改角色设定、人设、开场白等 |
| 导入角色 | ✅ | 从文件/相册/聊天记录/URL 导入 PNG/JSON 角色卡 |
| 删除角色 | ✅ | 长按菜单删除 |

### AI 后端配置

| 模式 | 说明 | 聊天记录 |
|---|---|---|
| **服务端模式** | 配置保存到 SillyTavern 服务端，网页端和小程序共享 | ✅ 自动同步 |
| **直连模式** | 小程序独立调用 AI API，不经过服务端 | ❌ 仅本地 |

服务端模式支持的 AI 后端：

| 后端 | 图标 | 说明 |
|---|---|---|
| **DeepSeek** | 🔵 | 推荐，OpenAI 兼容接口 |
| OpenAI | 🟢 | GPT 系列模型 |
| Claude | 🟠 | Anthropic Claude |
| 自定义接口 | ⚙️ | 任意 OpenAI 兼容 API |
| KoboldAI | 🟤 | 本地部署 |
| NovelAI | 🟣 | 小说生成 |
| TextGen | ⚪ | TextGeneration WebUI |

每个后端均支持 **测试连接** 功能，填写 API Key / URL 后可一键验证。

### 直连模式支持的 API 类型

- OpenAI 兼容（OpenAI、Groq、SiliconFlow 等）
- DeepSeek
- Anthropic Claude
- OpenRouter
- 自定义

## 项目结构

```
sillytavern_miniapp/
├── app.js                          # 全局逻辑
├── app.json                        # 小程序配置
├── app.wxss                        # 全局样式
├── project.config.json             # 开发工具配置
├── sitemap.json                    # 站点地图
├── utils/
│   ├── api.js                      # HTTP 请求封装（CSRF + Cookie + 上传）
│   ├── storage.js                  # 本地存储
│   └── util.js                     # 通用工具函数
├── services/
│   ├── sillytavern.js              # SillyTavern API 服务
│   └── direct_api.js               # 直连 AI API 服务
└── pages/
    ├── login/                      # 登录页面
    ├── characters/                 # 角色列表
    ├── chat/                       # 聊天页面
    ├── settings/                   # AI 后端配置
    ├── create-character/           # 创建/编辑角色
    └── import/                     # 导入角色
```

## 开发环境搭建

### 1. 安装微信开发者工具

下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

### 2. 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 项目目录选择 `sillytavern_miniapp/`
4. AppID 可先使用测试号（或填写自己的 AppID）
5. 点击「导入」

### 3. 配置合法域名

在微信公众平台 → 开发管理 → 开发设置 → 服务器域名中，添加：

- **request 合法域名**：你的 SillyTavern 服务器地址（如 `http://192.168.1.100:8000`）
- **uploadFile 合法域名**：同上
- **downloadFile 合法域名**：同上

> ⚠️ 开发阶段可在开发者工具中勾选「不校验合法域名」进行调试

### 4. 运行

在开发者工具中点击「编译」即可预览

## SillyTavern 服务端配置

`config.yaml` 需要开启：

```yaml
enableUserAccounts: true    # 启用多用户模式
enableCors: true            # 允许跨域（小程序需要）
```

## API 端点

| 端点 | 方法 | 用途 |
|---|---|---|
| `/csrf-token` | GET | 获取 CSRF Token + Session Cookie |
| `/api/users/list` | POST | 获取用户列表 |
| `/api/users/login` | POST | 用户登录 |
| `/api/users/logout` | POST | 用户登出 |
| `/api/users/me` | GET | 当前用户信息 |
| `/api/characters/all` | POST | 获取角色列表 |
| `/characters/{name}.png` | GET | 获取角色头像 |
| `/api/characters/chats` | POST | 获取角色聊天列表 |
| `/api/chats/get` | POST | 获取聊天历史 |
| `/api/chats/save` | POST | 保存聊天 |
| `/api/backends/chat-completions/generate` | POST | AI 对话生成 |
| `/api/characters/import` | POST | 导入角色（multipart） |
| `/api/characters/create` | POST | 创建角色（multipart） |
| `/api/characters/edit` | POST | 编辑角色（multipart） |
| `/api/settings/get` | POST | 获取设置 |
| `/api/settings/save` | POST | 保存设置 |

## 技术栈对比

| Flutter 原版 | 微信小程序版 |
|---|---|
| Dart | JavaScript (ES6+) |
| Flutter Widget | WXML + WXSS |
| Provider | App globalData + Page data |
| http 包 | wx.request |
| shared_preferences | wx.setStorageSync |
| CachedNetworkImage | wx.request + arraybuffer + 本地临时文件 |
| Navigator | wx.navigateTo / wx.redirectTo |

## License

MIT
