/**
 * AI 后端配置页面
 * 
 * 服务端模式：选择后端 → 填配置 → 测试 → 保存到 SillyTavern 服务端
 * 直连模式：独立配置 → 测试 → 保存到小程序本地
 */

const app = getApp();
const st = require('../../services/sillytavern');
const directApi = require('../../services/direct_api');

// ── 直连 API 类型 ──
const API_TYPE_KEYS = ['openaiCompatible', 'deepseek', 'anthropic', 'openrouter', 'custom'];
const API_TYPE_NAMES = ['OpenAI', 'DeepSeek', 'Claude', 'OpenRouter', '自定义'];

// ── SillyTavern 服务端后端 ──
const ST_BACKENDS = [
  { id: 'openai', name: 'OpenAI', icon: '🟢', tag: 'GPT',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-...', urlPlaceholder: 'https://api.openai.com', modelPlaceholder: 'gpt-4o-mini',
    testApiType: 'openaiCompatible' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🔵', tag: '推荐',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-...', urlPlaceholder: 'https://api.deepseek.com', modelPlaceholder: 'deepseek-chat',
    testApiType: 'deepseek' },
  { id: 'claude', name: 'Claude', icon: '🟠', tag: 'Anthropic',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'sk-ant-...', urlPlaceholder: 'https://api.anthropic.com', modelPlaceholder: 'claude-sonnet-4-5',
    testApiType: 'anthropic' },
  { id: 'chat-completions', name: '自定义接口', icon: '⚙️', tag: '兼容',
    needKey: true, needUrl: true, needModel: true,
    keyPlaceholder: 'API Key', urlPlaceholder: 'https://your-api.com/v1', modelPlaceholder: '模型名',
    testApiType: 'openaiCompatible' },
  { id: 'kobold', name: 'KoboldAI', icon: '🟤', tag: '',
    needKey: false, needUrl: true, needModel: false,
    keyPlaceholder: '', urlPlaceholder: 'http://localhost:5001', modelPlaceholder: '',
    testApiType: 'custom' },
  { id: 'novel', name: 'NovelAI', icon: '🟣', tag: '',
    needKey: true, needUrl: false, needModel: true,
    keyPlaceholder: 'NovelAI Key', urlPlaceholder: '', modelPlaceholder: 'euterpe-v2',
    testApiType: 'custom' },
  { id: 'textgenerationwebui', name: 'TextGen', icon: '⚪', tag: '',
    needKey: false, needUrl: true, needModel: false,
    keyPlaceholder: '', urlPlaceholder: 'http://localhost:5000', modelPlaceholder: '',
    testApiType: 'custom' }
];

