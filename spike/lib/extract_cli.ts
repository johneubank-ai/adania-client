// Deno-native replacement for the Agent SDK's extractFromBunfs().
//
// WHY THIS EXISTS: extractFromBunfs() no-ops on Deno — it gates on Bun's `$bunfs` / `~BUN`
// path markers that a `deno desktop` / `deno compile` binary does not have. So we hand-roll the
// extract: read the CLI native-binary BYTES (from an on-disk file in dev, or from the embedded
// asset inside a compiled binary) and write them to a REAL temp path we can exec.
//
// This resolves a runnable CLI path in BOTH modes:
//   - `deno run`        → `new URL("../vendor/claude", import.meta.url)` is a real on-disk file
//   - compiled binary   → the same URL resolves to the asset embedded via `--include ./vendor/claude`
//
// In dev you can skip vendoring entirely by setting CLAUDE_CLI_PATH to the node_modules copy.

let cached: string | null = null;

export async function ensureClaudeCli(): Promise<string> {
  if (cached) return cached;

  // Dev fast-path: point straight at an on-disk binary (no copy).
  const override = Deno.env.get("CLAUDE_CLI_PATH");
  if (override) {
    try {
      await Deno.stat(override);
      cached = override;
      return override;
    } catch {
      // fall through to the universal extract
    }
  }

  // Universal path (also the ONLY path that works inside a compiled binary).
  const src = new URL("../vendor/claude", import.meta.url);
  const bytes = await Deno.readFile(src);
  const dir = await Deno.makeTempDir({ prefix: "adania-cli-" });
  const dest = `${dir}/claude`; // basename MUST stay "claude"
  await Deno.writeFile(dest, bytes, { mode: 0o755 });
  try {
    await Deno.chmod(dest, 0o755);
  } catch {
    // chmod is a no-op / unsupported on Windows — ignore
  }
  cached = dest;
  return dest;
}
