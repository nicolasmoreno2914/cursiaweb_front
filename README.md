# Cursia Web Front

Landing page pública de [Cursia.ai](https://cursia.ai) — plataforma de producción educativa con IA para crear cursos virtuales completos para Moodle.

Sitio estático (HTML + CSS + JS vanilla). Sin framework, sin bundler. Listo para desplegarse en **Cloudflare Pages**.

---

## Requisitos

- Node.js ≥ 18 (solo para servidor local de desarrollo)
- Cuenta en [Cloudflare Pages](https://pages.cloudflare.com/) para despliegue

---

## Instalación local

```bash
# 1. Clona el repositorio
git clone https://github.com/TU_USUARIO/cursiaweb_front.git
cd cursiaweb_front

# 2. Instala dependencias (solo sirve el servidor local)
npm install

# 3. Inicia el servidor de desarrollo
npm run dev
# → Disponible en http://localhost:3000
```

---

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor local en `http://localhost:3000` |
| `npm run preview` | Preview de producción en `http://localhost:4173` |
| `npm run build` | Confirma que no hay build step (sitio ya está listo en `public/`) |

---

## Estructura del proyecto

```
cursiaweb_front/
├── public/                  ← Archivos servidos al navegador
│   ├── index.html           ← Landing page principal
│   ├── styles.css           ← Estilos globales
│   ├── main.js              ← Interactividad (accordion, reveal, menú)
│   ├── favicon.svg          ← Favicon en SVG
│   ├── 404.html             ← Página de error personalizada
│   ├── _redirects           ← Reglas de redirección Cloudflare Pages
│   └── images/              ← Logos y assets gráficos
│       ├── logo-inandina.png
│       ├── logo-nomaddi.png
│       └── logo-campus-virtual.png
├── .env.example             ← Variables de entorno de ejemplo
├── .gitignore
├── package.json
└── README.md
```

---

## Despliegue en Cloudflare Pages

### Configuración en el dashboard

Cuando conectes el repositorio en **Cloudflare Pages → Create a project → Connect to Git**, usa estos valores:

| Campo | Valor |
|---|---|
| **Framework preset** | `None` |
| **Build command** | *(dejar en blanco)* |
| **Build output directory** | `public` |
| **Node.js version** | `18` |

> El sitio es estático — no requiere paso de compilación. Cloudflare sirve directamente el contenido de la carpeta `public/`.

### Variables de entorno en Cloudflare

Actualmente el sitio no necesita variables de entorno. Si en el futuro se integran servicios externos, configúralas en:

> **Cloudflare Dashboard → Pages → Tu proyecto → Settings → Environment variables**

Consulta `.env.example` para ver qué variables se deben agregar.

---

## Subir a GitHub

```bash
# Desde la carpeta del proyecto
git init
git add .
git commit -m "Prepare Cursia web for Cloudflare Pages deployment"

# Crea el repo en GitHub y luego:
git remote add origin https://github.com/TU_USUARIO/cursiaweb_front.git
git branch -M main
git push -u origin main
```

Cada `git push origin main` desplegará automáticamente en Cloudflare Pages.

---

## Tecnología

- **HTML5** semántico con ARIA para accesibilidad
- **CSS3** con custom properties (variables de diseño), `clamp()` para tipografía fluida, glassmorphism
- **JavaScript vanilla** (sin dependencias): accordion FAQ, menú móvil, scroll-reveal con IntersectionObserver
- **Google Fonts**: Sora, Plus Jakarta Sans, JetBrains Mono
- **Cloudflare Pages** para CDN global, HTTPS automático y despliegue continuo

---

## Desarrollado con el respaldo de

- [Inandina](https://inandina.edu.co) — Experiencia en formación virtual institucional
- [Nomaddi](https://nomaddi.com) — Desarrollo tecnológico educativo
- Campus Virtual — Plataforma de educación en línea
