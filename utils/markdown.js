/**
 * 轻量级 Markdown → WXML 转换器
 * 
 * 支持：
 * - **粗体** / __粗体__
 * - *斜体* / _斜体_
 * - ***粗斜体***
 * - `行内代码`
 * - ```代码块```
 * - > 引用
 * - ~~删除线~~
 * - 换行
 * 
 * 不支持：标题、列表、链接、图片、表格（聊天场景不需要）
 */

/**
 * 将 Markdown 文本解析为 WXML 节点数组
 * @param {string} text - Markdown 文本
 * @returns {Array} 节点数组 [{type, text, class}]
 */
function parseMarkdown(text) {
  if (!text) return [];

  const nodes = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockContent = '';
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块处理
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        nodes.push({ type: 'code-block', text: codeBlockContent.trim(), lang: codeBlockLang });
        codeBlockContent = '';
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        // 开始代码块
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line;
      continue;
    }

    // 空行
    if (!line.trim()) {
      nodes.push({ type: 'newline' });
      continue;
    }

    // 引用
    if (line.startsWith('> ')) {
      nodes.push({ type: 'quote', text: line.slice(2) });
      continue;
    }

    // 普通行内格式
    nodes.push({ type: 'inline', text: line });
  }

  // 未闭合的代码块
  if (inCodeBlock && codeBlockContent) {
    nodes.push({ type: 'code-block', text: codeBlockContent, lang: codeBlockLang });
  }

  return nodes;
}

/**
 * 将行内 Markdown 格式转为 rich-text nodes
 * 支持 **bold**, *italic*, `code`, ~~del~~
 */
function inlineToRichNodes(text) {
  if (!text) return [{ type: 'text', text: '' }];

  const nodes = [];
  // 正则匹配各种格式
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_|~~(.+?)~~|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 匹配前的普通文本
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      // ***粗斜体***
      nodes.push({ type: 'text', text: match[2], style: 'font-weight:bold;font-style:italic;' });
    } else if (match[3]) {
      // **粗体**
      nodes.push({ type: 'text', text: match[3], style: 'font-weight:bold;' });
    } else if (match[4]) {
      // *斜体*
      nodes.push({ type: 'text', text: match[4], style: 'font-style:italic;' });
    } else if (match[5]) {
      // __粗体__
      nodes.push({ type: 'text', text: match[5], style: 'font-weight:bold;' });
    } else if (match[6]) {
      // _斜体_
      nodes.push({ type: 'text', text: match[6], style: 'font-style:italic;' });
    } else if (match[7]) {
      // ~~删除线~~
      nodes.push({ type: 'text', text: match[7], style: 'text-decoration:line-through;' });
    } else if (match[8]) {
      // `行内代码`
      nodes.push({ type: 'text', text: match[8], style: 'background:rgba(0,0,0,0.06);padding:2rpx 8rpx;border-radius:6rpx;font-family:monospace;font-size:0.9em;' });
    }

    lastIndex = match.index + match[0].length;
  }

  // 剩余普通文本
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  if (nodes.length === 0) {
    nodes.push({ type: 'text', text: text });
  }

  return nodes;
}

/**
 * 将完整 Markdown 文本转为 rich-text 组件可用的 nodes 字符串
 * 返回 WXML 字符串，可直接用在 <rich-text nodes="{{...}}" /> 中
 */
function markdownToWxml(text) {
  const blocks = parseMarkdown(text);
  let wxml = '';

  for (const block of blocks) {
    switch (block.type) {
      case 'newline':
        wxml += '<br/>';
        break;
      case 'code-block':
        wxml += `<pre style="background:rgba(0,0,0,0.06);padding:16rpx;border-radius:12rpx;font-family:monospace;font-size:24rpx;line-height:1.5;overflow-x:auto;margin:12rpx 0;white-space:pre-wrap;word-break:break-all;"><code>${_escapeHtml(block.text)}</code></pre>`;
        break;
      case 'quote':
        const quoteNodes = inlineToRichNodes(block.text);
        let quoteInner = '';
        for (const n of quoteNodes) {
          if (n.style) {
            quoteInner += `<span style="${n.style}">${_escapeHtml(n.text)}</span>`;
          } else {
            quoteInner += _escapeHtml(n.text);
          }
        }
        wxml += `<div style="border-left:6rpx solid rgba(108,92,231,0.3);padding-left:16rpx;color:rgba(0,0,0,0.5);margin:8rpx 0;">${quoteInner}</div>`;
        break;
      case 'inline':
        const nodes = inlineToRichNodes(block.text);
        for (const n of nodes) {
          if (n.style) {
            wxml += `<span style="${n.style}">${_escapeHtml(n.text)}</span>`;
          } else {
            wxml += _escapeHtml(n.text);
          }
        }
        wxml += '<br/>';
        break;
    }
  }

  return wxml;
}

function _escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  parseMarkdown,
  inlineToRichNodes,
  markdownToWxml
};
