# 📌 AI-Assisted Unit Test Generation via Git Pre-Push Hook

## 📋 Metadata

**Name:** AI-Assisted Test Generator  
**Role:** Git Pre-Push Hook Automation  
**Objective:**  
Automatically generate unit tests for staged code changes during `git push` using an LLM (Groq API), while allowing developer review and confirmation before pushing to the remote repository.

---

## 🧠 LLM Prompt Context (Few-Shot Examples)

These examples help guide the LLM to generate consistent, high-quality unit tests.

### Shot 1
**Input:**
```
Diff:
+ function add(a, b) {
+   return a + b;
+ }
```
**Output:**
```js
// __tests__/add.test.js
import { add } from '../src/add';

describe('add()', () => {
  it('returns sum of two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

---

### Shot 2
**Input:**
```
Diff:
+ export const isEven = (num) => num % 2 === 0;
```
**Output:**
```js
// __tests__/isEven.test.js
import { isEven } from '../src/isEven';

describe('isEven()', () => {
  it('returns true for even numbers', () => {
    expect(isEven(4)).toBe(true);
  });

  it('returns false for odd numbers', () => {
    expect(isEven(3)).toBe(false);
  });
});
```

---

### Shot 3
**Input:**
```
Diff:
+ const greet = (name) => `Hello, ${name}`;
```
**Output:**
```js
// __tests__/greet.test.js
import { greet } from '../src/greet';

describe('greet()', () => {
  it('greets user by name', () => {
    expect(greet('Alice')).toBe('Hello, Alice');
  });
});
```

---

## 🔄 Flow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Developer runs `git push`] --> B[Pre-push hook triggers]
    B --> C[Extract staged code diff]
    C --> D[Send diff to Groq API (LLM)]
    D --> E[AI generates unit test file(s)]
    E --> F[Hook saves test file into project]
    F --> G[Developer reviews and confirms push]
    G --> H[Push continues to remote]
```

---

## 📘 Step-by-Step Flow Description

1. Developer initiates `git push`.
2. Pre-push hook intercepts the operation.
3. Staged code changes are extracted.
4. Diff is sent to Groq API with few-shot prompt.
5. AI generates relevant unit test files.
6. Hook saves generated tests into project structure.
7. Developer reviews and approves test additions.
8. Push continues to remote repository.

---

## 🛠 Implementation Notes

- Hook location: `.git/hooks/pre-push`
- Diff command: `git diff --cached`
- Supported languages depend on project setup (e.g., JS, Python, Java)
- Validate generated tests before writing files
- Optional: run test suite before allowing push

---

## ✅ Outcome

- Improves test coverage automatically
- Encourages test-driven practices
- Keeps developer in control
- Seamlessly integrates with existing Git workflows
