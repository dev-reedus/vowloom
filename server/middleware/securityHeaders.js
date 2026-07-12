// Baseline security headers applied to every response. Kept dependency-free.
//
// Referrer-Policy is the important one here: guest galleries are reached via a
// capability token in the URL (/g/<token>). Without this, loading a gallery
// image would send that full URL as the Referer to R2 / any third party. Sending
// no referrer keeps the token out of other servers' logs.
export function securityHeaders(_req, res, next) {
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  // Only takes effect over HTTPS; harmless over plain HTTP. Assumes the app is
  // served behind TLS in production (as Secure session cookies require).
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}
