import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_URL_SITIO ?? 'http://localhost:3000';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/campus', '/admin', '/auth', '/api'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
