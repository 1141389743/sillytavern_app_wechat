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
    scrollTop: 0,

    // AI 模式
    useDirectApi: false,
    directApiTypeName: '',

    // 角色信息弹窗
    showCharInfo: false,

    // 下拉刷新
    isRefreshing: false,

    // 聊天文件名（保存用）
    currentChatFile: null,

    // 已加载的聊天会话索引
    _chatSessionIndex: 0,
    _chatSessions: []
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
      isSending: true,
      scrollToId: '' // 清空 scroll-into-view，用 scrollTop 控制
    });
    // 用户消息发出后立即滚动
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

      // 保存会话列表供下拉刷新使用
      this._chatSessions = chats;
      this._chatSessionIndex = 0;

      if (chats.length > 0) {
        await this._loadChatSession(0);
      } else if (this.data.greeting) {
        // 无历史记录但有开场白：将开场白作为第一条消息
        const greetingMsg = {
          id: generateId(),
          role: 'assistant',
          content: this.data.greeting,
          name: character.name,
          timestamp: Date.now(),
          _time: formatTime(new Date()),
          _showAvatar: true
        };
        this.setData({ messages: [greetingMsg] });
      }
    } catch (e) {
      console.warn('加载聊天历史失败:', e.message || e);
      wx.showToast({ title: '加载聊天记录失败', icon: 'none', duration: 2000 });
    }
  },

  /** 加载指定索引的聊天会话 */
  async _loadChatSession(index) {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character || !character.avatar) return;

    const chats = this._chatSessions;
    if (index >= chats.length) {
      wx.showToast({ title: '没有更早的记录了', icon: 'none' });
      return;
    }

    const chat = chats[index];
    const fileName = chat.file_name || '';
    if (!fileName) return;

    const avatarUrl = stripPngSuffix(character.avatar);
    const rawMessages = await st.getChatMessages(avatarUrl, fileName);

    const messages = rawMessages.map(m => ({
      id: generateId(),
      role: m.role,
      content: m.content,
      name: m.name || '',
      timestamp: m.timestamp,
      _time: formatTime(new Date(m.timestamp)),
      _showAvatar: m.role === 'assistant'
    }));

    const sessionLabel = chats.length > 1
      ? ` (${index + 1}/${chats.length})`
      : '';

    this.setData({
      messages,
      currentChatFile: fileName,
      [`characterName`]: (character.name || '') + sessionLabel
    });
    this._scrollToBottom();
  },

  /** 下拉刷新：加载上一条（更早的）聊天记录 */
  async onPullRefresh() {
    if (this.data.isRefreshing) return;
    this.setData({ isRefreshing: true });

    try {
      const nextIndex = this._chatSessionIndex + 1;
      if (nextIndex < this._chatSessions.length) {
        this._chatSessionIndex = nextIndex;
        await this._loadChatSession(nextIndex);
        wx.showToast({ title: `已加载第 ${nextIndex + 1} 条记录`, icon: 'none', duration: 1500 });
      } else {
        // 没有更多记录，重新拉取列表
        const g = app.globalData;
        const character = g.currentCharacter;
        if (character && character.avatar) {
          const avatarUrl = stripPngSuffix(character.avatar);
          const chats = await st.getChatList(avatarUrl);
          this._chatSessions = chats;

          if (nextIndex < chats.length) {
            this._chatSessionIndex = nextIndex;
            await this._loadChatSession(nextIndex);
          } else {
            wx.showToast({ title: '已是最新的记录', icon: 'none' });
          }
        }
      }
    } catch (e) {
      console.warn('刷新聊天记录失败:', e.message || e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ isRefreshing: false });
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
    // 先用 scroll-into-view 快速定位，再用 scroll-top 精确补偿
    this.setData({ scrollToId: 'msg-bottom' });
    // 延迟后用 scroll-top 精确滚动到底部（补偿 scroll-into-view 可能的偏差）
    setTimeout(() => {
      this.setData({ scrollToId: '' });
      const query = wx.createSelectorQuery();
      query.select('.message-list').boundingClientRect();
      query.select('#msg-bottom').boundingClientRect();
      query.exec((res) => {
        if (res[0] && res[1]) {
          const listHeight = res[0].height;
          const bottomTop = res[1].top;
          if (bottomTop > listHeight) {
            this.setData({ scrollTop: bottomTop - listHeight + 100 });
          }
        }
      });
    }, 150);
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
