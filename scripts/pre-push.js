#!/usr/bin/env node
/**
 * pre-push.js
 * Node implementation for Git pre-push hook.
 *
 * Behavior:
 *  - Reads diff from commits being pushed (or staged changes)
 *  - Sends diff + few-shot prompt to Groq API
 *  - Parses response for test files and writes them under `__tests__/`
 *  - Generated files remain untracked and are NOT auto-staged
 *  - NEVER blocks or aborts push under any condition
 *
 * Configuration:
 *  - `GROQ_API_KEY` and `GROQ_API_URL` environment variables preferred
 *  - Fallback to `config/groq.config.json` if env vars not set
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'groq.config.json');
const PROMPT_PATH = path.join(__dirname, 'groq_prompt.txt');

// Load config (env vars override file)
function loadConfig() {
  const cfg = {};
  if (process.env.GROQ_API_KEY) cfg.apiKey = process.env.GROQ_API_KEY;
  if (process.env.GROQ_API_URL) cfg.apiUrl = process.env.GROQ_API_URL;
  if (!cfg.apiKey && fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      Object.assign(cfg, parsed);
    } catch (e) {
      // ignore JSON parse errors
    }
  }
  return cfg;
}

// Get diff from commits being pushed (or fall back to staged diff)
function getStagedDiff() {
  try {
    let diff = '';
    try {
      // Get current branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      const remoteBranch = `origin/${branch}`;
      // Check if remote branch exists
      execSync(`git rev-parse ${remoteBranch}`, { encoding: 'utf8', stdio: 'ignore' });
      // Get diff between remote and local HEAD
      diff = execSync(`git diff ${remoteBranch}...HEAD --no-color`, { encoding: 'utf8' });
    } catch (e) {
      // Remote branch may not exist yet; fall back to staged
    }

    if (diff && diff.trim()) return diff;

    // Fall back to staged changes
    return execSync('git diff --cached --no-color', { encoding: 'utf8' });
  } catch (e) {
    return '';
  }
}

// Get fetch function (Node 18+ or node-fetch)
function getFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  try {
    // eslint-disable-next-line global-require
    return require('node-fetch');
  } catch (e) {
    return null;
  }
}

// Call Groq API (supports both chat and prompt endpoints)
async function callGroq(apiUrl, apiKey, prompt) {
  const fetchFn = getFetch();
  if (!fetchFn) throw new Error('No fetch available. Use Node 18+ or install node-fetch.');

  const useChat = /\/chat|openai|chat.completions/.test(apiUrl);

  let res;
  if (useChat) {
    const body = {
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are an assistant that outputs unit tests based on a diff. Respond with files in JSON: {"files":[{"path":"__tests__/x.test.js","content":"..."}]} or as text with file headers like // __tests__/x.test.js' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    };

    res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body)
    });
  } else {
    res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ prompt })
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Groq API error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.details = text;
    throw err;
  }

  const contentType = res.headers && res.headers.get ? res.headers.get('content-type') : '';
  if (contentType && contentType.includes('application/json')) {
    const json = await res.json();
    const chatContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.text;
    if (chatContent) return { text: chatContent, raw: json };
    return { json };
  }

  return { text: await res.text() };
}

// Parse response into files array
function parseFilesFromResponse(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.files)) return resp.files;
  if (resp.files && typeof resp.files === 'object') {
    return Object.entries(resp.files).map(([p, c]) => ({ path: p, content: c }));
  }

  const text = resp.text || (typeof resp === 'string' ? resp : '');
  const files = [];
  const headerRe = /^(?:\/\/|#)\s*(\/?[^\s\r\n]+)\s*$/gm;
  let match;
  const headers = [];

  while ((match = headerRe.exec(text)) !== null) {
    headers.push({ path: match[1].trim(), index: match.index });
  }

  if (headers.length === 0) {
    if (text.trim()) files.push({ path: '__tests__/ai-generated.test.js', content: text });
    return files;
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const headerLine = headers[i].path;
    const contentStart = text.indexOf('\n', start);
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const chunk = text.slice(contentStart + 1, end).replace(/^\s+|\s+$/g, '');
    files.push({ path: headerLine.startsWith('/') ? headerLine.slice(1) : headerLine, content: chunk });
  }

  return files;
}

// Write files safely (creates new files, appends .ai to existing files)
function writeFiles(files) {
  const written = [];
  for (const f of files) {
    if (!f || !f.path) continue;
    let rel = f.path;
    if (!path.dirname(rel) || path.dirname(rel) === '.') {
      rel = path.posix.join('__tests__', rel);
    }
    if (!path.extname(rel)) rel = rel + '.test.js';
    const full = path.join(process.cwd(), rel);
    const dir = path.dirname(full);
    try {
      fs.mkdirSync(dir, { recursive: true });
      let target = full;
      if (fs.existsSync(target)) {
        const parsed = path.parse(target);
        target = path.join(parsed.dir, parsed.name + '.ai' + parsed.ext);
      }
      fs.writeFileSync(target, f.content, 'utf8');
      written.push(path.relative(process.cwd(), target));
    } catch (writeErr) {
      // Silently skip write errors
    }
  }
  return written;
}

// Main: run silently, NEVER exit non-zero
(async function main() {
  try {
    const cfg = loadConfig();
    const apiKey = cfg.apiKey;
    const apiUrl = cfg.apiUrl || 'https://api.groq.com/openai/v1/chat/completions';

    // Get diff
    const diff = getStagedDiff();
    if (!diff || diff.trim() === '') {
      // Nothing to generate; allow push
      process.exit(0);
    }

    // Load prompt template
    let promptTemplate = '';
    if (fs.existsSync(PROMPT_PATH)) {
      promptTemplate = fs.readFileSync(PROMPT_PATH, 'utf8');
    } else {
      promptTemplate = 'Generate unit tests from the given diff. Respond with files in JSON: { "files": [ { "path": "__tests__/x.test.js", "content": "..." } ] }';
    }
    const fullPrompt = `${promptTemplate}\n\nDiff:\n${diff}`;

    // Call Groq API
    let resp;
    try {
      resp = await callGroq(apiUrl, apiKey, fullPrompt);
    } catch (err) {
      // Log the error but continue push
      console.log(`[pre-push] Groq API error: ${err.message}`);
      if (err.details) console.log(`[pre-push] Details: ${err.details.substring(0, 200)}`);
      process.exit(0);
    }

    // Parse and write files
    const files = parseFilesFromResponse(resp);
    if (!files || files.length === 0) {
      console.log('[pre-push] No test files generated by AI.');
      process.exit(0);
    }

    const written = writeFiles(files);
    if (written.length > 0) {
      console.log('[pre-push] Generated test files (untracked):');
      for (const w of written) {
        console.log(`  ✓ ${w}`);
      }
    }

    // Always exit 0: push continues regardless
    process.exit(0);
  } catch (err) {
    // Catch-all: log but never abort push
    console.log(`[pre-push] Unexpected error: ${err && err.message ? err.message : err}`);
    process.exit(0);
  }
})();
