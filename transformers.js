// transformers.js loader for Hugging Face summarization
// Loads the Xenova transformers.js library and provides a summarizeText function

let summarizerModel = null;
let _transformersLoaderPromise = null;

function loadTransformersScript(timeout = 20000) {
  if (window.transformers) return Promise.resolve();
  if (_transformersLoaderPromise) return _transformersLoaderPromise;

  _transformersLoaderPromise = new Promise((resolve, reject) => {
    // Avoid inserting duplicate script tags
    if (document.querySelector('script[data-trailnote-transformers]')) {
      // wait a short time for it to initialize
      const checkInterval = setInterval(() => {
        if (window.transformers) {
          clearInterval(checkInterval);
          return resolve();
        }
      }, 200);
      // fallback timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        if (window.transformers) return resolve();
        reject(new Error('Transformers load timeout'));
      }, timeout);
      return;
    }

    const s = document.createElement('script');
    s.setAttribute('data-trailnote-transformers', '1');
    s.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/dist/transformers.min.js';
    let to = null;
    s.onload = () => {
      if (to) clearTimeout(to);
      // small delay to ensure the library registers
      setTimeout(() => resolve(), 50);
    };
    s.onerror = (err) => {
      if (to) clearTimeout(to);
      reject(new Error('Failed to load transformers.js'));
    };
    document.head.appendChild(s);
    to = setTimeout(() => reject(new Error('Transformers load timeout')), timeout);
  });

  return _transformersLoaderPromise;
}

async function loadSummarizer(retries = 1) {
  if (summarizerModel) return summarizerModel;
  try {
    if (!window.transformers) {
      await loadTransformersScript();
    }
    // create summarization pipeline (model may be downloaded by transformers.js runtime)
    summarizerModel = await window.transformers.pipeline('summarization', 'Xenova/distilbart-cnn-6-6');
    return summarizerModel;
  } catch (e) {
    console.warn('Could not load summarizer (attempt):', e);
    if (retries > 0) {
      // retry once after a brief delay
      await new Promise(r => setTimeout(r, 500));
      return loadSummarizer(retries - 1);
    }
    return null;
  }
}

async function summarizeTextHuggingFace(text) {
  try {
    const model = await loadSummarizer(1);
    if (!model) return '';
    // limit input length to avoid heavy processing
    const input = text.length > 4000 ? text.slice(0, 4000) : text;
    const result = await model(input, { max_length: 130 });
    // result may be array or object depending on runtime
    if (Array.isArray(result)) return result[0]?.summary_text || '';
    return result?.summary_text || '';
  } catch (e) {
    console.warn('Summarization failed:', e);
    return '';
  }
}

window.summarizeTextHuggingFace = summarizeTextHuggingFace;
