/** @type {import('next').NextConfig} */
const config = {
  // The Agent SDK spawns a native CLI subprocess — never let Next try to bundle it.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};
export default config;
