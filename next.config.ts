import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const isDev = process.env.NODE_ENV === "development";

function policy(directives: Record<string, string[]>) {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");
}

// Partial prerendering rules out per-request nonces, so scripts stay 'unsafe-inline'.
// The full policy is report-only until staging shows no first-party violations;
// frame-ancestors is ignored in report-only mode, so the enforced policy carries it.
const reportOnlyPolicy = policy({
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://challenges.cloudflare.com",
    "https://vercel.live",
  ],
  "style-src": ["'self'", "'unsafe-inline'", "https://vercel.live"],
  // Markdown content may embed images from any https URL.
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "font-src": ["'self'", "data:", "https://vercel.live"],
  "connect-src": ["'self'", "https://vercel.live"],
  "frame-src": ["'self'", "https://challenges.cloudflare.com", "https://vercel.live"],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
});

const enforcedPolicy = policy({
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
});

const securityHeaders = [
  { key: "Content-Security-Policy", value: enforcedPolicy },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.localhost"],
  devIndicators: false,
  // A new deployment id busts asset URLs and turns a skewed client navigation
  // into a full page load on the first click.
  ...(deploymentId ? { deploymentId } : {}),
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    appNavFailHandling: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
