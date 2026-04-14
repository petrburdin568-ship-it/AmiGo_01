/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Добавляем эту строку для создания статических файлов
  experimental: {
    typedRoutes: true,
  },
  images: {
    unoptimized: true, // Обязательно для статического экспорта (APK)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Если ты используешь картинки из Supabase, добавь его хост сюда тоже
    ],
  },
};

export default nextConfig;