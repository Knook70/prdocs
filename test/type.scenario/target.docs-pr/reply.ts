/** A real child process supplies controlled gh/fault output and exit status. */
const reply = JSON.parse(process.env.DOCS_PR_REPLY!) as {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};
if (reply.stdout) process.stdout.write(reply.stdout);
if (reply.stderr) process.stderr.write(reply.stderr);
process.exitCode = reply.exitCode ?? 0;
