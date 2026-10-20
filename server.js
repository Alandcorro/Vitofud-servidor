'use strict';
/* Vito Fud - servidor local. Sin internet, sin dependencias: solo Node.js. */
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var crypto = require('crypto'), cp = require('child_process');
var QR = require('./qr.js');

var BASE = process.pkg ? path.dirname(process.execPath) : __dirname;
var PORT = process.env.PORT || 3000;
var DIR = process.env.DATOS || path.join(BASE, 'datos');
var IMG = process.env.IMAGENES || path.join(BASE, 'imagenes');
var PUB = path.join(__dirname, 'public');
var HIST = path.join(DIR, 'historial'), BACKUP = path.join(DIR, 'backup');
[DIR, HIST].forEach(function (d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

var ORDEN = { nuevo: 0, prep: 1, listo: 2, entregado: 3 };
var EN_CURSO = { porcobrar: 1, nuevo: 1, prep: 1, listo: 1 };

var MENU_INICIAL = [
  { id: 1, cat: 'Parrilla', n: 'Bife de chorizo', d: 'Corte de 400 g a las brasas, punto a elección.', p: 14500, c: ['#c0392b', '#4a0f0a'], x: ['Chimichurri', 'Sal gruesa', 'Limón'] },
  { id: 2, cat: 'Parrilla', n: 'Vacío a la parrilla', d: 'Cocción lenta, jugoso y con borde crocante.', p: 15800, c: ['#d35400', '#511d00'], x: ['Chimichurri', 'Salsa criolla'] },
  { id: 3, cat: 'Parrilla', n: 'Choripán', d: 'Chorizo parrillero, pan de campo y chimichurri.', p: 6200, c: ['#e67e22', '#5a2a02'], x: ['Chimichurri', 'Salsa criolla', 'Mayonesa'] },
  { id: 4, cat: 'Parrilla', n: 'Provoleta', d: 'Queso provolone fundido con orégano.', p: 7400, c: ['#f1c40f', '#6b4f00'], x: ['Orégano', 'Ají molido', 'Tomate'] },
  { id: 5, cat: 'Entradas', n: 'Empanadas de carne', d: 'Tres empanadas, cortadas a cuchillo.', p: 6900, c: ['#d68910', '#4f2e00'], x: ['Ají', 'Limón'] },
  { id: 6, cat: 'Entradas', n: 'Papas fritas', d: 'Porción grande para compartir.', p: 5300, c: ['#f4d03f', '#7a5c00'], x: ['Sal', 'Cheddar', 'Panceta'] },
  { id: 7, cat: 'Entradas', n: 'Ensalada mixta', d: 'Lechuga, tomate y cebolla.', p: 4800, c: ['#27ae60', '#0b3d1f'], x: ['Cebolla', 'Tomate', 'Aceitunas'] },
  { id: 8, cat: 'Bebidas', n: 'Gaseosa', d: 'Línea Coca-Cola 500 ml, bien fría.', p: 2600, c: ['#e74c3c', '#3a0a0a'], x: [], beb: 1 },
  { id: 9, cat: 'Bebidas', n: 'Cerveza artesanal', d: 'Pinta de 500 ml, rubia o roja.', p: 4200, c: ['#f5b041', '#6b3d00'], x: [], beb: 1 },
  { id: 10, cat: 'Bebidas', n: 'Agua con gas', d: 'Botella de 500 ml.', p: 2000, c: ['#5dade2', '#0f2f4a'], x: [], beb: 1 },
  { id: 11, cat: 'Postres', n: 'Flan con dulce de leche', d: 'Casero, con crema.', p: 4900, c: ['#e59866', '#5a2f12'], x: ['Crema', 'Dulce de leche'] },
  { id: 12, cat: 'Postres', n: 'Panqueque de manzana', d: 'Caliente, con helado de crema.', p: 5600, c: ['#cd6155', '#4a1510'], x: ['Helado', 'Canela'] }
];

/* ---------- archivos ---------- */
function leer(f, def) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return def; }
}
function guardar(f, obj) {
  /* escribe a un archivo temporal y lo renombra: si se corta la luz no queda a medias */
  var p = path.join(DIR, f), t = p + '.tmp';
  fs.writeFileSync(t, JSON.stringify(obj));
  fs.renameSync(t, p);
}
function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
function fechaLocal(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
function mesDe(ts) { return fechaLocal(ts).slice(0, 7); }
function refJ(n) { return 'J' + pad(n, 4); }

/* ---------- configuración y PIN ---------- */
var cfg = Object.assign({
  local: 'Vito Fud', mesas: 10, confirmarPago: true, aliasPago: '', pausado: false,
  limiteIp: 3, pin: null, secret: null, ipConocida: null, ipAviso: null
}, leer('config.json', {}));
function guardarCfg() { guardar('config.json', cfg); }
if (!cfg.secret) { cfg.secret = crypto.randomBytes(32).toString('hex'); guardarCfg(); }

function hashPin(pin, sal) { return crypto.scryptSync(String(pin), sal, 32).toString('hex'); }
function ponerPin(pin) {
  var sal = crypto.randomBytes(16).toString('hex');
  cfg.pin = { s: sal, h: hashPin(pin, sal) };
  cfg.secret = crypto.randomBytes(32).toString('hex'); /* invalida los accesos anteriores */
  guardarCfg();
}
function pinOk(pin) {
  if (!cfg.pin || typeof pin !== 'string') return false;
  var a = Buffer.from(hashPin(pin, cfg.pin.s)), b = Buffer.from(cfg.pin.h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function pinDebil(p) {
  if (!/^\d{4,8}$/.test(p)) return 'El PIN tiene que ser de 4 a 8 números.';
  if (/^(\d)\1+$/.test(p)) return 'Ese PIN es muy fácil de adivinar. Elegí otro.';
  var asc = true, desc = true;
  for (var i = 1; i < p.length; i++) {
    if (+p[i] !== +p[i - 1] + 1) asc = false;
    if (+p[i] !== +p[i - 1] - 1) desc = false;
  }
  if (asc || desc) return 'Ese PIN es muy fácil de adivinar. Elegí otro.';
  return null;
}
function tokenStaff() { return crypto.createHmac('sha256', cfg.secret).update('staff').digest('hex'); }
function esStaff(req) {
  var t = req.headers['x-token'];
  if (!cfg.pin || typeof t !== 'string') return false;
  var a = Buffer.from(t), b = Buffer.from(tokenStaff());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function esLocal(req) {
  var a = req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
var fallos = {};

/* ---------- menú, pedidos y jornada ---------- */
var menu = leer('menu.json', null);
if (!menu) { menu = MENU_INICIAL; guardar('menu.json', menu); }
var jorn = leer('jornada.json', { actual: null, ultima: 0 });
var pedidos = leer('pedidos.json', []);
var porId = {}, contador = 0;

function archivar(jornadaId, meta, lista) {
  /* guarda la jornada en historial/AAAA-MM.json; si ya estaba, la reemplaza (no duplica) */
  var mes = mesDe(meta.abrio), f = path.join('historial', mes + '.json');
  var h = leer(f, { mes: mes, jornadas: [] });
  h.jornadas = h.jornadas.filter(function (j) { return j.id !== jornadaId; });
  h.jornadas.push({ id: jornadaId, abrio: meta.abrio, cerro: meta.cerro, pedidos: lista });
  h.jornadas.sort(function (a, b) { return a.id - b.id; });
  guardar(f, h);
}

(function reconciliar() {
  /* pedidos de versiones anteriores o de una jornada ya cerrada: van al historial */
  var actualId = jorn.actual ? jorn.actual.id : null, grupos = {}, hubo = false;
  pedidos.forEach(function (p) {
    if (p.jornada == null) { p.jornada = 0; p.cobrado = true; }
    if (p.jornada > jorn.ultima) jorn.ultima = p.jornada;
    if (p.jornada !== actualId) { (grupos[p.jornada] = grupos[p.jornada] || []).push(p); hubo = true; }
  });
  Object.keys(grupos).forEach(function (id) {
    var l = grupos[id], ts = l.map(function (p) { return p.ts; });
    l.forEach(function (p) { if (p.estado in EN_CURSO) { p.estado = 'cancelado'; p.motivo = 'jornada cerrada'; } });
    archivar(+id, { abrio: Math.min.apply(null, ts), cerro: Math.max.apply(null, ts) }, l);
  });
  if (hubo) {
    pedidos = pedidos.filter(function (p) { return p.jornada === actualId; });
    guardar('pedidos.json', pedidos);
    guardar('jornada.json', jorn);
  }
  pedidos.forEach(function (p) { porId[p.id] = p; if (p.num > contador) contador = p.num; });
})();

function abrirJornada() {
  if (jorn.actual) return;
  var nueva = { actual: { id: jorn.ultima + 1, abrio: Date.now() }, ultima: jorn.ultima + 1 };
  guardar('jornada.json', nueva);
  jorn = nueva; contador = 0;
}

function resumir(lista) {
  var r = { pedidos: 0, total: 0, cancelados: 0, platos: [], porPago: {} }, pl = {};
  lista.forEach(function (p) {
    if (p.estado === 'cancelado') { r.cancelados++; return; }
    if (!p.cobrado) return;
    r.pedidos++; r.total += p.total;
    r.porPago[p.pago || 'Sin dato'] = (r.porPago[p.pago || 'Sin dato'] || 0) + p.total;
    p.items.forEach(function (i) {
      var o = pl[i.n] = pl[i.n] || { n: i.n, q: 0, total: 0 };
      o.q += i.q; o.total += (i.p != null ? i.p : precioDe(i.n)) * i.q;
    });
  });
  r.platos = Object.keys(pl).map(function (k) { return pl[k]; }).sort(function (a, b) { return b.total - a.total; });
  return r;
}
function precioDe(n) {
  for (var i = 0; i < menu.length; i++) if (menu[i].n === n) return menu[i].p;
  return 0;
}

/* ---------- respaldo diario ---------- */
function respaldar() {
  try {
    var dest = path.join(BACKUP, fechaLocal(Date.now()));
    fs.mkdirSync(path.join(dest, 'historial'), { recursive: true });
    ['config.json', 'menu.json', 'pedidos.json', 'jornada.json'].forEach(function (f) {
      var o = path.join(DIR, f); if (fs.existsSync(o)) fs.copyFileSync(o, path.join(dest, f));
    });
    fs.readdirSync(HIST).forEach(function (f) {
      if (/\.json$/.test(f)) fs.copyFileSync(path.join(HIST, f), path.join(dest, 'historial', f));
    });
    var dias = fs.readdirSync(BACKUP).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).sort();
    while (dias.length > 14) fs.rmSync(path.join(BACKUP, dias.shift()), { recursive: true, force: true });
  } catch (e) { console.error('No se pudo hacer la copia de seguridad:', e.message); }
}

/* ---------- red ---------- */
function candidatos() {
  var res = [], ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (k) {
    ifs[k].forEach(function (a) {
      if (a.family !== 'IPv4' || a.internal) return;
      var priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      var virtual = /vethernet|virtualbox|vmware|wsl|docker|vbox|bluetooth|loopback|hyper-v|tailscale|zerotier/i.test(k) || /^192\.168\.(56|99)\./.test(a.address);
      res.push({ nombre: k, ip: a.address, puntaje: (priv ? 2 : 0) + (virtual ? -3 : 0) });
    });
  });
  res.sort(function (a, b) { return b.puntaje - a.puntaje; });
  return res.map(function (c, i) { return { nombre: c.nombre, ip: c.ip, url: 'http://' + c.ip + ':' + PORT, preferida: i === 0 }; });
}

/* ---------- http ---------- */
var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Token',
  'Cache-Control': 'no-store'
};
function responder(res, code, obj) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(JSON.stringify(obj));
}
function leerCuerpo(req, cb) {
  var s = '', fin = false;
  req.on('data', function (c) {
    s += c;
    if (s.length > 1e6 && !fin) { fin = true; cb(new Error('grande')); req.destroy(); }
  });
  req.on('end', function () {
    if (fin) return;
    try { cb(null, s ? JSON.parse(s) : {}); } catch (e) { cb(e); }
  });
}
function conCuerpo(req, res, fn) {
  leerCuerpo(req, function (err, b) {
    if (err) return responder(res, 400, { ok: false, error: 'JSON inválido' });
    try { fn(b || {}); } catch (e) { console.error(e); responder(res, 500, { ok: false, error: 'Error interno' }); }
  });
}
function staff(req, res) {
  if (esStaff(req)) return true;
  responder(res, 401, { ok: false, error: 'Falta el PIN', login: true, necesitaPin: !cfg.pin });
  return false;
}

var TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function archivo(res, ruta, cache) {
  fs.readFile(ruta, function (err, data) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache || 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(); }
function mapaImagenes() {
  var m = {};
  try { fs.readdirSync(IMG).forEach(function (f) { if (/\.(png|jpe?g|webp)$/i.test(f)) m[norm(f.replace(/\.[^.]+$/, ''))] = f; }); } catch (e) {}
  return m;
}
function menuPublico() {
  var im = mapaImagenes();
  return menu.map(function (i) {
    var o = Object.assign({}, i), f = im[norm(i.n)];
    if (f) {
      var v = 0; try { v = Math.round(fs.statSync(path.join(IMG, f)).mtimeMs); } catch (e) {}
      o.img = '/img/' + encodeURIComponent(f) + '?v=' + v;
    }
    return o;
  });
}
var PALETA = [['#c0392b', '#4a0f0a'], ['#d35400', '#511d00'], ['#e67e22', '#5a2a02'], ['#27ae60', '#0b3d1f'], ['#5dade2', '#0f2f4a'], ['#cd6155', '#4a1510'], ['#8e44ad', '#2c0f3a'], ['#16a085', '#073b33']];
function nombreArchivo(n) { return n.replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'plato'; }
function archivosDe(nombre) {
  var k = norm(nombre), r = [];
  try { fs.readdirSync(IMG).forEach(function (f) { if (/\.(png|jpe?g|webp)$/i.test(f) && norm(f.replace(/\.[^.]+$/, '')) === k) r.push(f); }); } catch (e) {}
  return r;
}
function quitarImagenes(nombre) { archivosDe(nombre).forEach(function (f) { try { fs.unlinkSync(path.join(IMG, f)); } catch (e) {} }); }
function renombrarImagen(viejo, nuevo) {
  archivosDe(viejo).forEach(function (f) {
    try { fs.renameSync(path.join(IMG, f), path.join(IMG, nombreArchivo(nuevo) + path.extname(f).toLowerCase())); } catch (e) {}
  });
}
function limpio(p) { var o = Object.assign({}, p); delete o.ip; return o; }

function cambiar(res, p, campos) {
  var viejo = {};
  Object.keys(campos).forEach(function (k) { viejo[k] = p[k]; p[k] = campos[k]; });
  try { guardar('pedidos.json', pedidos); return true; }
  catch (ex) {
    Object.keys(viejo).forEach(function (k) { p[k] = viejo[k]; });
    console.error('No se pudo guardar:', ex.message);
    responder(res, 500, { ok: false, error: 'No se pudo guardar' });
    return false;
  }
}

function validarPedido(b) {
  if (!b || typeof b.id !== 'string' || b.id.length < 8 || b.id.length > 80) return 'id inválido';
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 100) return 'items inválidos';
  for (var i = 0; i < b.items.length; i++) {
    var it = b.items[i];
    if (!it || typeof it.n !== 'string' || !it.n || it.n.length > 120) return 'item inválido';
    if (!(it.q >= 1 && it.q <= 99) || Math.floor(it.q) !== it.q) return 'cantidad inválida';
    if (it.nota != null && (typeof it.nota !== 'string' || it.nota.length > 200)) return 'nota inválida';
  }
  if (b.pago != null && (typeof b.pago !== 'string' || b.pago.length > 60)) return 'pago inválido';
  return null;
}
function leerMesa(v) {
  if (v == null || v === '') return { ok: true, v: null };
  if (v === 'llevar') return { ok: true, v: 'llevar' };
  if (/^\d{1,3}$/.test(String(v)) && +v >= 1 && +v <= cfg.mesas) return { ok: true, v: +v };
  return { ok: false };
}

function crearPedido(req, res, b) {
  var e = validarPedido(b);
  if (e) return responder(res, 400, { ok: false, error: e });
  var ya = porId[b.id];
  if (ya) return responder(res, 200, { ok: true, repetido: true, pedido: limpio(ya) });
  if (cfg.pausado) return responder(res, 503, { ok: false, error: 'pausado', mensaje: 'El local pausó los pedidos por un momento. Avisale al mozo.' });
  var mesa = leerMesa(b.mesa);
  if (!mesa.ok) return responder(res, 400, { ok: false, error: 'mesa inválida' });

  var total = 0, items = [];
  for (var i = 0; i < b.items.length; i++) {
    var it = b.items[i], pl = null;
    for (var k = 0; k < menu.length; k++) if (menu[k].n === it.n) { pl = menu[k]; break; }
    if (!pl) return responder(res, 400, { ok: false, error: 'plato inexistente: ' + it.n });
    if (pl.agotado) return responder(res, 409, { ok: false, error: 'agotado', plato: pl.n, mensaje: pl.n + ' se agotó.' });
    total += pl.p * it.q;
    items.push({ n: pl.n, q: it.q, nota: it.nota || '', p: pl.p });
  }
  var ip = req.socket.remoteAddress, pend = 0;
  pedidos.forEach(function (p) { if (p.estado === 'porcobrar' && p.ip === ip) pend++; });
  if (pend >= cfg.limiteIp) return responder(res, 429, { ok: false, error: 'limite', mensaje: 'Tenés pedidos esperando el cobro. Pagalos o cancelalos antes de hacer otro.' });

  var teniaJornada = !!jorn.actual;
  try { abrirJornada(); } catch (ex) { console.error(ex); return responder(res, 500, { ok: false, error: 'No se pudo abrir la jornada' }); }
  var num = ++contador;
  var p = {
    id: b.id, num: num, ref: refJ(jorn.actual.id) + '-' + pad(num, 3), jornada: jorn.actual.id,
    estado: cfg.confirmarPago ? 'porcobrar' : 'nuevo', cobrado: !cfg.confirmarPago,
    ts: Date.now(), mesa: mesa.v, total: total, pago: b.pago || '', items: items, ip: ip
  };
  try {
    pedidos.push(p); porId[p.id] = p;
    guardar('pedidos.json', pedidos);
  } catch (ex) {
    pedidos.pop(); delete porId[p.id]; contador--;
    console.error('No se pudo guardar el pedido:', ex.message);
    return responder(res, 500, { ok: false, error: 'No se pudo guardar' });
  }
  console.log('Pedido #' + p.num + ' (' + p.ref + ') recibido' + (p.mesa ? ' - ' + (p.mesa === 'llevar' ? 'para llevar' : 'mesa ' + p.mesa) : ''));
  responder(res, 201, { ok: true, pedido: limpio(p) });
}

function cerrarJornada(res, forzar) {
  if (!jorn.actual) return responder(res, 409, { ok: false, error: 'No hay una jornada abierta' });
  var pendientes = pedidos.filter(function (p) { return p.estado in ORDEN && p.estado !== 'entregado'; }).length;
  if (pendientes && !forzar) return responder(res, 409, { ok: false, error: 'pendientes', pendientes: pendientes });
  var sinCobrar = 0;
  pedidos.forEach(function (p) {
    if (p.estado in EN_CURSO && !p.cobrado) { p.estado = 'cancelado'; p.motivo = 'cierre sin cobrar'; sinCobrar++; }
    else if (p.estado in EN_CURSO) { p.estado = 'entregado'; }
  });
  var ref = refJ(jorn.actual.id), resumen = resumir(pedidos), cerrada = jorn.actual;
  try {
    archivar(cerrada.id, { abrio: cerrada.abrio, cerro: Date.now() }, pedidos);
    guardar('jornada.json', { actual: null, ultima: jorn.ultima });
  } catch (ex) {
    console.error('No se pudo cerrar la jornada:', ex.message);
    return responder(res, 500, { ok: false, error: 'No se pudo guardar el cierre' });
  }
  jorn = { actual: null, ultima: jorn.ultima }; pedidos = []; porId = {}; contador = 0;
  try { guardar('pedidos.json', pedidos); } catch (ex) { console.error(ex.message); }
  respaldar();
  console.log('Jornada ' + ref + ' cerrada: ' + resumen.pedidos + ' pedidos, $' + resumen.total);
  responder(res, 200, { ok: true, ref: ref, resumen: resumen, sinCobrar: sinCobrar });
}

function reporte(mes) {
  var h = leer(path.join('historial', mes + '.json'), { jornadas: [] }), js = h.jornadas.slice();
  if (jorn.actual && mesDe(jorn.actual.abrio) === mes) js.push({ id: jorn.actual.id, abrio: jorn.actual.abrio, pedidos: pedidos, enCurso: true });
  var todos = [], dias = js.map(function (j) {
    var r = resumir(j.pedidos); todos = todos.concat(j.pedidos);
    return { ref: refJ(j.id), fecha: fechaLocal(j.abrio), pedidos: r.pedidos, total: r.total, enCurso: !!j.enCurso };
  });
  var r = resumir(todos), meses = {};
  try { fs.readdirSync(HIST).forEach(function (f) { var m = /^(\d{4}-\d{2})\.json$/.exec(f); if (m) meses[m[1]] = 1; }); } catch (e) {}
  meses[mesDe(Date.now())] = 1;
  return { ok: true, mes: mes, meses: Object.keys(meses).sort().reverse(), jornadas: dias, platos: r.platos, total: r.total, pedidos: r.pedidos, cancelados: r.cancelados };
}

var PAGINAS = { '/': 'pedir.html', '/pedir': 'pedir.html', '/cocina': 'cocina.html', '/caja': 'caja.html', '/inicio': 'inicio.html', '/turnos': 'turnos.html' };
var ESTATICOS = { '/base.css': 1, '/comun.js': 1 };

function manejar(req, res) {
  var partes = req.url.split('?'), url = partes[0], qs = new URLSearchParams(partes[1] || '');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  /* ----- páginas y archivos ----- */
  if (req.method === 'GET') {
    if (PAGINAS[url]) return archivo(res, path.join(PUB, PAGINAS[url]));
    if (ESTATICOS[url]) return archivo(res, path.join(PUB, url.slice(1)));
    if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    var mi = /^\/img\/([^\/]+)$/.exec(url);
    if (mi) {
      var nombre = path.basename(decodeURIComponent(mi[1]));
      if (!/\.(png|jpe?g|webp)$/i.test(nombre)) { res.writeHead(404); return res.end(); }
      return archivo(res, path.join(IMG, nombre), 'public, max-age=300');
    }
    if (url === '/qr-pago') {
      var ext = ['png', 'jpg', 'jpeg', 'webp'].filter(function (x) { return fs.existsSync(path.join(DIR, 'qr-pago.' + x)); })[0];
      if (!ext) { res.writeHead(404); return res.end(); }
      return archivo(res, path.join(DIR, 'qr-pago.' + ext));
    }
    if (url === '/qr.svg') {
      var t = qs.get('t') || '';
      try {
        if (!t || t.length > 100) throw new Error('largo');
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
        return res.end(QR.svg(t));
      } catch (e) { res.writeHead(400); return res.end('Texto inválido'); }
    }
  }

  /* ----- sin PIN: lo que usan los clientes ----- */
  if (req.method === 'GET' && url === '/api/estado') return responder(res, 200, { ok: true, ahora: Date.now() });
  if (req.method === 'GET' && url === '/api/menu') return responder(res, 200, { ok: true, menu: menuPublico() });
  if (req.method === 'GET' && url === '/api/config') {
    var hayQr = ['png', 'jpg', 'jpeg', 'webp'].some(function (x) { return fs.existsSync(path.join(DIR, 'qr-pago.' + x)); });
    return responder(res, 200, { ok: true, local: cfg.local, mesas: cfg.mesas, confirmarPago: cfg.confirmarPago, aliasPago: cfg.aliasPago,
      pausado: cfg.pausado, hayQrPago: hayQr, necesitaPin: !cfg.pin, limiteIp: cfg.limiteIp });
  }
  if (req.method === 'GET' && url === '/api/red') {
    return responder(res, 200, { ok: true, puerto: PORT, direcciones: candidatos(), aviso: cfg.ipAviso });
  }
  if (req.method === 'POST' && url === '/api/red/ok') {
    if (!esLocal(req)) return responder(res, 403, { ok: false, error: 'Solo desde la PC del local' });
    cfg.ipAviso = null; guardarCfg(); return responder(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url === '/api/turnos') {
    var tur = { preparando: [], listos: [] };
    pedidos.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (p) {
      var o = { num: p.num, mesa: p.mesa };
      if (p.estado === 'nuevo' || p.estado === 'prep') tur.preparando.push(o);
      else if (p.estado === 'listo') tur.listos.push(o);
    });
    return responder(res, 200, { ok: true, ahora: Date.now(), preparando: tur.preparando, listos: tur.listos });
  }
  if (req.method === 'POST' && url === '/api/pedidos') {
    return conCuerpo(req, res, function (b) { crearPedido(req, res, b); });
  }

  var mp = /^\/api\/pedidos\/([^\/]+)$/.exec(url);
  if (req.method === 'GET' && mp) {
    var pe = porId[decodeURIComponent(mp[1])];
    if (!pe) return responder(res, 404, { ok: false, error: 'No existe' });
    return responder(res, 200, { ok: true, pedido: { num: pe.num, estado: pe.estado, cobrado: pe.cobrado, mesa: pe.mesa, total: pe.total } });
  }

  /* ----- PIN ----- */
  if (req.method === 'POST' && url === '/api/setup') {
    return conCuerpo(req, res, function (b) {
      if (cfg.pin) return responder(res, 403, { ok: false, error: 'El PIN ya está configurado' });
      if (!esLocal(req)) return responder(res, 403, { ok: false, error: 'La primera configuración se hace desde la PC del local' });
      var d = pinDebil(String(b.pin || ''));
      if (d) return responder(res, 400, { ok: false, error: d });
      ponerPin(String(b.pin));
      responder(res, 200, { ok: true, token: tokenStaff() });
    });
  }
  if (req.method === 'POST' && url === '/api/login') {
    return conCuerpo(req, res, function (b) {
      var ip = req.socket.remoteAddress, f = fallos[ip] || (fallos[ip] = { n: 0, hasta: 0 });
      if (f.hasta > Date.now()) return responder(res, 429, { ok: false, error: 'Demasiados intentos. Esperá un momento.', espera: Math.ceil((f.hasta - Date.now()) / 1000) });
      if (!cfg.pin) return responder(res, 409, { ok: false, error: 'Todavía no se eligió un PIN', necesitaPin: true });
      if (!pinOk(String(b.pin || ''))) {
        if (++f.n >= 5) { f.n = 0; f.hasta = Date.now() + 60000; }
        return responder(res, 401, { ok: false, error: 'PIN incorrecto' });
      }
      f.n = 0;
      responder(res, 200, { ok: true, token: tokenStaff() });
    });
  }

  /* ----- con PIN ----- */
  if (req.method === 'GET' && url === '/api/pedidos') {
    if (!staff(req, res)) return;
    var activos = qs.get('activos') === '1';
    var lista = pedidos.filter(function (p) { return !activos || p.estado in EN_CURSO; }).map(limpio);
    lista.sort(function (a, b) { return a.ts - b.ts; });
    var horas = jorn.actual ? (Date.now() - jorn.actual.abrio) / 3600000 : 0;
    return responder(res, 200, { ok: true, ahora: Date.now(), pedidos: lista,
      jornada: jorn.actual ? { ref: refJ(jorn.actual.id), abrio: jorn.actual.abrio, horas: Math.round(horas * 10) / 10 } : null });
  }

  var m = /^\/api\/pedidos\/([^\/]+)\/(estado|cobrar|cancelar)$/.exec(url);
  if (req.method === 'POST' && m) {
    return conCuerpo(req, res, function (b) {
      var p = porId[decodeURIComponent(m[1])], accion = m[2];
      if (!p) return responder(res, 404, { ok: false, error: 'No existe' });
      if (accion === 'cancelar' && !esStaff(req)) {
        /* el cliente solo puede cancelar su pedido mientras no se cobró */
        if (p.estado !== 'porcobrar') return responder(res, 403, { ok: false, error: 'Para cancelar este pedido pedíselo a caja' });
      } else if (!staff(req, res)) return;

      if (accion === 'cancelar') {
        if (p.estado === 'cancelado') return responder(res, 200, { ok: true, repetido: true, pedido: limpio(p) });
        if (p.estado === 'entregado') return responder(res, 409, { ok: false, error: 'Ya se entregó' });
        if (!cambiar(res, p, { estado: 'cancelado', motivo: esStaff(req) ? 'caja' : 'cliente' })) return;
        return responder(res, 200, { ok: true, pedido: limpio(p) });
      }
      if (accion === 'cobrar') {
        if (p.estado === 'cancelado') return responder(res, 409, { ok: false, error: 'El pedido está cancelado' });
        if (p.cobrado) return responder(res, 200, { ok: true, repetido: true, pedido: limpio(p) });
        if (!cambiar(res, p, { estado: p.estado === 'porcobrar' ? 'nuevo' : p.estado, cobrado: true, cobradoTs: Date.now() })) return;
        return responder(res, 200, { ok: true, pedido: limpio(p) });
      }
      if (!(b.estado in ORDEN)) return responder(res, 400, { ok: false, error: 'Estado inválido' });
      if (!(p.estado in ORDEN)) return responder(res, 409, { ok: false, error: 'Transición no permitida', pedido: limpio(p) });
      if (ORDEN[b.estado] === ORDEN[p.estado]) return responder(res, 200, { ok: true, repetido: true, pedido: limpio(p) });
      if (ORDEN[b.estado] !== ORDEN[p.estado] + 1) return responder(res, 409, { ok: false, error: 'Transición no permitida', pedido: limpio(p) });
      if (!cambiar(res, p, { estado: b.estado })) return;
      responder(res, 200, { ok: true, pedido: limpio(p) });
    });
  }

  if (req.method === 'GET' && url === '/api/jornada') {
    if (!staff(req, res)) return;
    var horasJ = jorn.actual ? (Date.now() - jorn.actual.abrio) / 3600000 : 0;
    return responder(res, 200, { ok: true, actual: jorn.actual ? { ref: refJ(jorn.actual.id), abrio: jorn.actual.abrio, horas: Math.round(horasJ * 10) / 10 } : null,
      resumen: resumir(pedidos), pausado: cfg.pausado });
  }
  if (req.method === 'POST' && url === '/api/jornada/abrir') {
    if (!staff(req, res)) return;
    try { abrirJornada(); } catch (e) { return responder(res, 500, { ok: false, error: 'No se pudo abrir' }); }
    return responder(res, 200, { ok: true, ref: refJ(jorn.actual.id) });
  }
  if (req.method === 'POST' && url === '/api/jornada/cerrar') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) { cerrarJornada(res, !!b.forzar); });
  }
  if (req.method === 'GET' && url === '/api/reporte') {
    if (!staff(req, res)) return;
    var mes = qs.get('mes') || mesDe(Date.now());
    if (!/^\d{4}-\d{2}$/.test(mes)) return responder(res, 400, { ok: false, error: 'mes inválido' });
    return responder(res, 200, reporte(mes));
  }

  if (req.method === 'POST' && url === '/api/menu/agotado') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var pl = menu.filter(function (x) { return x.id === b.id; })[0];
      if (!pl) return responder(res, 404, { ok: false, error: 'No existe' });
      var antes = pl.agotado; pl.agotado = !!b.agotado;
      try { guardar('menu.json', menu); } catch (e) { pl.agotado = antes; return responder(res, 500, { ok: false, error: 'No se pudo guardar' }); }
      responder(res, 200, { ok: true, menu: menuPublico() });
    });
  }
  if (req.method === 'POST' && url === '/api/menu/guardar') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var n = typeof b.n === 'string' ? b.n.trim() : '', cat = typeof b.cat === 'string' ? b.cat.trim() : '', d = typeof b.d === 'string' ? b.d.trim() : '';
      if (!n || n.length > 60) return responder(res, 400, { ok: false, error: 'El nombre del producto es obligatorio (hasta 60 letras).' });
      if (!cat || cat.length > 30) return responder(res, 400, { ok: false, error: 'La categoría es obligatoria (hasta 30 letras).' });
      if (d.length > 140) return responder(res, 400, { ok: false, error: 'La descripción es muy larga (hasta 140 letras).' });
      if (!(typeof b.p === 'number' && b.p >= 0 && b.p <= 10000000 && Math.floor(b.p) === b.p)) return responder(res, 400, { ok: false, error: 'El precio tiene que ser un número entero.' });
      var x = Array.isArray(b.x) ? b.x.map(function (v) { return String(v).trim(); }).filter(Boolean) : [];
      if (x.length > 12 || x.some(function (v) { return v.length > 30; })) return responder(res, 400, { ok: false, error: 'Hasta 12 opciones de hasta 30 letras cada una.' });
      var ex = null;
      if (b.id != null) { ex = menu.filter(function (m) { return m.id === b.id; })[0]; if (!ex) return responder(res, 404, { ok: false, error: 'No existe ese producto' }); }
      var dup = menu.some(function (m) { return norm(m.n) === norm(n) && (!ex || m.id !== ex.id); });
      if (dup) return responder(res, 409, { ok: false, error: 'Ya hay un producto con ese nombre.' });
      var antes = JSON.stringify(menu), viejo = ex ? ex.n : null, id;
      if (ex) { id = ex.id; ex.n = n; ex.cat = cat; ex.d = d; ex.p = b.p; ex.x = x; }
      else {
        id = menu.reduce(function (m, i) { return Math.max(m, i.id); }, 0) + 1;
        menu.push({ id: id, cat: cat, n: n, d: d, p: b.p, c: PALETA[id % PALETA.length], x: x });
      }
      try { guardar('menu.json', menu); if (viejo && norm(viejo) !== norm(n)) renombrarImagen(viejo, n); }
      catch (e) { menu = JSON.parse(antes); console.error(e.message); return responder(res, 500, { ok: false, error: 'No se pudo guardar' }); }
      responder(res, 200, { ok: true, id: id, menu: menuPublico() });
    });
  }
  if (req.method === 'POST' && url === '/api/menu/borrar') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var k = -1; menu.forEach(function (m, i) { if (m.id === b.id) k = i; });
      if (k < 0) return responder(res, 404, { ok: false, error: 'No existe ese producto' });
      var antes = JSON.stringify(menu), quitado = menu[k];
      menu.splice(k, 1);
      try { guardar('menu.json', menu); } catch (e) { menu = JSON.parse(antes); return responder(res, 500, { ok: false, error: 'No se pudo guardar' }); }
      quitarImagenes(quitado.n);
      responder(res, 200, { ok: true, menu: menuPublico() });
    });
  }
  if (req.method === 'POST' && url === '/api/menu/imagen') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var pl = menu.filter(function (m) { return m.id === b.id; })[0];
      if (!pl) return responder(res, 404, { ok: false, error: 'No existe ese producto' });
      if (b.data === null) { quitarImagenes(pl.n); return responder(res, 200, { ok: true, menu: menuPublico() }); }
      var m = typeof b.data === 'string' && /^data:image\/(png|jpeg|webp);base64,/.exec(b.data.slice(0, 40));
      if (!m) return responder(res, 400, { ok: false, error: 'La foto tiene que ser PNG, JPG o WEBP.' });
      var buf = Buffer.from(b.data.slice(m[0].length), 'base64');
      if (buf.length < 12 || buf.length > 600 * 1024) return responder(res, 400, { ok: false, error: 'La foto es demasiado pesada (máximo 600 KB).' });
      var firma = buf.slice(0, 4).toString('hex'), ext = null;
      if (firma === '89504e47') ext = 'png';
      else if (firma.slice(0, 6) === 'ffd8ff') ext = 'jpg';
      else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ext = 'webp';
      if (!ext) return responder(res, 400, { ok: false, error: 'El archivo no es una imagen válida.' });
      try {
        fs.mkdirSync(IMG, { recursive: true });
        quitarImagenes(pl.n);
        var dest = path.join(IMG, nombreArchivo(pl.n) + '.' + ext);
        fs.writeFileSync(dest + '.tmp', buf); fs.renameSync(dest + '.tmp', dest);
      } catch (e) { console.error(e.message); return responder(res, 500, { ok: false, error: 'No se pudo guardar la foto' }); }
      responder(res, 200, { ok: true, menu: menuPublico() });
    });
  }
  if (req.method === 'POST' && url === '/api/pausa') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var antes = cfg.pausado; cfg.pausado = !!b.pausado;
      try { guardarCfg(); } catch (e) { cfg.pausado = antes; return responder(res, 500, { ok: false, error: 'No se pudo guardar' }); }
      responder(res, 200, { ok: true, pausado: cfg.pausado });
    });
  }
  if (req.method === 'POST' && url === '/api/config') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      var nuevo = {};
      if (b.local != null) { if (typeof b.local !== 'string' || !b.local.trim() || b.local.length > 60) return responder(res, 400, { ok: false, error: 'Nombre inválido' }); nuevo.local = b.local.trim(); }
      if (b.mesas != null) { if (!(b.mesas >= 0 && b.mesas <= 99) || Math.floor(b.mesas) !== b.mesas) return responder(res, 400, { ok: false, error: 'Cantidad de mesas inválida' }); nuevo.mesas = b.mesas; }
      if (b.confirmarPago != null) nuevo.confirmarPago = !!b.confirmarPago;
      if (b.aliasPago != null) { if (typeof b.aliasPago !== 'string' || b.aliasPago.length > 80) return responder(res, 400, { ok: false, error: 'Alias inválido' }); nuevo.aliasPago = b.aliasPago.trim(); }
      if (b.limiteIp != null) { if (!(b.limiteIp >= 1 && b.limiteIp <= 10000)) return responder(res, 400, { ok: false, error: 'Límite inválido' }); nuevo.limiteIp = b.limiteIp; }
      var viejo = {}; Object.keys(nuevo).forEach(function (k) { viejo[k] = cfg[k]; cfg[k] = nuevo[k]; });
      try { guardarCfg(); } catch (e) { Object.keys(viejo).forEach(function (k) { cfg[k] = viejo[k]; }); return responder(res, 500, { ok: false, error: 'No se pudo guardar' }); }
      responder(res, 200, { ok: true });
    });
  }
  if (req.method === 'POST' && url === '/api/pin') {
    if (!staff(req, res)) return;
    return conCuerpo(req, res, function (b) {
      if (!pinOk(String(b.actual || ''))) return responder(res, 401, { ok: false, error: 'El PIN actual no es correcto' });
      var d = pinDebil(String(b.nuevo || ''));
      if (d) return responder(res, 400, { ok: false, error: d });
      ponerPin(String(b.nuevo));
      responder(res, 200, { ok: true, token: tokenStaff() });
    });
  }

  responder(res, 404, { ok: false, error: 'No encontrado' });
}

