import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, fetchModes, fetchSample } from './api';
import type { AnalyzeResult, ModeInfo, ModeKey } from './types';
import CsvEditor, { type LineTone } from './CsvEditor';
import {
  GapCard,
  Legend,
  OverlapCard,
  RowDetail,
  SortedTable,
  StatBar,
  TimelineBar,
} from './components';

export default function App() {
  const [modes, setModes] = useState<ModeInfo[]>([]);
  const [mode, setMode] = useState<ModeKey>('25');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [tab, setTab] = useState<'issues' | 'timeline' | 'sorted'>('issues');
  const editorRef = useRef<{ scrollToLine: (line: number) => void }>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    fetchModes().then(setModes).catch(() => setModes([]));
  }, []);

  // 输入防抖后自动核对
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      analyze(csv, mode)
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [csv, mode]);

  // 行色调：非法 > 重叠 > 空隙
  const tones = useMemo(() => {
    const map = new Map<number, LineTone>();
    if (!result) return map;
    result.gaps.forEach((g) => g.lines.forEach((l) => map.set(l, 'gap')));
    result.overlaps.forEach((o) => o.lines.forEach((l) => map.set(l, 'overlap')));
    result.rows
      .filter((r) => r.errors.length > 0)
      .forEach((r) => map.set(r.line, 'invalid'));
    return map;
  }, [result]);

  const locate = (line: number) => {
    setSelectedLine(line);
    editorRef.current?.scrollToLine(line);
  };

  const loadSample = async () => {
    try {
      const text = await fetchSample(mode);
      setCsv(text);
      setTab('issues');
      setToast('已载入示例接片单');
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast('示例加载失败');
    }
  };

  const clearAll = () => {
    setCsv('');
    setResult(null);
    setSelectedLine(null);
  };

  const selectedRow = useMemo(
    () => (selectedLine !== null && result ? result.rows.find((r) => r.line === selectedLine) ?? null : null),
    [selectedLine, result],
  );

  const invalidRows = result?.rows.filter((r) => r.errors.length > 0) ?? [];
  const issueCount = invalidRows.length + (result?.overlapCount ?? 0) + (result?.gapCount ?? 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">EDL</span>
          <div>
            <h1>视频接片单核对工具</h1>
            <p>时间码合法性 · 素材/成片帧时长 · 成片空隙与重叠（全量配对，非仅相邻行）</p>
          </div>
        </div>
        <div className="toolbar">
          <div className="mode-switch" role="radiogroup" aria-label="帧率模式">
            {(modes.length ? modes : FALLBACK_MODES).map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={mode === m.key}
                className={`mode-btn ${mode === m.key ? 'active' : ''}`}
                onClick={() => setMode(m.key)}
                title={m.dropFrame ? '每分钟跳过 00、01 帧号，整十分钟不跳' : '每帧连续计数'}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={loadSample}>
            载入示例接片单
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearAll}>
            清空
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="pane pane-left">
          <div className="pane-head">
            <h2>
              接片单 CSV <span className="dim">（片段名, 素材入点, 素材出点, 成片入点, 成片出点）</span>
            </h2>
            <Legend tones={tones} />
          </div>
          <CsvEditor
            ref={editorRef}
            value={csv}
            onChange={setCsv}
            tones={tones}
            selectedLine={selectedLine}
            onSelectLine={setSelectedLine}
          />
          <div className="editor-foot">
            <span className={`status-dot ${loading ? 'busy' : ''}`} />
            {loading ? '核对中…' : result ? `已核对 ${result.rowCount} 行` : '粘贴 CSV 后自动核对'}
            {result?.csvError && <span className="foot-error">CSV 警告：{result.csvError}</span>}
            {result && !result.hasHeader && result.rowCount > 0 && (
              <span className="foot-hint">未识别到表头，已按固定列顺序解析</span>
            )}
          </div>
        </section>

        <section className="pane pane-right">
          {error && <div className="banner banner-error">{error}</div>}
          {!result && !error && (
            <div className="welcome">
              <h2>使用说明</h2>
              <ol>
                <li>右上角统一选择 <strong>25 fps 非丢帧</strong> 或 <strong>29.97 fps 丢帧</strong>（全单一致）。</li>
                <li>将接片单 CSV 粘贴到左侧文本框，自动核对（也可点击「载入示例接片单」）。</li>
                <li>时间码格式 <code>HH:MM:SS:FF</code>；丢帧模式每分钟跳过 <code>00</code>、<code>01</code> 帧号，整十分钟不跳。</li>
                <li>区间为半开区间 <code>[入点, 出点)</code>：入点包含、出点不包含；拒绝非法帧号与跨午夜区间。</li>
                <li>按实际帧数比较素材时长与成片时长；成片区间排序后列出全部空隙与重叠（重叠采用全量配对，包含跨多行的包含关系，首尾相接不算问题）。</li>
                <li>点击任意问题的「第 N 行」即可定位原始行，并查看帧数与时间码对照。</li>
              </ol>
            </div>
          )}

          {result && (
            <>
              <StatBar result={result} />

              <div className="tabs">
                <TabBtn active={tab === 'issues'} onClick={() => setTab('issues')}>
                  问题清单 {issueCount > 0 && <em className="tab-count">{issueCount}</em>}
                </TabBtn>
                <TabBtn active={tab === 'timeline'} onClick={() => setTab('timeline')}>
                  成片时间轴
                </TabBtn>
                <TabBtn active={tab === 'sorted'} onClick={() => setTab('sorted')}>
                  排序后的成片区间
                </TabBtn>
              </div>

              {tab === 'issues' && (
                <div className="tab-body">
                  {invalidRows.length === 0 && result.overlaps.length === 0 && result.gaps.length === 0 && (
                    <div className="all-ok">✓ 未发现问题：时间码合法、时长一致，成片区间连续无重叠。</div>
                  )}

                  {invalidRows.length > 0 && (
                    <section>
                      <h3 className="group-title">
                        <span className="badge badge-invalid">非法行 / 时长不一致 · {invalidRows.length}</span>
                      </h3>
                      <div className="issue-list">
                        {invalidRows.map((r) => (
                          <div
                            key={r.line}
                            className={`issue-card invalid-card ${selectedLine === r.line ? 'selected-card' : ''}`}
                          >
                            <div className="issue-head">
                              <button type="button" className="locate-btn locate-strong" onClick={() => locate(r.line)}>
                                第 {r.line} 行
                              </button>
                              <strong>{r.name || '（片段名为空）'}</strong>
                            </div>
                            <ul className="mini-msgs">
                              {r.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.overlaps.length > 0 && (
                    <section>
                      <h3 className="group-title">
                        <span className="badge badge-overlap">重叠区间 · {result.overlaps.length} 对</span>
                      </h3>
                      <div className="issue-list">
                        {result.overlaps.map((o, i) => (
                          <div key={i} onClick={() => locate(o.lines[0])} className="clickable">
                            <OverlapCard ov={o} onLocate={locate} />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.gaps.length > 0 && (
                    <section>
                      <h3 className="group-title">
                        <span className="badge badge-gap">空隙区间 · {result.gaps.length} 段</span>
                      </h3>
                      <div className="issue-list">
                        {result.gaps.map((g) => (
                          <GapCard key={g.index} gap={g} onLocate={locate} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div className="tab-body">
                  <TimelineBar result={result} onLocate={locate} />
                </div>
              )}

              {tab === 'sorted' && (
                <div className="tab-body">
                  <SortedTable result={result} onLocate={locate} />
                </div>
              )}

              {selectedRow && <RowDetail row={selectedRow} result={result} />}
            </>
          )}
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

const FALLBACK_MODES: ModeInfo[] = [
  { key: '25', label: '25 fps 非丢帧（PAL）', dropFrame: false, fps: 25 },
  { key: '2997df', label: '29.97 fps 丢帧（NTSC DF）', dropFrame: true, fps: 30 },
];
