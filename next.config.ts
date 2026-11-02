import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Solo tiene efecto con HTTPS (producción); en local se ignora.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      // Nadie enmarca Albor. Única excepción: el reproductor simulado (desarrollo y pruebas), solo desde el propio sitio.
      { source: '/((?!video-simulado/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/video-simulado/:id*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

export default config;
