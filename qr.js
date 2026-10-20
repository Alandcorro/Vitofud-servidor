'use strict';
/* Generador de códigos QR sin dependencias.
   Modo byte, corrección de errores nivel M, versiones 1 a 6 (hasta 106 caracteres). */

var EXP = [], LOG = [];
(function () {
  var x = 1, i;
  for (i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

function generador(n) {
  var g = [1], i, j;
  for (i = 0; i < n; i++) {
    var s = [];
    for (j = 0; j <= g.length; j++) s.push(0);
    for (j = 0; j < g.length; j++) { s[j] ^= g[j]; s[j + 1] ^= mul(g[j], EXP[i]); }
    g = s;
  }
  return g;
}
function restoRS(datos, n) {
  var g = generador(n), r = [], i;
  for (i = 0; i < n; i++) r.push(0);
  datos.forEach(function (d) {
    var f = d ^ r[0];
    r.shift(); r.push(0);
    for (i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  });
  return r;
}

/* t = codewords totales, ec = de corrección por bloque, b = [bloques, datos por bloque] */
var VER = [null,
  { t: 26,  ec: 10, b: [1, 16], al: [] },
  { t: 44,  ec: 16, b: [1, 28], al: [6, 18] },
  { t: 70,  ec: 26, b: [1, 44], al: [6, 22] },
  { t: 100, ec: 18, b: [2, 32], al: [6, 26] },
  { t: 134, ec: 24, b: [2, 43], al: [6, 30] },
  { t: 172, ec: 16, b: [4, 27], al: [6, 34] }
];

function bytesUtf8(s) { return Array.prototype.slice.call(Buffer.from(String(s), 'utf8')); }

function codewords(bytes, ver) {
  var v = VER[ver], total = v.b[0] * v.b[1], bits = [], i;
  function poner(val, n) { for (var k = n - 1; k >= 0; k--) bits.push((val >> k) & 1); }
  poner(4, 4); poner(bytes.length, 8);
  bytes.forEach(function (b) { poner(b, 8); });
  for (i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  var cw = [];
  for (i = 0; i < bits.length; i += 8) {
    var x = 0; for (var k = 0; k < 8; k++) x = (x << 1) | bits[i + k]; cw.push(x);
  }
  for (i = 0; cw.length < total; i++) cw.push(i % 2 ? 0x11 : 0xEC);
  /* bloques + corrección + intercalado */
  var bloques = [], ecs = [];
  for (i = 0; i < v.b[0]; i++) {
    var d = cw.slice(i * v.b[1], (i + 1) * v.b[1]);
    bloques.push(d); ecs.push(restoRS(d, v.ec));
  }
  var out = [];
  for (i = 0; i < v.b[1]; i++) bloques.forEach(function (d) { out.push(d[i]); });
  for (i = 0; i < v.ec; i++) ecs.forEach(function (e) { out.push(e[i]); });
  return out;
}

function matrizVacia(n, val) {
  var m = [];
  for (var y = 0; y < n; y++) { m.push([]); for (var x = 0; x < n; x++) m[y].push(val); }
  return m;
}

function bitsFormato(mask) {
  var d = mask, r = d << 10, i;           /* nivel M = 00 */
  for (i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  return ((d << 10) | r) ^ 0x5412;
}

function construir(texto) {
  var bytes = bytesUtf8(texto), ver = 0, i, x, y;
  for (i = 1; i <= 6; i++) if (bytes.length <= VER[i].b[0] * VER[i].b[1] - 2) { ver = i; break; }
  if (!ver) throw new Error('Texto demasiado largo para el QR (máx. 106 caracteres)');
  var n = 17 + 4 * ver, m = matrizVacia(n, 0), f = matrizVacia(n, false);

  function fn(x, y, v) { if (x < 0 || y < 0 || x >= n || y >= n) return; m[y][x] = v ? 1 : 0; f[y][x] = true; }
  function buscador(cx, cy) {
    for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
      var ent = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      var osc = ent && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      fn(cx + dx, cy + dy, osc);
    }
  }
  buscador(0, 0); buscador(n - 7, 0); buscador(0, n - 7);
  for (i = 8; i < n - 8; i++) { fn(i, 6, i % 2 === 0); fn(6, i, i % 2 === 0); }
  var al = VER[ver].al;
  al.forEach(function (cy, a) { al.forEach(function (cx, b) {
    if ((a === 0 && b === 0) || (a === 0 && b === al.length - 1) || (a === al.length - 1 && b === 0)) return;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
      fn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }); });
  function formato(mm, mask) {
    var bits = bitsFormato(mask);
    function b(k) { return (bits >> k) & 1; }
    var k;
    function set(x, y, v) { mm[y][x] = v; }
    for (k = 0; k <= 5; k++) set(8, k, b(k));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (k = 9; k < 15; k++) set(14 - k, 8, b(k));
    for (k = 0; k < 8; k++) set(n - 1 - k, 8, b(k));
    for (k = 8; k < 15; k++) set(8, n - 15 + k, b(k));
    set(8, n - 8, 1);
  }
  /* reservar áreas de formato */
  var tmp = matrizVacia(n, 0); formato(tmp, 0);
  for (i = 0; i <= 8; i++) { f[8][i] = true; f[i][8] = true; }
  for (i = 0; i < 8; i++) { f[8][n - 1 - i] = true; f[n - 1 - i][8] = true; }
  f[n - 8][8] = true;

  /* datos en zigzag */
  var cw = codewords(bytes, ver), bit = 0, tot = cw.length * 8, der, vert, j, upward;
  for (der = n - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
      x = der - j; upward = ((der + 1) & 2) === 0; y = upward ? n - 1 - vert : vert;
      if (!f[y][x] && bit < tot) { m[y][x] = (cw[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; }
    }
  }

  var MASC = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
    function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; }
  ];
  function penalidad(mm) {
    var p = 0, run, k, a, b;
    for (var pasada = 0; pasada < 2; pasada++) {
      for (a = 0; a < n; a++) {
        run = 1;
        var linea = [];
        for (b = 0; b < n; b++) linea.push(pasada ? mm[b][a] : mm[a][b]);
        for (b = 1; b < n; b++) {
          if (linea[b] === linea[b - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        var s = linea.join('');
        k = -1; while ((k = s.indexOf('10111010000', k + 1)) >= 0) p += 40;
        k = -1; while ((k = s.indexOf('00001011101', k + 1)) >= 0) p += 40;
      }
    }
    var oscuros = 0;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      oscuros += mm[y][x];
      if (x < n - 1 && y < n - 1 && mm[y][x] === mm[y][x + 1] && mm[y][x] === mm[y + 1][x] && mm[y][x] === mm[y + 1][x + 1]) p += 3;
    }
    p += (Math.ceil(Math.abs(oscuros * 20 - n * n * 10) / (n * n)) - 1) * 10;
    return p;
  }
  var mejor = null, mejorP = Infinity;
  for (var mask = 0; mask < 8; mask++) {
    var c = m.map(function (r) { return r.slice(); });
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (!f[y][x] && MASC[mask](x, y)) c[y][x] ^= 1;
    formato(c, mask);
    var pp = penalidad(c);
    if (pp < mejorP) { mejorP = pp; mejor = c; }
  }
  return mejor;
}

function svg(texto) {
  var m = construir(texto), n = m.length, q = 4, d = '', x, y;
  for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
  var t = n + q * 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + t + ' ' + t + '" shape-rendering="crispEdges">' +
    '<rect width="' + t + '" height="' + t + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

module.exports = { svg: svg, matriz: construir };
