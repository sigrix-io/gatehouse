// jsdom because the renderer is a DOM client and its tests drive a real one.
// `globals: true` matches the host these files came from, so a test moved in
// either direction runs unchanged.
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'jsdom',
    globals: true,
  },
});
