import type { AnalyzeResult, ModeInfo, ModeKey } from './types';

export async function fetchModes(): Promise<ModeInfo[]> {
  const res = await fetch('/api/modes');
  if (!res.ok) throw new Error('获取帧率模式失败');
  const data = await res.json();
  return data.modes;
}

export async function fetchSample(mode: ModeKey): Promise<string> {
  const res = await fetch(`/api/sample/${mode}`);
  if (!res.ok) throw new Error('获取示例接片单失败');
  const data = await res.json();
  return data.csv;
}

export async function analyze(csv: string, mode: ModeKey): Promise<AnalyzeResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, mode }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `分析失败（HTTP ${res.status}）`);
  }
  return data as AnalyzeResult;
}
