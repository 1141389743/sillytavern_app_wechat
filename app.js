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
    this.globalData.directApi = config;
    this.globalData.directApi.enabled = enabled;
    wx.setStorageSync('direct_api_config', config);
    wx.setStorageSync('direct_api_enabled', enabled);
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
