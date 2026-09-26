import type { AnalyzeResult, Gap, OverlapPair, RowResult } from './types';

const FRAME_LABEL: Record<string, string> = {
  invalid: '非法行',
  overlap: '重叠',
  gap: '空隙',
  ok: '正常',
};

export function Legend({ tones }: { tones: Map<number, string> }) {
  const counts = { invalid: 0, overlap: 0, gap: 0 };
  tones.forEach((t) => {
    if (t in counts) counts[t as keyof typeof counts]++;
  });
  return (
    <div className="legend">
      {(['invalid', 'overlap', 'gap'] as const).map((t) => (
        <span key={t} className={`legend-item tone-${t}`}>
          <i className={`dot tone-${t}`} />
          {FRAME_LABEL[t]} {counts[t]} 行
        </span>
      ))}
    </div>
  );
}

export function StatBar({ result }: { result: AnalyzeResult }) {
  const t = result.timeline;
  const mismatchCount = result.rows.filter((r) => r.errors.some((e) => e.includes('不一致'))).length;
  return (
    <div className="statbar">
      <Stat label="数据行" value={String(result.rowCount)} />
      <Stat label="非法行" value={String(result.invalidRowCount)} bad={result.invalidRowCount > 0} />
      <Stat label="时长不一致" value={String(mismatchCount)} bad={mismatchCount > 0} />
      <Stat label="重叠区间" value={String(result.overlapCount)} bad={result.overlapCount > 0} />
      <Stat label="空隙区间" value={String(result.gapCount)} warn={result.gapCount > 0} />
      <Stat
        label="成片总跨度"
        value={t.spanFrames === 0 ? '—' : `${t.spanFrames} 帧`}
        sub={t.spanFrames === 0 ? undefined : t.spanTc}
      />
      <Stat
        label="实际覆盖"
        value={t.unionFrames === 0 ? '—' : `${t.unionFrames} 帧`}
        sub={
          t.coverageRatio === null
            ? undefined
            : `${(t.coverageRatio * 100).toFixed(2)}%（含重叠）`
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  bad,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`stat ${bad ? 'stat-bad' : ''} ${warn ? 'stat-warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function GapCard({ gap, onLocate }: { gap: Gap; onLocate: (line: number) => void }) {
  return (
    <div className="issue-card gap-card">
      <div className="issue-head">
        <span className="badge badge-gap">空隙 #{gap.index}</span>
        <span className="issue-range mono">
          {gap.startTc} → {gap.endTc}
        </span>
        <span className="issue-size">{gap.gapFrames} 帧（{gap.gapTc}）</span>
      </div>
      <div className="issue-body">
        <div>
          前一区间结束：{gap.beforeNames.length ? gap.beforeNames.join('、') : '（无）'}
          {gap.beforeLines.map((l) => (
            <LocateBtn key={l} line={l} onLocate={onLocate} />
          ))}
        </div>
        <div>
          后一区间开始：{gap.afterNames.length ? gap.afterNames.join('、') : '（无）'}
          {gap.afterLines.map((l) => (
            <LocateBtn key={l} line={l} onLocate={onLocate} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function OverlapCard({ ov, onLocate }: { ov: OverlapPair; onLocate: (line: number) => void }) {
  return (
    <div className="issue-card overlap-card">
      <div className="issue-head">
        <span className="badge badge-overlap">重叠</span>
        <span className="issue-range mono">
          {ov.startTc} → {ov.endTc}
        </span>
        <span className="issue-size">{ov.overlapFrames} 帧（{ov.overlapTc}）</span>
      </div>
      <div className="issue-body">
        <div>
          <LocateBtn line={ov.a.line} onLocate={onLocate} /> <strong>{ov.a.name}</strong>
          <span className="mono dim">
            {' '}[{ov.a.inTc}, {ov.a.outTc})
          </span>
        </div>
        <div>
          <LocateBtn line={ov.b.line} onLocate={onLocate} /> <strong>{ov.b.name}</strong>
          <span className="mono dim">
            {' '}[{ov.b.inTc}, {ov.b.outTc})
          </span>
        </div>
      </div>
    </div>
  );
}

export function LocateBtn({ line, onLocate }: { line: number; onLocate: (line: number) => void }) {
  return (
    <button type="button" className="locate-btn" onClick={() => onLocate(line)} title={`定位到第 ${line} 行`}>
      第 {line} 行
    </button>
  );
}

export function RowDetail({ row, result }: { row: RowResult; result: AnalyzeResult }) {
  return (
    <div className="detail">
      <div className="detail-title">
        第 {row.line} 行
        {row.name ? <> · {row.name}</> : <span className="dim">（片段名为空）</span>}
      </div>

      <table className="detail-table">
        <thead>
          <tr>
            <th />
            <th>时间码（原文）</th>
            <th>帧数</th>
            <th>时长（帧 / 时间码）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>素材入点</th>
            <td className="mono">{row.sourceInText || '—'}</td>
            <td className="mono">{fmt(row.sourceInFrames)}</td>
            <td rowSpan={2} className="dur-cell">
              <div>
                <strong>{fmt(row.sourceDuration)}</strong> 帧
              </div>
              <div className="mono dim">{row.sourceDurationTc ?? '—'}</div>
            </td>
          </tr>
          <tr>
            <th>素材出点</th>
            <td className="mono">{row.sourceOutText || '—'}</td>
            <td className="mono">{fmt(row.sourceOutFrames)}</td>
          </tr>
          <tr>
            <th>成片入点</th>
            <td className="mono">{row.programInText || '—'}</td>
            <td className="mono">{fmt(row.programInFrames)}</td>
            <td rowSpan={2} className="dur-cell">
              <div>
                <strong>{fmt(row.programDuration)}</strong> 帧
              </div>
              <div className="mono dim">{row.programDurationTc ?? '—'}</div>
            </td>
          </tr>
          <tr>
            <th>成片出点</th>
            <td className="mono">{row.programOutText || '—'}</td>
            <td className="mono">{fmt(row.programOutFrames)}</td>
          </tr>
        </tbody>
      </table>

      <div className="detail-meta">
        {row.timelineValid ? (
          <span className="badge badge-ok">成片顺序 #{row.programOrder}</span>
        ) : (
          <span className="badge badge-invalid">未参与成片排序</span>
        )}
        <span className="dim mono">模式：{result.modeLabel}</span>
        {row.programInTc && row.programOutTc && (
          <span className="dim mono">
            成片区间 [{row.programInTc}, {row.programOutTc})（入点包含、出点不包含）
          </span>
        )}
      </div>

      {row.errors.length > 0 && (
        <ul className="msg-list">
          {row.errors.map((e, i) => (
            <li key={i} className="msg msg-error">
              {e}
            </li>
          ))}
        </ul>
      )}
      {row.warnings.length > 0 && (
        <ul className="msg-list">
          {row.warnings.map((w, i) => (
            <li key={i} className="msg msg-warn">
              {w}
            </li>
          ))}
        </ul>
      )}
      {row.errors.length === 0 && row.warnings.length === 0 && (
        <div className="msg msg-ok">该行时间码、时长均合法。</div>
      )}
    </div>
  );
}

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

export function SortedTable({ result, onLocate }: { result: AnalyzeResult; onLocate: (line: number) => void }) {
  const sorted = [...result.rows]
    .filter((r) => r.timelineValid)
    .sort((a, b) => a.programInFrames! - b.programInFrames! || a.line - b.line);

  if (sorted.length === 0) {
    return <div className="empty">暂无可排序的成片区间。</div>;
  }

  return (
    <div className="table-wrap">
      <table className="sorted-table">
        <thead>
          <tr>
            <th>顺序</th>
            <th>原始行</th>
            <th>片段名</th>
            <th>成片入点</th>
            <th>成片出点</th>
            <th>时长(帧)</th>
            <th>素材时长(帧)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const mismatch =
              r.sourceDuration !== null &&
              r.programDuration !== null &&
              r.sourceDuration !== r.programDuration;
            return (
              <tr key={r.line} className={mismatch ? 'row-bad' : ''}>
                <td className="mono">{r.programOrder}</td>
                <td className="mono">
                  <LocateBtn line={r.line} onLocate={onLocate} />
                </td>
                <td>{r.name || <span className="dim">（空）</span>}</td>
                <td className="mono">{r.programInTc}</td>
                <td className="mono">{r.programOutTc}</td>
                <td className="mono">{fmt(r.programDuration)}</td>
                <td className="mono">{fmt(r.sourceDuration)}</td>
                <td>{mismatch && <span className="badge badge-invalid">时长不一致</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TimelineBar({ result, onLocate }: { result: AnalyzeResult; onLocate: (line: number) => void }) {
  const t = result.timeline;
  if (t.startFrames === null || t.endFrames === null || t.spanFrames === 0) {
    return <div className="empty">暂无可视化区间。</div>;
  }
  const span = t.endFrames - t.startFrames;
  const pct = (f: number) => `${((f / span) * 100).toFixed(3)}%`;

  return (
    <div className="timeline-box">
      <div className="timeline">
        {t.unionPieces.map((p, i) => (
          <div
            key={`u${i}`}
            className="tl-piece tl-union"
            style={{ left: pct(p.startFrames - t.startFrames!), width: pct(p.frames) }}
            title={`覆盖：${p.startTc} → ${p.endTc}（${p.frames} 帧）`}
          />
        ))}
        {result.gaps.map((g) => (
          <div
            key={`g${g.index}`}
            className="tl-piece tl-gap"
            style={{ left: pct(g.startFrames - t.startFrames!), width: pct(g.gapFrames) }}
            title={`空隙：${g.startTc} → ${g.endTc}（${g.gapFrames} 帧）`}
          />
        ))}
        {result.overlaps.map((o, i) => (
          <button
            type="button"
            key={`o${i}`}
            className="tl-piece tl-overlap"
            style={{ left: pct(o.startFrames - t.startFrames!), width: pct(o.overlapFrames) }}
            title={`重叠：${o.startTc} → ${o.endTc}（${o.overlapFrames} 帧），行 ${o.lines.join(' / ')}`}
            onClick={() => onLocate(o.lines[0])}
          />
        ))}
      </div>
      <div className="tl-axis mono">
        <span>{t.startTc}</span>
        <span>{t.endTc}</span>
      </div>
      <div className="tl-legend">
        <span><i className="dot tone-ok" />覆盖</span>
        <span><i className="dot tone-gap" />空隙</span>
        <span><i className="dot tone-overlap" />重叠（点击定位）</span>
      </div>
    </div>
  );
}
