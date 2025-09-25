// Minimal vanilla popup using the same backend endpoints
(function(){
  const root = document.getElementById('root');
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v; else if (k === 'style') node.style.cssText = v; else node.setAttribute(k, v);
    });
    [].concat(children).forEach(c => typeof c === 'string' ? node.appendChild(document.createTextNode(c)) : c && node.appendChild(c));
    return node;
  };

  const state = { text: '', image: '', loading: false, error: '', result: '' };

  const setState = (partial) => {
    Object.assign(state, partial);
    render();
  };

  const callBackend = async (path, body) => {
    const base = 'http://localhost:5000';
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const onSummarize = async () => {
    setState({ loading: true, error: '', result: '' });
    try {
      const data = await callBackend('/summarize', { text: state.text });
      setState({ result: data.summary || '', loading: false });
    } catch (e) {
      setState({ error: 'Failed to summarize', loading: false });
    }
  };

  const onAnalyze = async () => {
    if (!state.image) {
      // Ask background to capture if not set
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (resp) => {
        if (resp && resp.ok) {
          setState({ image: resp.dataUrl });
          onAnalyze();
        } else {
          setState({ error: 'Capture failed' });
        }
      });
      return;
    }
    setState({ loading: true, error: '', result: '' });
    try {
      const data = await callBackend('/analyze-image', { imageBase64: state.image });
      setState({ result: data.description || '', loading: false });
    } catch (e) {
      setState({ error: 'Failed to analyze image', loading: false });
    }
  };

  const render = () => {
    root.innerHTML = '';
    const header = el('div', { style: 'font-weight:600;font-size:14px;margin-bottom:8px;' }, 'Solexity');
    const textarea = el('textarea', { style: 'width:100%;height:90px;padding:8px;border:1px solid #ddd;border-radius:6px;resize:none;' }, []);
    textarea.value = state.text;
    textarea.oninput = (e) => setState({ text: e.target.value });

    const btnRow = el('div', { style: 'margin-top:8px;display:flex;gap:8px;' }, []);
    const btnSum = el('button', { style: 'flex:1;padding:8px 10px;border-radius:6px;border:0;background:#111;color:#fff;cursor:pointer;' }, state.loading ? 'Working...' : 'Summarize');
    const btnImg = el('button', { style: 'flex:1;padding:8px 10px;border-radius:6px;border:1px solid #111;background:#fff;color:#111;cursor:pointer;' }, state.loading ? 'Working...' : 'Analyze Image');
    btnSum.disabled = state.loading;
    btnImg.disabled = state.loading;
    btnSum.onclick = onSummarize;
    btnImg.onclick = onAnalyze;
    btnRow.appendChild(btnSum);
    btnRow.appendChild(btnImg);

    const error = state.error ? el('div', { style: 'margin-top:8px;color:#b91c1c;font-size:12px;' }, state.error) : null;
    const result = state.result ? el('div', { style: 'margin-top:8px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;font-size:12px;white-space:pre-wrap;' }, state.result) : null;

    const preview = state.image ? el('img', { style: 'margin-top:8px;max-width:100%;border-radius:6px;border:1px solid #eee;', src: state.image }) : null;

    root.appendChild(header);
    root.appendChild(textarea);
    root.appendChild(btnRow);
    if (error) root.appendChild(error);
    if (preview) root.appendChild(preview);
    if (result) root.appendChild(result);
  };

  // Load latest selection/screenshot stored by background
  chrome.storage.local.get(['solexity_selectedText', 'solexity_capturedImage'], (data) => {
    setState({ text: data.solexity_selectedText || '', image: data.solexity_capturedImage || '' });
  });

  render();
})();
