/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@regwatch/shared'],
};

module.exports = nextConfig;
