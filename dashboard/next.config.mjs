/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    // Project screenshots are arbitrary user-supplied URLs (Google Drive, Imgur,
    // Cloudinary, S3, Upwork CDN, etc.). We allow all HTTPS hosts here; the
    // trade-off is intentional — restricting to a fixed list would break every
    // new hosting service users paste. Add narrower patterns when the set of
    // hosts stabilises.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  async rewrites() {
    const apiUrl = process.env.API_URL || 'http://localhost:3002';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
