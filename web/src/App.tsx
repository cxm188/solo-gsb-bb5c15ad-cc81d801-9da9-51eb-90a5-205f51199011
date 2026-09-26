import { useMemo, useRef, useState } from "react";
import { checkEdl } from "./api";
import { SAMPLE_CSV } from "./sample";
import type { CheckResponse, Mode } from "./types";

interface IssueItem {
  key: string;
  kind: "解析错误" | "时长不匹配" | "空隙" | "重叠";
  text: string;
  lines: number[];
}

function buildIssues(result: CheckResponse): IssueItem[] {
  const issues: IssueItem[] = [];
  for (const row of result.rows) {
    for (const err of row.errors) {
      issues.push({
        key: `err-${row.line}-${issues.length}`,
        kind: "解析错误",
        text: `第 ${row.line} 行：${err}`,
        lines: [row.line],
      });
    }
  }
  for (const d of result.durationIssues) {
    const sign = d.diff > 0 ? "+" : "";
    issues.push({
      key: `dur-${d.line}`,
      kind: "时长不匹配",
      text: `第 ${d.line} 行「${d.name}」：素材 ${d.srcDur} 帧 ≠ 成片 ${d.recDur} 帧（相差 ${sign}${d.diff} 帧）`,
      lines: [d.line],
    });
  }
  for (const [i, g] of result.gaps.entries()) {
    issues.push({
      key: `gap-${i}`,
      kind: "空隙",
      text: `成片空隙 ${g.startTc} – ${g.endTc}（${g.frames} 帧，第 ${g.startF} – ${g.endF} 帧），位于第 ${g.beforeLine} 行与第 ${g.afterLine} 行之间`,
      lines: [g.beforeLine, g.afterLine],
    });
  }
  for (const [i, o] of result.overlaps.entries()) {
    issues.push({
      key: `ovl-${i}`,
      kind: "重叠",
      text: `成片重叠 ${o.startTc} – ${o.endTc}（${o.frames} 帧，第 ${o.startF} – ${o.endF} 帧），第 ${o.lines[0]} 行与第 ${o.lines[1]} 行`,
      lines: [...o.lines],
    });
  }
  return issues;
}

const KIND_CLASS: Record<IssueItem["kind"], string> = {
  解析错误: "issue-error",
  时长不匹配: "issue-duration",
  空隙: "issue-gap",
  重叠: "issue-overlap",
};

