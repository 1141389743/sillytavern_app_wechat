/**
 * 通用工具函数
 */

/**
 * 去掉字符串末尾的 .png 后缀
 */
function stripPngSuffix(str) {
  if (!str) return str;
  return str.endsWith('.png') ? str.slice(0, -4) : str;
}

/**
 * 格式化时间 HH:MM
 */
function formatTime(date) {
  if (!date) date = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 防抖
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 判断是否为空对象
 */
function isEmptyObject(obj) {
  if (!obj) return true;
  return Object.keys(obj).length === 0;
}

/**
 * 安全解析 JSON
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

module.exports = {
  stripPngSuffix,
  formatTime,
  generateId,
  debounce,
  isEmptyObject,
  safeJsonParse
};
