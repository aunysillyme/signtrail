if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function() {
    return Array.from(this, b => b.toString(16).padStart(2, '0')).join('');
  };
}
if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function(key, callback) {
    if (this.has(key)) return this.get(key);
    const value = callback(key);
    this.set(key, value);
    return value;
  };
}

import * as pdfjsLib from '/vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
window.signtrailPdfJsReady = Promise.resolve(pdfjsLib);

