# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Jekyll-based personal website hosted on GitHub Pages at stevenpisani.com. The site uses Jekyll 4.1.1 with custom Webflow-based CSS styling.

## Development Commands

### Setup
```bash
# Install dependencies (requires Ruby and Bundler)
gem install bundler:2.1.4
bundle install
```

### Local Development
```bash
# Run Jekyll development server
bundle exec jekyll serve

# Build the site
bundle exec jekyll build
```

## Architecture

### Jekyll Structure
- **_layouts/**: HTML templates for pages
  - `default.html`: Base template with navigation and footer
  - `post.html`: Blog post template with hero image and reading time
- **_posts/**: Blog posts in Markdown format (YYYY-MM-DD-title format)
- **_includes/**: Reusable components (footer, navigation, read_time)
- **_config.yml**: Jekyll configuration and site metadata

### Styling
- Uses Webflow-generated CSS (`webflow.css`, `website.css`)
- Normalize.css for cross-browser consistency
- Custom styles in `assets/css/website.css`

### Key Pages
- `index.html`: Homepage with personal introduction
- `blog.html`: Blog listing page
- `about.html`: About page
- `404.html`, `401.html`: Error pages

### Assets
- Images stored in `assets/images/`
- JavaScript in `assets/js/` (primarily Webflow scripts)
- Uses Google Fonts (Montserrat) via WebFont loader

## Important Notes
- CNAME file contains custom domain configuration (stevenpisani.com)
- Site uses Jekyll front matter for page metadata
- Blog posts support custom hero images via `image_url` front matter
- Reading time calculation included for blog posts