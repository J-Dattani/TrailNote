// ---------------- TrailNote Popup Script ----------------
const trackBrowsingBtn = document.getElementById("trackBrowsing");
const trackResearchBtn = document.getElementById("trackResearch");
const stopBtn = document.getElementById("stopTracking");
const downloadBtn = document.getElementById("downloadPdf");
const statusDiv = document.getElementById("status");
const logList = document.getElementById("logList");
const tabCurrentBtn = document.getElementById("tabCurrent");
const tabPastBtn = document.getElementById("tabPast");
const tabContentCurrent = document.getElementById("tabContentCurrent");
const tabContentPast = document.getElementById("tabContentPast");
const pastSessionsList = document.getElementById("pastSessionsList");

let activeMode = null;
let sessions = [];
let useRichPdf = false;

// Ensure jsPDF is loaded (try local then CDN)
function ensureJsPdfLoaded(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.jsPDF || (window.jspdf && window.jspdf.jsPDF)) return resolve();
    // Try local file first
    const localUrl = chrome.runtime.getURL('libs/jspdf.umd.min.js');
    let done = false;
    // First check whether the local file actually exists to avoid noisy console errors
    fetch(localUrl).then(resp => {
      if (resp.ok) {
        const script = document.createElement('script');
        script.src = localUrl;
        script.onload = () => { done = true; console.info('TrailNote: loaded local jsPDF'); resolve(); };
        script.onerror = () => { console.warn('TrailNote: local jsPDF failed to execute'); tryCdn(); };
        document.head.appendChild(script);
      } else {
        tryCdn();
      }
    }).catch(() => {
      tryCdn();
    });

    function tryCdn() {
      // Removed CDN fallback to avoid Content Security Policy (CSP) violations in some pages.
      // If local jsPDF isn't present or doesn't provide a constructor, the popup will use the
      // built-in `simple-pdf` fallback included in `popup.html`.
      return reject(new Error('No local jsPDF available and CDN fallback disabled due to CSP'));
    }
    // safety timeout
    setTimeout(()=>{ if (!done) reject(new Error('jsPDF load timeout')); }, timeout);
  });
}

// 🟢 Start browsing tracker
trackBrowsingBtn.addEventListener("click", () => {
  activeMode = "browsing";
  statusDiv.textContent = "🟢 Tracking browsing...";
  chrome.runtime.sendMessage({ action: "startTracking", mode: "browsing" });
});

// 🧠 Start research tracker
trackResearchBtn.addEventListener("click", () => {
  activeMode = "research";
  statusDiv.textContent = "🧠 Tracking research...";
  chrome.runtime.sendMessage({ action: "startTracking", mode: "research" });
});

// ⛔ Stop tracking
stopBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopTracking" });
  statusDiv.textContent = "⛔ Tracking stopped.";
});

