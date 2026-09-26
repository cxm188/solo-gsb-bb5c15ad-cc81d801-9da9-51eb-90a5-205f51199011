import type { CheckResponse, Mode } from "./types";

export async function checkEdl(csv: string, mode: Mode): Promise<CheckResponse> {
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv, mode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`);
  }
  return data as CheckResponse;
}
