import app from "./app.mjs";

const host = "127.0.0.1";
const port = 3000;

const server = app.listen(port, host, () => {
  console.log(`API running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  process.exitCode = 1;
});