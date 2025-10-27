// Very small PDF generator for basic text reports (no external deps)
// Provides window.TrailNoteSimplePDF.generatePdfBytes(logs, meta) -> Uint8Array
(function(){
  function escapeText(s){
    return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  function buildPdf(logs, meta){
    meta = meta || {};
    // If caller provides preLines (already formatted) use them
    let lines = null;
    if (meta.preLines && Array.isArray(meta.preLines)) {
      lines = meta.preLines.slice();
    } else {
      lines = [];
      lines.push((meta.title||'TrailNote Report'));
      lines.push('Mode: ' + (meta.mode || 'N/A'));
      lines.push('Generated: ' + (meta.generated || new Date().toLocaleString()));
      lines.push('--------------------------------------');
      (logs||[]).forEach((entry, idx) => {
        lines.push((idx+1) + '. ' + (entry.title || 'No Title'));
        lines.push('URL: ' + (entry.url || ''));
        lines.push('Visited at: ' + (entry.time || ''));
        const summary = (entry.summary || '').split(/\n/).map(l=>l.trim()).join(' ');
        lines.push('Summary: ' + summary);
        if (entry.keywords && entry.keywords.length) lines.push('Keywords: ' + entry.keywords.join(', '));
        if (entry.headings && entry.headings.length) {
          const htexts = entry.headings.map(h => (typeof h === 'string' ? h : (h && h.text) ? h.text : '')).filter(Boolean);
          if (htexts.length) lines.push('Headings: ' + htexts.join(' | '));
        }
        if (entry.bullets && entry.bullets.length) lines.push('Bullets: ' + entry.bullets.slice(0,5).join(' | '));
        if (entry.author) lines.push('Author: ' + entry.author);
        if (entry.publishDate) lines.push('Date: ' + entry.publishDate);
        if (entry.abstract) lines.push('Abstract: ' + entry.abstract);
        lines.push('');
      });
    }

    // Ensure lines are trimmed, non-empty, and collapse consecutive duplicates
    try {
      lines = lines.map(l => (typeof l === 'string' ? l.trim() : l)).filter(l => l && l.length);
      const deduped = [];
      let last = null;
      lines.forEach(l => { if (l !== last) { deduped.push(l); last = l; } });
      lines = deduped;
    } catch (e) {
      // if something unexpected, fall back to current lines
    }

    // Build pages by chunking wrapped lines into pages to avoid coordinate math mistakes
    const leading = 14; // pts between lines
    const pageHeight = 792; // pts (letter)
    const marginTop = 760; // starting y coordinate for first line
    const marginBottom = 40;
    const maxLinesPerPage = Math.floor((marginTop - marginBottom) / leading);

    const wrap = (s, n) => {
      if (!s) return [''];
      const parts = [];
      let cur = '';
      s.split(' ').forEach(word => {
        if ((cur + ' ' + word).trim().length > n) { parts.push(cur.trim()); cur = word; }
        else { cur = (cur + ' ' + word).trim(); }
      });
      if (cur) parts.push(cur.trim());
      return parts;
    };

    // Wrap all lines first
    const wrappedLines = [];
    lines.forEach(L => {
      const parts = wrap(L, 80);
      parts.forEach(p => wrappedLines.push(p));
    });

    // Chunk into pages
    const pagesLines = [];
    for (let i = 0; i < wrappedLines.length; i += maxLinesPerPage) {
      pagesLines.push(wrappedLines.slice(i, i + maxLinesPerPage));
    }
    if (pagesLines.length === 0) pagesLines.push(['']);

    // Prepare PDF objects: we'll create content streams then page objects, then Pages, Font, Catalog
    const contentStreams = pagesLines.map(page => {
      const parts = [];
      parts.push('BT');
      parts.push('/F1 12 Tf');
      // y position starts at marginTop and decreases per line
      let y = marginTop;
      page.forEach(L => {
        parts.push('1 0 0 1 40 ' + y + ' Tm');
        parts.push('(' + escapeText(L) + ') Tj');
        y -= leading;
      });
      parts.push('ET');
      return parts.join('\n');
    });

    // Build page object strings (contents will reference content stream obj ids; parent/pages and font ids will be filled after we know offsets)
    const pageObjs = pagesLines.map((pl, idx) => {
      // placeholder for parent and font/content ids; we'll replace tokens later
      return '<< /Type /Page /Parent __PAGES_ID__ 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 __FONT_ID__ 0 R >> >> /Contents __CONTENT_ID__ 0 R >>';
    });

    // Font object
    const fontObj = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    // Pages container will reference kids
    // We'll assemble objects array now: contentStreams, then pageObjs, then pages container, then font, then catalog
    const objs = [];
    // add content streams as objects (but for simplicity we will store raw stream without stream wrapper; simple viewers accept raw text)
    contentStreams.forEach(s => objs.push(s));
    // add page placeholders
    pageObjs.forEach(p => objs.push(p));
    // pages container placeholder (kids will be replaced later)
    const pagesIndex = objs.length; // index where pages container will be added
    objs.push('<< /Type /Pages /Kids [__KIDS__] /Count __COUNT__ >>');
    // font object
    const fontIndex = objs.length; objs.push(fontObj);
    // catalog placeholder
    const catalogIndex = objs.length; objs.push('<< /Type /Catalog /Pages __PAGES_REF__ 0 R >>');

    // Now compute object ids (1-based)
    const totalObjs = objs.length;
    // We'll build the body and compute offsets
    let body = '';
    const offsets = [];
    body += '%PDF-1.1\n%\xE2\xE3\xCF\xD3\n';

    // Helper to write an object and record its offset
    for (let i = 0; i < objs.length; i++) {
      offsets.push(body.length);
      const id = i + 1;
      body += id + ' 0 obj\n';
      // For content streams we need to wrap as a stream object
      if (i < contentStreams.length) {
        const stream = objs[i];
        const streamBytes = new TextEncoder().encode(stream);
        body += '<< /Length ' + streamBytes.length + ' >>\nstream\n' + stream + '\nendstream\n';
      } else if (i >= contentStreams.length && i < contentStreams.length + pageObjs.length) {
        // page object - must replace placeholders
        const pageIdx = i - contentStreams.length; // 0-based
        const contentId = 1 + pageIdx; // content stream ids start at 1
        const pagesId = 1 + contentStreams.length + pageObjs.length; // pages container id
        const fontId = pagesId + 1; // font id
        let pstr = objs[i];
        pstr = pstr.replace('__PAGES_ID__', pagesId);
        pstr = pstr.replace('__FONT_ID__', fontId);
        pstr = pstr.replace('__CONTENT_ID__', contentId);
        body += pstr + '\n';
      } else if (i === pagesIndex) {
        // pages container - replace kids and count
        const kidsIds = [];
        const firstPageId = 1 + contentStreams.length; // first page id
        for (let p = 0; p < pageObjs.length; p++) kidsIds.push((firstPageId + p) + ' 0 R');
        const pagesStr = objs[i].replace('__KIDS__', kidsIds.join(' ')).replace('__COUNT__', pageObjs.length);
        body += pagesStr + '\n';
      } else if (i === fontIndex) {
        body += objs[i] + '\n';
      } else if (i === catalogIndex) {
        const pagesId = 1 + contentStreams.length + pageObjs.length;
        const cat = objs[i].replace('__PAGES_REF__', pagesId);
        body += cat + '\n';
      } else {
        body += objs[i] + '\n';
      }
      body += 'endobj\n';
    }

    const xrefStart = body.length;
    body += 'xref\n0 ' + (objs.length + 1) + '\n';
    body += '0000000000 65535 f \n';
    offsets.forEach(off => {
      body += String(off).padStart(10,'0') + ' 00000 n \n';
    });
    // root is catalog id which is last object
    const catalogObjId = objs.length;
    body += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalogObjId + ' 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

    const encoder = new TextEncoder();
    return encoder.encode(body);
  }

  window.TrailNoteSimplePDF = {
    generatePdfBytes: buildPdf
  };
})();
