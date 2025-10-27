// content.js - Extracts and summarizes page content for TrailNote

// Inline TextRank summarizer (embedded to avoid page CSP when injecting scripts)
function getSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [];
}

function getKeywords(text) {
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
  const keywords = getKeywords(text);
  const scores = sentences.map(s => {
    const sWords = s.toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/);
    const score = sWords.filter(w => keywords.includes(w)).length;
    return { sentence: s, score };
  });
  scores.sort((a,b)=>b.score-a.score);
  return scores.slice(0,maxSentences).map(s=>s.sentence.trim()).join(' ');
}

function extractSummary() {
  const title = document.title || 'No Title';
  const bodyText = document.body.innerText || '';
  let summary = '';
  let keywords = [];
  let metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  // Helper: detect if an element is inside a nav/footer/header/menu/sidebar etc
  function isInsideChrome(el) {
    if (!el) return false;
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      const tag = cur.tagName && cur.tagName.toLowerCase();
      const id = (cur.id || '').toLowerCase();
      const cls = (cur.className || '').toLowerCase();
      if (tag === 'nav' || tag === 'header' || tag === 'footer' || tag === 'aside') return true;
      if (/nav|navbar|navigation|menu|pagination|pager|footer|header|breadcrumbs|sidebar|site-nav/.test(id)) return true;
      if (/nav|navbar|navigation|menu|pagination|pager|footer|header|breadcrumbs|sidebar|site-nav/.test(cls)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // Extract headings with level and filter out site chrome
  const headingNodes = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(h => !isInsideChrome(h))
    .map(h => ({ level: parseInt(h.tagName.substring(1)) || 1, text: h.innerText.trim() }))
    .filter(h => h.text && h.text.length > 2);

  // Extract bullet points but ignore UI noise and navigation items
  const isNoiseItem = (s) => {
    if (!s) return true;
    const t = s.trim().toLowerCase();
    if (t.length < 3) return true;
    if (/^(delete|see more|page navigation|next|previous|pause|view more|save to google drive|save to gmail|home|footer)$/i.test(t)) return true;
    // if it looks like a pagination control (just numbers) skip
    if (/^\d+(\s*of\s*\d+)?$/i.test(t)) return true;
    return false;
  };

  const bullets = Array.from(document.querySelectorAll('li'))
    .filter(li => !isInsideChrome(li))
    .map(li => li.innerText.replace(/\s+/g, ' ').trim())
    .filter(b => !isNoiseItem(b))
    .map(b => b.length > 200 ? b.slice(0, 197) + '...' : b)
    .slice(0, 30); // limit to reasonable number
  // Extract research metadata
  const meta = {};
  document.querySelectorAll('meta[name]').forEach(m => {
    const n = m.getAttribute('name').toLowerCase();
    if (n.startsWith('citation_')) meta[n.replace('citation_', '')] = m.content;
  });
  // Author, publish date, etc.
  const author = meta['author'] || meta['authors'] || '';
  const publishDate = meta['date'] || meta['publication_date'] || '';
  const abstract = meta['abstract'] || '';

  if (window.summarizeTextRank && window.getKeywords) {
    summary = window.summarizeTextRank(bodyText, 3);
    keywords = window.getKeywords(bodyText);
  } else {
    summary = summarizeTextRank(bodyText, 3);
  }
  // Fallbacks
  if (!summary || summary === 'Summary not available') {
    const headingText = headingNodes && headingNodes.length ? headingNodes.map(h => h.text).join('; ') : '';
    summary = metaDesc || headingText || bullets.join('; ') || 'Summary not available';
  }

  // Detect interstitial / bot-check pages and return a skip flag so background can ignore them
  const interstitialPhrases = [/just a moment/i, /checking your browser/i, /please enable javascript/i, /verify you are human/i, /just a moment.../i];
  const isInterstitial = (
    (title && interstitialPhrases.some(rx => rx.test(title))) ||
    (summary && interstitialPhrases.some(rx => rx.test(summary))) ||
    // very short body and no meaningful headings/bullets
    ((bodyText || '').length < 200 && headingNodes.length === 0 && bullets.length === 0)
  );

  return {
    title,
    summary,
    keywords,
    headings: headingNodes,
    bullets,
    author,
    publishDate,
    abstract,
    meta,
    skip: !!isInterstitial
  };
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractSummary') {
    const data = extractSummary();
    sendResponse(data);
    return; // synchronous response
  }
});