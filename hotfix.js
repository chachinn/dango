(() => {
  'use strict';

  const HOTFIX_VERSION = '5.2.2';

  function normalizeDecimalValue(input) {
    if (!input || input.dataset.dangoDecimalBound === 'true') return;
    input.dataset.dangoDecimalBound = 'true';
    const clean = () => {
      const raw = String(input.value ?? '').trim();
      if (!raw) return;
      const normalized = raw
        .replace(/,/g, '.')
        .replace(/[“”"'′″]/g, '')
        .replace(/[^0-9.+-]/g, '');
      if (normalized && normalized !== raw) input.value = normalized;
    };
    input.addEventListener('change', clean);
    input.addEventListener('blur', clean);
  }

  function makeMeasurementInputsCustom(root = document) {
    const nodes = [];
    if (root?.matches?.('input[type="number"]')) nodes.push(root);
    root?.querySelectorAll?.('input[type="number"]').forEach(i => nodes.push(i));

    nodes.forEach(input => {
      // Safari's number input validity can reject perfectly usable decimal values.
      // Dango already parses the submitted values, so use a decimal text field and
      // let the app validate instead of the browser.
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.removeAttribute('step');
      input.removeAttribute('min');
      input.removeAttribute('max');
      input.dataset.dangoCustomMeasurement = 'true';
      normalizeDecimalValue(input);
    });
  }

  function installRotate90Button() {
    const tray = document.querySelector('#selectionTray');
    if (!tray || tray.style.display === 'none') return;
    if (tray.querySelector('[data-dango-rotate90]')) return;

    const freeRotate = tray.querySelector('[data-sel="rotate"]');
    if (!freeRotate) return; // doors/windows intentionally stay wall-aligned

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tiny-btn dango-rotate90-btn';
    button.dataset.dangoRotate90 = 'true';
    button.title = 'Rotate 90°';
    button.setAttribute('aria-label', 'Rotate selected object 90 degrees');
    button.textContent = '↻90°';

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      // Reuse Dango's existing rotation engine so undo, keep-inside-room,
      // haptics, geometry correction and persistence all stay consistent.
      freeRotate.click();
      requestAnimationFrame(() => {
        setTimeout(() => {
          const modal = document.querySelector('#modalRoot .modal-backdrop:last-child');
          if (!modal) return;
          const plus90 = modal.querySelector('[data-rot-step="90"]');
          const done = modal.querySelector('#rotationDone');
          if (!plus90 || !done) return;
          plus90.click();
          done.click();
        }, 0);
      });
    });

    tray.insertBefore(button, freeRotate);
  }

  function addHotfixStyles() {
    if (document.querySelector('#dangoHotfix522Styles')) return;
    const style = document.createElement('style');
    style.id = 'dangoHotfix522Styles';
    style.textContent = `
      .selection-tray .dango-rotate90-btn {
        min-width: 46px;
        padding: 0 7px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: -0.02em;
      }
    `;
    document.head.appendChild(style);
  }

  function enhance(root = document) {
    makeMeasurementInputsCustom(root);
    installRotate90Button();
  }

  function start() {
    addHotfixStyles();
    enhance(document);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
        }
      }
      installRotate90Button();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Covers in-place innerHTML refreshes of the selection tray and modals.
    document.addEventListener('click', () => requestAnimationFrame(() => enhance(document)), true);

    window.DANGO_INTERACTION_UPDATE = HOTFIX_VERSION;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
