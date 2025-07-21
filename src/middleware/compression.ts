import { Context, Next } from 'hono';
import { compress } from 'hono/compress';

// Cloudflare Workers automatically handles compression at the edge,
// but we can use Hono's built-in compress middleware for additional control
export const compressionMiddleware = compress({
  encoding: 'gzip',
});

// Custom compression middleware for fine-grained control
export const customCompressionMiddleware = async (c: Context, next: Next) => {
  await next();

  // Skip compression for already compressed content
  const contentEncoding = c.res.headers.get('Content-Encoding');
  if (contentEncoding) {
    return;
  }

  // Skip compression for small responses
  const contentLength = c.res.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength) < 1024) {
    return;
  }

  // Check if client accepts gzip
  const acceptEncoding = c.req.header('Accept-Encoding') || '';
  if (!acceptEncoding.includes('gzip')) {
    return;
  }

  // Get response body
  const body = await c.res.text();
  if (!body) {
    return;
  }

  // Compress using CompressionStream API (available in Workers)
  const encoder = new TextEncoder();
  const stream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
  ).body!.pipeThrough(new CompressionStream('gzip'));

  // Create compressed response
  const compressedResponse = new Response(stream, {
    status: c.res.status,
    statusText: c.res.statusText,
    headers: {
      ...Object.fromEntries(c.res.headers.entries()),
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding',
    },
  });

  // Delete Content-Length as it's no longer accurate
  compressedResponse.headers.delete('Content-Length');

  // Replace the response
  c.res = compressedResponse;
};

// Compression configuration for different content types
export const shouldCompress = (contentType: string | null): boolean => {
  if (!contentType) return false;

  const compressibleTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/xhtml+xml',
    'application/rss+xml',
    'application/atom+xml',
    'application/ld+json',
    'application/manifest+json',
    'application/x-web-app-manifest+json',
    'application/vnd.api+json',
    'application/x-font-ttf',
    'application/x-font-opentype',
    'application/x-font-truetype',
    'font/ttf',
    'font/opentype',
    'image/svg+xml',
    'image/x-icon',
  ];

  return compressibleTypes.some(type => contentType.includes(type));
};
