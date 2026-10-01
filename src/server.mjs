import app from "./app.mjs";
import { recoverInterruptedJobs } from "./analysisJobStore.mjs";
import { retryPendingFileDeletions } from "./fileCleanup.mjs";

const host = "127.0.0.1";
const port = 3000;

const server = app.listen(port, host, () => {
  try {
    const recoveredCount = recoverInterruptedJobs();

    if (recoveredCount > 0) {
      console.log(
        `Marked ${recoveredCount} interrupted analysis job(s) as failed.`
      );
    }

    console.log(`API running at http://${host}:${port}`);
    void retryPendingFileDeletions()
      .then(({ removed, failed }) => {
        if (removed > 0 || failed > 0) {
          console.log(
            `File cleanup: ${removed} completed, ${failed} pending.`
          );
        }
      })
      .catch((error) => {
        console.error("Could not run startup file cleanup:", error);
      });
  } catch (error) {
    console.error("Startup recovery failed:", error.message);
    process.exitCode = 1;
    server.close();
  }
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  process.exitCode = 1;
});