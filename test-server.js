const http = require('http');

// Test if server can start on port 28900
const server = http.createServer((req, res) => {
  console.log(`Received ${req.method} request to ${req.url}`);
  console.log('Headers:', req.headers);

  if (req.url === '/poll') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Test server working' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(28900, '127.0.0.1', () => {
  console.log('Test server listening on http://127.0.0.1:28900');
  console.log('Try accessing: http://127.0.0.1:28900/poll');
});

server.on('error', (err) => {
  console.error('Server error:', err);
});