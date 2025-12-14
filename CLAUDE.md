# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Professional portfolio website for Sylviane Bahr, a Gestalt therapist and coach in Sant Cugat, Spain. Static site with trilingual support (French, English, Spanish).

## Development

**No build process required** - Pure HTML/CSS/JS static site.

To run locally, serve from any static web server on port 8080. VS Code Chrome debugger is pre-configured in `.vscode/launch.json`.

## Architecture

### Internationalization System
- All user-facing text lives in `translations.js` (FR/EN/ES)
- HTML elements use `data-i18n="key"` for text content
- Form inputs use `data-i18n-placeholder="key"` for placeholders
- Language persists in localStorage as `site-lang`
- `app.js` handles language switching via dropdown

### Styling Architecture
- `style.css` uses CSS custom properties for theming (`:root` variables)
- Dark theme with neon accents (cyan #56c7ff, green #2ef2a2)
- Component classes: `.hero`, `.section`, `.card`, `.grid`
- Modifier pattern: `.btn--ghost`, `.card--soft`, `.card--form`
- Responsive breakpoints: 980px (layout shift), 720px (mobile adjustments)

### Page Structure
All pages share consistent header/nav/footer structure:
- `index.html` - Homepage with hero section
- `about.html` - Gestalt approach explanation
- `appointments.html` - Booking form
- `groups.html` - Group sessions/workshops
- `cv.html` - Professional background
- `references.html` - Inspirational references
- `blog.html` - Articles
- `contact.html` - Contact form

## Key Conventions

**Adding new text:** Always add translations to all three languages in `translations.js`, then reference via `data-i18n` attribute.

**CSS naming:** BEM-like with double underscores (`.card__header`). Use existing CSS variables for colors.

**JavaScript:** camelCase. Forms use `appointment-form` and `contact-form` IDs for handling in `app.js`.

**Fonts:** Playfair Display (headings), Work Sans (body) via Google Fonts.
