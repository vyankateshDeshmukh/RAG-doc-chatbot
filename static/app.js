/**
 * AskMyDocs – Document Intelligence & LLM Observability Frontend Logic
 */

// State
let currentTab = 'chat';
let isQuerying = false;
let metricsInterval = null;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  initDropzone();
  initChatInput();
  checkHealth();
  loadModels();
  loadDocuments();
  loadMetrics();

  // Setup periodic health & metrics refresh
  setInterval(checkHealth, 15000);
});

// Auto-resizing textarea
function initChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}

// Tab Switching
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

  if (tab === 'chat') {
    document.getElementById('navChatBtn').classList.add('active');
    document.getElementById('chatView').classList.add('active');
    if (metricsInterval) {
      clearInterval(metricsInterval);
      metricsInterval = null;
    }
  } else {
    document.getElementById('navDashboardBtn').classList.add('active');
    document.getElementById('dashboardView').classList.add('active');
    loadMetrics();
    // Auto-refresh metrics every 8 seconds while on dashboard
    if (!metricsInterval) {
      metricsInterval = setInterval(loadMetrics, 8000);
    }
  }
}

// Health Check
async function checkHealth() {
  const pill = document.getElementById('healthPill');
  const txt = document.getElementById('healthText');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'healthy') {
      pill.className = 'status-pill';
      const chunks = data.vector_db ? data.vector_db.total_chunks : 0;
      txt.textContent = `OmniRoute Online (${chunks} chunks)`;
    } else {
      pill.className = 'status-pill degraded';
      txt.textContent = 'OmniRoute Degraded';
    }
  } catch (err) {
    pill.className = 'status-pill degraded';
    txt.textContent = 'Backend Offline';
  }
}

// Models Catalog
async function loadModels() {
  const select = document.getElementById('modelSelect');
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    select.innerHTML = '';
    
    data.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} [${m.tier}]`;
      if (m.id === data.default) opt.selected = true;
      select.appendChild(opt);
    });

    onModelChange();
  } catch (e) {
    console.error('Failed to load models:', e);
  }
}

function onModelChange() {
  const select = document.getElementById('modelSelect');
  const label = document.getElementById('inputModelLabel');
  if (label && select) {
    const selectedText = select.options[select.selectedIndex]?.text || select.value;
    label.textContent = selectedText.split(' [')[0];
  }
}

// Documents Knowledge Base
async function loadDocuments() {
  const list = document.getElementById('documentList');
  const chunksSpan = document.getElementById('statChunksCount');
  const docsSpan = document.getElementById('statDocsCount');

  try {
    const res = await fetch('/api/documents');
    const data = await res.json();

    chunksSpan.textContent = data.total_chunks || 0;
    docsSpan.textContent = data.distinct_sources?.length || (data.files?.length || 0);

    list.innerHTML = '';
    const sources = data.distinct_sources || [];

    if (sources.length === 0 && (!data.files || data.files.length === 0)) {
      list.innerHTML = '<li class="doc-item loading">No documents uploaded yet</li>';
      return;
    }

    // Display distinct indexed sources
    sources.forEach(src => {
      const li = document.createElement('li');
      li.className = 'doc-item';
      li.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="doc-item-name" title="${escapeHtml(src)}">${escapeHtml(src)}</span>
      `;
      list.appendChild(li);
    });
  } catch (e) {
    console.error('Failed to load documents:', e);
    list.innerHTML = '<li class="doc-item loading">Error loading documents</li>';
  }
}

// PDF Ingestion & Drag and Drop
function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  });

  // Enable keyboard trigger for accessibility
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('pdfInput').click();
    }
  });
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (file) {
    uploadFile(file);
  }
}

