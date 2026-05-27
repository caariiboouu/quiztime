const API = "https://api.github.com";
export const REPO = "caariiboouu/quiztime";
export const BRANCH = "main";

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function validateToken(token: string): Promise<{ login: string }> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new GithubError(res.status, `Token check failed (${res.status})`);
  const data = await res.json();
  return { login: data.login };
}

export type RemoteFile = { content: string; sha: string };

export async function getFile(
  token: string,
  path: string,
): Promise<RemoteFile | null> {
  const res = await fetch(
    `${API}/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(res.status, `Fetch failed (${res.status})`);
  const data = await res.json();
  return { content: base64ToUtf8(data.content), sha: data.sha };
}

export async function putFile(
  token: string,
  path: string,
  content: string,
  message: string,
  sha: string | undefined,
): Promise<{ commit: string }> {
  const body: Record<string, unknown> = {
    message,
    content: utf8ToBase64(content),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `${API}/repos/${REPO}/contents/${encodeURIComponent(path)}`,
    {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new GithubError(res.status, `Commit failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { commit: data.commit?.sha ?? "" };
}