var servidor = http.createServer(function (req, res) {
  try { manejar(req, res); } catch (e) { console.error(e); try { responder(res, 500, { ok: false }); } catch (x) {} }
});
process.on('uncaughtException', function (e) { console.error('Error no controlado:', e); });

function abrirNavegador(url) {
  try {
    if (process.platform === 'win32') cp.exec('start "" "' + url + '"');
    else if (process.platform === 'darwin') cp.exec('open "' + url + '"');
    else cp.exec('xdg-open "' + url + '"');
  } catch (e) {}
}

servidor.listen(PORT, '0.0.0.0', function () {
  var cands = candidatos(), ip = cands[0] ? cands[0].ip : null;
  if (ip && cfg.ipConocida && cfg.ipConocida !== ip) {
    cfg.ipAviso = { antes: cfg.ipConocida, ahora: ip, ts: Date.now() };
    console.log('\n*** ATENCIÓN: la dirección de la PC cambió de ' + cfg.ipConocida + ' a ' + ip + '. Los QR impresos dejaron de funcionar. ***');
  }
  if (ip && cfg.ipConocida !== ip) { cfg.ipConocida = ip; try { guardarCfg(); } catch (e) {} }
  respaldar();
  setInterval(respaldar, 6 * 3600 * 1000).unref();

  console.log('\n=== Vito Fud - servidor activo ===');
  console.log('Pantalla de inicio: http://localhost:' + PORT + '/inicio');
  cands.forEach(function (c) { console.log('Dirección de la red: ' + c.url + '   (' + c.nombre + ')' + (c.preferida ? '  <- principal' : '')); });
  console.log('Datos guardados en: ' + DIR + '\n');
  if (!process.env.SIN_NAVEGADOR) abrirNavegador('http://localhost:' + PORT + (cfg.pin ? '/inicio' : '/caja'));
});
