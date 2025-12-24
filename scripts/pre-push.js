#!/usr/bin/env node
/**
 * pre-push.js
 * Node implementation for Git pre-push hook.
 *
 * Behavior:
 *  - Reads staged diff via `git diff --cached`
 *  - Sends diff + few-shot prompt to Groq API
 *  - Parses response for test files and writes them under `__tests__/` or returned paths
 *  - Prompts developer to confirm continuing the push
 *  - Fails gracefully if API is unavailable or developer aborts
 *
 * Configuration:
 *  - `GROQ_API_KEY` and `GROQ_API_URL` environment variables are preferred
 *  - Fallback to `config/groq.config.json` if present
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'groq.config.json');
const PROMPT_PATH = path.join(__dirname, 'groq_prompt.txt');

// Simple yes/no prompt helper
function askYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + ' ', (answer) => {
      rl.close();
      const normalized = (answer || '').trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

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
      // ignore JSON parse errors; we'll handle missing key later
    }
  }
  return cfg;
}

// Get staged diff
function getStagedDiff() {
  try {
    return execSync('git diff --cached --no-color', { encoding: 'utf8' });
  } catch (e) {
    return '';
  }
}

// Ensure fetch exists (Node 18+). Fallback to node-fetch if available.
function getFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  try {
    // eslint-disable-next-line global-require
    const nf = require('node-fetch');
    return nf;
  } catch (e) {
    return null;
  }
}

// Call Groq API: expects the API to accept a JSON body { prompt }
async function callGroq(apiUrl, apiKey, prompt) {
  const fetchFn = getFetch();
  if (!fetchFn) throw new Error('No fetch available. Use Node 18+ or install node-fetch.');

  const res = await fetchFn(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Groq API request failed: ${res.status} ${res.statusText} ${text}`);
    err.status = res.status;
    throw err;
  }

  // Prefer JSON
  const contentType = res.headers && res.headers.get ? res.headers.get('content-type') : '';
  if (contentType && contentType.includes('application/json')) return res.json();
  return { text: await res.text() };
}

// Parse response into files array: [{ path, content }]
function parseFilesFromResponse(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.files)) return resp.files;
  if (resp.files && typeof resp.files === 'object') {
    return Object.entries(resp.files).map(([p, c]) => ({ path: p, content: c }));
  }
  const text = resp.text || (typeof resp === 'string' ? resp : '');
  const files = [];
  // Detect file header comments like: // __tests__/name.test.js
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

// Write files safely (avoid overwriting existing files without adding .ai suffix)
function writeFiles(files) {
  const written = [];
  for (const f of files) {
    if (!f || !f.path) continue;
    let rel = f.path;
    // If only filename provided, put under __tests__
    if (!path.dirname(rel) || path.dirname(rel) === '.') rel = path.posix.join('__tests__', rel);
    if (!path.extname(rel)) rel = rel + '.test.js';
    const full = path.join(process.cwd(), rel);
    const dir = path.dirname(full);
    fs.mkdirSync(dir, { recursive: true });
    let target = full;
    if (fs.existsSync(target)) {
      const parsed = path.parse(target);
      target = path.join(parsed.dir, parsed.name + '.ai' + parsed.ext);
    }
    fs.writeFileSync(target, f.content, 'utf8');
    written.push(path.relative(process.cwd(), target));
  }
  return written;
}

(async function main() {
  try {
    const cfg = loadConfig();
    const apiKey = cfg.apiKey;
    const apiUrl = cfg.apiUrl || 'https://api.groq.com/v1/complete';

    // 1) get staged diff
    const diff = getStagedDiff();
    if (!diff || diff.trim() === '') {
      // Nothing staged; allow push to continue
      process.exit(0);
    }

    // 2) load few-shot prompt template
    let promptTemplate = '';
    if (fs.existsSync(PROMPT_PATH)) {
      promptTemplate = fs.readFileSync(PROMPT_PATH, 'utf8');
    } else {
      promptTemplate = 'Generate unit tests from the given diff. Respond with files as JSON: { "files": [ { "path": "__tests__/x.test.js", "content": "..." } ] }';
    }
    const fullPrompt = `${promptTemplate}\n\nDiff:\n${diff}`;

    // 3) Call Groq API
    let resp;
    try {
      resp = await callGroq(apiUrl, apiKey, fullPrompt);
    } catch (err) {
      // If the API returned a 404 it often means the configured endpoint is incorrect.
      // Treat 404 as non-fatal: inform the user and continue the push so normal workflow isn't blocked.
      if (err && err.status === 404) {
        console.warn('Groq API returned 404 (endpoint not found). Skipping AI test generation and continuing push.');
        process.exit(0);
      }
      console.error('Groq API call failed:', err && err.message ? err.message : err);
      const proceed = await askYesNo('Generating tests failed. Continue push without AI tests? (y/N)');
      if (proceed) process.exit(0);
      console.error('Aborting push.');
      process.exit(1);
    }

    // 4) parse and write files
    const files = parseFilesFromResponse(resp);
    if (!files || files.length === 0) {
      console.log('No test files were returned by the AI.');
      const proceed = await askYesNo('Continue push without tests? (y/N)');
      if (proceed) process.exit(0);
      process.exit(1);
    }

    const written = writeFiles(files);
    console.log('AI-generated test files (not staged):');
    for (const w of written) console.log('  -', w);

    const ok = await askYesNo('Review the files above. Continue push? (y/N)');
    if (!ok) {
      console.error('Push aborted by developer.');
      process.exit(1);
    }

    // Exit 0 to allow push to continue. Generated files are not auto-staged.
    process.exit(0);
  } catch (err) {
    console.error('Pre-push script error:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
