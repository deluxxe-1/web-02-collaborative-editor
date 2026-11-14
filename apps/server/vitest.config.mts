import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // WebSocket integration tests open sockets; give them a little headroom.
    testTimeout: 10000,
  },
});