// PDF generation using jsPDF (for current or past session)
async function generatePdf(logs, mode, timestamp) {
  try {
    if (useRichPdf) await ensureJsPdfLoaded();
  } catch (e) {
    // don't abort — we'll fall back to the built-in simple PDF generator
    console.warn('TrailNote: jsPDF failed to load, using local fallback', e && e.message);
  }

  let usedNative = false;
  // Only attempt to use jsPDF if the user enabled rich PDFs
  let jsPDFConstructor = null;
  if (useRichPdf) {
    const jsPDFExport = window.jsPDF || (window.jspdf && window.jspdf.jsPDF) || window.jspdf;
    if (typeof jsPDFExport === 'function') jsPDFConstructor = jsPDFExport;
    else if (jsPDFExport && typeof jsPDFExport.jsPDF === 'function') jsPDFConstructor = jsPDFExport.jsPDF;
    else if (jsPDFExport && typeof jsPDFExport.default === 'function') jsPDFConstructor = jsPDFExport.default;
  }

  // Build preformatted bullet/heading lines for each entry to avoid long paragraphs
  const preLines = [];
  preLines.push((timestamp ? `Generated: ${timestamp}` : `Generated: ${new Date().toLocaleString()}`));
  preLines.push(`Mode: ${mode || 'N/A'}`);
  preLines.push('');
  // helper to detect noisy list items scraped from UI
  const isNoise = (s) => {
    if (!s) return true;
    const t = s.trim().toLowerCase();
    return /^(delete|see more|page navigation|pause|view more|save to google drive|save to gmail)$/i.test(t);
  };

  (logs || []).forEach((entry, idx) => {
    // Title line
    preLines.push(`${idx + 1}. ${entry.title || entry.url || 'No title'}`);

    // URL as a separate line but keep a short label; actual clickable annotation added when using jsPDF
    if (entry.url) preLines.push(`URL: ${entry.url}`);

    // Headings: output a compact list of top headings
    if (entry.headings && entry.headings.length) {
      preLines.push('  Headings:');
      entry.headings.slice(0,6).forEach(h => {
        const text = (typeof h === 'string') ? h : (h && h.text) ? h.text : '';
        const level = (typeof h === 'object' && h && h.level) ? h.level : 2;
        if (!isNoise(text)) preLines.push(`    H${level}: ${text}`);
      });
    }

    // Bulleted points: filter out UI artifacts and limit count
    if (entry.bullets && entry.bullets.length) {
      preLines.push('  Bulleted points:');
      entry.bullets.filter(b => !isNoise(b)).slice(0,8).forEach(b => preLines.push(`    - ${b}`));
    }

    // If no headings/bullets, include a short summary bullet (first 200 chars)
    if ((!entry.headings || !entry.headings.length) && (!entry.bullets || !entry.bullets.length)) {
      const s = (entry.summary || '').replace(/\s+/g,' ').trim();
      if (s) preLines.push(`  Summary: ${s.slice(0,240)}${s.length>240?'...':''}`);
    }
    preLines.push('');
  });

  // Clean up preLines: trim, remove empty and collapse consecutive duplicates
  let cleaned = preLines.map(l => (typeof l === 'string' ? l.trim() : l)).filter(l => l && l.length);
  cleaned = cleaned.filter((v, i) => i === 0 || v !== cleaned[i - 1]);

  if (typeof jsPDFConstructor === 'function') {
    usedNative = true;
    const doc = new jsPDFConstructor();
    doc.setFontSize(12);
    let y = 20;
    const pageHeight = 280;
  cleaned.forEach(line => {
      // determine style and indentation based on the line content
      let fontStyle = 'normal';
      let fontSize = 11;
      let indent = 10;
      const trimmed = line.trim();
      if (/^\d+\.\s/.test(line)) { fontStyle = 'bold'; fontSize = 13; indent = 8; }
      else if (/^H1:\s*/.test(trimmed)) { fontStyle = 'bold'; fontSize = 14; indent = 8; }
      else if (/^H2:\s*/.test(trimmed)) { fontStyle = 'bold'; fontSize = 12; indent = 12; }
      else if (/^H3:\s*/.test(trimmed)) { fontStyle = 'italic'; fontSize = 11; indent = 14; }
      else if (trimmed.startsWith('Headings:') || trimmed.startsWith('Bulleted points:')) { fontStyle = 'bold'; fontSize = 11; indent = 12; }
      else if (/^[•\-]/.test(trimmed) || line.startsWith('    •') || line.startsWith('    -')) { fontStyle = 'normal'; fontSize = 11; indent = 20; }
      else { fontStyle = 'normal'; fontSize = 11; indent = 10; }

      // Prepare text for rendering; remove H-level markers
      let renderText = trimmed.replace(/^H[1-3]:\s*/, '');

      // If this is a URL line, render link immediately (no wrapping)
      if (renderText.startsWith('URL:')) {
        const url = renderText.slice(4).trim();
        const display = url;
        doc.setFontSize(fontSize);
        try { doc.setFont(undefined, fontStyle); } catch (e) {}
        doc.text(display, indent, y);
        try {
          if (typeof doc.link === 'function') {
            doc.link(indent, y - (fontSize - 2), Math.min(300, display.length * (fontSize * 0.5)), fontSize + 2, { url });
          } else if (typeof doc.textWithLink === 'function') {
            doc.textWithLink(display, indent, y, { url });
          }
        } catch (e) {}
        y += fontSize + 2;
        if (y > pageHeight) { doc.addPage(); y = 20; }
        return;
      }

      // wrap long lines using jsPDF helper if available
      let parts = [renderText];
      if (typeof doc.splitTextToSize === 'function') {
        parts = doc.splitTextToSize(renderText, 170 - indent);
      } else if (renderText.length > 100) {
        // naive wrap on word boundaries (avoid mid-word splits)
        parts = renderText.match(/(?:\S+(?:\s+|$)){1,10}/g) || [renderText];
      }

      doc.setFontSize(fontSize);
      try { doc.setFont(undefined, fontStyle); } catch (e) {}
      parts.forEach(p => {
        doc.text(p, indent, y);
        y += fontSize + 2;
        if (y > pageHeight) { doc.addPage(); y = 20; }
      });
    });
    doc.save(`TrailNote_${mode || 'session'}_${Date.now()}.pdf`);
    return;
  }

  // fallback to simple PDF generator
  if (window.TrailNoteSimplePDF && typeof window.TrailNoteSimplePDF.generatePdfBytes === 'function') {
    try {
    const bytes = window.TrailNoteSimplePDF.generatePdfBytes(logs, { mode, generated: timestamp, title: 'TrailNote Report', preLines: cleaned });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TrailNote_${mode || 'session'}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    } catch (e) {
      alert('Failed to generate PDF: ' + (e && e.message));
      return;
    }
  }
  alert('jsPDF library not available and no fallback PDF generator found.');
  return;
}

