const { createApp } = require('./src/app');
const app = createApp();
app.listen(32124, '127.0.0.1', () => console.log('test-server-ready'));
setInterval(() => {}, 1000);
