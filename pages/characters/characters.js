/**
 * 角色列表页面逻辑
 * 对应 Flutter character_list_screen.dart
 * 
 * 头像通过 wx.request 下载到本地临时文件后显示
 */

const app = getApp();
const st = require('../../services/sillytavern');

Page({
  data: {
    characters: [],
    filteredChars: [],
    searchQuery: '',
    isLoading: false,
    isRefreshing: false,
    isConnected: true,
    serverUrl: '',

    // 设置弹窗
    showSettings: false,
    useDirectApi: false,
    directApiTypeName: '',

    // 角色操作弹窗
    showCharMenu: false,
    selectedCharForMenu: null,

    // 群聊选择模式
    isGroupSelectMode: false,
    groupSelected: {}, // { name: true } 记录选中状态
    groupSelectedCount: 0
  },

  // 本地头像缓存 { avatarUrl: localPath }
  _avatarCache: {},

  /** 从持久化缓存加载头像路径映射 */
  _loadAvatarCache() {
    try {
      const cached = wx.getStorageSync('avatar_cache');
      if (cached && typeof cached === 'object') {
        // 验证缓存的文件是否仍然存在
        const fs = wx.getFileSystemManager();
        const valid = {};
        for (const key in cached) {
          try {
            fs.accessSync(cached[key]);
            valid[key] = cached[key];
          } catch (e) {
            // 文件已失效，跳过
          }
        }
        this._avatarCache = valid;
      }
    } catch (e) {
      this._avatarCache = {};
    }
  },

  /** 持久化头像缓存 */
  _saveAvatarCache() {
    try {
      wx.setStorageSync('avatar_cache', this._avatarCache);
    } catch (e) { /* ignore */ }
  },

  onLoad() {
    this._loadAvatarCache();
    this._loadData();
  },

  onShow() {
    this._checkConnection();
  },

  onPullDownRefresh() {
    this._loadCharacters().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // === 数据加载 ===

  async _loadData() {
    const g = app.globalData;
    this.setData({
      serverUrl: g.serverUrl,
      useDirectApi: g.directApi.enabled,
      directApiTypeName: g.directApi.enabled ? this._getTypeName(g.directApi.type) : ''
    });

    if (g.characters.length > 0) {
      this._setCharacters(g.characters);
    } else {
      await this._loadCharacters();
    }
  },

  async _checkConnection() {
    try {
      const ok = await st.checkConnection();
      this.setData({ isConnected: ok });
    } catch (e) {
      this.setData({ isConnected: false });
    }
  },

  async _loadCharacters() {
    this.setData({ isLoading: true });

    try {
      const chars = await st.getCharacters();
      app.globalData.characters = chars;
      this._setCharacters(chars);
      this.setData({ isConnected: true });
    } catch (err) {
      this.setData({ characters: [], filteredChars: [], isConnected: false });
      wx.showToast({ title: '加载角色失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false, isRefreshing: false });
    }
  },

  _setCharacters(chars) {
    const enriched = chars.map((c, i) => ({
      ...c,
      _avatarUrl: '', // 先置空，异步下载
      _avatarPath: '', // 本地临时文件路径
      _summary: c.description || c.personality || '暂无简介',
      _avatarFailed: false,
      _index: i
    }));
    this.setData({ characters: enriched, filteredChars: enriched });
    this._applyFilter();

    // 异步下载所有头像
    this._loadAllAvatars(enriched);
  },

  /** 批量下载头像（带并发控制） */
  async _loadAllAvatars(chars) {
    const CONCURRENCY = 3; // 同时最多 3 个下载
    let running = 0;
    let index = 0;

    return new Promise((resolve) => {
      const next = () => {
        while (running < CONCURRENCY && index < chars.length) {
          const i = index++;
          const c = chars[i];
          if (!c.avatar) {
            continue;
          }

          running++;
          this._downloadSingleAvatar(c, i).finally(() => {
            running--;
            if (index >= chars.length && running === 0) {
              resolve();
            } else {
              next();
            }
          });
        }
        // 所有角色都没有头像，或已全部启动下载
        if (running === 0) resolve();
      };
      next();
    });
  },

  /** 下载单个角色头像 */
  async _downloadSingleAvatar(character, dataIndex) {
    const avatarKey = character.avatar;

    // 检查内存缓存
    if (this._avatarCache[avatarKey]) {
      this.setData({ [`characters[${dataIndex}]._avatarPath`]: this._avatarCache[avatarKey] });
      this._updateFilteredChar(dataIndex, '_avatarPath', this._avatarCache[avatarKey]);
      return;
    }

    try {
      const localPath = await st.downloadAvatar(avatarKey);
      this._avatarCache[avatarKey] = localPath;

      this.setData({ [`characters[${dataIndex}]._avatarPath`]: localPath });
      this._updateFilteredChar(dataIndex, '_avatarPath', localPath);

      // 持久化缓存（每下载一个就存一次，批量下载时只在最后一个存）
      this._saveAvatarCache();
    } catch (e) {
      this.setData({ [`characters[${dataIndex}]._avatarFailed`]: true });
      this._updateFilteredChar(dataIndex, '_avatarFailed', true);
    }
  },

  /** 更新 filteredChars 中对应项 */
  _updateFilteredChar(dataIndex, key, value) {
    const filteredIndex = this.data.filteredChars.findIndex(c => c._index === dataIndex);
    if (filteredIndex >= 0) {
      this.setData({ [`filteredChars[${filteredIndex}].${key}`]: value });
    }
  },

  // === 搜索 ===

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    this._applyFilter();
  },

  clearSearch() {
    this.setData({ searchQuery: '' });
    this._applyFilter();
  },

  _applyFilter() {
    const query = this.data.searchQuery.toLowerCase();
    const chars = this.data.characters;
    if (!query) {
      this.setData({ filteredChars: chars });
    } else {
      this.setData({
        filteredChars: chars.filter(c =>
          c.name.toLowerCase().includes(query) ||
          (c._summary || '').toLowerCase().includes(query)
        )
      });
    }
  },

  // === 角色操作 ===

  onTapCharacter(e) {
    const index = e.currentTarget.dataset.index;
    const character = this.data.filteredChars[index];
    if (!character) return;

    // 群聊选择模式：切换选中状态
    if (this.data.isGroupSelectMode) {
      wx.vibrateShort({ type: 'light' });
      const key = `groupSelected.${character.name}`;
      const current = this.data.groupSelected[character.name];
      const newVal = !current;
      const updated = { ...this.data.groupSelected };
      if (newVal) { updated[character.name] = true; } else { delete updated[character.name]; }
      this.setData({ [key]: newVal, groupSelectedCount: Object.keys(updated).length });
      return;
    }

    app.globalData.currentCharacter = character;
    app.globalData.messages = [];

    wx.navigateTo({ url: '/pages/chat/chat' });
  },

  // === 群聊 ===

  onToggleGroupSelect() {
    wx.vibrateShort({ type: 'medium' });
    if (this.data.isGroupSelectMode) {
      this.setData({ isGroupSelectMode: false, groupSelected: {}, groupSelectedCount: 0 });
    } else {
      this.setData({ isGroupSelectMode: true, groupSelected: {}, groupSelectedCount: 0 });
    }
  },

  onStartGroupChat() {
    const selected = this.data.groupSelected;
    const members = this.data.characters.filter(c => selected[c.name]);

    if (members.length < 2) {
      wx.showToast({ title: '请至少选择 2 个角色', icon: 'none' });
      return;
    }

    wx.vibrateShort({ type: 'heavy' });

    // 第一个选中的作为主角色
    app.globalData.currentCharacter = members[0];
    app.globalData.groupMembers = members;
    app.globalData.isGroupChat = true;
    app.globalData.messages = [];

    this.setData({ isGroupSelectMode: false, groupSelected: {}, groupSelectedCount: 0 });
    wx.navigateTo({ url: '/pages/chat/chat' });
  },

  onLongPressCharacter(e) {
    const char = e.currentTarget.dataset.char;
    this.setData({
      showCharMenu: true,
      selectedCharForMenu: char
    });
  },

  hideCharMenu() {
    this.setData({ showCharMenu: false, selectedCharForMenu: null });
  },

  onEditCharacter() {
    const char = this.data.selectedCharForMenu;
    this.hideCharMenu();
    if (char) {
      wx.navigateTo({
        url: `/pages/create-character/create-character?mode=edit&name=${encodeURIComponent(char.name)}`
      });
    }
  },

  onDeleteCharacter() {
    const char = this.data.selectedCharForMenu;
    this.hideCharMenu();
    if (!char) return;

    wx.showModal({
      title: '删除角色',
      content: `确定要删除「${char.name}」吗？此操作不可撤销。`,
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          try {
            await st.deleteCharacter(char.avatar || '');
            wx.showToast({ title: '已删除', icon: 'success' });
            await this._loadCharacters();
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  async onExportCharacter() {
    const char = this.data.selectedCharForMenu;
    this.hideCharMenu();
    if (!char) return;

    wx.showLoading({ title: '导出中...' });
    try {
      const filePath = await st.exportCharacterAsPng(char);
      wx.hideLoading();

      // 分享文件
      wx.shareFileMessage({
        filePath,
        fileName: `${char.name}_角色卡.png`,
        success() {
          wx.showToast({ title: '导出成功', icon: 'success' });
        },
        fail(err) {
          // 分享被取消或失败，保留文件
          wx.showToast({ title: '已保存到本地', icon: 'none' });
        }
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '导出失败: ' + err.message, icon: 'none' });
    }
  },

  onAvatarError(e) {
    const index = e.currentTarget.dataset.index;
    const key = `filteredChars[${index}]._avatarFailed`;
    this.setData({ [key]: true });
  },

  // === 刷新 ===

  async onRefresh() {
    this.setData({ isRefreshing: true });
    this._avatarCache = {}; // 清空内存缓存
    this._saveAvatarCache(); // 清空持久化缓存
    await this._loadCharacters();
  },

  // === 导航 ===

  onImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/create-character/create-character' });
  },

  // === 设置弹窗 ===

  onShowSettings() {
    const g = app.globalData;
    this.setData({
      showSettings: true,
      useDirectApi: g.directApi.enabled,
      directApiTypeName: g.directApi.enabled ? this._getTypeName(g.directApi.type) : ''
    });
  },

  hideSettings() {
    this.setData({ showSettings: false });
  },

  async onReconnect() {
    this.hideSettings();
    wx.showLoading({ title: '重新连接...' });
    try {
      const ok = await st.checkConnection();
      if (ok) {
        this._avatarCache = {};
        await this._loadCharacters();
        wx.showToast({ title: '连接成功', icon: 'success' });
      } else {
        wx.showToast({ title: '连接失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '连接失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onOpenApiSettings() {
    this.hideSettings();
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  onSwitchAccount() {
    this.hideSettings();
    st.logout().finally(() => {
      wx.redirectTo({ url: '/pages/login/login' });
    });
  },

  onChangeServer() {
    this.hideSettings();
    app.clearSession();
    wx.redirectTo({ url: '/pages/login/login' });
  },

  // === 工具 ===

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
