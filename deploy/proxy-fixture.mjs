// CI transport fixture only. No accounts, real login or database.
import http from 'node:http';

http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/auth/providers') return res.end('{"googlePanel":false}');
  if (req.url === '/api/users/me') {
    res.statusCode = 401;
    return res.end('{"message":"Sin sesión"}');
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  res.setHeader('Set-Cookie', 'smoke_session=fixture; HttpOnly; Secure; SameSite=Lax; Path=/');
  res.end(JSON.stringify({
    method: req.method, url: req.url, body: Buffer.concat(chunks).toString(),
    ip: req.headers['x-forwarded-for'], proto: req.headers['x-forwarded-proto'],
    origin: req.headers.origin, requestedWith: req.headers['x-requested-with'], cookie: req.headers.cookie,
  }));
}).listen(3001, '0.0.0.0');
