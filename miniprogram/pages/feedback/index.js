const cloud = require('../../core/cloud');
const actionGuard = require('../../core/actionGuard');
const profileCore = require('../../core/profile');
const { resolveFeedbackGate } = require('./gate');

Page({
  data: {
    blocked: false,
    blockNeedProfile: false,
    blockTitle: '',
    blockMessage: '',
    categoryOptions: ['功能问题', '体验建议', '排程问题', '其他'],
    categoryIndex: 0,
    content: '',
    contentLength: 0,
    contact: '',
    submitting: false
  },

  async onLoad() {
    await this.ensureFeedbackReady();
  },

  async ensureFeedbackReady() {
    const gate = await profileCore.ensureProfileForAction('feedback', '/pages/feedback/index');
    const gateState = resolveFeedbackGate(gate);
    this.setData(gateState);
    if (!gate.ok) {
      return false;
    }
    return true;
  },

  onGoCompleteProfile() {
    wx.navigateTo({
      url: '/pages/profile/index?returnUrl=/pages/feedback/index'
    });
  },

  async onRetryReady() {
    await this.ensureFeedbackReady();
  },

  onPickCategory(e) {
    this.setData({ categoryIndex: Number(e.detail.value || 0) });
  },

  onContentInput(e) {
    const content = String(e.detail.value || '');
    this.setData({
      content,
      contentLength: content.length
    });
  },

  onContactInput(e) {
    this.setData({ contact: String(e.detail.value || '').trim() });
  },

  async onSubmit() {
    if (this.data.blocked) return;
    const content = String(this.data.content || '').trim();
    if (content.length < 10) {
      wx.showToast({ title: '反馈内容至少10字', icon: 'none' });
      return;
    }
    const actionKey = 'feedback:submit';
    if (actionGuard.isBusy(actionKey)) return;

    return actionGuard.runWithPageBusy(this, 'submitting', actionKey, async () => {
      wx.showLoading({ title: '提交中...' });
      try {
        const res = await cloud.call('feedbackSubmit', {
          category: this.data.categoryOptions[this.data.categoryIndex] || '其他',
          content,
          contact: String(this.data.contact || '').trim()
        });
        wx.hideLoading();
        wx.showModal({
          title: '提交成功',
          content: `反馈编号：${res && res.feedbackId ? res.feedbackId : '已记录'}`,
          showCancel: false,
          success: () => {
            this.setData({
              content: '',
              contentLength: 0,
              contact: ''
            });
          }
        });
      } catch (e) {
        wx.hideLoading();
        wx.showToast({ title: cloud.getUnifiedErrorMessage(e, '提交失败'), icon: 'none' });
      }
    });
  }
});
