# Documents PR test system

This directory contains the Documents PR fixture and one `node:test` scenario per `case-*.test.ts` file. All test code lives under `app/test/` with task-specific permission.

From `app/` with Node 24, run one scenario or the whole set.

```sh
npm run test:types
node --test test/type.scenario/target.docs-pr/case-create-pr.test.ts
node --test --test-concurrency=4 test/type.scenario/target.docs-pr/case-*.test.ts
```

Each case prints a Korean summary of the scenario and what the observed exit code means. The summary uses the actual command events and error output to describe the completed action or why the command stopped. The detailed diagnostics include stdout, stderr, observed commands, and available document and build snapshots. Relevant Git histories and remote refs also appear in the output. The Node test result now reports whether the declared behavior was verified: exit/signal, failure cause, command stages, built content, cleanup, and relevant Git state. Setup, spawn, observer, and request-contract errors also fail the test. An expected application failure passes only when its cause and forbidden later actions match the case assertions.

Source and fork pushes target local bare Git repositories. Actions event inputs and `gh` responses come from the case. The scenarios perform no GitHub requests or PR creation. Successful installs use the existing lockfile and npm cache, and a cache miss can require the npm registry.

## Fixture

`createDocsPRFixture(t: TestContext): Promise<DocsPRFixture>` registers `t.after` cleanup immediately after allocating a temporary directory. It returns:

- `checkout`: a new Git repository containing current tracked application files, including uncommitted edits to those files.
- `sourceRemote` and `forkRemote`: empty local bare Git repositories.
- `tempRoot`: the temporary directory used by the actual PR checker and builder.
- `env`: the isolated environment for caller-owned fixture setup commands.
- `run(entry, options)`: execute `check`, `submit`, or the actual npm `pr` chain.

No documents, commits, branches beyond the initial unborn base branch, or PR refs are generated. The caller materializes these explicitly using filesystem operations and real Git commands. The tracked-file copy excludes `test/`, `tests/`, `.git/`, `node_modules/`, `dist/`, and the configured document source root. Untracked source additions are not copied.

For Git setup, use `runProcess("git", args, { cwd: fixture.checkout, env: fixture.env })`. Nonzero exits are returned, so the caller must check setup results. The checkout's isolated config supplies a fixture author, disables commit signing/hooks, and rewrites the configured trusted HTTPS URL to `sourceRemote`. The HTTPS URL for exported `forkRepository` (`fixture/docs-pr-fork` on the configured hostname) maps to `forkRemote`. Set fake gh PR metadata to that owner/name to exercise real local pushes. Git transport is limited to local files; no real GitHub mutation occurs.

The source bare repository needs the configured base branch. For Actions, also publish the requested head SHA there, for example under `refs/pull/1/head`; production fetches the SHA, not that ref name. Fork-only objects are insufficient. Use `env` run overrides for `GITHUB_ACTIONS`, `PR_BRANCH`, `PR_AUTHOR_LOGIN`, `PR_HEAD_REVISION`, and optionally `GITHUB_SHA`. Local mode is the default; no inherited PR/GitHub context is retained. Context getters are never mocked.

Only one `run` may be active per fixture. Paths returned in observations remain available until the enclosing test ends. Read or copy needed artifacts before cleanup.

## Run options and observations

`RunOptions` has four optional fields:

- `env`: process environment overrides; `undefined` removes a variable from the child environment.
- `gh`: an ordered array of `{ args: string[], reply: Reply }` requests shared across the check and submit processes. Reply fields are optional raw `stdout`, `stderr`, and `exitCode` (default 0). Cases explicitly supply the requests, using small user/list/create request helpers. There are no implicit requests. Positional arguments and option values must match; option ordering may differ. Missing, extra, duplicate, mismatched, or unused requests fail the test, even when production catches the observer error. Raw reply text allows malformed JSON to reach the real parser.
- `fault`: replies keyed by `git.fetch`, `git.push`, `npm.ci`, or `npm.build`. Fault exit codes default to 1; callers may override them. Every matching invocation in that run receives the fault. A configured fault that is never reached fails the test.
- `timeoutMs`: process deadline, default 180,000 ms.

