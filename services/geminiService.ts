
import { GoogleGenAI } from "@google/genai";

const PROMPT_ENGINEERING_SYSTEM_PROMPT = `You are a Meticulous Systems Architect operating inside the HybridAgentStack Shared Intelligence Framework.

Your Mission:
Transform the source text into a high-quality, Tier-3 Tactical Execution prompt suitable for any CLI AI agent.

Engineering Requirements:
1. Reduce verbosity by 40–60%
2. Increase conceptual depth by 5–10×
3. Add structure, clarity, and architectural coherence
4. Be fully self-contained and executable

Output Format (JSON):
{
  "optimized_prompt": "The fully engineered, production-ready prompt",
  "architectural_notes": "Technical design decisions and reasoning",
  "usage_guidance": "How to use this prompt"
}

Return ONLY the JSON block—no additional text.`;

export interface TuningParams {
  granularity: number; // 0-100
  risk: number;        // 0-100
  assertiveness: number; // 0-100
}

export async function rephraseText(
  text: string,
  tone: string,
  tuning?: TuningParams
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Default Config
  let modelName = 'gemini-2.5-flash';
  let generationConfig: any = {
    temperature: 0.7,
  };
  
  let prompt: string;
  let systemInstruction: string | undefined = undefined;

  // Construct Tuning Context if present
  let tuningContext = "";
  if (tuning) {
    tuningContext = `
---
**REALITY TUNING PARAMETERS**:
Apply the following dimensional adjustments to the output tone and content:
- **Technical Granularity**: ${tuning.granularity}% (0=Simple, 100=Dense Technical Jargon)
- **Risk Tolerance**: ${tuning.risk}% (0=Safe/Conservative, 100=High Risk/Gamble)
- **Assertiveness**: ${tuning.assertiveness}% (0=Passive/Diplomatic, 100=Dominant/Aggressive)
`;
  }

  // --- 1. THE EXECUTIVE BRIEF (Strategic Compression) ---
  if (tone === 'executive-brief') {
    generationConfig = {
        thinkingConfig: { thinkingBudget: 1024 },
        temperature: 0.7,
    };
    systemInstruction = `You are a Principal Semantic Architect and Chief Strategy Officer. 
    
    Your goal is NOT just to summarize, but to perform a "Reality Shift" on the content.
    Analyze the Input Data across three dimensions:
    1. **Technical**: Syntax normalization and fact extraction.
    2. **Cognitive**: Reducing cognitive load for the reader.
    3. **Economic**: Highlighting financial risk and opportunity.`;
    
    prompt = `Transform the following text into an Executive Strategy Brief.

Input Data: "${text}"

Directives:
1. **BLUF**: Start with a 2-sentence Bottom Line Up Front.
2. **Strategic Impact**: What does this mean for the business? (Revenue, Risk, or Efficiency).
3. **Key Actions**: Bullet points of what needs to happen next.
${tuningContext}
---
**MISSING MATTER ANALYSIS**:
After the brief, add a section titled "### 🔍 Contextual Vacuum Report".
Identify what was *missing* from the original text that made it ineffective for an executive (e.g., "Lacked financial data," "Passive voice reduced authority," "Buried the lead").
`;
  
  // --- 2. THE LEGAL SHIELD (Risk Analysis) ---
  } else if (tone === 'legal-shield') {
    generationConfig = {
        thinkingConfig: { thinkingBudget: 2048 },
        temperature: 0.3,
    };
    systemInstruction = `You are a Senior General Counsel and Risk Auditor. Your philosophy is "Defensive Pessimism." You assume the worst-case scenario interpretation of every sentence.`;
    
    prompt = `Analyze the following legal or policy text.

Text to Audit: "${text}"

Directives:
1. **Plain English Translation**: Explain what this actually means.
2. **Red Flags**: Identify clauses that are dangerous, unfair, or create hidden liability.
3. **Loopholes**: Are there vague terms that could be exploited?
${tuningContext}
---
**MISSING MATTER ANALYSIS**:
After the audit, add a section titled "### 🔍 Contextual Vacuum Report".
Highlight what protections are *absent* from the text (e.g., "Missing arbitration clause," "Undefined termination terms").
`;

  // --- 3. LEGACY ALCHEMIST (Code Modernization) ---
  } else if (tone === 'legacy-refactor') {
    generationConfig = {
        thinkingConfig: { thinkingBudget: 4096 }, 
        temperature: 0.2,
    };
    systemInstruction = `You are a Distinguished Software Architect. You prioritize Clean Architecture, SOLID principles, and Type Safety.`;
    
    prompt = `Refactor and Transmute the following code.

Source Code: "${text}"

Directives:
1. **Modernize**: Convert this into the modern industry standard (e.g., jQuery -> React, Python 2 -> Python 3.12).
2. **Type Safety**: Add strict typing.
3. **Architectural Shift**: Improve the structure (extract functions, use hooks).
${tuningContext}
---
**MISSING MATTER ANALYSIS**:
After the code, add a section titled "### 🔍 Technical Debt Report".
Identify specific "Code Smells" and "Architectural Rot" found in the original snippet (e.g., "Global state mutation," "Callback hell," "Magic numbers").
`;

  // --- 4. MEDICAL CLAIM (Insurance Narrative) ---
  } else if (tone === 'medical-claim') {
     generationConfig = {
        thinkingConfig: { thinkingBudget: 2048 },
        temperature: 0.4,
    };
    systemInstruction = `You are a Medical Coding Specialist and Insurance Claims Adjuster. Your goal is to translate raw clinical notes into "Medical Necessity" narratives that trigger approval algorithms.`;

    prompt = `Transform the following raw medical notes into an Insurance Claim Narrative.

Raw Notes: "${text}"

Directives:
1. **Clinical Narrative**: Rewrite the event as a structured medical history using professional terminology.
2. **Medical Necessity**: Explicitly link symptoms to the required treatment to justify coverage.
3. **ICD-10/CPT Hints**: Suggest likely codes based on the text (disclaimer: for reference only).
${tuningContext}
---
**MISSING MATTER ANALYSIS**:
After the narrative, add a section titled "### 🔍 Documentation Gap Report".
Identify what critical clinical data is missing that might cause a claim denial (e.g., "Missing pain scale score," "Duration of symptoms not specified").
`;

  // --- 5. SEMANTIC DNA (Keyword Ecosystem) ---
  } else if (tone === 'semantic-dna') {
    generationConfig = {
      thinkingConfig: { thinkingBudget: 1024 },
      temperature: 0.5,
    };
    systemInstruction = `You are a Principal Semantic Architect. Your goal is to deconstruct the input text into its atomic value components. Do not rewrite the text. Extract the underlying value framework.`;

    prompt = `Perform a Semantic DNA Extraction on the following input.

Input Data: "${text}"

Generate a tiered keyword ecosystem. Group them exactly by these dimensions:

### 🧬 Technical Dimension (The Mechanics)
*List specific keywords related to Latent Space Manipulation, Semantic Interoperability, or specific technologies mentioned or implied.*

### 🧠 Cognitive Dimension (The Psychology)
*List keywords related to Cognitive Load Reduction, Intent Alignment, Mental Model Mapping, or User Experience.*

### 💰 Economic Dimension (The Value)
*List keywords related to ROI, Frictionless Negotiation, Conversion Rate Optimization, or Compliance.*

---
**MISSING MATTER ANALYSIS**:
Identify one critical "Contextual Vacuum" for each dimension. What high-value keyword is missing that should be there?
${tuningContext}
`;

  // --- STANDARD PERSONAS ---
  } else if (tone === 'prompt-engineering') {
     prompt = `Transform this source text into an optimized prompt:\n\nSource Text:\n${text}\n${tuningContext}`;
     systemInstruction = PROMPT_ENGINEERING_SYSTEM_PROMPT;
     generationConfig = { responseMimeType: "application/json" };
  
  } else if (tone === 'code-expert') {
    prompt = `You are a world-class software engineer. Refine, correct, and improve the given text/code.\nText: "${text}"\n${tuningContext}\n\nImproved Version:`;
  } else if (tone === 'questioner') {
    prompt = `Break down this text into essential questions and clear answers.\nText: "${text}"\n${tuningContext}\n\nQ&A Breakdown:`;
  } else if (tone === 'notebooklm') {
    prompt = `Transform this text into structured markdown suitable for NotebookLM.\nText: "${text}"\n${tuningContext}\n\nMarkdown Version:`;
  } else if (tone === 'objective-critic') {
    prompt = `Critique this idea. Use headings: Concept, Flaws, Technical Hurdles, Market Viability.\nIdea: "${text}"\n${tuningContext}\n\nObjective Critique:`;
  } else if (tone === 'viral-creator') {
    prompt = `Transform this into a high-engagement LinkedIn/Twitter post. Use hooks, white space, and emojis.\nInput: "${text}"\n${tuningContext}\n\nViral Post:`;
  } else if (tone === 'analogy-master') {
    prompt = `Explain this concept using a vivid real-world analogy (e.g., APIs = Waiters).\nConcept: "${text}"\n${tuningContext}\n\nAnalogy & Explanation:`;
  } else {
    // Fallback for simple tones
    let toneDescription = tone;
    if (tone === 'creative') toneDescription = 'creative, vivid, and engaging';
    prompt = `Rephrase this text to be ${toneDescription}.\nText: "${text}"\n${tuningContext}\n\nRephrased text:`;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        ...generationConfig,
        systemInstruction: systemInstruction,
      },
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to process request. The neural link was interrupted.");
  }
}