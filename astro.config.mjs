import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://directory.callsal.app',
  output: 'static',
  integrations: [react()],
});