`RunObservation` returns `code`, `signal`, `stdout`, `stderr`, `commands`, `snapshots`, `journal`, and `tempLeftovers`. Nonzero application exits are observations. Spawn failures, timeout, missing gh replies, and observer failures reject the run promise. JSON files are parsed as the declared TypeScript types; there is no runtime schema-validation layer.

Command events record `start`/`end`, process-local unique ID, executable, arguments, cwd, whether the call was injected, and end status/signal/spawn-error message. `injected` includes controlled gh replies. The log represents calls made by the PR process, not all internal subprocesses npm may launch. Unfinished commands can have only a start event.

Before `npm run build`, the observer saves the composed `documents/` snapshot and `system.sha256.json` containing system file-content hashes (excluding Git metadata, dependencies, documents, and build output). After the real or injected build returns, it saves any generated output under `dist/`. Failed builds can produce an empty after-build snapshot. This capture happens before production disposes its workspace.

`tempLeftovers` is the raw top-level listing of `tempRoot` after the child exits, before fixture cleanup. Node's compile cache has a separate fixture-owned directory so it does not obscure build temporary-directory cleanup. npm uses the existing application lockfile and real `npm ci`/`npm run build`; package downloads may require registry access. The normal user npm cache can be reused, but user npm configuration and Git configuration are isolated.

## Boundaries

`observe.ts` is a `NODE_OPTIONS --import` preload. It installs `node:test`'s `mock.method` on `child_process.spawnSync` and calls `syncBuiltinESMExports` only when the main entrypoint is the exact copied `scripts/pr/check.ts` or `submit.ts`. npm, build tools, and reply children inherit the preload but do not install the observer. Normal calls forward arguments/options/results to the real `spawnSync` unchanged, including binary Git archive/tar streams.

Controlled gh and fault replies execute `reply.ts` in a real Node child; spawn result objects are not fabricated. Git push classification handles the production `-c` credential arguments. npm classification recognizes `process.execPath` plus `npm_execpath`, so no npm executable wrapper is needed.

`runProcess` starts a detached process group without a shell and captures output through the `close` event. At timeout it sends TERM, waits two seconds, then sends KILL to the group even if its leader has already exited. It rejects only after the process closes and group termination has been attempted. This uses Linux/POSIX process groups, matching the project's WSL2 environment. Descendants that deliberately create a new session are outside this process group.

The fixture runs the current tracked source code in disposable repositories. Scenario cases supply their own histories, explicit request contracts, PR inputs, diagnostics, and assertions.

## Assertions and independent expectations

`runAndReport` returns the observation after printing diagnostics. The cases use `node:assert/strict` and the small helpers in `case-assertions.ts`; no scenario DSL or testing dependency is used.

Before a build, `expectedBuild` reads Git objects from the pinned source remote and submitted head independently of the application. Assertions compare the complete document tree, system hashes, generated HTML file set and expected plain Markdown content. Failure cases require specific causes and command stages. Successful npm stages must be real. Existing PR cases compare remote refs; dirty-worktree cases compare HEAD, index, file contents/modes, and status before/after. JavaScript frontmatter must be rejected before writing its external execution marker. Temporary build leftovers must be empty.

The dirty-worktree policy for these scenarios is explicit: check committed HEAD, ignore uncommitted edits, and preserve the index and working files. This replaces the older dirty-tree rejection expectation for these tests.

A failing strengthened test may expose a production defect. Do not update expectations merely to make the suite green. The hardening record and mutation evidence live outside `app/`, under `docs/tasks/v0.2-alpha2/docs-pr-test-hardening/` in the parent repository. Real GitHub authentication, event delivery, and branch protection remain outside this local suite.