export default function App() {
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<Mode>("ndf25");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const issues = useMemo(() => (result ? buildIssues(result) : []), [result]);

  const runCheck = async () => {
    setLoading(true);
    setFetchError(null);
    setHighlight(new Set());
    try {
      setResult(await checkEdl(csv, mode));
    } catch (e) {
      setResult(null);
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const locate = (lines: number[]) => {
    setHighlight(new Set(lines));
    const first = Math.min(...lines);
    rowRefs.current.get(first)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const parseErrorCount = result ? result.rows.reduce((n, r) => n + r.errors.length, 0) : 0;
  const allClear =
    result !== null &&
    parseErrorCount === 0 &&
    result.durationIssues.length === 0 &&
    result.gaps.length === 0 &&
    result.overlaps.length === 0;

  return (
    <div className="page">
      <header>
        <h1>视频接片单核对工具</h1>
        <p className="subtitle">
          粘贴 CSV（片段名,素材入点,素材出点,成片入点,成片出点），时间码格式 HH:MM:SS:FF，入点包含、出点不包含
        </p>
      </header>

      <section className="controls">
        <div className="mode-picker" role="radiogroup" aria-label="帧率模式">
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "ndf25"}
              onChange={() => setMode("ndf25")}
            />
            25fps 非丢帧
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "df2997"}
              onChange={() => setMode("df2997")}
            />
            29.97fps 丢帧
          </label>
        </div>
        <div className="buttons">
          <button className="primary" onClick={runCheck} disabled={loading || csv.trim() === ""}>
            {loading ? "核对中…" : "开始核对"}
          </button>
          <button onClick={() => setCsv(SAMPLE_CSV)}>加载示例接片单</button>
          <button
            onClick={() => {
              setCsv("");
              setResult(null);
              setFetchError(null);
              setHighlight(new Set());
            }}
          >
            清空
          </button>
        </div>
      </section>

      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={"片段名,素材入点,素材出点,成片入点,成片出点\n片头,00:00:01:00,00:00:06:00,00:00:00:00,00:00:05:00\n…"}
        spellCheck={false}
        rows={10}
      />

      {fetchError && <div className="banner banner-error">请求失败：{fetchError}</div>}

      {result && (
        <>
          <section className="summary">
            <div className="card">
              <div className="card-num">{result.dataRowCount}</div>
              <div className="card-label">数据行</div>
            </div>
            <div className={`card ${parseErrorCount > 0 ? "card-bad" : ""}`}>
              <div className="card-num">{parseErrorCount}</div>
              <div className="card-label">解析错误</div>
            </div>
            <div className={`card ${result.durationIssues.length > 0 ? "card-bad" : ""}`}>
              <div className="card-num">{result.durationIssues.length}</div>
              <div className="card-label">时长不匹配</div>
            </div>
            <div className={`card ${result.gaps.length > 0 ? "card-warn" : ""}`}>
              <div className="card-num">{result.gaps.length}</div>
              <div className="card-label">成片空隙</div>
            </div>
            <div className={`card ${result.overlaps.length > 0 ? "card-bad" : ""}`}>
              <div className="card-num">{result.overlaps.length}</div>
              <div className="card-label">成片重叠</div>
            </div>
          </section>

          {allClear ? (
            <div className="banner banner-ok">✅ 未发现问题：时长全部一致，成片时间线无空隙、无重叠</div>
          ) : (
            <section className="issues">
              <h2>问题列表（共 {issues.length} 项，点击定位原始行）</h2>
              <ul>
                {issues.map((issue) => (
                  <li key={issue.key}>
                    <button className={`issue ${KIND_CLASS[issue.kind]}`} onClick={() => locate(issue.lines)}>
                      <span className="issue-kind">{issue.kind}</span>
                      <span>{issue.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="table-wrap">
            <h2>逐行明细（时间码 / 帧数）</h2>
            <table>
              <thead>
                <tr>
                  <th>行号</th>
                  <th>片段名</th>
                  <th>素材入点</th>
                  <th>素材出点</th>
                  <th>素材时长</th>
                  <th>成片入点</th>
                  <th>成片出点</th>
                  <th>成片时长</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const durMismatch =
                    row.srcDur !== null && row.recDur !== null && row.srcDur !== row.recDur;
                  const classes = [
                    highlight.has(row.line) ? "row-highlight" : "",
                    row.errors.length > 0 ? "row-error" : durMismatch ? "row-warn" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr
                      key={row.line}
                      className={classes}
                      ref={(el) => {
                        if (el) rowRefs.current.set(row.line, el);
                        else rowRefs.current.delete(row.line);
                      }}
                    >
                      <td className="mono">{row.line}</td>
                      <td>{row.name}</td>
                      <TcCell tc={row.srcIn} frames={row.srcInF} />
                      <TcCell tc={row.srcOut} frames={row.srcOutF} />
                      <DurCell frames={row.srcDur} />
                      <TcCell tc={row.recIn} frames={row.recInF} />
                      <TcCell tc={row.recOut} frames={row.recOutF} />
                      <DurCell frames={row.recDur} />
                      <td>
                        {row.errors.length > 0 ? (
                          <ul className="cell-errors">
                            {row.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        ) : durMismatch ? (
                          <span className="tag tag-warn">时长不匹配</span>
                        ) : (
                          <span className="tag tag-ok">正常</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <footer>
        <p>
          丢帧规则：29.97fps 模式下每分钟跳过 00、01 帧号，整十分钟不跳；所有时长与区间均按实际帧数计算。
        </p>
      </footer>
    </div>
  );
}

function TcCell({ tc, frames }: { tc: string; frames: number | null }) {
  if (frames === null) return <td className="mono tc-bad">{tc || "—"}</td>;
  return (
    <td className="mono">
      {tc}
      <span className="frames">第 {frames} 帧</span>
    </td>
  );
}

function DurCell({ frames }: { frames: number | null }) {
  if (frames === null) return <td className="mono">—</td>;
  return <td className="mono">{frames} 帧</td>;
}
