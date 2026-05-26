import { useState } from "react";

const fetchStockData = async (code) => {
  try {
    const isJP = /^\d{4}$/.test(code);
    const symbol = isJP ? `${code}.T` : code.toUpperCase();
    const res = await fetch(`/api/stock?symbol=${symbol}`);
    const parsed = await res.json();
    const meta = parsed?.chart?.result?.[0]?.meta;
    return {
      price: meta?.regularMarketPrice || null,
      name: meta?.longName || meta?.shortName || null,
    };
  } catch {
    return { price: null, name: null };
  }
};

const fetchEpsData = async (code) => {
  try {
    const isJP = /^\d{4}$/.test(code);
    const symbol = isJP ? `${code}.T` : code.toUpperCase();
    const res = await fetch(`/api/stock?symbol=${symbol}&module=earningsTrend`);
    const parsed = await res.json();
    const trend = parsed?.quoteSummary?.result?.[0]?.earningsTrend?.trend;
    const epsNow = trend?.[0]?.earningsEstimate?.avg?.raw || null;
    const epsNext = trend?.[1]?.earningsEstimate?.avg?.raw || null;
    return { epsNow, epsNext };
  } catch {
    return { epsNow: null, epsNext: null };
  }
};

const Rating = ({ pct }) => {
  if (pct >= 20) return <span style={{ color: "#16a34a", fontWeight: "bold", fontSize: 13 }}>★ 強い割安</span>;
  if (pct >= 5) return <span style={{ color: "#22c55e", fontSize: 13 }}>割安</span>;
  if (pct >= -5) return <span style={{ color: "#d97706", fontSize: 13 }}>適正水準</span>;
  if (pct >= -20) return <span style={{ color: "#ef4444", fontSize: 13 }}>割高</span>;
  return <span style={{ color: "#b91c1c", fontWeight: "bold", fontSize: 13 }}>強い割高</span>;
};

