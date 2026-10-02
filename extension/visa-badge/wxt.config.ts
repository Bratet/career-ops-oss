import { defineConfig } from 'wxt'

export default defineConfig({
  // Visible folder name, so Chrome's "Load unpacked" picker can see it.
  outDir: 'dist',
  outDirTemplate: 'chrome',
  manifest: {
    name: 'Visa Badge',
    description: 'Labels LinkedIn job postings by what they say about visa sponsorship.',
    permissions: ['storage'],
    // Only Jev's API. The content script itself sends nothing anywhere.
    host_permissions: ['https://openrouter.ai/*'],
  },
})