// Download PDF (current session)
downloadBtn.addEventListener("click", async () => {
  chrome.storage.local.get(["trailnote_logs", "trailnote_mode"], async data => {
    await generatePdf(data.trailnote_logs || [], data.trailnote_mode || 'N/A', new Date().toLocaleString());
  });
});

// Tab switching logic
tabCurrentBtn.addEventListener("click", () => {
  tabCurrentBtn.classList.add("active");
  tabPastBtn.classList.remove("active");
  tabContentCurrent.style.display = "block";
  tabContentPast.style.display = "none";
});
tabPastBtn.addEventListener("click", () => {
  tabPastBtn.classList.add("active");
  tabCurrentBtn.classList.remove("active");
  tabContentCurrent.style.display = "none";
  tabContentPast.style.display = "block";
  renderPastSessions();
});

// 🔁 Receive live updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "updateLog") {
    renderLogs(msg.data);
  } else if (msg.action === "stopped") {
    statusDiv.textContent = "⛔ Tracking stopped.";
  }
});

// 🧱 Render stored logs (current session)
function renderLogs(logs) {
  if (!logs || logs.length === 0) {
    logList.innerHTML = "<div>No activity yet...</div>";
    downloadBtn.classList.add("hidden");
    return;
  }
  logList.innerHTML = logs
    .map(
      (log, i) => {
        let kw = log.keywords && log.keywords.length ? `<br><small>Keywords: ${log.keywords.join(', ')}</small>` : '';
        let hd = '';
        if (log.headings && log.headings.length) {
          const htexts = log.headings.map(h => (typeof h === 'string' ? h : (h && h.text) ? h.text : '') ).filter(Boolean);
          if (htexts.length) hd = `<br><small>Headings: ${htexts.join(' | ')}</small>`;
        }
        let bl = log.bullets && log.bullets.length ? `<br><small>Bullets: ${log.bullets.slice(0,5).join(' | ')}</small>` : '';
        let author = log.author ? `<br><small>Author: ${log.author}</small>` : '';
        let date = log.publishDate ? `<br><small>Date: ${log.publishDate}</small>` : '';
        let abs = log.abstract ? `<br><small>Abstract: ${log.abstract}</small>` : '';
        return `<div>• <a href=\"${log.url}\" target=\"_blank\">${log.title}</a><br><small>Summary: ${log.summary || 'N/A'}</small>${kw}${hd}${bl}${author}${date}${abs}</div>`;
      }
    )
    .join("");
  downloadBtn.classList.remove("hidden");
}

