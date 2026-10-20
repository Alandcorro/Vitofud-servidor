# VitoFud — Servidor de gestión gastronómica

Sistema para locales de comida que coordina pedidos y turnos entre
clientes, cocina y caja dentro de la red local del comercio.

## Funcionalidades
- **Pedidos (`pedir.html`):** el cliente arma su comanda desde la mesa.
- **Cocina (`cocina.html`):** muestra los pedidos entrantes [en tiempo real
  mediante ___ / actualizando cada ___ segundos].
- **Caja (`caja.html`):** confirmación de cobros y control de transacciones.
- **Turnos (`turnos.html`):** pantalla con los turnos de atención.
- **Códigos QR (`qr.js`):** generan el acceso rápido al menú desde la mesa.

## Tecnologías
- Backend: Node.js + Express
- Frontend: JavaScript (ES6+), HTML5 y CSS3, una interfaz por rol
- Datos: [JSON en /datos / otro]
- Automatización: scripts .bat para Windows

## Estructura
- `public/`: pantallas y lógica de cliente
- `datos/`: [qué guarda y en qué formato]
- `imagenes/`: recursos visuales
- `server.js`: servidor Express y lógica de negocio
- `qr.js`: generador de códigos QR
- `test.js`: [qué prueba]
- `instalar.bat`, `iniciar.bat`, `abrir-cocina.bat`: instalación y arranque

## Instalación (Windows)
1. Instalar Node.js.
2. Doble clic en `instalar.bat`.
3. Doble clic en `iniciar.bat`.
4. Abrir en el navegador `http://[IP-del-equipo]:[puerto]`.
   Los demás dispositivos de la red usan esa misma dirección.
