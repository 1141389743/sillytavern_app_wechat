/**
 * 酒馆AI 微信小程序 - 全局逻辑
 * 
 * 对应原 Flutter 项目的 main.dart + AppProvider
 * 管理全局状态：连接配置、用户会话、角色列表
 */

App({
  globalData: {
    // === 服务器配置 ===
    serverUrl: '',
    csrfToken: '',
    sessionCookies: '',
    currentUser: null,
    isLoggedIn: false,

    // === 直连 API 配置 ===
    directApi: {
      enabled: false,
      type: 'openaiCompatible',  // openaiCompatible | deepseek | anthropic | openrouter | custom
      baseUrl: '',
      apiKey: '',
      model: ''
    },

    // === 角色列表缓存 ===
    characters: [],
    currentCharacter: null,

    // === 聊天状态 ===
    messages: [],
    isSending: false
  },

  onLaunch() {
    this._loadConfig();
    this._cleanOldTempFiles();
  },

  /** 从本地存储加载配置 */
  _loadConfig() {
    const g = this.globalData;
    g.serverUrl = wx.getStorageSync('server_url') || '';
    g.directApi = wx.getStorageSync('direct_api_config') || g.directApi;
    g.directApi.enabled = wx.getStorageSync('direct_api_enabled') || false;
  },

  /** 保存服务器地址 */
  saveServerUrl(url) {
    this.globalData.serverUrl = url;
    wx.setStorageSync('server_url', url);
  },

  /** 保存直连 API 配置 */
  saveDirectApiConfig(config, enabled) {
    const g = this.globalData;
    g.directApi = { ...config, enabled };
    // API Key 仅保存在内存，不写入本地持久化存储
    // 防止设备被他人使用时 Key 泄露
    const safeConfig = { ...config, apiKey: '' };
    wx.setStorageSync('direct_api_config', safeConfig);
    wx.setStorageSync('direct_api_enabled', enabled);
  },

  /** 清理过期临时文件（头像等），保留 7 天内的 */
  _cleanOldTempFiles() {
    try {
      const fs = wx.getFileSystemManager();
      const userPath = wx.env.USER_DATA_PATH;
      const files = fs.readdirSync(userPath);
      const now = Date.now();
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天

      for (const file of files) {
        // 只清理 avatar_ 和 tmp_ 开头的临时文件
        if (!file.startsWith('avatar_') && !file.startsWith('tmp_')) continue;
        try {
          const stat = fs.statSync(`${userPath}/${file}`);
          if (stat && (now - stat.lastModifiedTime) > MAX_AGE) {
            fs.unlinkSync(`${userPath}/${file}`);
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  },

  /** 清除会话状态 */
  clearSession() {
    this.globalData.csrfToken = '';
    this.globalData.sessionCookies = '';
    this.globalData.currentUser = null;
    this.globalData.isLoggedIn = false;
    this.globalData.characters = [];
    this.globalData.currentCharacter = null;
    this.globalData.messages = [];
  }
});
