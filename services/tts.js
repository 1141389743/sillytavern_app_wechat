/**
 * TTS 语音朗读服务
 *
 * 支持后端：
 * 1. OpenAI 兼容 TTS（OpenAI / 自定义）
 * 2. Edge TTS（免费，通过公共代理）
 * 3. 自定义 TTS API
 *
 * 流程：
 * 用户长按消息 → [可选] AI 情感分析 → TTS 合成 → 播放音频
 */

// ═══════════════════════════════════════
// 音色配置
// ═══════════════════════════════════════

const VOICE_PRESETS = {
  openai: [
    { id: 'alloy',   name: 'Alloy（中性）',    gender: 'neutral', desc: '平衡、温和' },
    { id: 'echo',    name: 'Echo（男声）',      gender: 'male',   desc: '低沉、磁性' },
    { id: 'fable',   name: 'Fable（叙事）',     gender: 'neutral', desc: '生动、故事感' },
    { id: 'onyx',    name: 'Onyx（男声）',      gender: 'male',   desc: '深沉、有力' },
    { id: 'nova',    name: 'Nova（女声）',      gender: 'female', desc: '温暖、亲切' },
    { id: 'shimmer', name: 'Shimmer（女声）',   gender: 'female', desc: '柔和、明亮' },
  ],
  edge: [
    { id: 'zh-CN-XiaoxiaoNeural',  name: '晓晓（女声）',   gender: 'female', lang: 'zh', desc: '温暖、自然' },
    { id: 'zh-CN-YunxiNeural',     name: '云希（男声）',   gender: 'male',   lang: 'zh', desc: '年轻、活力' },
    { id: 'zh-CN-YunjianNeural',   name: '云健（男声）',   gender: 'male',   lang: 'zh', desc: '成熟、稳重' },
    { id: 'zh-CN-XiaoyiNeural',    name: '晓依（女声）',   gender: 'female', lang: 'zh', desc: '甜美、温柔' },
    { id: 'zh-CN-YunyangNeural',   name: '云扬（男声）',   gender: 'male',   lang: 'zh', desc: '新闻播报' },
    { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓北（东北）', gender: 'female', lang: 'zh', desc: '东北口音' },
    { id: 'en-US-JennyNeural',     name: 'Jenny（EN）',    gender: 'female', lang: 'en', desc: '自然、友好' },
    { id: 'en-US-GuyNeural',       name: 'Guy（EN）',      gender: 'male',   lang: 'en', desc: '专业、清晰' },
    { id: 'en-US-AriaNeural',      name: 'Aria（EN）',     gender: 'female', lang: 'en', desc: '流畅、表达力' },
    { id: 'ja-JP-NanamiNeural',    name: '七海（日语）',   gender: 'female', lang: 'ja', desc: '柔和、自然' },
  ]
};

// ═══════════════════════════════════════
// TTS 配置管理
// ═══════════════════════════════════════

/** 获取 TTS 配置 */
function getTtsConfig() {
  const saved = wx.getStorageSync('tts_config');
  return {
    backend: 'edge',           // 'openai' | 'edge' | 'custom'
    voice: 'zh-CN-XiaoxiaoNeural',
    speed: 1.0,                // 0.25 - 4.0
    openaiBaseUrl: '',
    openaiApiKey: '',
    openaiModel: 'tts-1',
    customUrl: '',
    enableEmotion: false,      // 是否启用 AI 情感分析
    ...saved
  };
}

/** 保存 TTS 配置 */
function saveTtsConfig(config) {
  const safeConfig = { ...config };
  // API Key 不写持久化（与直连模式同策略）
  if (safeConfig.openaiApiKey) {
    wx.setStorageSync('tts_has_key', true);
    safeConfig.openaiApiKey = '';
  }
  wx.setStorageSync('tts_config', safeConfig);
  // Key 仅存内存
  if (config.openaiApiKey) {
    getApp().globalData._ttsApiKey = config.openaiApiKey;
  }
}

/** 获取音色列表 */
function getVoices(backend) {
  return VOICE_PRESETS[backend] || VOICE_PRESETS.edge;
}

// ═══════════════════════════════════════
// AI 情感分析（可选）
// ═══════════════════════════════════════

/**
 * 让 AI 分析文本情感，返回带情感标注的文本
 * 用法：先调 AI 解读情感 → 把标注文本传给 TTS
 *
 * @param {string} text - 原始文本
 * @returns {Promise<{text: string, emotion: string}>} 带情感标注的文本 + 情感类型
 */
async function analyzeEmotion(text) {
  const st = require('./sillytavern');
  const directApi = require('./direct_api');
  const app = getApp();
  const g = app.globalData;

  const prompt = `分析以下文本的情感基调，用一个词概括情感类型（如：温柔、愤怒、悲伤、欢快、紧张、平静、激动、嘲讽、深情、恐惧），然后保持原文内容不变，仅在语气停顿处添加适当的语气词或标点来增强表达力。直接输出修改后的文本，不要解释。

文本：
${text}`;

  try {
    let result;
    if (g.directApi.enabled && g.directApi.apiKey) {
      result = await directApi.sendMessage(g.directApi, [], prompt, '你是一个语音朗读情感分析助手。只输出修改后的文本，不要任何解释或前缀。');
    } else if (g.serverUrl) {
      result = await st.sendMessage([], prompt, null);
    } else {
      return { text, emotion: '平静' };
    }

    // 提取情感词（通常在回复开头）
    let emotion = '平静';
    let processedText = result;

    // 尝试从回复中分离情感标签
    const emotionMatch = result.match(/^(情感[：:]\s*)?([\u4e00-\u9fa5]{1,4})[，,。.\n]/);
    if (emotionMatch) {
      emotion = emotionMatch[2];
      // 如果 AI 在前面加了情感标签，去掉它
      processedText = result.replace(/^.*?[，,。.\n]\s*/s, '').trim();
    }

    // 如果处理后的文本太短或为空，用原文
    if (processedText.length < text.length * 0.5) {
      processedText = text;
    }

    return { text: processedText, emotion };
  } catch (e) {
    console.warn('[TTS] 情感分析失败，使用原文:', e.message);
    return { text, emotion: '平静' };
  }
}

// ═══════════════════════════════════════
// TTS 合成
// ═══════════════════════════════════════

/**
 * 合成语音，返回本地音频文件路径
 *
 * @param {string} text - 要朗读的文本
 * @param {object} config - TTS 配置（可选，默认从存储读取）
 * @returns {Promise<string>} 本地临时文件路径
 */
async function synthesize(text, config) {
  if (!text || !text.trim()) throw new Error('文本为空');

  const cfg = config || getTtsConfig();
  // 清理文本：去掉 Markdown 标记
  const cleanText = _cleanForTts(text);

  switch (cfg.backend) {
    case 'openai':
      return _synthesizeOpenAi(cleanText, cfg);
    case 'edge':
      return _synthesizeEdge(cleanText, cfg);
    case 'custom':
      return _synthesizeCustom(cleanText, cfg);
    default:
      return _synthesizeEdge(cleanText, cfg);
  }
}

/** OpenAI 兼容 TTS */
function _synthesizeOpenAi(text, cfg) {
  return new Promise((resolve, reject) => {
    const baseUrl = (cfg.openaiBaseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    const url = `${baseUrl}/v1/audio/speech`;
    const apiKey = cfg.openaiApiKey || getApp().globalData._ttsApiKey || '';

    if (!apiKey) {
      return reject(new Error('未配置 OpenAI TTS API Key'));
    }

    const body = {
      model: cfg.openaiModel || 'tts-1',
      input: text.slice(0, 4096), // OpenAI TTS 限制 4096 字符
      voice: cfg.voice || 'alloy',
      speed: cfg.speed || 1.0,
      response_format: 'mp3'
    };

    wx.downloadFile({
      url,
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      // downloadFile 不支持 POST，需要用 wx.request 的 arraybuffer 方式
      success: () => {},
      fail: () => {}
    });

    // wx.downloadFile 只支持 GET，TTS API 是 POST
    // 改用 wx.request + responseType: arraybuffer
    const reqTask = wx.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: body,
      responseType: 'arraybuffer',
      timeout: 60000,
      success(res) {
        if (res.statusCode === 200 && res.data) {
          _writeAudioFile(res.data, 'mp3').then(resolve).catch(reject);
        } else {
          let errMsg = 'TTS 请求失败';
          try {
            const decoder = new TextDecoder();
            const text = decoder.decode(res.data);
            const json = JSON.parse(text);
            errMsg = json.error?.message || errMsg;
          } catch (e) {}
          reject(new Error(`${errMsg} (${res.statusCode})`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'TTS 网络请求失败'));
      }
    });
  });
}

/** Edge TTS（通过公共代理） */
function _synthesizeEdge(text, cfg) {
  return new Promise((resolve, reject) => {
    const voice = cfg.voice || 'zh-CN-XiaoxiaoNeural';
    const rate = Math.round((cfg.speed - 1) * 100); // 转换为百分比: -75 ~ +300
    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;

    // 使用公共 Edge TTS 代理
    // 如果你有自己的代理，替换此 URL
    const proxyUrl = 'https://edge-tts.pages.dev/api/tts';

    const reqUrl = `${proxyUrl}?voice=${encodeURIComponent(voice)}&rate=${encodeURIComponent(rateStr)}&text=${encodeURIComponent(text.slice(0, 5000))}`;

    wx.request({
      url: reqUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
      success(res) {
        if (res.statusCode === 200 && res.data) {
          _writeAudioFile(res.data, 'mp3').then(resolve).catch(reject);
        } else {
          reject(new Error(`Edge TTS 失败 (${res.statusCode})`));
        }
      },
      fail(err) {
        // 代理不可用时回退到直连 Edge WebSocket
        _synthesizeEdgeDirect(text, cfg).then(resolve).catch(reject);
      }
    });
  });
}

/** Edge TTS 直连（WebSocket 方式，作为回退） */
function _synthesizeEdgeDirect(text, cfg) {
  return new Promise((resolve, reject) => {
    // 微信小程序支持 wx.connectSocket
    const voice = cfg.voice || 'zh-CN-XiaoxiaoNeural';
    const rate = Math.round((cfg.speed - 1) * 100);
    const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;

    const wsUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
    const trustedClientToken = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

    let audioChunks = [];
    let socketTask = null;
    let timeout = null;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (socketTask) {
        try { socketTask.close(); } catch (e) {}
      }
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Edge TTS 连接超时'));
    }, 15000);

    try {
      socketTask = wx.connectSocket({
        url: `${wsUrl}?TrustedClientToken=${trustedClientToken}&ConnectionId=${_generateId()}`,
        success() {},
        fail(err) {
          cleanup();
          reject(new Error('WebSocket 连接失败'));
        }
      });

      socketTask.onOpen(() => {
        // 发送配置
        const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
        socketTask.send({ data: configMsg });

        // 发送 SSML
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${rateStr}' pitch='+0Hz'>${_escapeXml(text.slice(0, 5000))}</prosody></voice></speak>`;
        const requestId = _generateId();
        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        socketTask.send({ data: ssmlMsg });
      });

      socketTask.onMessage((res) => {
        const data = res.data;
        if (typeof data === 'string') {
          // 文本消息：检查是否结束
          if (data.includes('Path:turn.end')) {
            cleanup();
            if (audioChunks.length > 0) {
              const totalLen = audioChunks.reduce((s, c) => s + c.byteLength, 0);
              const merged = new Uint8Array(totalLen);
              let offset = 0;
              for (const chunk of audioChunks) {
                merged.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
              }
              _writeAudioFile(merged.buffer, 'mp3').then(resolve).catch(reject);
            } else {
              reject(new Error('Edge TTS 未返回音频数据'));
            }
          }
        } else if (data instanceof ArrayBuffer) {
          // 二进制消息：提取音频数据
          // 前 2 bytes 是 header length，然后是 header，再后面是音频
          const view = new DataView(data);
          const headerLen = view.getUint16(0);
          // 音频数据从 offset 2 + headerLen 开始
          const audioData = data.slice(2 + headerLen);
          if (audioData.byteLength > 0) {
            audioChunks.push(audioData);
          }
        }
      });

      socketTask.onError((err) => {
        cleanup();
        reject(new Error('Edge TTS WebSocket 错误'));
      });

      socketTask.onClose(() => {
        cleanup();
      });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

/** 自定义 TTS API */
function _synthesizeCustom(text, cfg) {
  return new Promise((resolve, reject) => {
    const url = cfg.customUrl;
    if (!url) return reject(new Error('未配置自定义 TTS 地址'));

    wx.request({
      url,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        text: text.slice(0, 5000),
        voice: cfg.voice,
        speed: cfg.speed
      },
      responseType: 'arraybuffer',
      timeout: 30000,
      success(res) {
        if (res.statusCode === 200 && res.data) {
          _writeAudioFile(res.data, 'mp3').then(resolve).catch(reject);
        } else {
          reject(new Error(`自定义 TTS 失败 (${res.statusCode})`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '自定义 TTS 请求失败'));
      }
    });
  });
}

// ═══════════════════════════════════════
// 音频播放
// ═══════════════════════════════════════

let _currentAudio = null;
let _onPlayEndCallback = null;

/**
 * 播放音频文件
 * @param {string} filePath - 本地文件路径
 * @param {function} onEnd - 播放结束回调
 * @returns {object} audioContext 实例
 */
function playAudio(filePath, onEnd) {
  stopAudio(); // 先停止之前的

  const audio = wx.createInnerAudioContext();
  audio.src = filePath;
  audio.volume = 1.0;

  _currentAudio = audio;
  _onPlayEndCallback = onEnd;

  audio.onEnded(() => {
    _cleanupAudio();
    if (onEnd) onEnd();
  });

  audio.onError((err) => {
    console.error('[TTS] 播放错误:', err);
    _cleanupAudio();
    if (onEnd) onEnd(err);
  });

  audio.play();
  return audio;
}

/** 停止当前播放 */
function stopAudio() {
  if (_currentAudio) {
    try {
      _currentAudio.stop();
      _currentAudio.destroy();
    } catch (e) {}
    _currentAudio = null;
  }
  _onPlayEndCallback = null;
}

/** 是否正在播放 */
function isPlaying() {
  return _currentAudio !== null;
}

function _cleanupAudio() {
  if (_currentAudio) {
    try { _currentAudio.destroy(); } catch (e) {}
    _currentAudio = null;
  }
}

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

/** 清理文本供 TTS 使用 */
function _cleanForTts(text) {
  return text
    // 去掉 Markdown 图片
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // 去掉 Markdown 链接，保留文字
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 去掉 Markdown 格式标记
    .replace(/[*_~`#>]/g, '')
    // 去掉代码块
    .replace(/```[\s\S]*?```/g, '（代码已省略）')
    // 去掉多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 将 ArrayBuffer 写入临时音频文件 */
function _writeAudioFile(buffer, ext) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const tmpPath = `${wx.env.USER_DATA_PATH}/tts_${Date.now()}.${ext}`;
    fs.writeFile({
      filePath: tmpPath,
      data: buffer,
      encoding: 'binary',
      success() { resolve(tmpPath); },
      fail(err) { reject(new Error('写入音频文件失败')); }
    });
  });
}

/** 清理过期 TTS 临时文件 */
function cleanOldTtsFiles() {
  try {
    const fs = wx.getFileSystemManager();
    const userPath = wx.env.USER_DATA_PATH;
    const files = fs.readdirSync(userPath);
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24 小时

    for (const file of files) {
      if (!file.startsWith('tts_')) continue;
      try {
        const stat = fs.statSync(`${userPath}/${file}`);
        if (stat && (now - stat.lastModifiedTime) > MAX_AGE) {
          fs.unlinkSync(`${userPath}/${file}`);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function _generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

module.exports = {
  VOICE_PRESETS,
  getTtsConfig,
  saveTtsConfig,
  getVoices,
  analyzeEmotion,
  synthesize,
  playAudio,
  stopAudio,
  isPlaying,
  cleanOldTtsFiles
};
