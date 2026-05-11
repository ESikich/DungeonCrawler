const fs = require('fs');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);

const mimeTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png'
};

function send(res, status, body, type = 'text/plain') {
    res.writeHead(status, {'Content-Type': type});
    res.end(body);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const decodedPath = decodeURIComponent(url.pathname);
    const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
    const filePath = path.resolve(rootDir, `.${requestedPath}`);

    if (!filePath.startsWith(rootDir)) {
        send(res, 403, 'Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }

        send(res, 200, data, mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    });
});

server.listen(port, () => {
    console.log(`Dungeon Durgon running at http://localhost:${port}`);
});
