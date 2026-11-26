// Mostra na tela os erros de JavaScript (principalmente de quem está editando o shared/species.js):
// sem isso, a faixa transparente simplesmente some e não dá pra saber o que aconteceu.
// Carregado antes de todos os outros scripts.

(function () {
  'use strict';
  let box = null;
  function show(msg, file, line) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', () => show(msg, file, line)); return; }
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;padding:8px 10px;background:#2a0e0e;'
        + 'border:2px solid #c0402e;color:#ffd8d0;font:12px/1.35 Consolas,monospace;white-space:pre-wrap;max-height:70%;overflow:auto;';
      document.body.appendChild(box);
    }
    const where = file ? `${String(file).split('/').slice(-2).join('/')}${line ? `, linha ${line}` : ''}` : '';
    const hint = /species\.js/.test(file || '') || /species\.js/.test(msg)
      ? '\nDica: confira aspas em volta de textos, vírgulas entre os campos e chaves { } fechando.' : '';
    box.textContent += `${box.textContent ? '\n' : ''}Erro${where ? ` em ${where}` : ''}: ${msg}${hint}`;
  }
  window.addEventListener('error', (e) => show(e.message || String(e.error), e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => show(e.reason && e.reason.message ? e.reason.message : String(e.reason), '', 0));
})();
