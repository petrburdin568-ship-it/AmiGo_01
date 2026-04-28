/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Статический экспорт для APK
  experimental: {
    typedRoutes: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    config.externals.push({
      '@capacitor/push-notifications': 'commonjs @capacitor/push-notifications',
      '@capacitor/camera': 'commonjs @capacitor/camera',
      '@capacitor/core': 'commonjs @capacitor/core',
    });
    return config;
  },
};

export default nextConfig;