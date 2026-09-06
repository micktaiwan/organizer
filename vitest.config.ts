import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/client/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ['./tests/client/setup.ts'],
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_TIMESTAMP__: JSON.stringify('test'),
  },
});
