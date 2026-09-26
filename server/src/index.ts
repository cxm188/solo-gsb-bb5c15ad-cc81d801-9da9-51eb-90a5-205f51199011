import express from "express";
import path from "path";
import { checkEdl } from "./checker";
import { Mode, MODE_LABEL } from "./timecode";

const app = express();
app.use(express.json({ limit: "10mb" }));

const VALID_MODES: Mode[] = ["ndf25", "df2997"];

app.post("/api/check", (req, res) => {
  const { csv, mode } = (req.body ?? {}) as { csv?: unknown; mode?: unknown };
  if (typeof csv !== "string" || typeof mode !== "string" || !VALID_MODES.includes(mode as Mode)) {
    res.status(400).json({
      error: `请求参数错误：需要 { csv: string, mode: "ndf25" | "df2997" }（${VALID_MODES.map((m) => MODE_LABEL[m]).join(" / ")}）`,
    });
    return;
  }
  try {
    res.json(checkEdl(csv, mode as Mode));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// 生产模式下由后端托管前端构建产物
const webDist = path.join(__dirname, "..", "..", "web", "dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("前端未构建：请先构建 web/ 或仅使用 /api 接口");
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`视频接片单核对工具已启动：http://localhost:${port}`);
});
