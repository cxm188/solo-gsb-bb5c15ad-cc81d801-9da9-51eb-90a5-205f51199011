import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

export type LineTone = 'invalid' | 'overlap' | 'gap' | 'ok';

interface CsvEditorHandle {
  /** 滚动到物理行号（1-based） */
  scrollToLine: (line: number) => void;
}

interface CsvEditorProps {
  value: string;
  onChange: (v: string) => void;
  tones: Map<number, LineTone>;
  selectedLine: number | null;
  onSelectLine: (line: number) => void;
}

const LINE_HEIGHT = 20;
const PAD_Y = 10;

/**
 * 带行号、行底色高亮的 CSV 编辑器。
 * 底层为普通 textarea；背景层渲染高亮行，滚动由外层容器统一驱动。
 */
const CsvEditor = forwardRef<CsvEditorHandle, CsvEditorProps>(function CsvEditor(
  { value, onChange, tones, selectedLine, onSelectLine },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split('\n'), [value]);

  useImperativeHandle(ref, () => ({
    scrollToLine(line: number) {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, (line - 1) * LINE_HEIGHT + PAD_Y - el.clientHeight / 2 + LINE_HEIGHT);
    },
  }));

  const syncScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    if (backdropRef.current) backdropRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };

  return (
    <div className="editor" onScroll={syncScroll} ref={scrollRef}>
      <div
        className="editor-gutter"
        ref={gutterRef}
        style={{
          height: lines.length * LINE_HEIGHT + PAD_Y * 2,
          paddingTop: PAD_Y,
          paddingBottom: PAD_Y,
        }}
      >
        {lines.map((_, i) => {
          const lineNo = i + 1;
          const tone = tones.get(lineNo);
          return (
            <button
              type="button"
              key={lineNo}
              className={`gutter-line ${tone ? `tone-${tone}` : ''} ${selectedLine === lineNo ? 'selected' : ''}`}
              style={{ height: LINE_HEIGHT }}
              onClick={() => onSelectLine(lineNo)}
              title={`定位到第 ${lineNo} 行`}
            >
              {lineNo}
            </button>
          );
        })}
      </div>
      <div className="editor-main">
        <div
          className="editor-backdrop"
          ref={backdropRef}
          aria-hidden
          style={{
            minHeight: '100%',
            paddingTop: PAD_Y,
            paddingBottom: PAD_Y,
            paddingLeft: 8,
            paddingRight: 24,
          }}
        >
          {lines.map((_, i) => {
            const lineNo = i + 1;
            const tone = tones.get(lineNo);
            return (
              <div
                key={lineNo}
                className={`hl-line ${tone ? `tone-${tone}` : ''} ${selectedLine === lineNo ? 'selected' : ''}`}
                style={{ height: LINE_HEIGHT }}
              />
            );
          })}
        </div>
        <textarea
          className="editor-textarea"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          wrap="off"
          style={{
            minHeight: '100%',
            paddingTop: PAD_Y,
            paddingBottom: PAD_Y,
            paddingLeft: 8,
            paddingRight: 24,
          }}
        />
      </div>
    </div>
  );
});

export default CsvEditor;
