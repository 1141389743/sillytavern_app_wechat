# 酒馆AI 微信小程序版 (SillyTavern WeChat Mini Program)

> 将 [SillyTavern App (Flutter)](https://github.com/1141389743/sillytavern_app) 转换为微信小程序

一个连接 SillyTavern 服务端的微信小程序客户端，支持角色浏览、AI 对话、角色创建/导入等功能。

## 功能对照

| 原 Flutter 功能 | 微信小程序状态 | 说明 |
|---|---|---|
| 服务器连接 (HTTP Basic Auth + CSRF) | ✅ | 多用户登录模式 |
| 角色列表浏览与搜索 | ✅ | 头像懒加载 |
| 角色头像加载 | ✅ | `/characters/{name}.png` |
| 与角色实时聊天 | ✅ | 通过 `/api/backends/chat-completions/generate` |
| 聊天历史记录 | ✅ | 加载/保存到服务端 |
| 直连 LLM API | ✅ | OpenAI 兼容 / DeepSeek / Anthropic / OpenRouter |
| AI 后端切换 | ✅ | 通过 SillyTavern settings API |
| 创建角色 | ✅ | multipart/form-data 上传 |
| 编辑角色 | ✅ | |
| 导入角色 | ✅ | 从文件/链接导入 PNG/JSON 角色卡 |
| 删除角色 | ✅ | |
| 流式对话输出 | ❌ | 微信小程序 SSE 支持有限 |
| 多聊天管理 | ❌ | 待实现 |

## 项目结构

```
sillytavern_miniapp/
├── app.js                          # 全局逻辑（对应 AppProvider）
├── app.json                        # 小程序配置
├── app.wxss                        # 全局样式（对应 Flutter 主题）
├── project.config.json             # 开发工具配置
├── sitemap.json                    # 站点地图
├── utils/
│   ├── api.js                      # HTTP 请求封装（对应 http.Client）
│   ├── storage.js                  # 本地存储（对应 SharedPreferences）
│   └── util.js                     # 通用工具函数
├── services/
│   ├── sillytavern.js              # SillyTavern API 服务（对应 sillytavern_service.dart）
│   └── direct_api.js               # 直连 AI API 服务（对应 direct_api_service.dart）
└── pages/
    ├── login/                      # 登录页面（对应 login_screen.dart）
    ├── characters/                 # 角色列表（对应 character_list_screen.dart）
    ├── chat/                       # 聊天页面（对应 chat_screen.dart）
    ├── settings/                   # AI 后端配置（对应 api_settings_screen.dart）
    ├── create-character/           # 创建/编辑角色（对应 create_character_screen.dart）
    └── import/                     # 导入角色（对应 import_screen.dart）
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

## 与原 Flutter 项目的差异

### 技术栈替换

| Flutter | 微信小程序 |
|---|---|
| Dart | JavaScript (ES6+) |
| Flutter Widget | WXML + WXSS |
| Provider (状态管理) | App globalData + Page data |
| http 包 | wx.request |
| shared_preferences | wx.setStorageSync / wx.getStorageSync |
| CachedNetworkImage | `<image>` 组件 + lazy-load |
| Navigator | wx.navigateTo / wx.redirectTo |
| Material Design | 自定义 WXSS 样式 |

### 关键差异

1. **文件上传**：Flutter 用 `http.MultipartFile`，小程序用 `wx.uploadFile`
2. **Cookie 管理**：小程序需要手动管理 Session Cookie（`wx.request` 不自动携带）
3. **文件系统**：小程序无法直接访问设备文件，使用 `wx.chooseMessageFile` / `wx.chooseMedia`
4. **流式输出**：小程序不原生支持 SSE，暂未实现流式对话
5. **跨域**：小程序需要在后台配置合法域名

## SillyTavern API 说明

支持 SillyTavern 1.18.0+ 的多用户模式（`enableUserAccounts: true`）：

| 端点 | 方法 | 用途 |
|---|---|---|
| `/csrf-token` | GET | 获取 CSRF Token + Session Cookie |
| `/api/users/list` | POST | 获取用户列表 |
| `/api/users/login` | POST | 用户登录 |
| `/api/users/logout` | POST | 用户登出 |
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

## 服务器配置

SillyTavern 服务端 `config.yaml` 需要开启：

```yaml
enableUserAccounts: true    # 启用多用户模式
enableCors: true            # 允许跨域（小程序需要）
```

## License

MIT
