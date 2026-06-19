/**
 * 导入角色页面逻辑
 * 对应 Flutter import_screen.dart
 * 
 * 微信小程序限制：
 * - 无法直接访问文件系统
 * - 使用 wx.chooseMessageFile 从聊天记录选文件
 * - 使用 wx.chooseMedia 从相册选图片
 */

const app = getApp();
const st = require('../../services/sillytavern');

Page({
  data: {
    importUrl: '',
    isImporting: false,
    statusMessage: '',
    isSuccess: false
  },

  onUrlInput(e) {
    this.setData({ importUrl: e.detail.value });
  },

  // === 从文件导入 ===

  onPickFile() {
    wx.showActionSheet({
      itemList: ['从相册选择 PNG 角色卡', '从聊天记录选择文件'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._pickFromAlbum();
        } else {
          this._pickFromChat();
        }
      }
    });
  },

  /** 从相册选择 PNG */
  _pickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const file = res.tempFiles[0];
        const fileName = 'character.png';
        this._doImportFile(file.tempFilePath, fileName);
      }
    });
  },

  /** 从聊天记录选择文件 */
  _pickFromChat() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['png', 'json'],
      success: (res) => {
        const file = res.tempFiles[0];
        this._doImportFile(file.path, file.name);
      }
    });
  },

  // === 从链接导入 ===

  async onImportFromUrl() {
    const url = this.data.importUrl.trim();
    if (!url) {
      wx.showToast({ title: '请输入链接', icon: 'none' });
      return;
    }

    this.setData({ isImporting: true, statusMessage: '', isSuccess: false });

    try {
      // 下载文件
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url,
          success: resolve,
          fail: (err) => reject(new Error(err.errMsg))
        });
      });

      if (downloadRes.statusCode !== 200) {
        throw new Error(`下载失败 (HTTP ${downloadRes.statusCode})`);
      }

      // 判断文件类型
      const isPng = url.toLowerCase().endsWith('.png');
      const fileName = isPng ? 'character.json' : 'character.json';

      if (isPng) {
        await this._doImportFile(downloadRes.tempFilePath, 'character.png');
      } else {
        // 尝试作为 JSON 解析
        const fs = wx.getFileSystemManager();
        const content = fs.readFileSync(downloadRes.tempFilePath, 'utf8');
        try {
          const charData = JSON.parse(content);
          await this._doImportData(charData);
        } catch (e) {
          this._showStatus('无法解析下载的文件', false);
        }
      }
    } catch (err) {
      this._showStatus('导入失败: ' + err.message, false);
    } finally {
      this.setData({ isImporting: false });
    }
  },

  // === 导入执行 ===

  async _doImportFile(filePath, fileName) {
    this.setData({ isImporting: true, statusMessage: '正在导入到 SillyTavern...' });

    try {
      const result = await st.importCharacterFile(filePath, fileName);

      if (result && (result.ok || result.avatar_name || result.character)) {
        this._showStatus('✅ 角色导入成功！', true);
        // 刷新角色列表
        const characters = await st.getCharacters();
        app.globalData.characters = characters;
      } else {
        // 如果 PNG 导入失败，尝试本地解析
        if (fileName.endsWith('.png')) {
          this.setData({ statusMessage: '服务端导入失败，尝试本地解析...' });
          try {
            const fs = wx.getFileSystemManager();
            const content = fs.readFileSync(filePath, 'utf8');
            const charData = JSON.parse(content);
            await this._doImportData(charData);
          } catch (e) {
            this._showStatus('❌ 无法解析角色卡片，请确认格式正确', false);
          }
        } else {
          this._showStatus('❌ 导入失败，请检查角色卡格式', false);
        }
      }
    } catch (err) {
      this._showStatus('❌ 导入失败: ' + err.message, false);
    } finally {
      this.setData({ isImporting: false });
    }
  },

  async _doImportData(charData) {
    this.setData({ statusMessage: '正在导入到 SillyTavern...' });

    try {
      const result = await st.importCharacterData(charData);
      if (result && (result.ok || result.avatar_name || result.character)) {
        this._showStatus('✅ 角色导入成功！', true);
        const characters = await st.getCharacters();
        app.globalData.characters = characters;
      } else {
        this._showStatus('❌ 导入失败，请检查角色卡格式', false);
      }
    } catch (err) {
      this._showStatus('❌ 导入失败: ' + err.message, false);
    }
  },

  // === 工具 ===

  _showStatus(message, success) {
    this.setData({
      isImporting: false,
      statusMessage: message,
      isSuccess: success
    });
  },

  onGoBack() {
    wx.navigateBack();
  }
});
