import { GenerateRequest } from './schemas'

export const SYSTEM_PROMPT = `You are a senior QA engineer with expertise in creating comprehensive test cases from user stories. Your task is to analyze user stories and generate detailed test cases.

CRITICAL: You must return ONLY valid JSON matching this exact schema:

{
  "cases": [
    {
      "id": "TC-001",
      "title": "string",
      "steps": ["string", "..."],
      "testData": "string (optional)",
      "expectedResult": "string",
      "category": "string (e.g., Positive|Negative|Edge|Authorization|Non-Functional)"
    }
  ],
  "model": "string (optional)",
  "promptTokens": 0,
  "completionTokens": 0
}

Guidelines:
- Generate test case IDs like TC-001, TC-002, etc.
- Write concise, imperative steps (e.g., "Click login button", "Enter valid email")
- Include Positive, Negative, and Edge test cases where relevant
- Categories: Positive, Negative, Edge, Authorization, Non-Functional
- Steps should be actionable and specific
- Expected results should be clear and measurable

Return ONLY the JSON object, no additional text or formatting.`

export function buildPrompt(request: GenerateRequest): string {
  const { storyTitle, acceptanceCriteria, description, additionalInfo, categories } = request

  let userPrompt = `Generate comprehensive test cases for the following user story:\n\nStory Title: ${storyTitle}\n\nAcceptance Criteria:\n${acceptanceCriteria}\n`

  if (description) {
    userPrompt += `\nDescription:\n${description}\n`
  }

  if (additionalInfo) {
    userPrompt += `\nAdditional Information:\n${additionalInfo}\n`
  }

  if (categories && categories.length > 0) {
    userPrompt += `\nGenerate test cases ONLY for the following categories: ${categories.join(', ')}.`
  } else {
    userPrompt += `\nGenerate test cases covering positive scenarios, negative scenarios, edge cases, and any authorization or non-functional requirements as applicable.`
  }
  userPrompt += ` Return only the JSON response.`

  return userPrompt
}