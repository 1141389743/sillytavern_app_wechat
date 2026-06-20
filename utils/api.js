/**
 * HTTP 请求工具层
 * 
 * 封装 wx.request，处理：
 * - CSRF Token 自动获取与附加
 * - Session Cookie 管理
 * - 请求/响应拦截
 * - 错误统一处理
 */

/**
 * 发起 GET 请求
 */
function get(url, options = {}) {
  return request(url, { ...options, method: 'GET' });
}

/**
 * 发起 POST 请求
 */
function post(url, data, options = {}) {
  return request(url, { ...options, method: 'POST', data });
}

/**
 * 核心请求函数
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const app = getApp();
    const g = app.globalData;
    const fullUrl = url.startsWith('http') ? url : `${g.serverUrl}${url}`;

    // 构建请求头
    const header = {
      'Content-Type': 'application/json',
      ...options.header
    };

    // 附加 CSRF Token
    if (g.csrfToken) {
      header['X-CSRF-Token'] = g.csrfToken;
    }

    // 附加 Session Cookie
    if (g.sessionCookies) {
      header['Cookie'] = g.sessionCookies;
    }

    wx.request({
      url: fullUrl,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || 30000,
      success(res) {
        // 提取 Set-Cookie（微信小程序会自动处理，但我们需要手动存储）
        const setCookies = res.header['Set-Cookie'] || res.header['set-cookie'];
        if (setCookies) {
          _parseCookies(setCookies);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          // 会话过期，尝试刷新 CSRF token 后重试一次
          if (!options._retried) {
            _refreshSession().then(() => {
              request(url, { ...options, _retried: true })
                .then(resolve)
                .catch(reject);
            }).catch(() => {
              reject(new Error('会话已过期，请重新登录'));
            });
          } else {
            reject(new Error(`请求失败: HTTP ${res.statusCode}`));
          }
        } else {
          const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          console.error(`[api] HTTP ${res.statusCode} ${url}`);
          console.error(`[api] 响应头:`, JSON.stringify(res.header));
          console.error(`[api] 响应体:`, bodyStr.slice(0, 1000));
          const errMsg = _extractError(res.data);
          reject(new Error(errMsg || `请求失败: HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

/**
 * 上传文件（multipart/form-data）
 */
function uploadFile(url, filePath, fieldName, formData = {}) {
  return new Promise((resolve, reject) => {
    const app = getApp();
    const g = app.globalData;
    const fullUrl = url.startsWith('http') ? url : `${g.serverUrl}${url}`;

    const header = {};
    if (g.csrfToken) {
      header['X-CSRF-Token'] = g.csrfToken;
    }
    if (g.sessionCookies) {
      header['Cookie'] = g.sessionCookies;
    }

    // 构建 formData 字符串
    const formDataStr = {};
    for (const key in formData) {
      if (formData[key] != null) {
        formDataStr[key] = String(formData[key]);
      }
    }

    wx.uploadFile({
      url: fullUrl,
      filePath,
      name: fieldName,
      formData: formDataStr,
      header,
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let data;
          try {
            data = JSON.parse(res.data);
          } catch (e) {
            data = res.data;
          }
          resolve(data);
        } else {
          reject(new Error(`上传失败: HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '文件上传失败'));
      }
    });
  });
}

/**
 * 上传字节数据（用于无文件路径的场景）
 * 将 ArrayBuffer 写入临时文件后上传
 */
function uploadBytes(url, bytes, fileName, fieldName, formData = {}) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const tmpPath = `${wx.env.USER_DATA_PATH}/tmp_${Date.now()}_${fileName}`;
    
    try {
      fs.writeFile({
        filePath: tmpPath,
        data: bytes,
        encoding: 'binary',
        success() {
          uploadFile(url, tmpPath, fieldName, formData)
            .then(resolve)
            .catch(reject)
            .finally(() => {
              // 清理临时文件
              try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
            });
        },
        fail(err) {
          reject(new Error('写入临时文件失败: ' + err.errMsg));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 获取 CSRF Token 并初始化会话
 */
function initSession() {
  return get('/csrf-token').then(data => {
    if (data && data.token) {
      getApp().globalData.csrfToken = data.token;
      return true;
    }
    return false;
  });
}

/**
 * 刷新会话（内部方法）
 */
function _refreshSession() {
  return get('/csrf-token').then(data => {
    if (data && data.token) {
      getApp().globalData.csrfToken = data.token;
    }
  });
}

/**
 * 解析 Set-Cookie 头（内部方法）
 *
 * Set-Cookie 值中可能包含逗号（如 expires=Thu, 21 Jan 2027 ...），
 * 不能简单按逗号分割。改用正则匹配 name=value 模式。
 */
function _parseCookies(setCookieHeader) {
  if (!setCookieHeader) return;

  const cookies = [];
  // 匹配所有 name=value 片段，跳过属性（path, expires, secure 等）
  const regex = /(?:^|,\s*)([^,=]+)=([^;]*)/g;
  let match;

  while ((match = regex.exec(setCookieHeader)) !== null) {
    const name = match[1].trim();
    const value = match[2].trim();
    // 跳过空名或常见非 cookie 属性
    if (name && !/^(expires|path|domain|secure|httponly|samesite|max-age)$/i.test(name)) {
      cookies.push(`${name}=${value}`);
    }
  }

  if (cookies.length > 0) {
    getApp().globalData.sessionCookies = cookies.join('; ');
  }
}

/**
 * 提取错误消息（内部方法）
 */
function _extractError(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.error) return typeof data.error === 'string' ? data.error : data.error.message || '';
  if (data.message) return data.message;
  return '';
}

module.exports = {
  get,
  post,
  request,
  uploadFile,
  uploadBytes,
  initSession
};
