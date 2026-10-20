# VitoFud - Servidor de Gestión Gastronómica 🍔🕒

**VitoFud** es un sistema integral y eficiente diseñado para **gestionar pedidos y turnos en tiempo real para establecimientos de comida**. El proyecto resuelve un problema real del sector gastronómico: optimizar y coordinar la comunicación interna entre el cliente, la cocina y la caja desde cualquier dispositivo conectado a la red local.

El sistema permite que los clientes realicen sus pedidos de forma autónoma desde sus mesas, enviando la información instantáneamente a los paneles de preparación (cocina) y cobro (caja).

---

### ⚙️ Funcionalidades Principales

*   **Panel de Pedidos Interactivo:** Interfaz intuitiva dentro de la sección pública para que el usuario arme su comanda.
*   **Pantalla de Cocina Dinámica:** Visualización en tiempo real de los pedidos entrantes para agilizar la preparación de platos.
*   **Control de Caja y Administración:** Módulo dedicado para la confirmación de cobros y el flujo de transacciones del negocio.
*   **Gestión de Turnos:** Visualización clara de los turnos de atención para organizar la experiencia de los clientes.
*   **Automatización con Scripts (.bat):** Inclusión de ejecutables nativos de Windows para realizar la instalación de dependencias y el arranque del entorno local con un solo clic.

---

### 🛠️ Tecnologías Utilizadas

*   **Backend / Servidor:** Node.js, Express.js
*   **Frontend:** JavaScript Vanilla (ES6+), HTML5, CSS3 (Diseño modular e independiente para cada rol)
*   **Automatización:** Batch Scripts (`.bat` para entornos Windows)

---

### 📂 Estructura del Proyecto

*   `/public`: Contiene las interfaces y lógica de usuario (`pedir.html`, `cocina.html`, `caja.html`, `turnos.html`, `comun.js`).
*   `/datos`: Carpeta encargada del almacenamiento y persistencia del flujo de información del sistema.
*   `/imagenes`: Recursos visuales utilizados en las distintas pantallas del negocio.
*   `server.js`: Núcleo del servidor Express que coordina las peticiones de red y la lógica del negocio gastronómico.
*   `qr.js`: Módulo de generación de códigos QR para facilitar el acceso rápido a los menús.
*   `instalar.bat` / `iniciar.bat` / `abrir-cocina.bat`: Herramientas de automatización para despliegue rápido sin usar comandos de consola.

---

### 🚀 Instalación y Uso Local

El proyecto está optimizado para correr en computadoras Windows de forma inmediata gracias a sus scripts integrados:

1.  **Requisito previo:** Asegúrate de tener instalado **Node.js** en el equipo que funcionará como servidor central.
2.  **Instala las dependencias automáticamente:**
    Haz doble clic sobre el archivo `instalar.bat` (este ejecutará de forma automática el comando de instalación de paquetes de Node de manera limpia).
3.  **Inicia el servidor:**
    Haz doble clic sobre el archivo `iniciar.bat` para levantar el servidor local y habilitar la red del comercio.
4.  **Accede al sistema:**
    Abre tu navegador web e ingresa a la dirección IP local configurada en el puerto de salida del servidor.