Page({
  data: {
    useDirectApi: false,

    // ── 服务端 ──
    backends: [],
    currentBackendId: '',
    currentBackendName: '',
    currentBackendIcon: '',
    currentTestApiType: '',
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

    // ── 通用测试状态 ──
    isTesting: false,
    testResult: '',
    testSuccess: false,

    // ── 直连 ──
    apiTypeIndex: 0,
    apiTypeNames: API_TYPE_NAMES,
    apiBaseUrl: '',
    apiKey: '',
    modelName: '',
    showApiKey: false
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
    const isDirect = e.currentTarget.dataset.mode === 'direct';
    this.setData({
      useDirectApi: isDirect,
      testResult: '',
      saveResult: ''
    });

    // 立即持久化模式切换
    if (!isDirect) {
      // 切回服务端模式：关闭直连
      app.saveDirectApiConfig(app.globalData.directApi, false);
    }
  },

  // ═══════════════════════════
  // 服务端模式
  // ═══════════════════════════

  async _loadBackends() {
    try {
      const settings = await st.getServerSettings();
      const currentApi = settings.main_api || 'openai';

      // 如果当前是 openai 且 url 是 deepseek，标记为 deepseek
      let activeId = currentApi;
      if (currentApi === 'openai' && (settings.openai_url || '').includes('deepseek')) {
        activeId = 'deepseek';
      }

      const backends = ST_BACKENDS.map(b => ({
        ...b,
        active: b.id === activeId
      }));

      this.setData({ backends, currentBackendId: activeId });
      this._selectBackend(activeId, settings);
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
        // DeepSeek: SillyTavern 用 openai 兼容模式，配置存 openai 字段
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

    // v1.2.1+ key 存在 secrets 中，settings 读不到，显示占位提示
    let keyPlaceholder = backend.keyPlaceholder;
    if (!currentKey && backend.needKey) {
      const hasConfig = (backendId === 'openai' || backendId === 'deepseek')
        ? !!(settings.openai_url || settings.openai_model)
        : backendId === 'claude'
        ? !!(settings.claude_url || settings.claude_model)
        : backendId === 'chat-completions'
        ? !!(settings.chat_completion_url || settings.chat_completion_model)
        : false;
      if (hasConfig) {
        keyPlaceholder = '已保存（留空则不更新）';
      }
    }

    this.setData({
      currentBackendId: backendId,
      currentBackendName: backend.name,
      currentBackendIcon: backend.icon,
      currentTestApiType: backend.testApiType,
      showApiForm: backend.needKey || backend.needUrl || backend.needModel,
      needApiKey: backend.needKey,
      needApiUrl: backend.needUrl,
      needModel: backend.needModel,
      apiKeyPlaceholder: keyPlaceholder,
      apiUrlPlaceholder: backend.urlPlaceholder,
      modelPlaceholder: backend.modelPlaceholder,
      stApiKey: currentKey,
      stApiUrl: currentUrl,
      stModel: currentModel,
      saveResult: '',
      testResult: ''
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

  onStApiKeyInput(e) { this.setData({ stApiKey: e.detail.value, testResult: '', saveResult: '' }); },
  onStApiUrlInput(e) { this.setData({ stApiUrl: e.detail.value, testResult: '', saveResult: '' }); },
  onStModelInput(e) { this.setData({ stModel: e.detail.value, testResult: '', saveResult: '' }); },
  toggleStApiKey() { this.setData({ showStApiKey: !this.data.showStApiKey }); },

  /** 输入框获焦时滚动到可见区域，防止键盘遮挡 */
  onInputFocus(e) {
    // 延迟等键盘弹出后滚动
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: e.currentTarget.offsetTop - 100, duration: 300 });
    }, 300);
  },

  /** 测试服务端 AI 连接（通过 SillyTavern 后端测试） */
  async onTestServerConnection() {
    const url = this.data.stApiUrl;
    const key = this.data.stApiKey;
    const model = this.data.stModel;
    console.log('[onTestServerConnection] 开始:', { url, hasKey: !!key, keyLen: (key || '').length, model, backend: this.data.currentBackendId });

    if (!url && this.data.needApiUrl) {
      wx.showToast({ title: '请输入 API 地址', icon: 'none' });
      return;
    }

    this.setData({ isTesting: true, testResult: '' });

    try {
      // 先保存配置到服务端
      let backendId = this.data.currentBackendId;
      if (backendId === 'deepseek') backendId = 'openai';

      await st.saveServerApiConfig(backendId, {
        apiKey: key,
        apiUrl: url,
        model: model
      });

      // 通过 SillyTavern 的 generate 端点发一条测试消息
      const testResult = await st.sendMessage([], 'Hi', null);
      const ok = testResult && testResult.length > 0;

      this.setData({
        testResult: ok
          ? '✅ 连接成功，AI 可正常回复'
          : '❌ 连接失败，请检查：\n1. API 地址是否正确\n2. API Key 是否有效\n3. 服务端日志获取详情',
        testSuccess: ok
      });
    } catch (e) {
      this.setData({
        testResult: '❌ 测试出错: ' + e.message,
        testSuccess: false
      });
    } finally {
      this.setData({ isTesting: false });
    }
  },

  /** 保存配置到服务端 */
  async onSaveToServer() {
    this.setData({ isSaving: true, saveResult: '' });

    try {
      let backendId = this.data.currentBackendId;

      // DeepSeek: SillyTavern 用 openai 兼容模式
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
      modelName: this.data.modelName || defaults.defaultModel,
      testResult: ''
    });
  },

  onApiBaseUrlInput(e) { this.setData({ apiBaseUrl: e.detail.value, testResult: '' }); },
  onApiKeyInput(e) { this.setData({ apiKey: e.detail.value, testResult: '' }); },
  onModelInput(e) { this.setData({ modelName: e.detail.value, testResult: '' }); },
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