// 🧱 Render past sessions list
function renderPastSessions() {
  chrome.storage.local.get({ trailnote_sessions: [] }, data => {
    sessions = data.trailnote_sessions || [];
    if (!sessions.length) {
      pastSessionsList.innerHTML = "<div>No past sessions found.</div>";
      return;
    }
    pastSessionsList.innerHTML = sessions.map((session, idx) => {
      return `<div class='session-item'>
        <strong>Session ${idx + 1} (${session.mode || 'N/A'})</strong><br>
        <small>${session.timestamp || ''}</small><br>
        <button class='downloadPast' data-idx='${idx}'>Download PDF</button>
        <button class='deletePast' data-idx='${idx}'>Delete</button>
        <div class='session-logs'>
          ${session.logs.map((log, i) => {
            let kw = log.keywords && log.keywords.length ? `<br><small>Keywords: ${log.keywords.join(', ')}</small>` : '';
            let hd = '';
            if (log.headings && log.headings.length) {
              const htexts = log.headings.map(h => (typeof h === 'string' ? h : (h && h.text) ? h.text : '') ).filter(Boolean);
              if (htexts.length) hd = `<br><small>Headings: ${htexts.join(' | ')}</small>`;
            }
            let bl = log.bullets && log.bullets.length ? `<br><small>Bullets: ${log.bullets.slice(0,5).join(' | ')}</small>` : '';
            let author = log.author ? `<br><small>Author: ${log.author}</small>` : '';
            let date = log.publishDate ? `<br><small>Date: ${log.publishDate}</small>` : '';
            let abs = log.abstract ? `<br><small>Abstract: ${log.abstract}</small>` : '';
            return `<div>• <a href=\"${log.url}\" target=\"_blank\">${log.title}</a><br><small>Summary: ${log.summary || 'N/A'}</small>${kw}${hd}${bl}${author}${date}${abs}</div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    // Add event listeners for download/delete
    document.querySelectorAll('.downloadPast').forEach(btn => {
      btn.onclick = function() {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const session = sessions[idx];
        if (session) generatePdf(session.logs, session.mode, session.timestamp);
      };
    });
    document.querySelectorAll('.deletePast').forEach(btn => {
      btn.onclick = function() {
        const idx = parseInt(btn.getAttribute('data-idx'));
        sessions.splice(idx, 1);
        chrome.storage.local.set({ trailnote_sessions: sessions }, renderPastSessions);
      };
    });
  });
}

// Hugging Face summarization integration
async function getHuggingFaceSummary(text) {
  // Client-side HuggingFace summarization is disabled in this extension build to avoid
  // loading external runtime code that can be blocked by CSP. Use the built-in TextRank
  // summarizer instead.
  if (window.summarizeTextRank) {
    return window.summarizeTextRank(text, 3);
  }
  return '';
}

// Robust summary fetch: try content script, fallback to fetch+HuggingFace
async function robustSummary(tabId, url) {
  // Try content script first
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'extractSummary' }, async (data) => {
      if (chrome.runtime.lastError || !data || !data.summary) {
        // Fallback: try running a small extractor in the page via scripting.executeScript
        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
              const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(h=>h.innerText.trim()).filter(Boolean);
              const bullets = Array.from(document.querySelectorAll('li')).map(li=>li.innerText.trim()).filter(Boolean);
              const bodyText = document.body ? document.body.innerText || '' : '';
              return { summary: metaDesc || headings.join('; ') || bullets.join('; ') || (bodyText.slice(0,1000) || '') };
            }
          });
          const extracted = Array.isArray(res) && res[0] && res[0].result ? res[0].result : null;
          if (extracted && extracted.summary) return resolve(extracted);
          return resolve({ summary: 'Summary not available' });
        } catch (e) {
          return resolve({ summary: 'Summary not available' });
        }
      } else {
        resolve(data);
      }
    });
  });
}

// 📦 Load last state on popup open
chrome.storage.local.get(["trailnote_tracking", "trailnote_mode", "trailnote_logs"], (data) => {
  if (data.trailnote_tracking) {
    statusDiv.textContent = data.trailnote_mode === "research"
      ? "🧠 Tracking research..."
      : "🟢 Tracking browsing...";
  } else {
    statusDiv.textContent = "⛔ Tracking stopped.";
  }
  if (data.trailnote_logs) renderLogs(data.trailnote_logs);
});

// Load user setting for rich PDF
const useRichPdfCheckbox = document.getElementById('useRichPdf');
chrome.storage.local.get({ trailnote_useRichPdf: false }, (s) => {
  useRichPdf = !!s.trailnote_useRichPdf;
  if (useRichPdfCheckbox) useRichPdfCheckbox.checked = useRichPdf;
});
if (useRichPdfCheckbox) {
  useRichPdfCheckbox.addEventListener('change', () => {
    useRichPdf = !!useRichPdfCheckbox.checked;
    chrome.storage.local.set({ trailnote_useRichPdf: useRichPdf });
  });
}

// (No global click handler needed; handlers attached in renderPastSessions)
