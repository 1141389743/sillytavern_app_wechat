/**
 * 直连 AI API 服务层
 * 
 * 对应原 Flutter 项目的 direct_api_service.dart
 * 支持 OpenAI 兼容 / DeepSeek / Anthropic / OpenRouter / 自定义
 */

const API_TYPES = {
  openaiCompatible: {
    name: 'OpenAI 兼容',
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini'
  },
  deepseek: {
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat'
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5'
  },
  openrouter: {
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    defaultModel: 'openai/gpt-4o-mini'
  },
  custom: {
    name: '自定义',
    defaultBaseUrl: '',
    defaultModel: ''
  }
};

/**
 * 测试连接
 * 优先用 /v1/models 探测，如果返回 401/403/404 则回退到 /v1/chat/completions 发一条最小消息
 * Anthropic 走专用逻辑
 */
function testConnection(config) {
  const baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  const apiKey = config.apiKey || '';

  if (config.type === 'anthropic') {
    return _sendAnthropic(config, [{ role: 'user', content: 'hi' }], '', { max_tokens: 10 })
      .then(() => true)
      .catch(err => {
        if (err.message && err.message.includes('400')) return true;
        return false;
      });
  }

  // OpenAI 兼容 / DeepSeek / 自定义
  return new Promise((resolve) => {
    const modelsUrl = `${baseUrl}/v1/models`;

    wx.request({
      url: modelsUrl,
      method: 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000,
      success(res) {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          // 认证失败，但服务可达
          resolve(false);
        } else {
          // /v1/models 不可用，回退用 chat/completions 测试
          _testByChatCompletion(baseUrl, apiKey, config.model).then(resolve);
        }
      },
      fail() {
        // 网络不通，再试 chat/completions
        _testByChatCompletion(baseUrl, apiKey, config.model).then(resolve);
      }
    });
  });
}

/**
 * 通过发送最小 chat completion 请求来测试
 * 很多 API（如 DeepSeek）/v1/models 可能不返回 200，但 chat/completions 可以
 */
function _testByChatCompletion(baseUrl, apiKey, model) {
  return new Promise((resolve) => {
    let chatUrl;
    if (baseUrl.endsWith('/chat/completions')) {
      chatUrl = baseUrl;
    } else if (baseUrl.endsWith('/v1')) {
      chatUrl = `${baseUrl}/chat/completions`;
    } else {
      chatUrl = `${baseUrl}/v1/chat/completions`;
    }

    wx.request({
      url: chatUrl,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: {
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      },
      timeout: 20000,
      success(res) {
        // 200 = 成功, 400 = 参数错误但服务可达, 401/403 = 认证问题但服务可达
        resolve(res.statusCode === 200 || res.statusCode === 400);
      },
      fail() {
        resolve(false);
      }
    });
  });
}

/**
 * 发送消息（非流式）
 */
function sendMessage(config, history, userMessage, systemPrompt, overrideParams) {
  if (config.type === 'anthropic') {
    return _sendAnthropicMessage(config, history, userMessage, systemPrompt, overrideParams);
  }
  return _sendOpenAiCompatibleMessage(config, history, userMessage, systemPrompt, overrideParams);
}

/**
 * OpenAI 兼容 API 发送消息
 */
function _sendOpenAiCompatibleMessage(config, history, userMessage, systemPrompt, overrideParams) {
  return new Promise((resolve, reject) => {
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (history && history.length > 0) {
      for (const m of history) {
        if (m.role === 'user' || m.role === 'assistant') {
          messages.push({
            role: m.role,
            content: m.content,
            ...(m.name ? { name: m.name } : {})
          });
        }
      }
    }

    messages.push({ role: 'user', content: userMessage });

    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    let chatUrl;
    if (baseUrl.endsWith('/chat/completions')) {
      chatUrl = baseUrl;
    } else if (baseUrl.endsWith('/v1')) {
      chatUrl = `${baseUrl}/chat/completions`;
    } else {
      chatUrl = `${baseUrl}/v1/chat/completions`;
    }

    const body = {
      model: config.model || API_TYPES[config.type]?.defaultModel || 'gpt-4o-mini',
      messages
    };
    if (overrideParams) Object.assign(body, overrideParams);

    wx.request({
      url: chatUrl,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      data: body,
      timeout: 120000,
      success(res) {
        if (res.statusCode === 200) {
          const data = res.data;
          if (data.choices && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message && choice.message.content) {
              return resolve(choice.message.content);
            }
            if (choice.text) return resolve(choice.text);
          }
          if (data.error) {
            return reject(new Error(data.error.message || '未知错误'));
          }
          return resolve('（无回复）');
        } else {
          let errMsg;
          try {
            const errData = res.data;
            errMsg = errData?.error?.message || errData?.error || JSON.stringify(errData);
          } catch (e) {
            errMsg = String(res.data);
          }
          reject(new Error(`API 请求失败 (${res.statusCode}): ${errMsg}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

/**
 * Anthropic API 发送消息
 */
function _sendAnthropicMessage(config, history, userMessage, systemPrompt, overrideParams) {
  const messages = [];

  if (history && history.length > 0) {
    for (const m of history) {
      if (m.role === 'user') {
        messages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        messages.push({ role: 'assistant', content: m.content });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  return _sendAnthropic(config, messages, systemPrompt, overrideParams);
}

/**
 * Anthropic API 底层发送
 */
function _sendAnthropic(config, messages, systemPrompt, overrideParams) {
  return new Promise((resolve, reject) => {
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const apiUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/v1/messages`;

    const body = {
      model: config.model || 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (overrideParams) Object.assign(body, overrideParams);

    wx.request({
      url: apiUrl,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      data: body,
      timeout: 120000,
      success(res) {
        if (res.statusCode === 200) {
          const data = res.data;
          if (data.content && data.content.length > 0) {
            const text = data.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('\n');
            if (text) return resolve(text);
          }
          return resolve('（无回复）');
        } else {
          let errMsg;
          try {
            errMsg = res.data?.error?.message || JSON.stringify(res.data);
          } catch (e) {
            errMsg = String(res.data);
          }
          reject(new Error(`Anthropic 请求失败 (${res.statusCode}): ${errMsg}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

/**
 * 构建角色系统提示词
 */
function buildCharacterPrompt(character) {
  const parts = [];
  parts.push('你现在扮演以下角色，请严格保持角色设定，用该角色的语气和风格回复');
  parts.push('');
  parts.push('=== 角色设定 ===');
  parts.push(`名称: ${character.name}`);

  if (character.description) parts.push(`描述: ${character.description}`);
  if (character.personality) parts.push(`性格: ${character.personality}`);
  if (character.scenario) parts.push(`场景: ${character.scenario}`);
  if (character.greeting) parts.push(`开场白: ${character.greeting}`);
  if (character.firstMessage) parts.push(`第一条消息: ${character.firstMessage}`);

  parts.push('');
  parts.push('始终以角色的身份回复，不要跳出角色设定。');

  return parts.join('\n');
}

module.exports = {
  API_TYPES,
  testConnection,
  sendMessage,
  buildCharacterPrompt
};
