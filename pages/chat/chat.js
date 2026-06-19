/**
 * 聊天页面逻辑
 * 对应 Flutter chat_screen.dart
 */

const app = getApp();
const st = require('../../services/sillytavern');
const directApi = require('../../services/direct_api');
const { formatTime, generateId } = require('../../utils/util');
const { stripPngSuffix } = require('../../utils/util');

Page({
  data: {
    // 角色信息
    characterName: '',
    characterAvatarUrl: '',
    characterDescription: '',
    characterPersonality: '',
    characterScenario: '',
    greeting: '',

    // 消息
    messages: [],
    isSending: false,
    inputText: '',
    canSend: false,
    scrollToId: '',

    // AI 模式
    useDirectApi: false,
    directApiTypeName: '',

    // 角色信息弹窗
    showCharInfo: false,

    // 聊天文件名（保存用）
    currentChatFile: null
  },

  onLoad() {
    const g = app.globalData;
    const char = g.currentCharacter;
    if (!char) return;

    this.setData({
      characterName: char.name || '未知角色',
      characterAvatarUrl: '',
      characterDescription: char.description || '',
      characterPersonality: char.personality || '',
      characterScenario: char.scenario || '',
      greeting: char.greeting || char.first_mes || '',
      useDirectApi: g.directApi.enabled,
      directApiTypeName: g.directApi.enabled ? this._getTypeName(g.directApi.type) : ''
    });

    // 异步下载头像到本地
    if (char.avatar) {
      st.downloadAvatar(char.avatar).then(localPath => {
        this.setData({ characterAvatarUrl: localPath });
      }).catch(() => {});
    }

    // 加载聊天历史
    this._loadChatHistory();
  },

  onUnload() {
    // 返回时清除当前角色
    app.globalData.currentCharacter = null;
  },

  // === 输入 ===

  onInput(e) {
    const text = e.detail.value;
    this.setData({
      inputText: text,
      canSend: text.trim().length > 0 && !this.data.isSending
    });
  },

  // === 发送消息 ===

  async onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isSending) return;

    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character) return;

    // 添加用户消息
    const userMsg = {
      id: generateId(),
      role: 'user',
      content: text,
      name: '我',
      timestamp: Date.now(),
      _time: formatTime(new Date())
    };

    const messages = [...this.data.messages, userMsg];
    this.setData({
      messages,
      inputText: '',
      canSend: false,
      isSending: true
    });
    this._scrollToBottom();

    try {
      const history = messages.slice(0, -1); // 不含刚添加的用户消息
      let reply;

      if (this.data.useDirectApi && g.directApi.enabled) {
        // 直连 LLM API
        const systemPrompt = directApi.buildCharacterPrompt(character);
        reply = await directApi.sendMessage(
          g.directApi,
          history,
          text,
          systemPrompt
        );
      } else if (g.serverUrl) {
        // 走 SillyTavern 后端
        const charData = character;
        reply = await st.sendMessage(history, text, charData);
      } else {
        throw new Error('未配置任何 AI 后端');
      }

      // 添加助手回复
      const assistantMsg = {
        id: generateId(),
        role: 'assistant',
        content: reply || '（无回复）',
        name: character.name,
        timestamp: Date.now(),
        _time: formatTime(new Date()),
        _showAvatar: true
      };

      const updatedMessages = [...this.data.messages, assistantMsg];
      this.setData({ messages: updatedMessages });
      this._scrollToBottom();

      // 自动保存聊天到 SillyTavern 服务端
      if (!this.data.useDirectApi) {
        this._saveCurrentChat(updatedMessages);
      }
    } catch (err) {
      const errMsg = {
        id: generateId(),
        role: 'system',
        content: `⚠️ 回复失败: ${err.message}`,
        timestamp: Date.now(),
        _time: formatTime(new Date())
      };
      this.setData({ messages: [...this.data.messages, errMsg] });
      this._scrollToBottom();
    } finally {
      this.setData({ isSending: false });
    }
  },

  // === 聊天历史 ===

  async _loadChatHistory() {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character || !character.avatar) return;

    try {
      const avatarUrl = stripPngSuffix(character.avatar);
      const chats = await st.getChatList(avatarUrl);

      if (chats.length > 0) {
        const latestChat = chats[0];
        const fileName = latestChat.file_name || '';
        if (fileName) {
          this.setData({ currentChatFile: fileName });
          const rawMessages = await st.getChatMessages(avatarUrl, fileName);

          // 转换为页面格式
          const messages = rawMessages.map(m => ({
            id: generateId(),
            role: m.role,
            content: m.content,
            name: m.name || '',
            timestamp: m.timestamp,
            _time: formatTime(new Date(m.timestamp)),
            _showAvatar: m.role === 'assistant'
          }));

          this.setData({ messages });
          this._scrollToBottom();
        }
      }
    } catch (e) {
      // 不阻塞用户，可以开始新对话
      console.warn('加载聊天历史失败:', e.message || e);
      wx.showToast({ title: '加载聊天记录失败', icon: 'none', duration: 2000 });
    }
  },

  async _saveCurrentChat(messages) {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character) return;

    try {
      const avatarUrl = stripPngSuffix(character.avatar || '');
      const fileName = this.data.currentChatFile ||
        `${character.name} - ${new Date().toISOString().replace(/[:.]/g, 'h')}m`;

      const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role,
          content: m.content,
          name: m.name || '',
          timestamp: m.timestamp
        }));

      await st.saveChat(character.name, fileName, chatMessages, avatarUrl);

      if (!this.data.currentChatFile) {
        this.setData({ currentChatFile: fileName });
      }
    } catch (e) {
      console.warn('保存聊天失败:', e);
    }
  },

  // === 导航 ===

  onBack() {
    wx.navigateBack();
  },

  // === 角色信息弹窗 ===

  onShowCharacterInfo() {
    this.setData({ showCharInfo: true });
  },

  hideCharInfo() {
    this.setData({ showCharInfo: false });
  },

  // === 工具 ===

  _scrollToBottom() {
    setTimeout(() => {
      this.setData({ scrollToId: 'msg-bottom' });
    }, 100);
  },

  _getTypeName(type) {
    const names = {
      openaiCompatible: 'OpenAI 兼容',
      deepseek: 'DeepSeek',
      anthropic: 'Anthropic Claude',
      openrouter: 'OpenRouter',
      custom: '自定义'
    };
    return names[type] || type;
  }
});