export default function App() {
  const [code, setCode] = useState("");
  const [stockName, setStockName] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [avgPer, setAvgPer] = useState("");
  const [companyEps, setCompanyEps] = useState("");
  const [shikihoEpsNow, setShikihoEpsNow] = useState("");
  const [shikihoEpsNext, setShikihoEpsNext] = useState("");

  const [midData, setMidData] = useState(null);
  const [midEps, setMidEps] = useState(null);
  const [midLoading, setMidLoading] = useState(false);
  const [midConfirmed, setMidConfirmed] = useState(false);
  const [midNoData, setMidNoData] = useState(false);

  const [results, setResults] = useState(null);
  const [aiComment, setAiComment] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);

  const handleDemoMode = () => {
    setStockName("キーエンス（デモデータ・参考値）");
    setCurrentPrice("56380");
    setCompanyEps("1834");
    setShikihoEpsNow("1820");
    setShikihoEpsNext("1950");
    setMidData(null);
    setMidEps(null);
    setMidNoData(true);
    setFetchError("");
    setResults(null);
    setMidConfirmed(false);
  };

  const handleFetchAll = async () => {
    if (!code) return;
    setFetching(true);
    setFetchError("");
    setResults(null);
    setMidData(null);
    setMidEps(null);
    setMidConfirmed(false);
    setMidNoData(false);

    const [stock, eps] = await Promise.all([fetchStockData(code), fetchEpsData(code)]);

    if (!stock.price) {
      setFetchError("株価を取得できませんでした。銘柄コードを確認してください。");
      setFetching(false);
      return;
    }

    setCurrentPrice(String(Math.round(stock.price * 10) / 10));
    if (stock.name) setStockName(stock.name);
    if (eps.epsNow) setCompanyEps(String(Math.round(eps.epsNow * 10) / 10));
    if (eps.epsNext) setShikihoEpsNext(String(Math.round(eps.epsNext * 10) / 10));

    setFetching(false);
    fetchMidTermPlan(code, stock.name);
  };

  const fetchMidTermPlan = async (code, name) => {
    setMidLoading(true);
    try {
      const companyName = name || `銘柄コード${code}`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `「${companyName}」の最新の中期経営計画を検索してください。以下の情報をJSON形式のみで返してください（他のテキスト不要）:
{
  "finalYear": "最終目標年度（例: 2027年3月期）",
  "operatingProfit": "営業利益目標（億円）",
  "netProfitRatio": "純利益率の目安（対営業利益 %）",
  "shares": "発行済み株式数（万株）",
  "source": "参照元URL",
  "notes": "補足事項があれば"
}
情報が見つからない場合はnullを返してください。`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (parsed && parsed.operatingProfit) {
          setMidData(parsed);
          const op = parseFloat(parsed.operatingProfit) * 100000000;
          const netRatio = parseFloat(parsed.netProfitRatio) / 100;
          const shares = parseFloat(parsed.shares) * 10000;
          if (op && netRatio && shares) {
            const eps = Math.round((op * netRatio / shares) * 10) / 10;
            setMidEps(eps);
          }
        }
      } catch {
        setMidData(null);
        setMidNoData(true);
      }
    } catch {
      setMidData(null);
      setMidNoData(true);
    }
    setMidLoading(false);
  };

  const calcResults = () => {
    const per = parseFloat(avgPer);
    const cp = parseFloat(currentPrice);
    if (!per || !cp) return;

    const patterns = [
      { label: "会社予想EPS（今期）", eps: parseFloat(companyEps) },
      { label: "四季報予想EPS（今期）", eps: parseFloat(shikihoEpsNow) },
      { label: "四季報予想EPS（来期）", eps: parseFloat(shikihoEpsNext) },
      { label: "中計ベースEPS", eps: midConfirmed ? midEps : null },
    ].filter(p => p.eps && !isNaN(p.eps));

    if (patterns.length === 0) return;

    const res = patterns.map(p => {
      const target = Math.round(p.eps * per);
      const diff = target - cp;
      const pct = Math.round((diff / cp) * 1000) / 10;
      return { ...p, target, diff, pct };
    });

    setResults(res);
    generateAIComment(res, cp, per);
  };

  const generateAIComment = async (res, cp, per) => {
    setLoadingAI(true);
    setAiComment("");
    try {
      const summary = res.map(r =>
        `${r.label}: 予想EPS ${r.eps}円 → 目標株価 ${r.target}円（現在比 ${r.pct > 0 ? "+" : ""}${r.pct}%）`
      ).join("\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `株式投資のアドバイザーとして、以下の目標株価算出結果を投資初心者にもわかりやすく200〜300文字で解説してください。ポジティブな点とリスクの両方に触れ、最後に投資判断は自己責任である旨を一言添えてください。

現在株価: ${cp}円 / 予想PER過去平均: ${per}倍
${summary}`
          }]
        })
      });
      const data = await response.json();
      setAiComment(data.content?.[0]?.text || "");
    } catch {
      setAiComment("AIコメントの生成に失敗しました。");
    }
    setLoadingAI(false);
  };

  const inp = (extra = {}) => ({
    style: {
      width: "100%", boxSizing: "border-box",
      background: "#fff",
      border: "1.5px solid #e2e8f0",
      borderRadius: 8, padding: "11px 14px",
      color: "#1e293b", fontSize: 15,
      fontFamily: "'Courier New', monospace",
      outline: "none", transition: "border-color 0.2s",
      ...extra,
    },
    onFocus: e => e.target.style.borderColor = "#3b82f6",
    onBlur: e => e.target.style.borderColor = "#e2e8f0",
  });

  const label = (text, sub) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#64748b", textTransform: "uppercase" }}>{text}</label>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const card = (children, extra = {}) => (
    <div style={{
      background: "#fff", borderRadius: 12,
      border: "1px solid #e2e8f0",
      padding: 24, marginBottom: 16,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      ...extra
    }}>{children}</div>
  );

  const sectionTitle = (text) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", letterSpacing: 1, textTransform: "uppercase", marginBottom: 18, paddingBottom: 10, borderBottom: "2px solid #f1f5f9" }}>
      {text}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1e293b" }}>

      <div style={{ background: "#1e40af", padding: "24px 40px 20px", boxShadow: "0 2px 8px rgba(30,64,175,0.3)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: 5, color: "#93c5fd", marginBottom: 4, textTransform: "uppercase" }}>Stock Analysis Tool — TAB 2</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>目標株価 算出ツール</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#bfdbfe" }}>銘柄コードを入力するだけで株価・EPS・中計データを自動取得し、複数シナリオの目標株価を算出</p>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>

        {card(<>
          {sectionTitle("① 銘柄コードを入力")}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              {label("銘柄コード / ティッカー", "日本株: 4桁コード（例: 7203）　米国株: ティッカー（例: AAPL）")}
              <input value={code} onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFetchAll()}
                placeholder="例: 7203 または AAPL"
                {...inp()} />
            </div>
            <button onClick={handleFetchAll} disabled={fetching} style={{
              padding: "11px 28px", background: fetching ? "#93c5fd" : "#1e40af",
              border: "none", borderRadius: 8, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: fetching ? "not-allowed" : "pointer",
              whiteSpace: "nowrap", letterSpacing: 1, transition: "background 0.2s",
            }}>
              {fetching ? "取得中..." : "データ取得"}
            </button>
          </div>
          {fetchError && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>{fetchError}</div>}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>または</span>
            <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          </div>
          <button onClick={handleDemoMode} style={{
            width: "100%", marginTop: 12, padding: "11px 0",
            background: "#f8fafc", border: "1.5px dashed #cbd5e1",
            borderRadius: 8, color: "#64748b", fontSize: 13,
            fontWeight: 600, cursor: "pointer", letterSpacing: 1,
          }}>
            🧪 デモモードで試す（キーエンスのサンプルデータで動作確認）
          </button>
          {stockName && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#eff6ff", borderRadius: 8, fontSize: 13, color: "#1e40af", fontWeight: 600 }}>
              ✓ {stockName}
            </div>
          )}
        </>)}

        {currentPrice && card(<>
          {sectionTitle("② 取得データの確認・編集")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              {label("現在株価（円）", "自動取得 / 15〜20分遅延")}
              <input value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} {...inp()} />
            </div>
            <div>
              {label("予想PER 過去平均（倍）", "SBI証券・バフェットコード等で確認")}
              <input value={avgPer} onChange={e => setAvgPer(e.target.value)} placeholder="例: 18.5" {...inp()} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              {label("会社予想EPS（今期）", "自動取得（要確認）")}
              <input value={companyEps} onChange={e => setCompanyEps(e.target.value)} placeholder="例: 120.5" {...inp()} />
            </div>
            <div>
              {label("四季報予想EPS（今期）", "手入力 or 自動取得値を修正")}
              <input value={shikihoEpsNow} onChange={e => setShikihoEpsNow(e.target.value)} placeholder="例: 115.0" {...inp()} />
            </div>
            <div>
              {label("四季報予想EPS（来期）", "自動取得（要確認）")}
              <input value={shikihoEpsNext} onChange={e => setShikihoEpsNext(e.target.value)} placeholder="例: 140.0" {...inp()} />
            </div>
          </div>
        </>)}

        {currentPrice && card(<>
          {sectionTitle("③ 中期経営計画ベースEPS")}
          {midLoading && (
            <div style={{ padding: "20px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
              🔍 AIが中期経営計画を検索中...
            </div>
          )}
          {!midLoading && midData && (
            <div>
              <div style={{ padding: 16, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", marginBottom: 12 }}>AIが取得した中計データ（要確認）</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  {[
                    ["最終目標年度", midData.finalYear],
                    ["営業利益目標", `${midData.operatingProfit}億円`],
                    ["純利益率（対営業利益）", `${midData.netProfitRatio}%`],
                    ["発行済み株式数", `${midData.shares}万株`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ padding: "6px 10px", background: "#fff", borderRadius: 6, border: "1px solid #e0f2fe" }}>
                      <span style={{ color: "#64748b", fontSize: 11 }}>{k}：</span>
                      <span style={{ color: "#1e293b", fontWeight: 600 }}>{v || "取得できず"}</span>
                    </div>
                  ))}
                </div>
                {midData.source && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
                    参照元: <a href={midData.source} target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>{midData.source}</a>
                  </div>
                )}
                {midData.notes && <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>📌 {midData.notes}</div>}
              </div>
              {midEps && (
                <div style={{ padding: "14px 18px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 12, color: "#16a34a" }}>算出された中計ベースEPS：</span>
                    <span style={{ fontSize: 22, color: "#15803d", fontFamily: "'Courier New', monospace", marginLeft: 10, fontWeight: 700 }}>{midEps} 円</span>
                  </div>
                  <button onClick={() => setMidConfirmed(v => !v)} style={{
                    padding: "8px 18px",
                    background: midConfirmed ? "#16a34a" : "#fff",
                    border: `2px solid ${midConfirmed ? "#16a34a" : "#e2e8f0"}`,
                    borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    color: midConfirmed ? "#fff" : "#64748b", transition: "all 0.2s",
                  }}>
                    {midConfirmed ? "✓ 計算に使用する" : "計算に使用する"}
                  </button>
                </div>
              )}
            </div>
          )}
          {!midLoading && midNoData && (
            <div style={{ padding: "14px 18px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#c2410c", marginBottom: 4 }}>⚠️ 中計データを取得できませんでした</div>
              <div style={{ fontSize: 12, color: "#9a3412" }}>
                中期経営計画が非公表、または業績目標の記載が見つかりませんでした。<br />
                中計ベースEPSなしで目標株価を算出します。
              </div>
            </div>
          )}
        </>)}

        {currentPrice && (
          <button onClick={calcResults} style={{
            width: "100%", padding: 16,
            background: "#1e40af", border: "none", borderRadius: 10,
            color: "#fff", fontSize: 15, fontWeight: 700,
            letterSpacing: 2, textTransform: "uppercase",
            cursor: "pointer", marginBottom: 24,
            boxShadow: "0 4px 12px rgba(30,64,175,0.3)",
            transition: "background 0.2s",
          }}
            onMouseEnter={e => e.target.style.background = "#1d4ed8"}
            onMouseLeave={e => e.target.style.background = "#1e40af"}
          >
            目標株価を算出する
          </button>
        )}

        {results && (<>
          <div style={{ fontSize: 12, letterSpacing: 4, color: "#64748b", marginBottom: 16, textTransform: "uppercase", textAlign: "center" }}>
            — 算出結果 —
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 12, padding: 20,
                border: `2px solid ${r.pct >= 10 ? "#86efac" : r.pct <= -10 ? "#fca5a5" : "#e2e8f0"}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>{r.label}</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>予想EPS</span>
                  <span style={{ fontSize: 17, color: "#1e293b", fontFamily: "'Courier New', monospace", marginLeft: 10 }}>{r.eps} 円</span>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>目標株価</span>
                  <span style={{ fontSize: 26, color: "#1e40af", fontFamily: "'Courier New', monospace", marginLeft: 10, fontWeight: 700 }}>{r.target.toLocaleString()} 円</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>現在株価比</span>
                  <span style={{ fontSize: 18, fontFamily: "'Courier New', monospace", marginLeft: 10, color: r.pct >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                    {r.pct >= 0 ? "+" : ""}{r.pct}%
                  </span>
                </div>
                <Rating pct={r.pct} />
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>▸ AI 総合コメント</div>
            {loadingAI ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>AIが分析中...</div>
            ) : (
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{aiComment}</div>
            )}
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, textAlign: "center", lineHeight: 1.8 }}>
            ※ 本ツールは参考情報の提供を目的としており、投資勧誘ではありません。投資判断はご自身の責任で行ってください。<br />
            株価データは15〜20分遅延があります。
          </p>
        </>)}
      </div>
    </div>
  );
}
