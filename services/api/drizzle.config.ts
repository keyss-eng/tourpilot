import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'd1-http', // Instructs Drizzle to build queries compatible with Cloudflare D1
});