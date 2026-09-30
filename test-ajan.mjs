import fs from 'fs';

// 1. KOD (AJAN) METNİ OKUR VE CÜMLELERE BÖLER
// Daha önce oluşturduğumuz dağınık metni okuyoruz
const text = fs.readFileSync(new URL('./tests/drone.txt', import.meta.url), 'utf8');

// Basitçe noktalardan bölüp başına numara ekliyoruz
const sentences = text.match(/[^.!?]+[.!?]+/g).map(s => s.trim());
const numberedText = sentences.map((s, i) => `[${i}] ${s}`).join('\n');

// 2. AJANIN YAPAY ZEKAYA VERECEĞİ KESİN EMİR (PROMPT VE SCHEMA)
const prompt = `
You are a Knowledge Compressor and "Vibe to Pro" translator.
Analyze the numbered sentences below.
1. Group the relevant engineering ideas into logical clusters. Ignore irrelevant stories, jokes, or complaints.
2. For each cluster, output "universal_keywords" (global engineering terms).
3. Rewrite the cluster into a compact, professional summary.
4. List the exact "sentence_ids" that belong to this cluster.

Text to compress:
${numberedText}

Return ONLY JSON matching this exact structure:
{
  "clusters": [
    {
      "color_theme": "green or orange or blue or red",
      "universal_keywords": ["string", "string"],
      "rewritten_text": "string",
      "sentence_ids": [number, number]
    }
  ]
}
`;

console.log("=== KODUN (AJANIN) MODELE GÖNDERECEĞİ SON PROMPT ===");
console.log(prompt);
