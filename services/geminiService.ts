import { GoogleGenAI } from "@google/genai";

const PROMPT_ENGINEERING_SYSTEM_PROMPT = `You are a Meticulous Systems Architect operating inside the HybridAgentStack Shared Intelligence Framework.

Your Mission:
Transform the source text into a high-quality, Tier-3 Tactical Execution prompt suitable for any CLI AI agent (Claude Code, Gemini CLI, Ollama, etc.).

Engineering Requirements:
1. Reduce verbosity by 40–60%
2. Increase conceptual depth by 5–10×
3. Add structure, clarity, and architectural coherence
4. Be fully self-contained and executable
5. Incorporate latest AI technologies (multimodal, reasoning, agentic patterns)
6. Leverage best practices from Gemini, ChatGPT, and Claude
7. Design for maximum utility and precision output
8. Use system design principles: modularity, composability, resilience

Output Format (JSON):
{
  "optimized_prompt": "The fully engineered, production-ready prompt",
  "architectural_notes": "Technical design decisions and reasoning",
  "usage_guidance": "How to use this prompt with different AI platforms (Claude, Gemini, Ollama)"
}

Return ONLY the JSON block—no additional text.`;

export async function rephraseText(
  text: string,
  tone: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  if (tone === 'prompt-engineering') {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Transform this source text into an optimized prompt:\n\nSource Text:\n${text}`,
        config: {
          systemInstruction: PROMPT_ENGINEERING_SYSTEM_PROMPT,
          responseMimeType: "application/json",
        },
      });
      return response.text.trim();
    } catch (error) {
      console.error("Gemini API Error (Prompt Engineering):", error);
      throw new Error("Failed to engineer prompt. Please try again later.");
    }
  }

  let prompt: string;

  if (tone === 'code-expert') {
    prompt = `You are a world-class software engineer and prompt engineering expert. Your task is to refine, correct, or improve the given programming-related text, which could be a code snippet, a technical question, or an explanation.

Task: Analyze and improve the following text.
Text: "${text}"

Instructions:
- If it's a code snippet, identify bugs, suggest performance improvements, or enhance readability (e.g., better variable names, comments). Return the improved code, explaining the changes in comments within the code itself.
- If it's a technical question, refine it to be clearer, more specific, and more likely to receive a high-quality answer on a platform like Stack Overflow.
- If it's a technical explanation, make it more accurate, clear, and concise.
- Only return the improved text/code.
- Do not add introductory phrases like "Here is the improved code:".
- Preserve the original programming language and intent.

Improved Version:`;
  } else if (tone === 'questioner') {
    prompt = `You are an expert tutor. Your task is to break down the provided text into a series of essential questions and clear answers to help a user understand the core concepts.

Topic Text: "${text}"

Instructions:
- Analyze the text to identify the main topic and key points.
- Generate a list of key questions that cover the essential aspects of the subject.
- Provide a concise, easy-to-understand answer for each question.
- Format the output in a clear Q&A style. Use Markdown for bolding the questions.
- Return only the list of questions and answers. Do not add any introductory or concluding text.

Q&A Breakdown:`;
  } else if (tone === 'notebooklm') {
    prompt = `You are a technical writer specializing in documentation. Your task is to transform the following text into a well-structured markdown format suitable for platforms like NotebookLM or knowledge bases.

Text to transform: "${text}"

Instructions:
- Analyze the text and identify headings, lists, code blocks, and other structural elements.
- Convert the text into clean, readable markdown.
- Use appropriate heading levels (#, ##, etc.).
- Format lists as bullet points or numbered lists.
- Enclose code snippets in markdown code blocks (\`\`\`).
- Return only the transformed markdown content. Do not add any introductory or concluding text.

Markdown Version:`;
  }
  else {
    let toneDescription = tone;
    if (tone === 'creative') {
        toneDescription = 'creative, vivid, and engaging';
    }
    prompt = `You are an expert in writing and communication. Your task is to rephrase the given text to adopt a specific tone.
  
Tone: ${toneDescription}
Text to rephrase: "${text}"

Instructions:
- Only return the rephrased text.
- Do not add any introductory phrases, explanations, or concluding remarks like "Here is the rephrased text:".
- Ensure the core meaning of the original text is preserved.
- If the input text is empty or nonsensical, return an empty string.

Rephrased text:`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to get a response from the AI. Please try again later.");
  }
}
