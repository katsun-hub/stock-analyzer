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

  const fetchMidTermPlan
