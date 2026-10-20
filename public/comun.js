/* Ayudas compartidas por las pantallas del personal (caja y cocina) */
var VF = (function () {
  var TK = 'vf_token', abierto = false;
  function token() { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } }
  function guardar(t) { try { localStorage.setItem(TK, t); } catch (e) {} }
  function borrar() { try { localStorage.removeItem(TK); } catch (e) {} }

  /* llamada a la API con el PIN; si falta, muestra la pantalla de PIN */
  function api(url, opts) {
    opts = opts || {};
    var h = { 'X-Token': token() };
    if (opts.body !== undefined) { h['Content-Type'] = 'application/json'; if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body); }
    opts.headers = Object.assign(h, opts.headers || {});
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, opts.ms || 5000);
    opts.signal = c.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(t);
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && d.login) { borrar(); login(); }
        return { ok: r.ok, status: r.status, data: d };
      });
    }, function (e) { clearTimeout(t); throw e; });
  }

  function login(cb) {
    if (abierto) return;
    abierto = true;
    var v = document.createElement('div'); v.className = 'velo';
    v.innerHTML = '<form class="caja-dlg" autocomplete="off"><h2>Ingresá el PIN</h2><p>Es el PIN del personal del local.</p>' +
      '<input type="password" inputmode="numeric" maxlength="8" id="vf-pin" aria-label="PIN" autofocus>' +
      '<div class="err" id="vf-err" role="alert"></div><button class="btn" type="submit">Entrar</button></form>';
    document.body.appendChild(v);
    var f = v.querySelector('form'), i = v.querySelector('#vf-pin'), e = v.querySelector('#vf-err');
    setTimeout(function () { i.focus(); }, 50);
    f.onsubmit = function (ev) {
      ev.preventDefault(); e.textContent = '';
      fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: i.value }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { guardar(d.token); document.body.removeChild(v); abierto = false; if (cb) cb(); else location.reload(); }
          else { e.textContent = d.error || 'No se pudo entrar'; i.value = ''; i.focus(); }
        }).catch(function () { e.textContent = 'No hay conexión con el servidor.'; });
    };
  }
  return { token: token, guardar: guardar, borrar: borrar, api: api, login: login };
})();

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dinero(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function etiquetaMesa(m) { return m === 'llevar' ? 'Para llevar' : (m ? 'Mesa ' + m : 'Mostrador'); }
function aplicarTema() {
  var t = null; try { t = localStorage.getItem('vf_tema'); } catch (e) {}
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
  document.documentElement.setAttribute('data-tema', t);
}
function cambiarTema() {
  var t = document.documentElement.getAttribute('data-tema') === 'claro' ? 'oscuro' : 'claro';
  try { localStorage.setItem('vf_tema', t); } catch (e) {}
  document.documentElement.setAttribute('data-tema', t);
}
aplicarTema();