async function uploadFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showFeedback('Please select a valid PDF file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  const progressBar = document.getElementById('uploadProgress');
  progressBar.style.display = 'block';
  progressBar.style.width = '30%';

  showFeedback(`Ingesting & indexing "${file.name}"...`, 'info');

  try {
    progressBar.style.width = '70%';
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    progressBar.style.width = '100%';
    const data = await res.json();

    if (res.ok && data.success) {
      showFeedback(`Successfully indexed ${data.chunks_count} chunks from ${data.pages} page(s)!`, 'success');
      loadDocuments();
    } else {
      showFeedback(data.detail || data.message || 'Error indexing PDF', 'error');
    }
  } catch (err) {
    showFeedback(`Upload failed: ${err.message}`, 'error');
  } finally {
    setTimeout(() => {
      progressBar.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1200);
  }
}

function showFeedback(msg, type) {
  const fb = document.getElementById('uploadFeedback');
  if (!fb) return;
  fb.textContent = msg;
  fb.className = `upload-feedback ${type}`;
  fb.style.display = 'block';
}

function handleTextareaKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitChat(event);
  }
}

// Chat Flow
async function submitChat(event) {
  if (event) event.preventDefault();
  if (isQuerying) return;

  const input = document.getElementById('chatInput');
  const query = input.value.trim();
  if (!query) return;

  const model = document.getElementById('modelSelect').value;

  // Append User Message to UI
  appendMessage({
    role: 'user',
    content: query
  });

  input.value = '';
  input.style.height = 'auto';
  isQuerying = true;
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = true;

  // Add Typing Indicator
  const typingId = 'typing-' + Date.now();
  appendTypingIndicator(typingId);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        model: model,
        top_k: 3
      })
    });

    const data = await res.json();
    removeTypingIndicator(typingId);

    if (res.ok && data.success) {
      appendMessage({
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
        telemetry: data.telemetry,
        model: data.model_resolved || data.model_requested
      });
      // Background update of metrics
      loadMetrics();
    } else {
      appendMessage({
        role: 'assistant',
        content: data.answer || data.detail || 'An error occurred while generating the answer.',
        error: true,
        telemetry: data.telemetry
      });
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage({
      role: 'assistant',
      content: `Failed to connect to the server: ${err.message}`,
      error: true
    });
  } finally {
    isQuerying = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function appendMessage({ role, content, citations, telemetry, model, error }) {
  const container = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}-message`;

  if (role === 'user') {
    msgDiv.innerHTML = `
      <div class="message-body">
        <div class="message-content"><p>${escapeHtml(content)}</p></div>
      </div>
      <div class="message-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </div>
    `;
  } else {
    // Citations box intentionally hidden per user preference
    // Source references still appear inline inside the answer text as [Source N] badges
    let citationsHtml = '';

    let telemetryHtml = '';
    if (telemetry) {
      const formattedCost = Number(telemetry.estimated_cost_usd || 0).toFixed(5);
      const latencyMs = telemetry.latency_ms !== null && telemetry.latency_ms !== undefined ? telemetry.latency_ms : 0;
      telemetryHtml = `
        <div class="telemetry-pill">
          <span class="telemetry-item latency">⚡ ${latencyMs} ms</span>
          <span class="telemetry-item tokens">🪙 ${telemetry.total_tokens || 0} tokens</span>
          <span class="telemetry-item cost">💰 $${formattedCost}</span>
          ${model ? `<span class="telemetry-divider">|</span><span class="telemetry-model">${escapeHtml(model)}</span>` : ''}
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <div class="message-avatar" aria-label="AskMyDocs">
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
          <path d="M7.5 7C7.5 5.34 8.84 4 10.5 4H18L24.5 10.5V21.5C24.5 23.16 23.16 24.5 21.5 24.5H15.5L11 28V24.5H10.5C8.84 24.5 7.5 23.16 7.5 21.5V7Z" fill="rgba(20, 184, 166, 0.16)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M18 4V9.5C18 10.05 18.45 10.5 19 10.5H24.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 11C16 12.8 14.6 14 13 14C14.6 14 16 15.2 16 17C16 15.2 17.4 14 19 14C17.4 14 16 12.8 16 11Z" fill="currentColor"/>
          <line x1="12" y1="19.5" x2="20" y2="19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="message-body">
        <div class="message-meta-header">
          <span class="agent-name">AskMyDocs</span>
          ${error ? '<span class="status-badge fail">Error</span>' : '<span class="status-badge success">Grounded</span>'}
        </div>
        <div class="message-content">${formatMarkdown(content)}</div>
        ${citationsHtml}
        ${telemetryHtml}
      </div>
    `;
  }

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator(id) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.id = id;
  div.className = 'message assistant-message typing-indicator-msg';
  div.innerHTML = `
    <div class="message-avatar" aria-label="AskMyDocs">
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
        <path d="M7.5 7C7.5 5.34 8.84 4 10.5 4H18L24.5 10.5V21.5C24.5 23.16 23.16 24.5 21.5 24.5H15.5L11 28V24.5H10.5C8.84 24.5 7.5 23.16 7.5 21.5V7Z" fill="rgba(20, 184, 166, 0.16)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18 4V9.5C18 10.05 18.45 10.5 19 10.5H24.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 11C16 12.8 14.6 14 13 14C14.6 14 16 15.2 16 17C16 15.2 17.4 14 19 14C17.4 14 16 12.8 16 11Z" fill="currentColor"/>
        <line x1="12" y1="19.5" x2="20" y2="19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="message-body typing-body">
      <div class="typing-content">
        <span class="typing-dot"></span>
        <span>AskMyDocs is retrieving vector chunks & generating answer...</span>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Dashboard Metrics Fetch & Render
async function loadMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const data = await res.json();

    const totals = data.totals || {};
    const totalCalls = document.getElementById('kpiTotalCalls');
    const totalCost = document.getElementById('kpiTotalCost');
    const avgLatency = document.getElementById('kpiAvgLatency');
    const totalTokens = document.getElementById('kpiTotalTokens');
    const successRate = document.getElementById('kpiSuccessRate');
    const tokenSplit = document.getElementById('kpiTokenSplit');

    if (totalCalls) totalCalls.textContent = totals.total_requests || 0;
    if (totalCost) totalCost.textContent = `$${Number(totals.total_cost_usd || 0).toFixed(5)}`;
    if (avgLatency) avgLatency.textContent = `${Math.round(totals.avg_latency_ms || 0)} ms`;
    if (totalTokens) totalTokens.textContent = (totals.total_tokens || 0).toLocaleString();
    if (successRate) successRate.textContent = `${totals.success_rate_percent !== undefined ? totals.success_rate_percent : 100}% Success Rate`;
    if (tokenSplit) tokenSplit.textContent = `Prompt: ${(totals.prompt_tokens || 0).toLocaleString()} | Comp: ${(totals.completion_tokens || 0).toLocaleString()}`;

    // Recommendations
    const recList = document.getElementById('recList');
    if (recList) {
      if (data.recommendations && data.recommendations.length > 0) {
        recList.innerHTML = data.recommendations.map(r => `
          <div class="rec-item">
            <strong>${escapeHtml(r.title)}</strong>
            <p>${escapeHtml(r.description)}</p>
          </div>
        `).join('');
      } else {
        recList.innerHTML = '<p class="text-muted">Accumulating request data. Optimization suggestions will appear automatically.</p>';
      }
    }

    // Model Comparison Table
    const modelTableBody = document.getElementById('modelComparisonBody');
    if (modelTableBody) {
      if (data.model_comparison && data.model_comparison.length > 0) {
        modelTableBody.innerHTML = data.model_comparison.map(m => `
          <tr>
            <td><strong class="table-model-name">${escapeHtml(m.model)}</strong></td>
            <td class="font-mono">${m.requests}</td>
            <td class="font-mono">$${Number(m.cost_usd).toFixed(4)}</td>
            <td class="font-mono">$${Number(m.avg_cost_per_query).toFixed(5)}</td>
            <td class="font-mono">${m.avg_latency_ms} ms</td>
            <td><span class="status-badge success">${m.success_rate}%</span></td>
          </tr>
        `).join('');
      } else {
        modelTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No telemetry logged yet.</td></tr>';
      }
    }

    // Recent Logs Table
    const recentBody = document.getElementById('recentLogsBody');
    if (recentBody) {
      if (data.recent_logs && data.recent_logs.length > 0) {
        recentBody.innerHTML = data.recent_logs.map(log => {
          const timeFormatted = log.timestamp ? log.timestamp.split('T')[1]?.replace('Z', '').slice(0, 8) || log.timestamp : '';
          return `
            <tr>
              <td class="font-mono log-time">${timeFormatted}</td>
              <td class="log-query" title="${escapeHtml(log.query)}">${escapeHtml(log.query.length > 35 ? log.query.slice(0, 35) + '...' : log.query)}</td>
              <td class="log-model">${escapeHtml(log.model)}</td>
              <td class="font-mono">${log.latency_ms} ms</td>
              <td class="font-mono">${log.tokens ? log.tokens.total : 0}</td>
              <td class="font-mono">$${Number(log.cost_usd || 0).toFixed(5)}</td>
              <td><span class="status-badge ${log.success ? 'success' : 'fail'}">${log.success ? 'Success' : 'Error'}</span></td>
            </tr>
          `;
        }).join('');
      } else {
        recentBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No requests recorded yet.</td></tr>';
      }
    }
  } catch (err) {
    console.error('Failed to load metrics:', err);
  }
}

