import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './database/schema/schema.ts',
  out: './database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './database/granola.db',
  },
});
