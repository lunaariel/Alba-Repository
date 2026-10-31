import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_URL_SITIO ?? 'http://localhost:3000';
  return {
    // /admin no se nombra: robots.txt es público y el panel no se anuncia (responde 404 y lleva noindex).
    rules: { userAgent: '*', allow: '/', disallow: ['/campus', '/auth', '/api'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
