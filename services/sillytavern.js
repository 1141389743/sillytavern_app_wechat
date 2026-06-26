/**
 * SillyTavern API 服务层
 * 
 * 对应原 Flutter 项目的 sillytavern_service.dart
 * 封装所有与 SillyTavern 服务端的交互
 */

const api = require('../utils/api');
const { stripPngSuffix } = require('../utils/util');


// ============================================================
// 连接 & 会话管理
// ============================================================

/**
 * 检测服务器是否可达
 */
function checkConnection() {
  return api.get('/csrf-token')
    .then(() => true)
    .catch(() => false);
}

/**
 * 获取服务器版本信息
 */
function getServerInfo() {
  return api.get('/version').catch(() => null);
}

// ============================================================
// 多用户登录
// ============================================================

/**
 * 获取用户列表
 * POST /api/users/list
 */
function getUserList() {
  return api.post('/api/users/list');
}

/**
 * 用户登录
 * POST /api/users/login  body: {handle, password}
 */
function login(handle, password) {
  return api.post('/api/users/login', { handle, password })
    .then(data => {
      if (data && data.handle) {
        const app = getApp();
        app.globalData.currentUser = data;
        app.globalData.isLoggedIn = true;
      }
      return data;
    });
}

/**
 * 登出
 * POST /api/users/logout
 */
function logout() {
  return api.post('/api/users/logout')
    .finally(() => {
      getApp().clearSession();
    });
}

/**
 * 创建用户（需管理员权限）
 * POST /api/users/create
 */
function createUser(handle, name, password = '', isAdmin = false) {
  return api.post('/api/users/create', {
    handle,
    name,
    password,
    admin: isAdmin
  });
}

/**
 * 获取当前登录用户信息
 * GET /api/users/me
 */
function getCurrentUser() {
  return api.get('/api/users/me').catch(() => null);
}

// ============================================================
// 角色接口
// ============================================================

/**
 * 获取所有角色
 * POST /api/characters/all
 */
function getCharacters() {
  return api.post('/api/characters/all', {})
    .then(data => {
      if (Array.isArray(data)) {
        return data;
      } else if (data && data.characters) {
        return data.characters;
      }
      return [];
    });
}

/**
 * 获取角色头像完整 URL
 */
function getCharacterAvatarUrl(avatarUrl) {
  if (!avatarUrl) return '';
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  const name = avatarUrl.endsWith('.png') ? avatarUrl : `${avatarUrl}.png`;
  return `${getApp().globalData.serverUrl}/characters/${name}`;
}

/**
 * 下载角色头像到本地（携带鉴权信息）
 * 微信小程序 <image> 不会携带 Cookie，
 * 用 wx.request + arraybuffer 下载后写入临时文件。
 * 返回本地临时文件路径。
 */
