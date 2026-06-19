/**
 * 创建/编辑角色页面逻辑
 * 对应 Flutter create_character_screen.dart
 */

const app = getApp();
const st = require('../../services/sillytavern');

Page({
  data: {
    isEditing: false,
    editingAvatarUrl: '',
    isLoading: false,

    // 头像
    avatarPath: '',

    // 角色字段
    charName: '',
    description: '',
    greeting: '',
    firstMes: '',
    personality: '',
    scenario: '',
    mesExample: '',
    systemPrompt: '',
    creatorNotes: ''
  },

  onLoad(options) {
    if (options.mode === 'edit' && options.name) {
      const name = decodeURIComponent(options.name);
      const characters = app.globalData.characters;
      const char = characters.find(c => c.name === name);

      if (char) {
        wx.setNavigationBarTitle({ title: '编辑角色' });
        this.setData({
          isEditing: true,
          editingAvatarUrl: char.avatar || '',
          charName: char.name || '',
          description: char.description || '',
          greeting: char.greeting || '',
          firstMes: char.first_mes || '',
          personality: char.personality || '',
          scenario: char.scenario || '',
          mesExample: char.mes_example || '',
          systemPrompt: char.system_prompt || '',
          creatorNotes: char.creator_notes || ''
        });
      }
    }
  },

  // === 输入事件 ===

  onNameInput(e) { this.setData({ charName: e.detail.value }); },
  onDescInput(e) { this.setData({ description: e.detail.value }); },
  onGreetingInput(e) { this.setData({ greeting: e.detail.value }); },
  onFirstMesInput(e) { this.setData({ firstMes: e.detail.value }); },
  onPersonalityInput(e) { this.setData({ personality: e.detail.value }); },
  onScenarioInput(e) { this.setData({ scenario: e.detail.value }); },
  onMesExampleInput(e) { this.setData({ mesExample: e.detail.value }); },
  onSystemPromptInput(e) { this.setData({ systemPrompt: e.detail.value }); },
  onCreatorNotesInput(e) { this.setData({ creatorNotes: e.detail.value }); },

  // === 头像选择 ===

  onPickAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
        this.setData({ avatarPath: tempFile.tempFilePath });
      }
    });
  },

  // === 保存 ===

  async onSave() {
    if (!this.data.charName.trim()) {
      wx.showToast({ title: '角色名称不能为空', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });

    try {
      const charData = {
        ch_name: this.data.charName.trim(),
        description: this.data.description.trim(),
        greeting: this.data.greeting.trim(),
        personality: this.data.personality.trim(),
        first_mes: this.data.firstMes.trim(),
        scenario: this.data.scenario.trim(),
        mes_example: this.data.mesExample.trim(),
        system_prompt: this.data.systemPrompt.trim(),
        creator_notes: this.data.creatorNotes.trim(),
        tags: '',
        creator: '',
        creator_comment: '',
        character_version: '1.0'
      };

      let result;
      if (this.data.isEditing) {
        result = await st.editCharacter(
          this.data.editingAvatarUrl,
          charData,
          this.data.avatarPath || null
        );
      } else {
        result = await st.createCharacter(
          charData,
          this.data.avatarPath || null
        );
      }

      if (result && (result.ok || result.avatar_name || typeof result === 'string')) {
        // 刷新角色列表
        const characters = await st.getCharacters();
        app.globalData.characters = characters;

        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1000);
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  }
});
