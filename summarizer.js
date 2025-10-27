// summarizer.js - TextRank-based summarizer for TrailNote
// Source: https://github.com/davidadamojr/TextRank (MIT License)
// Minimal client-side implementation

function getSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [];
}

function getKeywords(text) {
  // Simple keyword extraction: most frequent words (excluding stopwords)
  const stopwords = new Set(["the","is","at","which","on","and","a","an","of","to","in","for","with","by","as","from","that","this","it","are","was","be","or","but","not","have","has","had","will","would","can","could","should","do","does","did"]);
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/);
  const freq = {};
  words.forEach(w => {
    if (!stopwords.has(w) && w.length > 2) freq[w] = (freq[w]||0)+1;
  });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0]);
}

function summarizeTextRank(text, maxSentences=3) {
  const sentences = getSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(' ');
  // Score sentences by keyword overlap
  const keywords = getKeywords(text);
  const scores = sentences.map(s => {
    const sWords = s.toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/);
    const score = sWords.filter(w => keywords.includes(w)).length;
    return { sentence: s, score };
  });
  scores.sort((a,b)=>b.score-a.score);
  return scores.slice(0,maxSentences).map(s=>s.sentence.trim()).join(' ');
}

// Export for content.js
window.summarizeTextRank = summarizeTextRank;
window.getKeywords = getKeywords;
