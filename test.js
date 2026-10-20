'use strict';
/* Pruebas del servidor. Correr con:  node test.js */
var http = require('http'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
var PORT = 3999, DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-')), IMGS = fs.mkdtempSync(path.join(os.tmpdir(), 'vfimg-'));
var srv = null, fallos = 0, total = 0;

/* pedidos de la versión anterior (sin jornada): tienen que pasar al historial */
var LEGADO = [
  { id: 'e8c2cb63-e039-4178-99f5-aae3ed209906', num: 1, estado: 'entregado', ts: 1792152021620, total: 20300, pago: 'Pagás en caja', items: [{ n: 'Flan con dulce de leche', q: 3, nota: '' }, { n: 'Panqueque de manzana', q: 1, nota: '' }] },
  { id: 'c4abc4b1-53ed-49ef-b69c-aa3ba3cfb1fc', num: 2, estado: 'entregado', ts: 1792153410868, total: 60600, pago: 'Pagás en caja', items: [{ n: 'Bife de chorizo', q: 2, nota: '' }, { n: 'Vacío a la parrilla', q: 2, nota: '' }] },
  { id: '9e90cda3-ae43-4f04-bdbb-ff14c8cedf73', num: 3, estado: 'entregado', ts: 1792153740980, total: 16700, pago: 'Pagás en caja', items: [{ n: 'Papas fritas', q: 1, nota: '' }, { n: 'Choripán', q: 1, nota: '' }, { n: 'Gaseosa', q: 2, nota: '' }] },
  { id: 'ed8f57f1-036c-4055-8906-f79e7738fc17', num: 4, estado: 'entregado', ts: 1792154559714, total: 28200, pago: 'Pagás en caja', items: [{ n: 'Choripán', q: 2, nota: 'sin Chimichurri' }, { n: 'Papas fritas', q: 2, nota: 'sin Cheddar' }, { n: 'Gaseosa', q: 2, nota: '' }] }
];

function arrancar() {
  return new Promise(function (ok) {
    srv = cp.spawn(process.execPath, ['server.js'], { cwd: __dirname, env: Object.assign({}, process.env, { PORT: PORT, DATOS: DATOS, IMAGENES: IMGS, SIN_NAVEGADOR: '1' }) });
    srv.stdout.on('data', function (d) { if (String(d).indexOf('activo') >= 0) ok(); });
  });
}
function parar() { return new Promise(function (ok) { srv.on('exit', ok); srv.kill(); }); }
function pedir(metodo, ruta, cuerpo, token) {
  return new Promise(function (ok, no) {
    var data = cuerpo === undefined ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    var h = { 'Content-Type': 'application/json' }; if (token) h['X-Token'] = token;
    var r = http.request({ host: '127.0.0.1', port: PORT, path: ruta, method: metodo, headers: h }, function (res) {
      var s = ''; res.on('data', function (c) { s += c; });
      res.on('end', function () { var b = s; try { b = s ? JSON.parse(s) : null; } catch (e) {} ok({ code: res.statusCode, body: b, tipo: res.headers['content-type'] }); });
    });
    r.on('error', no); if (data) r.write(data); r.end();
  });
}
function chequear(nombre, cond, extra) {
  total++;
  console.log((cond ? 'OK     ' : 'FALLÓ  ') + nombre + (cond ? '' : '  -> ' + extra));
  if (!cond) fallos++;
}
function ped(id, extra) { return Object.assign({ id: id, total: 1, pago: 'QR', items: [{ n: 'Choripán', q: 2, nota: 'sin chimichurri' }] }, extra || {}); }
function mesActual() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

(async function () {
  fs.writeFileSync(path.join(DATOS, 'pedidos.json'), JSON.stringify(LEGADO));
  fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({ limiteIp: 1000 }));
  await arrancar();
  var T, r, a, b;

  /* ---------- PIN ---------- */
  chequear('Sin PIN configurado, la lista de pedidos está cerrada (401)', (await pedir('GET', '/api/pedidos')).code === 401);
  chequear('No se acepta un PIN fácil como 1234', (await pedir('POST', '/api/setup', { pin: '1234' })).code === 400);
  chequear('No se acepta un PIN repetido como 1111', (await pedir('POST', '/api/setup', { pin: '1111' })).code === 400);
  r = await pedir('POST', '/api/setup', { pin: '4827' }); T = r.body && r.body.token;
  chequear('Se puede elegir un PIN propio la primera vez', r.code === 200 && !!T);
  chequear('El PIN no se puede volver a configurar desde afuera', (await pedir('POST', '/api/setup', { pin: '9183' })).code === 403);
  chequear('Con el PIN del personal se leen los pedidos', (await pedir('GET', '/api/pedidos', undefined, T)).code === 200);
  chequear('Un token inventado no sirve', (await pedir('GET', '/api/pedidos', undefined, 'a'.repeat(64))).code === 401);
  chequear('PIN incorrecto da 401', (await pedir('POST', '/api/login', { pin: '0000' })).code === 401);

  /* ---------- migración de la versión anterior ---------- */
  r = await pedir('GET', '/api/pedidos', undefined, T);
  chequear('Los pedidos viejos pasan al historial y la jornada nueva arranca vacía', r.body.pedidos.length === 0 && r.body.jornada === null);
  r = await pedir('GET', '/api/reporte?mes=2026-10', undefined, T);
  chequear('El reporte mensual suma los pedidos viejos ($125.800 en 4 pedidos)', r.body.total === 125800 && r.body.pedidos === 4, JSON.stringify(r.body && [r.body.total, r.body.pedidos]));
  var chori = (r.body.platos || []).filter(function (p) { return p.n === 'Choripán'; })[0];
  chequear('El reporte separa las ventas por plato (3 choripanes)', chori && chori.q === 3, JSON.stringify(chori));

  /* ---------- crear pedidos ---------- */
  a = await pedir('POST', '/api/pedidos', ped('prueba-0001-abcd', { mesa: 4 }));
  b = await pedir('POST', '/api/pedidos', ped('prueba-0001-abcd', { mesa: 4 }));
  chequear('El cliente pide sin PIN y el pedido nace "por cobrar" con número #1', a.code === 201 && a.body.pedido.num === 1 && a.body.pedido.estado === 'porcobrar');
  chequear('El total lo calcula el servidor, no el celular (2 × $6.200)', a.body.pedido.total === 12400, a.body.pedido.total);
  chequear('Cada pedido tiene un identificador interno único con la jornada', a.body.pedido.ref === 'J0001-001', a.body.pedido.ref);
  chequear('Enviar el mismo pedido dos veces no lo duplica y devuelve el mismo número', b.code === 200 && b.body.repetido === true && b.body.pedido.num === 1);
  r = await pedir('GET', '/api/pedidos?activos=1', undefined, T);
  chequear('La lista del personal no expone la IP del cliente', r.body.pedidos.length === 1 && r.body.pedidos[0].ip === undefined && r.body.jornada.ref === 'J0001');
  r = await pedir('GET', '/api/pedidos/prueba-0001-abcd');
  chequear('El cliente consulta el estado de su pedido por su id', r.code === 200 && r.body.pedido.estado === 'porcobrar' && r.body.pedido.num === 1);
  chequear('Un pedido inventado da 404', (await pedir('GET', '/api/pedidos/no-existe-123')).code === 404);

  chequear('Una mesa que no existe se rechaza', (await pedir('POST', '/api/pedidos', ped('mesa-mala-0001', { mesa: 50 }))).code === 400);
  chequear('Para llevar es válido', (await pedir('POST', '/api/pedidos', ped('llevar-0001-ab', { mesa: 'llevar' }))).code === 201);
  chequear('Un plato que no está en el menú se rechaza', (await pedir('POST', '/api/pedidos', ped('plato-malo-0001', { items: [{ n: 'Pizza', q: 1 }] }))).code === 400);
  chequear('Un pedido inválido se rechaza con aviso (400)', (await pedir('POST', '/api/pedidos', { id: 'x', items: [] })).code === 400);
  r = await pedir('POST', '/api/pedidos', '{no es json');
  chequear('Un JSON roto no tumba el servidor', r.code === 400 && (await pedir('GET', '/api/estado')).code === 200);

  /* ---------- cobro y cocina ---------- */
  chequear('Cobrar sin PIN no se puede (401)', (await pedir('POST', '/api/pedidos/prueba-0001-abcd/cobrar', {})).code === 401);
  chequear('Cocina sin PIN no puede mover pedidos (401)', (await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'prep' })).code === 401);
  chequear('Un pedido sin cobrar no puede pasar a cocina (409)', (await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'prep' }, T)).code === 409);
  r = await pedir('POST', '/api/pedidos/prueba-0001-abcd/cobrar', {}, T);
  chequear('Al cobrar, el pedido pasa a cocina', r.code === 200 && r.body.pedido.estado === 'nuevo' && r.body.pedido.cobrado === true);
  chequear('Cobrar dos veces no rompe nada', (await pedir('POST', '/api/pedidos/prueba-0001-abcd/cobrar', {}, T)).body.repetido === true);
  chequear('No se puede saltar de Nuevo a Listo (409)', (await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'listo' }, T)).code === 409);
  var p1 = await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'prep' }, T);
  var p2 = await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'prep' }, T);
  chequear('Tocar "Empezar" dos veces no rompe nada', p1.code === 200 && p2.code === 200 && p2.body.pedido.estado === 'prep');
  r = await pedir('GET', '/api/turnos');
  chequear('La pantalla de turnos muestra el pedido preparando, con su mesa', r.body.preparando.length === 1 && r.body.preparando[0].num === 1 && r.body.preparando[0].mesa === 4);
  await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'listo' }, T);
  r = await pedir('GET', '/api/turnos');
  chequear('Al estar listo pasa a la columna de listos', r.body.listos.length === 1 && r.body.preparando.length === 0);
  await pedir('POST', '/api/pedidos/prueba-0001-abcd/estado', { estado: 'entregado' }, T);
  r = await pedir('GET', '/api/pedidos?activos=1', undefined, T);
  chequear('Un pedido entregado sale del tablero', r.body.pedidos.every(function (p) { return p.id !== 'prueba-0001-abcd'; }));
  chequear('Cambiar un pedido inexistente da 404', (await pedir('POST', '/api/pedidos/no-existe-123/estado', { estado: 'prep' }, T)).code === 404);

  /* ---------- cancelar ---------- */
  r = await pedir('POST', '/api/pedidos/llevar-0001-ab/cancelar', {});
  chequear('El cliente puede cancelar su pedido mientras no pagó', r.code === 200 && r.body.pedido.estado === 'cancelado');
  await pedir('POST', '/api/pedidos', ped('cobrado-0001-ab'));
  await pedir('POST', '/api/pedidos/cobrado-0001-ab/cobrar', {}, T);
  chequear('Una vez cobrado, el cliente ya no puede cancelar (lo hace caja)', (await pedir('POST', '/api/pedidos/cobrado-0001-ab/cancelar', {})).code === 403);

  /* ---------- agotado, pausa, límites ---------- */
  chequear('Marcar agotado sin PIN no se puede', (await pedir('POST', '/api/menu/agotado', { id: 3, agotado: true })).code === 401);
  await pedir('POST', '/api/menu/agotado', { id: 3, agotado: true }, T);
  r = await pedir('POST', '/api/pedidos', ped('agotado-0001-a'));
  chequear('Un plato agotado no se puede pedir (409)', r.code === 409 && r.body.error === 'agotado');
  await pedir('POST', '/api/menu/agotado', { id: 3, agotado: false }, T);
  await pedir('POST', '/api/pausa', { pausado: true }, T);
  chequear('Con los pedidos pausados el cliente recibe un aviso (503)', (await pedir('POST', '/api/pedidos', ped('pausado-0001-a'))).code === 503);
  await pedir('POST', '/api/pausa', { pausado: false }, T);

  var tareas = [];
  for (var i = 0; i < 50; i++) tareas.push(pedir('POST', '/api/pedidos', ped('paralelo-' + (1000 + i))));
  var rs = await Promise.all(tareas);
  var nums = rs.map(function (x) { return x.body.pedido.num; });
  chequear('50 pedidos simultáneos: todos guardados, sin números repetidos', new Set(nums).size === 50 && rs.every(function (x) { return x.code === 201; }), new Set(nums).size + ' únicos');

  await pedir('POST', '/api/config', { limiteIp: 2 }, T);
  r = await pedir('POST', '/api/pedidos', ped('limite-0001-ab'));
  chequear('Un mismo celular no puede dejar pedidos sin pagar sin límite (429)', r.code === 429);
  await pedir('POST', '/api/config', { limiteIp: 1000 }, T);

  chequear('Cambiar ajustes sin PIN no se puede', (await pedir('POST', '/api/config', { mesas: 3 })).code === 401);
  await pedir('POST', '/api/config', { mesas: 5 }, T);
  chequear('La cantidad de mesas se respeta en los pedidos', (await pedir('POST', '/api/pedidos', ped('mesa-siete-01', { mesa: 7 }))).code === 400);
  await pedir('POST', '/api/config', { mesas: 10 }, T);

  await pedir('POST', '/api/config', { confirmarPago: false }, T);
  r = await pedir('POST', '/api/pedidos', ped('directo-0001-a'));
  chequear('Sin confirmación de pago el pedido va directo a cocina', r.code === 201 && r.body.pedido.estado === 'nuevo' && r.body.pedido.cobrado === true);
  await pedir('POST', '/api/config', { confirmarPago: true }, T);


  /* ---------- editar el menú ---------- */
  var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  var NUEVO = { n: 'Hamburguesa con queso', cat: 'Parrilla', p: 9800, d: 'Doble carne', x: ['Cebolla', 'Pepino'] };
  async function pedidoYCancelar(id, items) { var q = await pedir('POST', '/api/pedidos', ped(id, { items: items })); await pedir('POST', '/api/pedidos/' + id + '/cancelar', {}, T); return q; }
  chequear('Agregar un producto sin PIN no se puede', (await pedir('POST', '/api/menu/guardar', NUEVO)).code === 401);
  r = await pedir('POST', '/api/menu/guardar', NUEVO, T); var NID = r.body && r.body.id;
  chequear('Se puede agregar un producto nuevo y aparece en la carta', r.code === 200 && r.body.menu.some(function (m) { return m.n === 'Hamburguesa con queso' && m.p === 9800 && m.x.length === 2; }), JSON.stringify(r.body));
  chequear('El producto nuevo se puede pedir', (await pedidoYCancelar('hamb-nueva-0001', [{ n: 'Hamburguesa con queso', q: 1 }])).body.pedido.total === 9800);
  chequear('No se acepta un precio negativo, con decimales ni vacío', (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: 'X1', p: -5 }), T)).code === 400 && (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: 'X2', p: 10.5 }), T)).code === 400 && (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: 'X3', p: '100' }), T)).code === 400);
  chequear('No se acepta un producto sin nombre o sin categoría', (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: '  ' }), T)).code === 400 && (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: 'Y1', cat: '' }), T)).code === 400);
  chequear('No se aceptan dos productos con el mismo nombre (aunque cambien mayúsculas)', (await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { n: 'HAMBURGUESA con QUESO' }), T)).code === 409);
  r = await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { id: NID, p: 11000 }), T);
  chequear('Cambiar el precio vale para los pedidos nuevos', r.code === 200 && (await pedidoYCancelar('hamb-nueva-0002', [{ n: 'Hamburguesa con queso', q: 1 }])).body.pedido.total === 11000);
  chequear('Los pedidos viejos conservan el precio con el que se hicieron', (await pedir('GET', '/api/pedidos/hamb-nueva-0001')).body.pedido.total === 9800);
  chequear('Subir una foto sin PIN no se puede', (await pedir('POST', '/api/menu/imagen', { id: NID, data: PNG })).code === 401);
  r = await pedir('POST', '/api/menu/imagen', { id: NID, data: PNG }, T);
  var item = r.body && r.body.menu && r.body.menu.filter(function (m) { return m.id === NID; })[0];
  chequear('Se puede subir la foto de un producto', r.code === 200 && item && /^\/img\//.test(item.img || ''), JSON.stringify(item));
  var fi = item && await pedir('GET', item.img);
  chequear('La foto subida se sirve a los clientes', fi && fi.code === 200 && /image\/png/.test(fi.tipo));
  chequear('La foto se guarda en la carpeta de imágenes con el nombre del producto', fs.existsSync(path.join(IMGS, 'Hamburguesa con queso.png')));
  chequear('Un archivo que no es imagen se rechaza', (await pedir('POST', '/api/menu/imagen', { id: NID, data: 'data:text/html;base64,PGgxPmhvbGE8L2gxPg==' }, T)).code === 400 && (await pedir('POST', '/api/menu/imagen', { id: NID, data: 'data:image/png;base64,' + Buffer.from('esto no es una imagen png').toString('base64') }, T)).code === 400);
  chequear('Una foto demasiado pesada se rechaza', (await pedir('POST', '/api/menu/imagen', { id: NID, data: 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e47', 'hex'), Buffer.alloc(700 * 1024)]).toString('base64') }, T)).code === 400);
  r = await pedir('POST', '/api/menu/guardar', Object.assign({}, NUEVO, { id: NID, n: 'Hamburguesa clásica', p: 11000 }), T);
  item = r.body.menu.filter(function (m) { return m.id === NID; })[0];
  chequear('Al renombrar el producto, la foto lo acompaña', r.code === 200 && /^\/img\//.test(item.img || '') && fs.existsSync(path.join(IMGS, 'Hamburguesa clásica.png')) && !fs.existsSync(path.join(IMGS, 'Hamburguesa con queso.png')), JSON.stringify(item));
  r = await pedir('POST', '/api/menu/imagen', { id: NID, data: null }, T);
  chequear('Se puede quitar la foto', r.code === 200 && !r.body.menu.filter(function (m) { return m.id === NID; })[0].img && !fs.existsSync(path.join(IMGS, 'Hamburguesa clásica.png')));
  chequear('Borrar un producto sin PIN no se puede', (await pedir('POST', '/api/menu/borrar', { id: NID })).code === 401);
  r = await pedir('POST', '/api/menu/borrar', { id: NID }, T);
  chequear('Se puede borrar un producto y ya no se puede pedir', r.code === 200 && (await pedir('POST', '/api/pedidos', ped('hamb-borrada-001', { items: [{ n: 'Hamburguesa clásica', q: 1 }] }))).code === 400);

  /* ---------- cierre de jornada ---------- */
  chequear('Cerrar la jornada sin PIN no se puede', (await pedir('POST', '/api/jornada/cerrar', {})).code === 401);
  r = await pedir('POST', '/api/jornada/cerrar', {}, T);
  chequear('Con pedidos sin entregar, el cierre avisa antes (409)', r.code === 409 && r.body.error === 'pendientes' && r.body.pendientes > 0, JSON.stringify(r.body));
  r = await pedir('POST', '/api/jornada/cerrar', { forzar: true }, T);
  chequear('Cerrar la jornada devuelve el resumen de ventas', r.code === 200 && r.body.ref === 'J0001' && r.body.resumen.pedidos === 3 && r.body.resumen.total > 0, JSON.stringify(r.body));
  chequear('Los pedidos sin cobrar se cancelan al cerrar (no suman a las ventas)', r.body.sinCobrar === 50, r.body.sinCobrar);
  r = await pedir('GET', '/api/pedidos', undefined, T);
  chequear('Después del cierre no queda ninguna jornada abierta', r.body.pedidos.length === 0 && r.body.jornada === null);
  chequear('El historial del mes quedó guardado en disco', fs.existsSync(path.join(DATOS, 'historial', mesActual() + '.json')));
  chequear('Se hizo la copia de seguridad', fs.readdirSync(path.join(DATOS, 'backup')).length >= 1);
  a = await pedir('POST', '/api/pedidos', ped('jornada2-0001-a'));
  chequear('La numeración vuelve a #1 en la jornada nueva, con otro identificador', a.body.pedido.num === 1 && a.body.pedido.ref === 'J0002-001', JSON.stringify(a.body.pedido));
  r = await pedir('GET', '/api/reporte?mes=' + mesActual(), undefined, T);
  chequear('El reporte del mes junta las jornadas cerradas y la que está en curso', r.body.jornadas.length >= 2 && r.body.jornadas.some(function (j) { return j.enCurso; }) && r.body.total > 0, JSON.stringify(r.body.jornadas));

  /* ---------- cambio de PIN y bloqueo ---------- */
  chequear('Cambiar el PIN con el actual mal escrito falla', (await pedir('POST', '/api/pin', { actual: '0000', nuevo: '7391' }, T)).code === 401);
  chequear('Un PIN nuevo fácil se rechaza', (await pedir('POST', '/api/pin', { actual: '4827', nuevo: '4321' }, T)).code === 400);
  r = await pedir('POST', '/api/pin', { actual: '4827', nuevo: '7391' }, T); var T2 = r.body.token;
  chequear('Al cambiar el PIN, el acceso anterior deja de servir y el nuevo sí', r.code === 200 && (await pedir('GET', '/api/pedidos', undefined, T)).code === 401 && (await pedir('GET', '/api/pedidos', undefined, T2)).code === 200);
  var bloqueo = 0;
  for (i = 0; i < 6; i++) bloqueo = (await pedir('POST', '/api/login', { pin: '0001' })).code;
  chequear('Después de 5 PIN incorrectos seguidos, se bloquea unos segundos (429)', bloqueo === 429, bloqueo);

  /* ---------- páginas, QR y archivos ---------- */
  r = await pedir('GET', '/inicio'); chequear('La pantalla de inicio carga', r.code === 200 && /html/.test(r.tipo));
  chequear('La pantalla de pedido carga con ?mesa=N', (await pedir('GET', '/pedir?mesa=3')).code === 200);
  chequear('Caja, cocina y turnos cargan', (await pedir('GET', '/caja')).code === 200 && (await pedir('GET', '/cocina')).code === 200 && (await pedir('GET', '/turnos')).code === 200);
  r = await pedir('GET', '/qr.svg?t=' + encodeURIComponent('http://192.168.0.15:3000/pedir?mesa=4'));
  chequear('El servidor genera el QR', r.code === 200 && /svg/.test(r.tipo) && /<path/.test(String(r.body)));
  chequear('Un texto demasiado largo para el QR se rechaza', (await pedir('GET', '/qr.svg?t=' + 'x'.repeat(200))).code === 400);
  chequear('No se puede leer server.js desde el navegador', (await pedir('GET', '/server.js')).code === 404 && (await pedir('GET', '/../server.js')).code === 404 && (await pedir('GET', '/%2e%2e/server.js')).code === 404);
  chequear('No se puede salir de la carpeta de imágenes', (await pedir('GET', '/img/..%2fserver.js')).code === 404);
  chequear('La dirección de red se informa para armar los QR', (await pedir('GET', '/api/red')).body.ok === true);
  chequear('El menú se entrega completo y sin PIN', (await pedir('GET', '/api/menu')).body.menu.length === 12);

  /* ---------- reinicio ---------- */
  await parar(); await arrancar();
  r = await pedir('GET', '/api/pedidos', undefined, T2);
  chequear('Al apagar y prender el servidor no se pierde ningún pedido ni el acceso', r.code === 200 && r.body.pedidos.length === 1 && r.body.jornada.ref === 'J0002', JSON.stringify(r.body));
  b = await pedir('POST', '/api/pedidos', ped('jornada2-0001-a'));
  chequear('Un reintento tras reiniciar tampoco duplica', b.body.repetido === true && (await pedir('GET', '/api/pedidos', undefined, T2)).body.pedidos.length === 1);
  b = await pedir('POST', '/api/pedidos', ped('jornada2-0002-a'));
  chequear('Reiniciar el programa no reinicia la numeración (sigue en #2)', b.body.pedido.num === 2, b.body.pedido.num);
  chequear('El PIN viejo ya no entra y el nuevo sí', (await pedir('POST', '/api/login', { pin: '4827' })).code === 401 && (await pedir('POST', '/api/login', { pin: '7391' })).code === 200);

  var q = require('./qr.js').matriz('x'.repeat(20));
  chequear('El generador de QR arma la versión 2 para textos medianos', q.length === 25, q.length);

  await parar();
  console.log(fallos ? '\n' + fallos + ' de ' + total + ' PRUEBA(S) FALLARON' : '\nTODAS LAS PRUEBAS PASARON (' + total + ')');
  process.exit(fallos ? 1 : 0);
})();
