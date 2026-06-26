/**
 * 聊天页面逻辑
 * 对应 Flutter chat_screen.dart
 */

const app = getApp();
const st = require('../../services/sillytavern');
const directApi = require('../../services/direct_api');
const { formatTime, generateId, stripPngSuffix } = require('../../utils/util');
const { markdownToWxml, parseContentBlocks, extractImageUrls } = require('../../utils/markdown');
const tts = require('../../services/tts');

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
    inputFocused: true,

    // AI 模式
    useDirectApi: false,
    directApiTypeName: '',

    // 角色信息弹窗
    showCharInfo: false,

    // 消息长按菜单
    showMsgMenu: false,
    menuMessageId: '',
    menuMessageContent: '',
    menuMessageRole: '',

    // TTS 播放状态
    isTtsPlaying: false,
    ttsPlayingMsgId: '',

    // @提及面板
    showMentionPanel: false,

    // 下拉刷新
    isRefreshing: false,

    // 流式状态
    isStreaming: false,

    // 群聊
    isGroupChat: false,
    groupMembers: [],
    groupRespondIndex: 0, // 当前轮到回复的角色索引（轮流模式）
    showGroupPanel: false,

    // 消息编辑
    editingMessageId: null,
    editingText: '',

    // 聊天文件名（保存用）
    currentChatFile: null,

    // 已加载的聊天会话索引
    _chatSessionIndex: 0,
    _chatSessions: []
  },

  // 流式文本累积器
  _streamText: '',
  _streamAbort: null,
  // Markdown 渲染缓存
  _mdCache: {},

  /** 渲染消息的 Markdown 内容为 WXML */
  _renderMessage(content, role) {
    if (!content || role === 'user') return null; // 用户消息不渲染 Markdown
    if (this._mdCache[content]) return this._mdCache[content];
    const wxml = markdownToWxml(content);
    this._mdCache[content] = wxml;
    return wxml;
  },

  /** 解析消息为内容块（文字+图片混合） */
  _parseBlocks(content, role) {
    if (!content) return [];
    // 用户消息不解析图片
    if (role === 'user') return [{ type: 'text', content }];
    return parseContentBlocks(content);
  },

  /** 为消息添加渲染数据 (_mdWxml + _blocks) */
  _enrichMessage(msg) {
    if (msg.role === 'assistant' && msg.content) {
      const blocks = this._parseBlocks(msg.content, msg.role);
      msg._blocks = blocks.map(b => {
        if (b.type === 'text') {
          return { type: 'text', _wxml: this._renderMessage(b.content, 'assistant') || b.content };
        }
        return b;
      });
      msg._mdWxml = this._renderMessage(msg.content, msg.role);

      // 群聊模式：设置消息对应的头像
      if (this.data.isGroupChat && msg.name) {
        const member = this.data.groupMembers.find(m => m.name === msg.name);
        if (member) {
          msg._avatarPath = member._avatarPath || '';
          msg._avatarLetter = member._avatarLetter || msg.name[0];
        } else {
          msg._avatarLetter = msg.name[0];
        }
      }
    }
    return msg;
  },

  /** 预览图片 */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    // 收集当前消息中所有图片 URL 作为预览列表
    const msgId = e.currentTarget.dataset.msgId;
    const msg = this.data.messages.find(m => m.id === msgId);
    const urls = msg ? extractImageUrls(msg.content) : [url];
    wx.previewImage({ current: url, urls: urls.length > 0 ? urls : [url] });
  },

  onLoad() {
    const g = app.globalData;
    const char = g.currentCharacter;
    if (!char) return;

    // 群聊模式初始化
    const isGroup = !!g.isGroupChat && Array.isArray(g.groupMembers) && g.groupMembers.length > 1;
    const groupMembers = isGroup ? g.groupMembers : [];

    this.setData({
      characterName: char.name || '未知角色',
      characterAvatarUrl: '',
      characterDescription: char.description || '',
      characterPersonality: char.personality || '',
      characterScenario: char.scenario || '',
      greeting: char.greeting || char.first_mes || '',
      useDirectApi: g.directApi.enabled,
      directApiTypeName: g.directApi.enabled ? this._getTypeName(g.directApi.type) : '',
      isGroupChat: isGroup,
      groupMembers: groupMembers.map(m => ({
        name: m.name,
        avatar: m.avatar,
        personality: m.personality || '',
        _avatarPath: '',
        _avatarLetter: (m.name || '?')[0]
      }))
    });

    // 异步下载头像到本地
    if (char.avatar) {
      st.downloadAvatar(char.avatar).then(localPath => {
        this.setData({ characterAvatarUrl: localPath });
      }).catch(() => {});
    }

    // 群聊模式：下载所有成员头像
    if (isGroup) {
      groupMembers.forEach((m, i) => {
        if (m.avatar) {
          st.downloadAvatar(m.avatar).then(localPath => {
            this.setData({ [`groupMembers[${i}]._avatarPath`]: localPath });
          }).catch(() => {});
        }
      });
    }

    // 加载聊天历史
    this._loadChatHistory();
  },

  onUnload() {
    // 中止进行中的流式请求
    if (this._streamAbort) {
      this._streamAbort();
      this._streamAbort = null;
    }
    // 返回时清除当前角色
    app.globalData.currentCharacter = null;
    // 清除群聊状态
    app.globalData.isGroupChat = false;
    app.globalData.groupMembers = null;
  },

  onHide() {
    // 页面隐藏时不中止流式，允许后台继续
  },

  // === 输入 ===

  onInput(e) {
    const text = e.detail.value;
    this.setData({
      inputText: text,
      canSend: text.trim().length > 0 && !this.data.isSending
    });
  },

  onInputBlur() {
    this.setData({ inputFocused: false });
  },

  // === 发送消息 ===

  async onSend() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isSending) return;

    // 网络检查
    if (!app.isNetworkAvailable()) {
      wx.showToast({ title: '网络已断开，请检查连接', icon: 'none' });
      return;
    }

    // 触觉反馈
    wx.vibrateShort({ type: 'medium' });

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
    // 先清空文字，再立即恢复焦点，保持键盘打开
    this.setData({
      messages,
      inputText: '',
      canSend: false,
      isSending: true,
      isStreaming: true,
      scrollToId: '',
      inputFocused: false
    });
    // 下一帧重新聚焦，保持键盘不收起
    setTimeout(() => {
      this.setData({ inputFocused: true });
    }, 50);
    this._scrollToBottom();

    await this._generateReply(messages, character);
  },

  /** 确定群聊中哪个角色回复 */
  _getGroupResponder(userText) {
    const members = this.data.groupMembers;
    if (!members || members.length === 0) return null;

    // 检查是否有 @提及
    const mentionMatch = userText.match(/@(\S+)/);
    if (mentionMatch) {
      const mentionName = mentionMatch[1];
      const idx = members.findIndex(m =>
        m.name === mentionName || m.name.startsWith(mentionName)
      );
      if (idx >= 0) return members[idx];
    }

    // 轮流模式
    const idx = this.data.groupRespondIndex % members.length;
    this.setData({ groupRespondIndex: idx + 1 });
    return members[idx];
  },

  /**
   * 核心生成逻辑（流式），被 onSend 和 onRegenerate 共用
   */
  async _generateReply(messages, character) {
    const g = app.globalData;
    const history = messages.slice(0, -1);
    const lastUserMsg = messages[messages.length - 1];

    // 群聊模式：确定回复角色
    let responder = character;
    if (this.data.isGroupChat) {
      responder = this._getGroupResponder(lastUserMsg.content) || character;
    }

    // 先添加一个空的 assistant 消息作为流式占位
    const streamingMsgId = generateId();
    const streamingMsg = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      name: responder.name,
      timestamp: Date.now(),
      _time: formatTime(new Date()),
      _showAvatar: true,
      _isStreaming: true
    };

    const messagesWithPlaceholder = [...messages, streamingMsg];
    this.setData({ messages: messagesWithPlaceholder });
    this._scrollToBottom();

    // 流式回调：逐步更新消息内容
    let chunkBuffer = '';
    let updateTimer = null;
    const updateStreamingText = () => {
      if (!chunkBuffer) return;
      const idx = this.data.messages.findIndex(m => m.id === streamingMsgId);
      if (idx >= 0) {
        this.setData({
          [`messages[${idx}].content`]: this._streamText
        });
        this._scrollToBottom();
      }
      chunkBuffer = '';
    };

    const onChunk = (delta, full) => {
      this._streamText = full;
      chunkBuffer += delta;
      // 节流：每 100ms 更新一次 UI，避免 setData 过于频繁
      if (!updateTimer) {
        updateTimer = setTimeout(() => {
          updateStreamingText();
          updateTimer = null;
        }, 100);
      }
    };

    this._streamText = '';

    try {
      let reply;

      if (this.data.useDirectApi && g.directApi.enabled) {
        // 直连模式流式
        const systemPrompt = directApi.buildCharacterPrompt(responder);
        reply = await directApi.sendMessageStream(
          g.directApi,
          history,
          lastUserMsg.content,
          systemPrompt,
          onChunk
        );
      } else if (g.serverUrl) {
        // SillyTavern 后端流式
        reply = await st.sendMessageStream(
          history,
          lastUserMsg.content,
          responder,
          onChunk
        );
      } else {
        throw new Error('未配置任何 AI 后端');
      }

      // 流式结束，刷新最后一帧确保完整
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      updateStreamingText();

      // 标记流式结束
      const finalIdx = this.data.messages.findIndex(m => m.id === streamingMsgId);
      if (finalIdx >= 0) {
        const finalContent = reply || this._streamText || '（无回复）';
        const enriched = this._enrichMessage({ content: finalContent, role: 'assistant' });
        this.setData({
          [`messages[${finalIdx}].content`]: finalContent,
          [`messages[${finalIdx}]._isStreaming`]: false,
          [`messages[${finalIdx}]._mdWxml`]: enriched._mdWxml,
          [`messages[${finalIdx}]._blocks`]: enriched._blocks
        });
      }

      // 自动保存聊天
      const finalMessages = this.data.messages.map(m =>
        m.id === streamingMsgId ? { ...m, content: reply || this._streamText || '（无回复）', _isStreaming: false } : m
      );
      if (this.data.useDirectApi) {
        this._saveLocalChat(finalMessages);
      } else {
        this._saveCurrentChat(finalMessages);
      }
    } catch (err) {
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      // 流式失败：如果有部分文本，保留；否则显示错误
      const errIdx = this.data.messages.findIndex(m => m.id === streamingMsgId);
      if (errIdx >= 0) {
        if (this._streamText) {
          // 有部分内容，保留并标记错误
          this.setData({
            [`messages[${errIdx}].content`]: this._streamText + `\n\n⚠️ 生成中断: ${err.message}`,
            [`messages[${errIdx}]._isStreaming`]: false
          });
        } else {
          // 完全无内容，替换成错误消息
          const errMsg = {
            id: streamingMsgId,
            role: 'system',
            content: `⚠️ 回复失败: ${err.message}`,
            timestamp: Date.now(),
            _time: formatTime(new Date())
          };
          const updated = [...this.data.messages];
          updated[errIdx] = errMsg;
          this.setData({ messages: updated });
        }
      }
    } finally {
      this.setData({ isSending: false, isStreaming: false });
      this._streamText = '';
      this._streamAbort = null;
      this._scrollToBottom();
    }
  },

  // === 停止生成 ===

  onStopStreaming() {
    wx.vibrateShort({ type: 'medium' });
    if (this._streamAbort) {
      this._streamAbort();
    }
    this.setData({ isSending: false, isStreaming: false });
  },

  // === 重新生成 ===

  async onRegenerate() {
    if (this.data.isSending) return;
    wx.vibrateShort({ type: 'light' });

    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character) return;

    const messages = this.data.messages;
    if (messages.length === 0) return;

    // 找到最后一条 assistant 消息并删除
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }

    if (lastAssistantIdx < 0) return;

    // 保留到最后一条 user 消息之前（包含 user 消息）
    const trimmed = messages.slice(0, lastAssistantIdx);
    // 找到最后一条 user 消息
    let lastUserIdx = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    if (lastUserIdx < 0) return;

    const newMessages = trimmed.slice(0, lastUserIdx + 1);
    this.setData({
      messages: newMessages,
      isSending: true,
      isStreaming: true
    });

    await this._generateReply(newMessages, character);
  },

  // === 编辑消息 ===

  onStartEdit(e) {
    const { id, content } = e.currentTarget.dataset;
    this.setData({
      editingMessageId: id,
      editingText: content
    });
  },

  onEditInput(e) {
    this.setData({ editingText: e.detail.value });
  },

  onCancelEdit() {
    this.setData({ editingMessageId: null, editingText: '' });
  },

  async onSaveEdit() {
    const { editingMessageId, editingText } = this.data;
    if (!editingMessageId) return;
    wx.vibrateShort({ type: 'light' });

    const newText = editingText.trim();
    if (!newText) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }

    const idx = this.data.messages.findIndex(m => m.id === editingMessageId);
    if (idx < 0) return;

    const msg = this.data.messages[idx];

    if (msg.role === 'user') {
      // 编辑用户消息：更新内容，删除后续所有消息，重新生成
      const newMessages = this.data.messages.slice(0, idx);
      newMessages.push({
        ...msg,
        content: newText,
        timestamp: Date.now(),
        _time: formatTime(new Date())
      });

      this.setData({
        messages: newMessages,
        editingMessageId: null,
        editingText: '',
        isSending: true,
        isStreaming: true
      });

      const g = app.globalData;
      const character = g.currentCharacter;
      if (character) {
        await this._generateReply(newMessages, character);
      }
    } else if (msg.role === 'assistant') {
      // 编辑助手消息：只更新内容，不触发重新生成
      const enriched = this._enrichMessage({ content: newText, role: 'assistant' });
      this.setData({
        [`messages[${idx}].content`]: newText,
        [`messages[${idx}]._mdWxml`]: enriched._mdWxml,
        [`messages[${idx}]._blocks`]: enriched._blocks,
        editingMessageId: null,
        editingText: ''
      });
      // 直连模式：编辑后保存到本地
      if (this.data.useDirectApi) {
        this._saveLocalChat(this.data.messages);
      }
    }
  },

  // === 删除单条消息 ===

  // === 消息长按菜单 ===

  onLongPressMessage(e) {
    const { id, content, role } = e.currentTarget.dataset;
    wx.vibrateShort({ type: 'heavy' });
    this.setData({
      showMsgMenu: true,
      menuMessageId: id,
      menuMessageContent: content,
      menuMessageRole: role
    });
  },

  hideMsgMenu() {
    this.setData({ showMsgMenu: false, menuMessageId: '', menuMessageContent: '', menuMessageRole: '' });
  },

  onMenuEdit() {
    const { menuMessageId, menuMessageContent } = this.data;
    this.hideMsgMenu();
    wx.vibrateShort({ type: 'light' });
    this.setData({
      editingMessageId: menuMessageId,
      editingText: menuMessageContent
    });
  },

  onMenuCopy() {
    const { menuMessageContent } = this.data;
    this.hideMsgMenu();
    wx.vibrateShort({ type: 'light' });
    wx.setClipboardData({
      data: menuMessageContent,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1500 });
      }
    });
  },

  onMenuDelete() {
    const { menuMessageId } = this.data;
    this.hideMsgMenu();
    wx.vibrateShort({ type: 'medium' });
    if (!menuMessageId) return;

    const idx = this.data.messages.findIndex(m => m.id === menuMessageId);
    if (idx >= 0) {
      const updated = [...this.data.messages];
      updated.splice(idx, 1);
      this.setData({ messages: updated });
      if (this.data.useDirectApi) {
        this._saveLocalChat(updated);
      }
    }
  },

  // === TTS 朗读 ===

  async onMenuReadAloud() {
    const { menuMessageId, menuMessageContent } = this.data;
    this.hideMsgMenu();
    if (!menuMessageContent) return;
    wx.vibrateShort({ type: 'light' });

    // 如果正在播放同一条，停止
    if (this.data.isTtsPlaying && this.data.ttsPlayingMsgId === menuMessageId) {
      tts.stopAudio();
      this.setData({ isTtsPlaying: false, ttsPlayingMsgId: '' });
      return;
    }

    this.setData({ isTtsPlaying: true, ttsPlayingMsgId: menuMessageId });
    wx.showLoading({ title: '正在合成语音...' });

    try {
      let textToSpeak = menuMessageContent;

      // 可选：AI 情感分析
      const ttsConfig = tts.getTtsConfig();
      if (ttsConfig.enableEmotion) {
        wx.showLoading({ title: 'AI 分析情感中...' });
        const emotionResult = await tts.analyzeEmotion(menuMessageContent);
        textToSpeak = emotionResult.text;
        console.log('[TTS] 情感:', emotionResult.emotion);
      }

      wx.showLoading({ title: '合成语音中...' });
      const filePath = await tts.synthesize(textToSpeak);
      wx.hideLoading();

      tts.playAudio(filePath, (err) => {
        this.setData({ isTtsPlaying: false, ttsPlayingMsgId: '' });
        if (err) {
          wx.showToast({ title: '播放失败', icon: 'none' });
        }
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ isTtsPlaying: false, ttsPlayingMsgId: '' });
      wx.showToast({ title: '朗读失败: ' + e.message, icon: 'none' });
    }
  },

  onStopTts() {
    tts.stopAudio();
    this.setData({ isTtsPlaying: false, ttsPlayingMsgId: '' });
  },

  // === 聊天历史 ===

  async _loadChatHistory() {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character) return;

    // 直连模式：从本地存储加载
    if (this.data.useDirectApi && g.directApi.enabled) {
      this._loadLocalChat(character);
      return;
    }

    // 服务端模式：从 SillyTavern 加载
    if (!character.avatar) return;

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
        const greetingMsg = this._enrichMessage({
          id: generateId(),
          role: 'assistant',
          content: this.data.greeting,
          name: character.name,
          timestamp: Date.now(),
          _time: formatTime(new Date()),
          _showAvatar: true
        });
        this.setData({ messages: [greetingMsg] });
      }
    } catch (e) {
      console.warn('加载聊天历史失败:', e.message || e);
      wx.showToast({ title: '加载聊天记录失败', icon: 'none', duration: 2000 });
    }
  },

  /** 从本地存储加载直连模式聊天记录 */
  _loadLocalChat(character) {
    const key = `direct_chat_${character.name || character.avatar || 'unknown'}`;
    const saved = wx.getStorageSync(key);

    if (saved && Array.isArray(saved) && saved.length > 0) {
      const messages = saved.map(m => {
        const enriched = this._enrichMessage({
          ...m,
          _time: formatTime(new Date(m.timestamp))
        });
        return enriched;
      });
      this.setData({ messages });
      this._scrollToBottom();
    } else if (this.data.greeting) {
      const greetingMsg = this._enrichMessage({
        id: generateId(),
        role: 'assistant',
        content: this.data.greeting,
        name: character.name,
        timestamp: Date.now(),
        _time: formatTime(new Date()),
        _showAvatar: true
      });
      this.setData({ messages: [greetingMsg] });
    }
  },

  /** 保存直连模式聊天记录到本地 */
  _saveLocalChat(messages) {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character) return;

    const key = `direct_chat_${character.name || character.avatar || 'unknown'}`;
    // 只保存必要字段，不保存 UI 状态
    const toSave = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        name: m.name || '',
        timestamp: m.timestamp
      }));

    try {
      wx.setStorageSync(key, toSave);
    } catch (e) {
      console.warn('保存本地聊天失败:', e.message);
    }
  },

  /** 加载指定索引的聊天会话 */
  async _loadChatSession(index) {
    const g = app.globalData;
    const character = g.currentCharacter;
    if (!character || !character.avatar) return;

    // 切换会话时清空 Markdown 缓存
    this._mdCache = {};

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

    const messages = rawMessages.map(m => this._enrichMessage({
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

  onToggleGroupPanel() {
    this.setData({ showGroupPanel: !this.data.showGroupPanel });
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
