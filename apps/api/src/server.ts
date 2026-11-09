import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
const config = readConfig();
const app = await buildApp(config);
await app.listen({ host: config.host, port: config.port });
console.log(`API de torneos: http://${config.host}:${config.port}`);
const close = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', close); process.on('SIGTERM', close);
