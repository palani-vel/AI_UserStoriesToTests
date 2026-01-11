**Overview**

This repository includes a non-blocking, production-ready Git `pre-push` hook that uses the Groq AI API to generate unit tests from the diff being pushed. The hook runs silently during `git push`, writes generated tests to `__tests__/` (as untracked files), and never aborts or blocks a push regardless of API errors or network failures.

**Architecture**

- A tiny shell wrapper installed at Git's hook location calls the Node script on push.
- The Node script collects the diff (un-pushed commits or staged changes), combines it with a few-shot prompt, calls the Groq API, parses the returned files, and writes them under `__tests__/` without staging them.
- Configuration is read from environment variables or a local `config/groq.config.json` fallback (but API keys must never be committed).

**How AI-Based Unit Test Generation Works During Push**

1. On `git push`, Git executes the hook file installed at `.git/hooks/pre-push` (created by `scripts/install-hook.js`). That hook simply invokes the shell wrapper `scripts/pre-push-hook.sh`.
2. `scripts/pre-push-hook.sh` runs `node scripts/pre-push.js`.
3. `scripts/pre-push.js` obtains the diff to be pushed:
   - It first tries `git diff origin/<branch>...HEAD` (unpushed commits).
   - If that fails or is empty, it falls back to `git diff --cached` (staged changes).
4. The script loads the few-shot prompt template from `scripts/groq_prompt.txt` and appends the diff.
5. The script calls the Groq API (chat completions endpoint by default) with a small system instruction and the prompt.
6. The response is expected as either JSON `{ "files": [{"path":"__tests__/x.test.js","content":"..."}] }` or as plain text with file header comments (e.g., `// __tests__/x.test.js`).
7. The script parses the response into files and writes them to `__tests__/`. If a file already exists, the generated file is written alongside with a `.ai` suffix to avoid collisions.
8. The hook always exits successfully (exit code `0`) so the push proceeds normally. Generated files are left untracked so developers can review and opt-in to commit them.

**Role Of Each File**

- **`scripts/pre-push-hook.sh`**: Shell wrapper invoked by Git's `.git/hooks/pre-push`. It forwards execution to the Node script. Installed to `.git/hooks/pre-push` by the installer.

- **`scripts/pre-push.js`**: Main Node implementation of the hook. Responsibilities:
  - Collects the diff being pushed or staged changes.
  - Loads the prompt template from `scripts/groq_prompt.txt`.
  - Calls the Groq API (supports OpenAI-style chat completions endpoints).
  - Parses returned files and writes them to `__tests__/` without staging.
  - Logs diagnostic messages prefixed with `[pre-push]` and ALWAYS exits `0` (non-blocking behavior).

- **`scripts/groq_prompt.txt`**: Few-shot prompt template with examples showing expected outputs (JSON files or plain-text file headers). The Node script appends the repo diff to this template before calling the API.

- **`scripts/install-hook.js`**: Small installer that copies `scripts/pre-push-hook.sh` to `.git/hooks/pre-push` and sets executable permissions. Run this once per clone to activate the hook.

- **`config/groq.config.json`**: Optional fallback configuration file for `apiKey` and `apiUrl`. DO NOT commit secrets to your repository. Prefer using `GROQ_API_KEY` and `GROQ_API_URL` environment variables. If you keep a local config file, ensure it is listed in `.gitignore`.

**Installation & Setup (Repository Maintainer)**

Prerequisites:

- Node.js 18+ (recommended) or Node with `node-fetch` available
- Git CLI
- A valid Groq API key with access to the chat completions endpoint

Step-by-step:

1. Clone the repository and change to its root directory:

```bash
git clone <repo-url>
cd <repo>
```

2. Ensure Node and dependencies are available. If your project has a `package.json`, run:

```bash
npm install
```

3. Configure the Groq API key and (optionally) the API URL. Prefer environment variables:

- On macOS / Linux / PowerShell (session):

```bash
export GROQ_API_KEY="<your_api_key>"
export GROQ_API_URL="https://api.groq.com/openai/v1/chat/completions"
```

- On Windows PowerShell (session):

```powershell
$env:GROQ_API_KEY = "<your_api_key>"
$env:GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
```

Alternatively, create `config/groq.config.json` with placeholders (DO NOT commit real keys):

```json
{
  "apiKey": "<REPLACE_WITH_GROQ_API_KEY>",
  "apiUrl": "https://api.groq.com/openai/v1/chat/completions"
}
```

Add that file to `.gitignore` to avoid accidental commits.

4. Install the Git hook (run from repository root):

```bash
npm run install-hook
```

This copies `scripts/pre-push-hook.sh` into `.git/hooks/pre-push` and sets exec permissions.

5. Verify the hook is installed:

```bash
ls -l .git/hooks/pre-push
# or on PowerShell
Get-ChildItem .git/hooks/pre-push
```

6. Test the flow:

- Make a small change that will trigger test generation (e.g., add a simple function)
- Commit and push to a branch on your remote

The hook runs during `git push`. It will log messages like:

```
[pre-push] Generated test files (untracked):
  ✓ __tests__/your-test-file.test.js
```

The push will continue regardless of whether the Groq API succeeded.

**How To Reuse On Another PC/Laptop**

1. Clone the repository on the new machine.
2. Install Node (18+) and run `npm install` if needed.
3. Set the `GROQ_API_KEY` environment variable on the new machine (or create a local `config/groq.config.json` with a placeholder — do not commit secrets).
4. Run the installer to place the hook in `.git/hooks`:

```bash
npm run install-hook
```

5. Push a commit to trigger the hook. Generated tests will appear in `__tests__/` as untracked files.

**Troubleshooting & Notes**

- Node `fetch`: The script expects Node 18+ (which has global `fetch`). If you run an older Node, install `node-fetch` as a project dependency:

```bash
npm install node-fetch --save
```

- API Endpoint / Model: Default `GROQ_API_URL` targets the chat completions endpoint. If you need to change models or endpoints, set `GROQ_MODEL` or `GROQ_API_URL` via environment variables.

- Secrets: Never commit API keys. If a key was accidentally committed, follow GitHub guidance to rotate the key and purge it from history if needed.

- File collisions: If a generated filename already exists in the repo, the script writes a sibling file with a `.ai` suffix (e.g., `existing.test.ai.js`) to avoid overwriting.

- Non-blocking behavior: The hook intentionally never returns a non-zero exit code. That ensures developer workflows are not disrupted by AI failures.

**Example Commands**

Install hook:

```bash
npm run install-hook
```

Set env vars (PowerShell session example):

```powershell
$env:GROQ_API_KEY = "sk-..."
$env:GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
```

Test push (make a change, commit, and push):

```bash
git add .
git commit -m "Add small change to trigger AI tests"
git push origin your-branch
```

**Security Reminder**

- Use environment variables for secrets.
- Add `config/groq.config.json` to `.gitignore` if you use it locally.
- Rotate keys immediately if they leak.

**Files Summary**

- `scripts/pre-push.js` — main logic (diff collection, API call, file parsing, write files)
- `scripts/pre-push-hook.sh` — shell wrapper executed by Git
- `scripts/install-hook.js` — copies the wrapper into `.git/hooks/pre-push`
- `scripts/groq_prompt.txt` — few-shot prompt template used by the AI
- `config/groq.config.json` — optional local fallback (DO NOT commit real keys)

---

If you want, I can also:

- Add a small README badge or GitHub Actions workflow to validate the hook behavior in CI (read-only simulation), or
- Create a minimal `.gitignore` entry snippet to ensure `config/groq.config.json` is ignored.

