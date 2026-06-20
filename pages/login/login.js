/**
 * 登录页面逻辑
 * 对应 Flutter login_screen.dart
 */

const app = getApp();
const st = require('../../services/sillytavern');
const api = require('../../utils/api');

// 用户头像颜色池
const COLORS = [
  '#6C5CE7', '#00b894', '#e17055', '#0984e3',
  '#fdcb6e', '#e84393', '#00cec9', '#d63031'
];

Page({
  data: {
    // 步骤控制
    showUserList: false,
    selectedUser: null,

    // 服务器连接
    serverUrl: '',
    isConnecting: false,
    urlError: '',

    // 用户列表
    users: [],
    isLoadingUsers: false,

    // 登录
    loginPassword: '',
    showPassword: false,
    isLoggingIn: false,

    // 错误
    errorMsg: ''
  },

  onLoad() {
    const savedUrl = wx.getStorageSync('server_url') || '';
    this.setData({ serverUrl: savedUrl });
  },

  // === 输入事件 ===

  onServerUrlInput(e) {
    this.setData({ serverUrl: e.detail.value, urlError: '' });
  },

  onPasswordInput(e) {
    this.setData({ loginPassword: e.detail.value });
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  clearError() {
    this.setData({ errorMsg: '' });
  },

  // === 连接服务器 ===

  async onConnect() {
    const url = this.data.serverUrl.trim();
    if (!url) {
      this.setData({ urlError: '请输入服务器地址' });
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.setData({ urlError: '地址格式：http(s)://ip:端口' });
      return;
    }

    this.setData({ isConnecting: true, urlError: '' });

    try {
      // 保存地址
      app.saveServerUrl(url);

      // 初始化会话（获取 CSRF token）
      const ok = await api.initSession();
      if (!ok) {
        throw new Error('无法连接到服务器，请检查地址是否正确');
      }

      // 加载用户列表
      await this._loadUsers();
      this.setData({ showUserList: true });
    } catch (err) {
      this.setData({ errorMsg: err.message || '连接失败' });
    } finally {
      this.setData({ isConnecting: false });
    }
  },

  // === 用户列表 ===

  async _loadUsers() {
    this.setData({ isLoadingUsers: true, selectedUser: null, loginPassword: '' });

    try {
      const users = await st.getUserList();
      // 为每个用户分配颜色和首字母
      const enrichedUsers = (users || []).map((u, i) => ({
        ...u,
        _color: COLORS[i % COLORS.length],
        _initial: (u.name || '?')[0].toUpperCase()
      }));
      this.setData({ users: enrichedUsers });
    } catch (err) {
      this.setData({ users: [], errorMsg: '获取用户列表失败: ' + err.message });
    } finally {
      this.setData({ isLoadingUsers: false });
    }
  },

  async onRefreshUsers() {
    await this._loadUsers();
  },

  onSelectUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user.password) {
      // 无密码直接登录
      this._loginAs(user.handle, '');
      return;
    }
    this.setData({ selectedUser: user, loginPassword: '' });
  },

  onBackToUsers() {
    this.setData({ selectedUser: null, loginPassword: '' });
  },

  onDisconnect() {
    app.clearSession();
    this.setData({
      showUserList: false,
      selectedUser: null,
      users: [],
      loginPassword: ''
    });
  },

  // === 登录 ===

  async onLogin() {
    if (!this.data.selectedUser) return;

    const user = this.data.selectedUser;
    const password = this.data.loginPassword;

    if (user.password && !password) {
      this.setData({ errorMsg: '请输入密码' });
      return;
    }

    await this._loginAs(user.handle, password);
  },

  async _loginAs(handle, password) {
    this.setData({ isLoggingIn: true });

    try {
      await st.login(handle, password);

      // 登录成功，加载角色列表
      wx.showLoading({ title: '加载角色...' });
      const characters = await st.getCharacters();
      app.globalData.characters = characters;
      wx.hideLoading();

      // 跳转到角色列表
      wx.redirectTo({ url: '/pages/characters/characters' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ errorMsg: err.message || '登录失败' });
    } finally {
      this.setData({ isLoggingIn: false });
    }
  },

  // === 显示错误 ===

  _showError(msg) {
    this.setData({ errorMsg: msg });
    setTimeout(() => this.setData({ errorMsg: '' }), 4000);
  }
});
