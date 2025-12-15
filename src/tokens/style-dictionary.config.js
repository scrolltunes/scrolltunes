/**
 * Style Dictionary configuration for ScrollTunes
 * Transforms Figma design tokens to Tailwind-compatible formats
 *
 * Usage: npx style-dictionary build --config src/tokens/style-dictionary.config.js
 */

export default {
  source: ["src/tokens/figma-tokens.json"],
  platforms: {
    tailwind: {
      transformGroup: "js",
      buildPath: "src/tokens/",
      files: [
        {
          destination: "tailwind-colors.js",
          format: "javascript/es6",
          filter: {
            type: "color",
          },
        },
        {
          destination: "tailwind-spacing.js",
          format: "javascript/es6",
          filter: {
            type: "spacing",
          },
        },
        {
          destination: "tailwind-typography.js",
          format: "javascript/es6",
          filter: {
            type: "typography",
          },
        },
      ],
    },
    css: {
      transformGroup: "css",
      buildPath: "src/tokens/",
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
          options: {
            outputReferences: true,
          },
        },
      ],
    },
  },
}
