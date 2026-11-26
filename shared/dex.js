// Fichas da Dex (categoria, tamanho, habitat, do que gosta, descrição), lidas do shared/species.js.
// Só texto (usado pelo painel). window.DexInfo no navegador, module.exports no Node.

(function (root) {
  'use strict';

  // as fichas ficam em shared/species.js (campo dex de cada espécie)
  const SD = root.SpeciesData || require('./species.js');
  const INFO = Object.fromEntries(Object.entries(SD.SPECIES).map(([id, sp]) => [id, sp.dex || {}]));

  const fmtNum = (n) => String(n).replace('.', ',');
  const height = (sp) => (INFO[sp] ? `${fmtNum(INFO[sp].height)} m` : '—');
  const weight = (sp) => (INFO[sp] ? `${fmtNum(INFO[sp].weight)} kg` : '—');

  const api = { INFO, height, weight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DexInfo = api;
})(typeof window !== 'undefined' ? window : globalThis);
