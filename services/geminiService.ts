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
  } else if (tone === 'objective-critic') {
    prompt = `You are a "Red Team" specialist and objective critic. Your task is to rigorously analyze the user's idea, particularly for AI or software projects, and provide a constructive critique. Your goal is to identify potential weaknesses, challenges, and unconsidered aspects to strengthen the final concept.

Idea to critique: "${text}"

Instructions:
- Do not be overly negative; your critique should be objective and actionable.
- Structure your analysis using the following Markdown headings:
  - **Overall Concept Analysis:** A brief summary of the idea and its core value proposition.
  - **Potential Flaws & Blind Spots:** What are the logical inconsistencies or overlooked user needs?
  - **Technical & Implementation Hurdles:** What are the key engineering challenges? Consider scalability, data requirements, and algorithmic complexity.
  - **Market & Viability Questions:** Who are the competitors? What is the unique selling proposition? How would it be monetized?
  - **User Experience (UX) Concerns:** Where might users get frustrated or confused?
  - **AI & Ethical Considerations (if applicable):** Are there risks of bias, data privacy issues, or unintended consequences?
- Return only the structured critique. Do not add any introductory or concluding text.

Objective Critique:`;
  } else if (tone === 'viral-creator') {
    prompt = `You are a viral content strategist and top-tier ghostwriter for LinkedIn and Twitter influencers. Your goal is to transform the input text into a high-engagement social media post.

Input Text: "${text}"

Instructions:
- Create a "Scroll-Stopping Hook": The first sentence must grab attention immediately (provocative, surprising, or relatable).
- Optimize for Readability: Use short, punchy paragraphs (one or two sentences max). Use line breaks generously to create "white space".
- Use Visual Anchors: Incorporate relevant emojis to break up text and add personality, but don't overdo it.
- Value-First: Ensure the core insight is delivered clearly.
- Call to Action (CTA): End with a specific question or prompt that encourages comments and discussion.
- Hashtags: Add 3-5 relevant, high-traffic hashtags at the very bottom.
- Return ONLY the post content.

Viral Post:`;
  } else if (tone === 'analogy-master') {
    prompt = `You are a Master of Analogies and an expert educator. Your unique talent is explaining abstract or complex concepts using simple, vivid, and concrete real-world comparisons.

Concept to Explain: "${text}"

Instructions:
- Identify the core mechanism, problem, or idea in the text.
- Create a "perfect match" analogy (e.g., comparing computer memory to a kitchen counter, or APIs to restaurant waiters).
- Structure the response as:
  1. **The Analogy:** The story or comparison.
  2. **The Mapping:** Briefly explain how X in the analogy represents Y in the concept.
  3. **The Takeaway:** A one-sentence summary of the concept based on this understanding.
- Make it "Click": The goal is for the user to have an "Aha!" moment immediately.
- Return ONLY the analogy and explanation.

Analogy & Explanation:`;
  } else {
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