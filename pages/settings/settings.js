/**
 * AI 后端配置页面（美化版）
 * 
 * 服务端模式：选择后端 → 填配置 → 保存到 SillyTavern 服务端
 * 直连模式：独立配置 → 保存到小程序本地
 */

const app = getApp();
const st = require('../../services/sillytavern');
const directApi = require('../../services/direct_api');

// ── 直连 API 类型 ──
const API_TYPE_KEYS = ['openaiCompatible', 'deepseek', 'anthropic', 'openrouter', 'custom'];
const API_TYPE_NAMES = ['OpenAI', 'DeepSeek', 'Claude', 'OpenRouter', '自定义'];

// ── SillyTavern 后端 ──
const ST_BACKENDS = [
  { id: 'openai', name: 'OpenAI', icon: '🟢', tag: 'GPT',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-...', urlPlaceholder: 'https://api.openai.com', modelPlaceholder: 'gpt-4o-mini' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🔵', tag: '推荐',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-...', urlPlaceholder: 'https://api.deepseek.com', modelPlaceholder: 'deepseek-chat' },
  { id: 'claude', name: 'Claude', icon: '🟠', tag: 'Anthropic',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-ant-...', urlPlaceholder: 'https://api.anthropic.com', modelPlaceholder: 'claude-sonnet-4-5' },
  { id: 'chat-completions', name: '自定义接口', icon: '⚙️', tag: '兼容',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'API Key', urlPlaceholder: 'https://your-api.com/v1', modelPlaceholder: '模型名' },
  { id: 'kobold', name: 'KoboldAI', icon: '🟤', tag: '',
    needKey: false, needUrl: true, needModel: false,
    keyPlaceholder: '', urlPlaceholder: 'http://localhost:5001', modelPlaceholder: '' },
  { id: 'novel', name: 'NovelAI', icon: '🟣', tag: '',
    needKey: true, needUrl: false, needModel: true,
    keyPlaceholder: 'NovelAI Key', urlPlaceholder: '', modelPlaceholder: 'euterpe-v2' },
  { id: 'textgenerationwebui', name: 'TextGen', icon: '⚪', tag: '',
    needKey: false, needUrl: true, needModel: false,
    keyPlaceholder: '', urlPlaceholder: 'http://localhost:5000', modelPlaceholder: '' }
];

Page({
  data: {
    useDirectApi: false,

    // ── 服务端 ──
    backends: [],
    currentBackendId: '',
    currentBackendName: '',
    currentBackendIcon: '',
    showApiForm: false,
    needApiKey: false,
    needApiUrl: false,
    needModel: false,
    apiKeyPlaceholder: '',
    apiUrlPlaceholder: '',
    modelPlaceholder: '',
    stApiKey: '',
    stApiUrl: '',
    stModel: '',
    showStApiKey: false,
    isSaving: false,
    saveResult: '',
    saveSuccess: false,

    // ── 直连 ──
    apiTypeIndex: 0,
    apiTypeNames: API_TYPE_NAMES,
    apiBaseUrl: '',
    apiKey: '',
    modelName: '',
    showApiKey: false,
    isTesting: false,
    testResult: '',
    testSuccess: false
  },

  onLoad() {
    const g = app.globalData;
    const config = g.directApi;
    const typeIndex = API_TYPE_KEYS.indexOf(config.type);

    this.setData({
      useDirectApi: config.enabled,
      apiTypeIndex: typeIndex >= 0 ? typeIndex : 0,
      apiBaseUrl: config.baseUrl || '',
      apiKey: config.apiKey || '',
      modelName: config.model || ''
    });

    this._loadBackends();
  },

  // ═══════════════════════════
  // 模式切换
  // ═══════════════════════════

  onSelectMode(e) {
    this.setData({ useDirectApi: e.currentTarget.dataset.mode === 'direct' });
  },

  // ═══════════════════════════
  // 服务端模式
  // ═══════════════════════════

  async _loadBackends() {
    try {
      const settings = await st.getServerSettings();
      const currentApi = settings.main_api || 'openai';

      // 兼容：如果服务端没有 deepseek 类型，用 openai 兼容模式
      const backends = ST_BACKENDS.map(b => ({
        ...b,
        active: b.id === currentApi
      }));

      this.setData({ backends, currentBackendId: currentApi });
      this._selectBackend(currentApi, settings);
    } catch (e) {
      this.setData({
        backends: ST_BACKENDS.map((b, i) => ({ ...b, active: i === 0 })),
        currentBackendId: 'openai'
      });
      this._selectBackend('openai', {});
    }
  },

  _selectBackend(backendId, settings) {
    const backend = ST_BACKENDS.find(b => b.id === backendId);
    if (!backend) return;

    let currentKey = '', currentUrl = '', currentModel = '';

    switch (backendId) {
      case 'openai':
        currentKey = settings.oai_key || '';
        currentUrl = settings.openai_url || '';
        currentModel = settings.openai_model || '';
        break;
      case 'deepseek':
        // DeepSeek 用 OpenAI 兼容接口，配置存在 openai 字段中
        currentKey = settings.oai_key || '';
        currentUrl = settings.openai_url || 'https://api.deepseek.com';
        currentModel = settings.openai_model || 'deepseek-chat';
        break;
      case 'claude':
        currentKey = settings.claude_key || '';
        currentUrl = settings.claude_url || '';
        currentModel = settings.claude_model || '';
        break;
      case 'chat-completions':
        currentKey = settings.chat_completion_api_key || '';
        currentUrl = settings.chat_completion_url || '';
        currentModel = settings.chat_completion_model || '';
        break;
      case 'kobold':
        currentUrl = settings.kobold_url || '';
        break;
      case 'novel':
        currentKey = settings.novel_api_key || '';
        currentModel = settings.novel_model || '';
        break;
      case 'textgenerationwebui':
        currentUrl = settings.textgenerationwebui_url || '';
        break;
    }

    this.setData({
      currentBackendId: backendId,
      currentBackendName: backend.name,
      currentBackendIcon: backend.icon,
      showApiForm: backend.needKey || backend.needUrl || backend.needModel,
      needApiKey: backend.needKey,
      needApiUrl: backend.needUrl,
      needModel: backend.needModel,
      apiKeyPlaceholder: backend.keyPlaceholder,
      apiUrlPlaceholder: backend.urlPlaceholder,
      modelPlaceholder: backend.modelPlaceholder,
      stApiKey: currentKey,
      stApiUrl: currentUrl,
      stModel: currentModel,
      saveResult: ''
    });
  },

  onSelectBackend(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      backends: this.data.backends.map(b => ({ ...b, active: b.id === id }))
    });

    st.getServerSettings().then(settings => {
      this._selectBackend(id, settings);
    }).catch(() => {
      this._selectBackend(id, {});
    });
  },

  onStApiKeyInput(e) { this.setData({ stApiKey: e.detail.value, saveResult: '' }); },
  onStApiUrlInput(e) { this.setData({ stApiUrl: e.detail.value, saveResult: '' }); },
  onStModelInput(e) { this.setData({ stModel: e.detail.value, saveResult: '' }); },
  toggleStApiKey() { this.setData({ showStApiKey: !this.data.showStApiKey }); },

  async onSaveToServer() {
    this.setData({ isSaving: true, saveResult: '' });

    try {
      let backendId = this.data.currentBackendId;

      // DeepSeek 走 OpenAI 兼容接口
      if (backendId === 'deepseek') {
        backendId = 'openai';
      }

      await st.saveServerApiConfig(backendId, {
        apiKey: this.data.stApiKey,
        apiUrl: this.data.stApiUrl,
        model: this.data.stModel
      });

      this.setData({
        saveResult: '已保存到服务端！服务端将使用此配置调用 AI。',
        saveSuccess: true
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      this.setData({
        saveResult: '保存失败: ' + err.message,
        saveSuccess: false
      });
    } finally {
      this.setData({ isSaving: false });
    }
  },

  // ═══════════════════════════
  // 直连模式
  // ═══════════════════════════

  onApiTypeChange(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const type = API_TYPE_KEYS[index];
    const defaults = directApi.API_TYPES[type];

    this.setData({
      apiTypeIndex: index,
      apiBaseUrl: this.data.apiBaseUrl || defaults.defaultBaseUrl,
      modelName: this.data.modelName || defaults.defaultModel
    });
  },

  onApiBaseUrlInput(e) { this.setData({ apiBaseUrl: e.detail.value }); },
  onApiKeyInput(e) { this.setData({ apiKey: e.detail.value }); },
  onModelInput(e) { this.setData({ modelName: e.detail.value }); },
  toggleApiKey() { this.setData({ showApiKey: !this.data.showApiKey }); },

  async onTestConnection() {
    if (!this.data.apiBaseUrl) {
      wx.showToast({ title: '请输入 API 地址', icon: 'none' });
      return;
    }

    this.setData({ isTesting: true, testResult: '' });

    try {
      const ok = await directApi.testConnection({
        type: API_TYPE_KEYS[this.data.apiTypeIndex],
        baseUrl: this.data.apiBaseUrl,
        apiKey: this.data.apiKey,
        model: this.data.modelName
      });
      this.setData({
        testResult: ok ? '连接成功' : '连接失败，请检查地址和 API Key',
        testSuccess: ok
      });
    } catch (e) {
      this.setData({ testResult: '连接失败: ' + e.message, testSuccess: false });
    } finally {
      this.setData({ isTesting: false });
    }
  },

  onSaveLocal() {
    app.saveDirectApiConfig({
      enabled: true,
      type: API_TYPE_KEYS[this.data.apiTypeIndex],
      baseUrl: this.data.apiBaseUrl,
      apiKey: this.data.apiKey,
      model: this.data.modelName
    }, true);

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1000);
  }
});