// Helpers & Markdown Formatting
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Pre-process raw markdown text from LLM to fix formatting edge cases
function preprocessMarkdown(text) {
  if (!text) return '';
  let str = text.replace(/\r\n/g, '\n');

  // Fix lists glued directly to previous text line without empty line:
  // e.g. "Here are the details:\n* Item 1" -> "Here are the details:\n\n* Item 1"
  str = str.replace(/([^\n])\n([*\-+] |\d+\. )/g, '$1\n\n$2');

  // Fix headings glued directly to previous line without empty line
  str = str.replace(/([^\n])\n(#{1,6}\s+)/g, '$1\n\n$2');

  return str;
}

// Post-process HTML generated by marked/parser to add interactive citations, responsive table wrappers, and code headers
function postprocessHtml(html) {
  if (!html) return '';

  // 1. Convert citation brackets to interactive badges:
  // Handles [Source 1], [Source 1: filename.pdf, Page 2], [Source 1: filename.pdf], etc.
  html = html.replace(/\[Source\s*(\d+)(?::\s*([^,\]]+))?(?:,?\s*Page\s*(\d+))?\]/gi, (match, idx, file, page) => {
    const label = `Source ${idx}`;
    const tooltip = file ? `${file.trim()}${page ? ` (p. ${page.trim()})` : ''}` : `Source chunk ${idx}`;
    return `<span class="inline-citation" onclick="jumpToCitation(${idx})" title="${escapeHtml(tooltip)}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span>${label}</span></span>`;
  });

  // 2. Wrap bare <table> elements in .markdown-table-wrapper for responsive horizontal scrolling
  html = html.replace(/(<table[\s\S]*?<\/table>)/gi, (match) => {
    return `<div class="markdown-table-wrapper">${match}</div>`;
  });

  // 3. Wrap bare <pre><code ...> blocks into code card with copy button & language badge
  html = html.replace(/<pre><code(?:\s+class="language-([a-zA-Z0-9_\-]+)")?>([\s\S]*?)<\/code><\/pre>/gi, (match, lang, codeContent) => {
    const displayLang = lang || 'code';
    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">${escapeHtml(displayLang)}</span>
          <button type="button" class="btn-copy-code" onclick="copyCodeBlock(this)" title="Copy code snippet" aria-label="Copy code">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-text">Copy</span>
          </button>
        </div>
        <pre class="code-pre"><code class="language-${escapeHtml(displayLang)}">${codeContent}</code></pre>
      </div>
    `;
  });

  return html;
}

// Robust fallback Markdown parser when marked is unavailable
function fallbackMarkdownParser(text) {
  if (!text) return '';
  let lines = text.split('\n');
  let output = [];
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      if (inCode) {
        // End code block
        output.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false;
        codeLines = [];
        codeLang = '';
      } else {
        // Close any active list
        if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
        inCode = true;
        codeLang = line.trim().slice(3).trim() || 'plaintext';
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Unordered List items (*, -, +)
    let ulMatch = line.match(/^(\s*)[*\-+]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) output.push(listType === 'ol' ? '</ol>' : '</ul>');
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${parseInlineMarkdown(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered List items (1., 2., etc.)
    let olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) output.push(listType === 'ol' ? '</ol>' : '</ul>');
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${parseInlineMarkdown(olMatch[2])}</li>`);
      continue;
    }

    // If we were in a list and this line is not a list item
    if (inList) {
      output.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }

    let trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Headings
    if (trimmed.startsWith('#### ')) {
      output.push(`<h4>${parseInlineMarkdown(trimmed.slice(5))}</h4>`);
    } else if (trimmed.startsWith('### ')) {
      output.push(`<h3>${parseInlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      output.push(`<h2>${parseInlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      output.push(`<h1>${parseInlineMarkdown(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('> ')) {
      output.push(`<blockquote><p>${parseInlineMarkdown(trimmed.slice(2))}</p></blockquote>`);
    } else {
      output.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
    }
  }

  if (inList) output.push(listType === 'ol' ? '</ol>' : '</ul>');
  if (inCode) output.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);

  return output.join('\n');
}

function parseInlineMarkdown(text) {
  if (!text) return '';
  let str = escapeHtml(text);

  // Inline code `code`
  str = str.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **bold** or __bold__
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic *italic* or _italic_
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/_([^_]+)_/g, '<em>$1</em>');

  return str;
}

// Master Markdown formatter
function formatMarkdown(text) {
  if (!text) return '';
  const preprocessed = preprocessMarkdown(text);

  // If marked and DOMPurify are loaded (from local scripts in static/)
  if (typeof marked !== 'undefined') {
    try {
      marked.setOptions({
        gfm: true,
        breaks: true,
        pedantic: false
      });
      const rawHtml = marked.parse(preprocessed);
      const cleanHtml = (typeof DOMPurify !== 'undefined')
        ? DOMPurify.sanitize(rawHtml, {
            ADD_ATTR: ['target', 'onclick', 'title']
          })
        : rawHtml;
      return postprocessHtml(cleanHtml);
    } catch (e) {
      console.warn('Marked parser warning, falling back to native parser:', e);
    }
  }

  return postprocessHtml(fallbackMarkdownParser(preprocessed));
}

// Interactive Code Copying
function copyCodeBlock(button) {
  const wrapper = button.closest('.code-block-wrapper');
  if (!wrapper) return;
  const codeEl = wrapper.querySelector('pre code');
  if (!codeEl) return;
  const text = codeEl.innerText || codeEl.textContent;

  const textSpan = button.querySelector('.copy-text');
  const originalText = textSpan ? textSpan.textContent : 'Copy';

  const markCopied = () => {
    button.classList.add('copied');
    if (textSpan) textSpan.textContent = 'Copied!';
    setTimeout(() => {
      button.classList.remove('copied');
      if (textSpan) textSpan.textContent = originalText;
    }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(() => fallbackCopy(text, markCopied));
  } else {
    fallbackCopy(text, markCopied);
  }
}

function fallbackCopy(text, callback) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    if (callback) callback();
  } catch (e) {
    console.error('Fallback copy failed: ', e);
  }
  document.body.removeChild(textarea);
}

// Interactive Citation Jump & Highlight
function jumpToCitation(idx) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const cards = messages.querySelectorAll('.citation-card');
  let targetCard = null;
  cards.forEach(card => {
    const srcSpan = card.querySelector('.citation-source');
    if (srcSpan && srcSpan.textContent.includes(`[Source ${idx}]`)) {
      targetCard = card;
    }
  });

  if (targetCard) {
    const grid = targetCard.closest('.citations-grid');
    if (grid && grid.classList.contains('hidden')) {
      grid.classList.remove('hidden');
    }
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    targetCard.classList.add('citation-highlight');
    setTimeout(() => targetCard.classList.remove('citation-highlight'), 2200);
  }
}
