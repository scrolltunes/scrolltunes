# Design Tokens

This folder contains ScrollTunes design tokens exported from Figma.

## Files

| File | Description |
|------|-------------|
| `figma-tokens.json` | Source tokens exported from Figma (manually or via plugin) |
| `style-dictionary.config.js` | Configuration for transforming tokens |
| `tailwind-*.js` | Generated files for Tailwind config (do not edit) |
| `variables.css` | Generated CSS custom properties (do not edit) |

## Workflow

1. **Export from Figma**: Use the Design Tokens plugin to export to `figma-tokens.json`
2. **Build**: Run `bun run tokens:build` to generate Tailwind and CSS files
3. **Use**: Import generated files in `tailwind.config.js` and components

## Token Structure

```
color/
├── primary, secondary        # Brand colors
├── background/*              # Surface colors
├── text/*                    # Text colors
├── accent/*                  # Status colors
└── lyrics/*                  # Lyrics-specific colors

spacing/                      # 4px base scale (1-16)

typography/
├── fontSize/*                # Including lyrics-specific sizes
├── fontWeight/*
└── lineHeight/*

radius/                       # Border radius scale
shadow/                       # Box shadows including glow effects
```

## Updating Tokens

When design changes in Figma:

```bash
# 1. Export new tokens from Figma plugin
# 2. Replace figma-tokens.json
# 3. Rebuild
bun run tokens:build
```
