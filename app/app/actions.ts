"use server";
import { patchState } from "../lib/store";
import { genPkce, authorizeUrl } from "../lib/oauth";
import { openBrowser } from "../lib/agent-node";

export async function signIn() {
  const { verifier, challenge } = genPkce();
  // stash the verifier in the file store so the loopback listener (a different realm) can read it
  await patchState({ pkceVerifier: verifier, login: "signing in…" });
  openBrowser(authorizeUrl(challenge)); // Cognito hosted UI; user types their password in the browser
}

export async function signOut() {
  await patchState({ login: "signed out", email: "—", pkceVerifier: "" });
}