function downloadAvatar(avatarUrl) {
  return new Promise((resolve, reject) => {
    if (!avatarUrl) return reject(new Error('no avatar url'));

    const fullUrl = getCharacterAvatarUrl(avatarUrl);
    if (!fullUrl) return reject(new Error('invalid avatar url'));

    const g = getApp().globalData;
    const header = { 'Accept': 'image/*' };
    if (g.csrfToken) header['X-CSRF-Token'] = g.csrfToken;
    if (g.sessionCookies) header['Cookie'] = g.sessionCookies;

    wx.request({
      url: fullUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      header,
      timeout: 20000,
      success(res) {
        if (res.statusCode === 200 && res.data) {
          // 写入临时文件
          const fs = wx.getFileSystemManager();
          const ext = fullUrl.split('.').pop() || 'png';
          const tmpPath = `${wx.env.USER_DATA_PATH}/avatar_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
          fs.writeFile({
            filePath: tmpPath,
            data: res.data,
            encoding: 'binary',
            success() {
              resolve(tmpPath);
            },
            fail(err) {
              reject(new Error('write temp file failed: ' + err.errMsg));
            }
          });
        } else {
          reject(new Error('avatar http ' + res.statusCode));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'avatar request failed'));
      }
    });
  });
}

/**
 * 删除角色
 * POST /api/characters/delete
 */
function deleteCharacter(avatarUrl) {
  return api.post('/api/characters/delete', { avatar_url: avatarUrl });
}

/**
 * 导出角色卡为 JSON 数据
 * 从服务端获取角色详情后打包为标准 PNG 角色卡格式
 *
 * @param {object} character - 角色对象
 * @returns {Promise<object>} 角色卡 JSON 数据
 */
function exportCharacter(character) {
  // 构建标准角色卡 JSON
  const card = {
    name: character.name || '',
    description: character.description || '',
    personality: character.personality || '',
    scenario: character.scenario || '',
    first_mes: character.first_mes || character.greeting || '',
    mes_example: character.mes_example || '',
    creator_notes: character.creator_notes || '',
    system_prompt: character.system_prompt || '',
    tags: character.tags || [],
    creator: character.creator || '',
    character_version: character.character_version || '1.0'
  };
  return Promise.resolve(card);
}

/**
 * 将角色卡 JSON 导出为 PNG 文件（在 PNG 中嵌入 JSON）
 * 下载原始头像 PNG，将角色数据写入 tEXt chunk
 *
 * @param {object} character - 角色对象
 * @returns {Promise<string>} 本地临时文件路径
 */
async function exportCharacterAsPng(character) {
  const cardJson = await exportCharacter(character);
  const jsonStr = JSON.stringify(cardJson);

  // 尝试下载原始头像 PNG
  let pngData = null;
  if (character.avatar) {
    try {
      const fullUrl = getCharacterAvatarUrl(character.avatar);
      const g = getApp().globalData;
      const header = { 'Accept': 'image/*' };
      if (g.csrfToken) header['X-CSRF-Token'] = g.csrfToken;
      if (g.sessionCookies) header['Cookie'] = g.sessionCookies;

      pngData = await new Promise((resolve, reject) => {
        wx.request({
          url: fullUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          header,
          timeout: 20000,
          success(res) {
            if (res.statusCode === 200 && res.data) resolve(res.data);
            else reject(new Error('HTTP ' + res.statusCode));
          },
          fail(err) { reject(new Error(err.errMsg)); }
        });
      });
    } catch (e) {
      console.warn('下载头像失败，使用纯 JSON 导出:', e.message);
    }
  }

  if (pngData) {
    // 将 JSON 嵌入 PNG 的 tEXt chunk
    const embedded = _embedJsonInPng(pngData, 'chara', btoa(unescape(encodeURIComponent(jsonStr))));
    const tmpPath = `${wx.env.USER_DATA_PATH}/export_${Date.now()}.png`;
    const fs = wx.getFileSystemManager();
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: tmpPath,
        data: embedded,
        encoding: 'binary',
        success() { resolve(tmpPath); },
        fail(err) { reject(new Error('写入文件失败')); }
      });
    });
  }

  // 无头像时导出为纯 JSON
  const tmpPath = `${wx.env.USER_DATA_PATH}/export_${Date.now()}.json`;
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: tmpPath,
      data: jsonStr,
      encoding: 'utf8',
      success() { resolve(tmpPath); },
      fail(err) { reject(new Error('写入文件失败')); }
    });
  });
}

/**
 * 在 PNG 文件中嵌入 JSON 数据（写入 tEXt chunk）
 * 使用 'chara' 作为 keyword，与 SillyTavern 标准一致
 */
function _embedJsonInPng(pngBuffer, keyword, base64Data) {
  const src = new Uint8Array(pngBuffer);
  const chunks = [];

  // PNG 签名（8 bytes）
  chunks.push(src.slice(0, 8));

  let pos = 8;
  let inserted = false;

  while (pos < src.length) {
    const length = (src[pos] << 24) | (src[pos+1] << 16) | (src[pos+2] << 8) | src[pos+3];
    const type = String.fromCharCode(src[pos+4], src[pos+5], src[pos+6], src[pos+7]);
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;

    // 在 IEND 之前插入 tEXt chunk
    if (type === 'IEND' && !inserted) {
      const textChunk = _buildPngTextChunk(keyword, base64Data);
      chunks.push(new Uint8Array(textChunk));
      inserted = true;
    }

    chunks.push(src.slice(pos, crcEnd));
    pos = crcEnd;
  }

  // 合并所有 chunk
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}

/** 构建 PNG tEXt chunk */
function _buildPngTextChunk(keyword, text) {
  const keyBytes = [];
  for (let i = 0; i < keyword.length; i++) keyBytes.push(keyword.charCodeAt(i));
  keyBytes.push(0); // null separator

  const textBytes = [];
  for (let i = 0; i < text.length; i++) textBytes.push(text.charCodeAt(i));

  const dataLen = keyBytes.length + textBytes.length;
  const chunk = new Uint8Array(12 + dataLen);

  // Length (4 bytes)
  chunk[0] = (dataLen >> 24) & 0xFF;
  chunk[1] = (dataLen >> 16) & 0xFF;
  chunk[2] = (dataLen >> 8) & 0xFF;
  chunk[3] = dataLen & 0xFF;

  // Type: tEXt (4 bytes)
  chunk[4] = 0x74; // t
  chunk[5] = 0x45; // E
  chunk[6] = 0x58; // X
  chunk[7] = 0x74; // t

  // Data
  chunk.set(keyBytes, 8);
  chunk.set(textBytes, 8 + keyBytes.length);

  // CRC32 (over type + data)
  const crc = _crc32(chunk.slice(4, 8 + dataLen));
  chunk[8 + dataLen] = (crc >> 24) & 0xFF;
  chunk[9 + dataLen] = (crc >> 16) & 0xFF;
  chunk[10 + dataLen] = (crc >> 8) & 0xFF;
  chunk[11 + dataLen] = crc & 0xFF;

  return chunk;
}

/** CRC32 实现 */
function _crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 获取角色聊天列表
 * POST /api/characters/chats
 */
function getChatList(avatarUrl) {
  const cleanUrl = stripPngSuffix(avatarUrl);
  return api.post('/api/characters/chats', { avatar_url: cleanUrl })
    .then(data => {
      let chats = [];
      if (Array.isArray(data)) chats = data;
      else if (data && Array.isArray(data.chats)) chats = data.chats;
      else if (data && Array.isArray(data.data)) chats = data.data;
      else { console.warn('getChatList: 意外的返回格式', data); return []; }

      // 按 last_mes（最后修改时间）降序排列，最新的在前
      chats.sort((a, b) => (b.last_mes || 0) - (a.last_mes || 0));
      return chats;
    });
}

/**
 * 获取聊天历史消息
 * POST /api/chats/get
 */
function getChatMessages(avatarUrl, fileName) {
  const cleanUrl = stripPngSuffix(avatarUrl);
  return api.post('/api/chats/get', {
    avatar_url: cleanUrl,
    file_name: fileName
  }).then(data => {
    if (Array.isArray(data)) {
      return data.map(parseSillyTavernMessage);
    }
    // 兼容 {messages: [...]} 格式
    if (data && Array.isArray(data.messages)) {
      return data.messages.map(parseSillyTavernMessage);
    }
    if (data && Array.isArray(data.chat)) {
      return data.chat.map(parseSillyTavernMessage);
    }
    console.warn('getChatMessages: 意外的返回格式', data);
    return [];
  });
}

/**
 * 保存聊天到服务端
 * POST /api/chats/save
 */
function saveChat(characterName, fileName, messages, avatarUrl) {
  const chatData = messages.map(m => ({
    user_name: m.role === 'user' ? (m.name || 'You') : '',
    character_name: m.role === 'assistant' ? (m.name || '') : '',
    name: m.name || '',
    mes: m.content,
    send_date: m.timestamp || Date.now()
  }));

  return api.post('/api/chats/save', {
    ch_name: characterName,
    file_name: fileName,
    chat: chatData,
    avatar_url: avatarUrl
  });
}

/**
 * 删除聊天历史
 * POST /api/chats/delete
 */
function deleteChat(avatarUrl, chatfile) {
  return api.post('/api/chats/delete', {
    avatar_url: avatarUrl,
    chatfile
  });
}

// ============================================================
// AI 生成接口
// ============================================================

/**
 * SillyTavern main_api → chat_completion_source 映射
 * generate 端点通过 chat_completion_source 路由到对应后端处理器
 * 参见 SillyTavern src/endpoints/backends/chat-completions.js 第 2179 行
 */
const _CHAT_COMPLETION_SOURCE_MAP = {
  'openai': 'openai',
  'claude': 'claude',
  'chat-completions': 'custom',
  'kobold': 'custom',
  'novel': 'novel',
  'textgenerationwebui': 'custom',
};

/**
 * 发送消息并获取 AI 回复（非流式）
 * POST /api/backends/chat-completions/generate
 *
 * 必须发送 chat_completion_source，否则端点无法路由到正确的 AI 后端，会返回 400。
 * 不发送 char 字段——SillyTavern 服务端已加载角色，generate 端点不使用此字段。
 *
 * @param {Array} history - 历史消息
 * @param {string} userMessage - 用户消息
 * @param {object} character - 角色对象（当前未使用，保留接口兼容）
 * @param {object} overrideParams - 可选覆盖参数
 * @returns {Promise<string>} AI 回复文本
 */
async function sendMessage(history, userMessage, character, overrideParams) {
  const messages = [];

  if (history && history.length > 0) {
    for (const m of history) {
      if (m.role === 'system') continue;
      messages.push({
        role: m.role === 'character' ? 'assistant' : m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {})
      });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  // 构建请求体：chat_completion_source 是必填字段
  const body = { messages };

  // 从服务端设置中获取当前 AI 后端类型，映射为 chat_completion_source
  // 如果缓存为空，先拉取一次
  let settings = getApp().globalData._cachedSettings;
  if (!settings) {
    try {
      settings = await getServerSettings();
    } catch (e) {
      console.warn('[sendMessage] 获取设置失败，使用默认 openai:', e.message);
      settings = {};
    }
  }

  const mainApi = settings.main_api || 'openai';
  body.chat_completion_source = _CHAT_COMPLETION_SOURCE_MAP[mainApi] || 'openai';

  // 对于 openai 后端，如果有自定义 URL，需要通过 reverse_proxy 传给 generate 端点
  // proxy_password 仅在有缓存 Key 时传入；为空时不传，让端点从 secrets 读取
  if (mainApi === 'openai' && settings.openai_url) {
    body.reverse_proxy = settings.openai_url;
    if (settings._apiKey) {
      body.proxy_password = settings._apiKey;
    }
  }
  // chat-completions 自定义接口：custom_url
  if (mainApi === 'chat-completions' && settings.chat_completion_url) {
    body.custom_url = settings.chat_completion_url;
  }

  // 传递模型名
  if (settings.openai_model && mainApi === 'openai') {
    body.model = settings.openai_model;
  } else if (settings.chat_completion_model && mainApi === 'chat-completions') {
    body.model = settings.chat_completion_model;
  } else if (settings.claude_model && mainApi === 'claude') {
    body.model = settings.claude_model;
  }

  if (overrideParams) Object.assign(body, overrideParams);

  console.log('[sendMessage] 请求体:', JSON.stringify(body).slice(0, 1000));

  try {
    const data = await api.post('/api/backends/chat-completions/generate', body, { timeout: 120000 });
    console.log('[sendMessage] 响应:', JSON.stringify(data).slice(0, 500));
    // 解析 OpenAI 兼容格式响应
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content) {
        return choice.message.content;
      }
      if (choice.text) return choice.text;
    }
    if (data.message) return data.message;
    return '（无回复）';
  } catch (err) {
    console.error('[sendMessage] 错误:', err.message);
    throw err;
  }
}

// ============================================================
// AI 后端管理
// ============================================================

/**
 * 获取已配置的 AI 后端列表
 * POST /api/settings/get
 */
function getBackends() {
  return api.post('/api/settings/get')
    .then(data => {
      const settingsStr = data.settings;
      let currentBackend = 'openai';
      if (settingsStr) {
        try {
          const settings = typeof settingsStr === 'string' ? JSON.parse(settingsStr) : settingsStr;
          currentBackend = settings.main_api || 'openai';
        } catch (e) { /* ignore */ }
      }

      return [
        { id: 'openai', name: 'OpenAI', active: currentBackend === 'openai' },
        { id: 'kobold', name: 'KoboldAI', active: currentBackend === 'kobold' },
        { id: 'novel', name: 'NovelAI', active: currentBackend === 'novel' },
        { id: 'textgenerationwebui', name: 'TextGen WebUI', active: currentBackend === 'textgenerationwebui' },
        { id: 'claude', name: 'Claude', active: currentBackend === 'claude' },
        { id: 'chat-completions', name: 'Chat Completions', active: currentBackend === 'chat-completions' }
      ];
    });
}

/**
 * 切换 AI 后端
 */
function setBackend(backendId) {
  return api.post('/api/settings/get')
    .then(data => {
      const settingsStr = data.settings;
      if (!settingsStr) throw new Error('无法获取设置');
      
      const settings = typeof settingsStr === 'string' ? JSON.parse(settingsStr) : settingsStr;
      settings.main_api = backendId;
      
      return api.post('/api/settings/save', settings);
    });
}

// ============================================================
// 角色导入/创建
// ============================================================

/**
 * 导入角色文件（PNG/JSON）
 * POST /api/characters/import  multipart/form-data
 */
function importCharacterFile(filePath, fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const fileType = (ext === 'json' || ext === 'png') ? ext : 'png';

  return api.uploadFile(
    '/api/characters/import',
    filePath,
    'avatar',
    { file_type: fileType }
  );
}

/**
 * 从 JSON 数据导入角色
 */
function importCharacterData(charData) {
  const jsonStr = JSON.stringify(charData);
  const fs = wx.getFileSystemManager();
  const tmpPath = `${wx.env.USER_DATA_PATH}/tmp_import_${Date.now()}.json`;

  return new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: tmpPath,
      data: jsonStr,
      encoding: 'utf8',
      success() {
        api.uploadFile('/api/characters/import', tmpPath, 'avatar', { file_type: 'json' })
          .then(resolve)
          .catch(reject)
          .finally(() => {
            try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
          });
      },
      fail(err) {
        reject(new Error('写入临时文件失败'));
      }
    });
  });
}

/**
 * 创建角色
 * POST /api/characters/create  multipart/form-data
 */
function createCharacter(charData, avatarFilePath) {
  const formData = {};
  for (const key in charData) {
    if (charData[key] != null) {
      formData[key] = String(charData[key]);
    }
  }

  if (avatarFilePath) {
    return api.uploadFile('/api/characters/create', avatarFilePath, 'avatar', formData);
  }

  // 无头像时用普通 POST
  return api.post('/api/characters/create', formData);
}

/**
 * 编辑角色
 * POST /api/characters/edit  multipart/form-data
 */
function editCharacter(internalFileName, charData, avatarFilePath) {
  const formData = {
    file_name: internalFileName
  };
  for (const key in charData) {
    if (charData[key] != null) {
      formData[key] = String(charData[key]);
    }
  }

  if (avatarFilePath) {
    return api.uploadFile('/api/characters/edit', avatarFilePath, 'avatar', formData);
  }

  return api.post('/api/characters/edit', formData);
}

// ============================================================
// 内部工具
// ============================================================

/**
 * 解析 SillyTavern 聊天消息格式
 */
function parseSillyTavernMessage(json) {
  const isUser = json.user_name && json.user_name.length > 0;
  return {
    role: isUser ? 'user' : 'assistant',
    content: json.mes || '',
    name: isUser ? (json.user_name || 'You') : (json.name || json.character_name || ''),
    timestamp: json.send_date || Date.now()
  };
}

/**
 * 获取服务端完整设置
 * POST /api/settings/get
 * 同时缓存到 globalData._cachedSettings 供 sendMessage 使用
 */
function getServerSettings() {
  return api.post('/api/settings/get').then(data => {
    const settingsStr = data.settings;
    let settings = {};
    if (settingsStr) {
      try {
        settings = typeof settingsStr === 'string' ? JSON.parse(settingsStr) : settingsStr;
      } catch (e) { settings = {}; }
    }
    // 缓存设置供 sendMessage 读取 chat_completion_source
    getApp().globalData._cachedSettings = settings;
    return settings;
  });
}

/** API 类型 → SillyTavern secrets key 映射 */
const _SECRET_KEY_MAP = {
  openai: 'api_key_openai',
  claude: 'api_key_claude',
  novel: 'api_key_novel',
  'chat-completions': 'api_key_custom',
};

/**
 * 保存 API Key 到 SillyTavern secrets.json
 * generate 端点通过 readSecret() 读取 key，必须存到 secrets 而非 settings
 */
function _saveApiKeyToSecrets(apiType, apiKey) {
  const secretKey = _SECRET_KEY_MAP[apiType];
  if (!secretKey || !apiKey) {
    console.warn('[_saveApiKeyToSecrets] 跳过:', { apiType, secretKey, hasKey: !!apiKey });
    return Promise.resolve();
  }
  console.log('[_saveApiKeyToSecrets] 写入:', { key: secretKey });
  return api.post('/api/secrets/write', {
    key: secretKey,
    value: apiKey,
    label: 'SillyTavern MiniApp'
  }).then(res => {
    console.log('[_saveApiKeyToSecrets] 成功:', res);
    return res;
  }).catch(err => {
    console.error('[_saveApiKeyToSecrets] 失败:', err.message);
    throw err;
  });
}

/**
 * 保存 AI API 配置到 SillyTavern 服务端
 * 1. settings 存 main_api / model / url
 * 2. secrets  存 api key（generate 端点从这里读）
 *
 * @param {string} apiType - 'openai' | 'claude' | 'kobold' | 'novel' | 'textgenerationwebui' | 'chat-completions'
 * @param {object} config - { apiKey, apiUrl, model, ... }
 */
function saveServerApiConfig(apiType, config) {
  console.log('[saveServerApiConfig] 入参:', { apiType, hasKey: !!config.apiKey, model: config.model, url: config.apiUrl });
  return getServerSettings().then(settings => {
    settings.main_api = apiType;

    switch (apiType) {
      case 'openai':
        settings.openai_model = config.model || settings.openai_model;
        if (config.apiUrl !== undefined) settings.openai_url = config.apiUrl;
        if (config.maxContext) settings.openai_max_context = config.maxContext;
        if (config.maxTokens) settings.openai_max_tokens = config.maxTokens;
        break;

      case 'claude':
        settings.claude_model = config.model || settings.claude_model;
        if (config.apiUrl !== undefined) settings.claude_url = config.apiUrl;
        break;

      case 'kobold':
        if (config.apiUrl !== undefined) settings.kobold_url = config.apiUrl;
        break;

      case 'novel':
        settings.novel_model = config.model || settings.novel_model;
        break;

      case 'textgenerationwebui':
        if (config.apiUrl !== undefined) settings.textgenerationwebui_url = config.apiUrl;
        break;

      case 'chat-completions':
        settings.chat_completion_model = config.model || settings.chat_completion_model;
        if (config.apiUrl !== undefined) settings.chat_completion_url = config.apiUrl;
        break;
    }

    // 同时保存 settings + secrets，并更新缓存
    const tasks = [api.post('/api/settings/save', settings)];

    // 仅当用户实际输入了 Key 时才更新 secrets，避免空值覆盖已有密钥
    if (config.apiKey) {
      tasks.push(_saveApiKeyToSecrets(apiType, config.apiKey));
    }

    return Promise.all(tasks).then(result => {
      // 缓存中额外保存 API Key（secrets 无法读回，需要内存缓存）
      if (config.apiKey) {
        settings._apiKey = config.apiKey;
      }
      getApp().globalData._cachedSettings = settings;
      return result;
    });
  });
}

// ============================================================
// AI 流式生成接口
// ============================================================

/**
 * 发送消息并流式获取 AI 回复（SSE / chunked）
 * POST /api/backends/chat-completions/generate
 *
 * @param {Array} history - 历史消息
 * @param {string} userMessage - 用户消息
 * @param {object} character - 角色对象
 * @param {function} onChunk - 收到增量文本时回调 onChunk(deltaText, fullText)
 * @param {object} overrideParams - 可选覆盖参数
 * @returns {Promise<string>} 完整回复文本
 */
async function sendMessageStream(history, userMessage, character, onChunk, overrideParams) {
  const messages = [];

  if (history && history.length > 0) {
    for (const m of history) {
      if (m.role === 'system') continue;
      messages.push({
        role: m.role === 'character' ? 'assistant' : m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {})
      });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  const body = { messages, stream: true };

  // 获取 AI 后端配置
  let settings = getApp().globalData._cachedSettings;
  if (!settings) {
    try {
      settings = await getServerSettings();
    } catch (e) {
      console.warn('[sendMessageStream] 获取设置失败，使用默认 openai:', e.message);
      settings = {};
    }
  }

  const mainApi = settings.main_api || 'openai';
  body.chat_completion_source = _CHAT_COMPLETION_SOURCE_MAP[mainApi] || 'openai';

  if (mainApi === 'openai' && settings.openai_url) {
    body.reverse_proxy = settings.openai_url;
    if (settings._apiKey) {
      body.proxy_password = settings._apiKey;
    }
  }
  if (mainApi === 'chat-completions' && settings.chat_completion_url) {
    body.custom_url = settings.chat_completion_url;
  }

  if (settings.openai_model && mainApi === 'openai') {
    body.model = settings.openai_model;
  } else if (settings.chat_completion_model && mainApi === 'chat-completions') {
    body.model = settings.chat_completion_model;
  } else if (settings.claude_model && mainApi === 'claude') {
    body.model = settings.claude_model;
  }

  if (overrideParams) Object.assign(body, overrideParams);

  console.log('[sendMessageStream] 开始流式请求');

  const g = getApp().globalData;
  const fullUrl = `${g.serverUrl}/api/backends/chat-completions/generate`;

  const header = {
    'Content-Type': 'application/json'
  };
  if (g.csrfToken) header['X-CSRF-Token'] = g.csrfToken;
  if (g.sessionCookies) header['Cookie'] = g.sessionCookies;

  return new Promise((resolve, reject) => {
    let fullText = '';
    let settled = false;

    const reqTask = wx.request({
      url: fullUrl,
      method: 'POST',
      data: body,
      header,
      timeout: 120000,
      enableChunked: true,
      success(res) {
        if (settled) return;
        settled = true;
        // 非流式回退：服务端可能忽略 stream 参数直接返回完整响应
        if (res.statusCode === 200 && res.data) {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (!fullText) {
            // 没收到任何 chunk，从完整响应中提取
            if (data.choices && data.choices.length > 0) {
              const choice = data.choices[0];
              fullText = choice.message?.content || choice.text || '';
            } else if (data.message) {
              fullText = data.message;
            }
          }
          resolve(fullText || '（无回复）');
        } else if (res.statusCode === 401) {
          reject(new Error('会话已过期，请重新登录'));
        } else {
          reject(new Error(`请求失败: HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        if (settled) return;
        settled = true;
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });

    // 监听 chunked 数据
    reqTask.onChunkReceived(function(res) {
      try {
        const chunk = new TextDecoder().decode(res.data);
        // 解析 SSE 格式：data: {...}\n\n
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            // OpenAI 格式
            if (json.choices && json.choices.length > 0) {
              const delta = json.choices[0].delta;
              if (delta && delta.content) {
                fullText += delta.content;
                if (onChunk) onChunk(delta.content, fullText);
              }
              // 也可能在 text 字段（旧格式）
              const text = json.choices[0].text;
              if (text) {
                fullText += text;
                if (onChunk) onChunk(text, fullText);
              }
            }
          } catch (e) {
            // 不完整的 JSON chunk，忽略
          }
        }
      } catch (e) {
        console.warn('[sendMessageStream] chunk 解析错误:', e.message);
      }
    });
  });
}

module.exports = {
  // 连接
  checkConnection,
  getServerInfo,
  // 用户
  getUserList,
  login,
  logout,
  createUser,
  getCurrentUser,
  // 角色
  getCharacters,
  getCharacterAvatarUrl,
  downloadAvatar,
  deleteCharacter,
  exportCharacter,
  exportCharacterAsPng,
  // 聊天
  getChatList,
  getChatMessages,
  saveChat,
  deleteChat,
  // AI 生成
  sendMessage,
  sendMessageStream,
  // 后端
  getBackends,
  setBackend,
  getServerSettings,
  saveServerApiConfig,
  // 导入/创建
  importCharacterFile,
  importCharacterData,
  createCharacter,
  editCharacter
};
