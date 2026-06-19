/**
 * 本地存储工具
 * 
 * 封装 wx.storage，提供类型安全的存取方法
 */

function get(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key);
    return value !== '' && value !== undefined ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) { /* ignore */ }
}

function clear() {
  try {
    wx.clearStorageSync();
  } catch (e) { /* ignore */ }
}

module.exports = { get, set, remove, clear };
