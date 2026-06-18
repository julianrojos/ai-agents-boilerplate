# Buscampleo

Buscampleo se despliega como una SPA estática en GitHub Pages con Supabase como origen de datos y Edge Functions para las operaciones sensibles.

Buscampleo es una aplicación web personal para centralizar, filtrar y priorizar ofertas de empleo orientadas a perfiles de diseño digital, UI, Design Systems y Design Engineering.

La app está pensada como un radar de señal y no como un simple agregador. Su objetivo es ayudar a identificar qué ofertas merecen atención y por qué.

## Características principales

- Listado responsive de ofertas con tarjetas compactas.
- Detalle de oferta con explicación de compatibilidad.
- Filtros persistentes en la URL.
- Estados de oferta: `new`, `seen`, `saved`, `hidden`, `applied`.
- Configuración de fuentes.
- Editor de criterios con señales ponderadas, exclusiones duras y reglas condicionales.
- Pantallas de perfil, emails, historial y ajustes.
- Datos mockeados para desarrollo local.
- Persistencia local/Supabase para jobs, fuentes, perfil, criterios, settings, matches y logs.
- Autenticación privada opcional con Supabase Auth.
- Diseño mobile-first con layout adaptativo en escritorio.

## Stack técnico

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn UI
- TanStack Query
- React Router
- Lucide React
- Radix UI
- Supabase JS
- Zod

## Rutas principales

- `/ofertas`
- `/ofertas/:id`
- `/fuentes`
- `/criterios`
- `/perfil`
- `/emails`
- `/historial`
- `/ajustes`

## Qué hace la app hoy

- Carga una colección de ofertas mock desde `src/data/mock-jobs.ts`.
- Permite filtrar por texto, fuente, modalidad, score mínimo, keywords y estado.
- Abre el detalle de una oferta en la misma ruta, con comportamiento adaptativo en móvil y escritorio.
- Muestra señales positivas, alertas y estado visual de cada oferta.
- Permite editar criterios de filtrado y priorización desde `/criterios`.
- Ofrece pantallas de configuración para fuentes, perfil, emails e historial.

## Estructura de proyecto

- `src/components/jobs`: cards, listado, detalle y badges de oferta.
- `src/components/filters`: panel, sheet y chips de filtros activos.
- `src/components/config`: pantallas de configuración.
- `src/components/layout`: shell global, top bar y navegación.
- `src/data`: mocks, criterios y store local.
- `src/hooks`: hooks de filtros, acciones y datos.
- `src/pages`: layouts de página.
- `src/router`: configuración de rutas.
- `src/types`: contratos de dominio.
- `scraper`: pipeline de ingestión y normalización.
- `supabase/functions`: Edge Functions para análisis, comparación y digest.

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | No (modo mock) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anónima de Supabase | No (modo mock) |
| `VITE_ALLOWED_EMAIL` | Email permitido en el acceso privado | No |
| `VITE_BASE_PATH` | Base pública del build, por defecto `/buscampleo/` | No |
| `VITE_APP_MODE` | `auto` o `mock` para forzar fallback local | No |
| `SUPABASE_URL` | URL de Supabase para Edge Functions / GitHub Actions | No |
| `SUPABASE_ANON_KEY` | Clave anónima de Supabase para Edge Functions / GitHub Actions | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo para funciones serverless / Actions; nunca en el cliente | No |
| `ALLOWED_ORIGIN` | Orígenes permitidos para las Edge Functions de Supabase | No |
| `OPENROUTER_API_KEY` | API key de OpenRouter para el análisis LLM | No |
| `OPENROUTER_MODEL` | Modelo por defecto para OpenRouter, por ejemplo `anthropic/claude-haiku-4-5` | No |
| `RESEND_API_KEY` | API key de Resend para el envío de emails transaccionales | No |
| `EMAIL_FROM` | Dirección remitente verificada en Resend; `onboarding@resend.dev` sirve para empezar | No |

> Sin ninguna variable configurada la app arranca en modo mock con datos locales.

## Cómo arrancar

```bash
npm install
cp .env.example .env   # edita los valores si quieres conectar Supabase o LLM
npm run dev
```

## Scripts disponibles

- `npm run dev`: arranque en desarrollo.
- `npm run build`: build de producción.
- `npm run preview`: previsualización del build.
- `npm run db:types`: regenera `src/lib/supabase/database.types.ts` con Supabase CLI enlazado.
- `npm run scrape`: ejecuta el scraper TypeScript.
- `npm test`: corre la suite `node:test` con `tsx`.
- `npm run typecheck`: ejecuta `tsc --noEmit`.
- `npm run lint`: revisa el código con ESLint.
- `npm run lint:fix`: corrige automáticamente los avisos arreglables de ESLint.
- `npm run format`: formatea el código con Prettier.
- `npm run format:check`: comprueba que el código respeta Prettier.
- `npm run agents:check`: valida la configuración compartida de agentes, skills, rules y workflows.

## Notas

- La app usa un fallback mock/local cuando faltan las variables de backend.
- El contenido de criterios se basa en el conocimiento curado del proyecto y vive como seed tipado.
- El proyecto expone Edge Functions en Supabase para análisis, comparación y digest, y un scraper automatizable con GitHub Actions.
