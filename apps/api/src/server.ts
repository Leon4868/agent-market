import { buildApp } from "./app.js";

function readPort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "3000", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 3000;
}

const app = buildApp();

try {
  await app.listen({ host: "127.0.0.1", port: readPort() });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
