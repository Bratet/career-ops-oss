import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The app shells out to rendercv / claude / codex and reads the repo from disk.
  // It is a localhost tool, not a deployable site.
  //
  // pdfjs-dist must stay external: bundling its legacy build breaks the dynamic
  // import at runtime, and the failure is silent (page info just comes back null).
  serverExternalPackages: ['yaml', 'pdfjs-dist'],
  // Keeps Next from picking ~/package-lock.json as the workspace root.
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
  // /editor became /profile once the masters stopped being "a file to edit" and
  // started being the profile every tailored CV is cut from.
  async redirects() {
    return [{ source: '/editor', destination: '/profile', permanent: false }]
  },
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig
