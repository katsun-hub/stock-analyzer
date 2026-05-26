const handler = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  try {
    const pdfRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!pdfRes.ok) throw new Error("PDF取得失敗");

    const buffer = await pdfRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64
              }
            },
            {
              type: "text",
              text: `この資料から最終年度の業績目標を読み取り、EPSを算出してください。JSONのみで返してください（マークダウン不要）。

抽出・計算ルール：
1. 純利益目標がある → そのまま使用
2. 経常利益目標がある → 純利益 = 経常利益 × 直近実績の純利益率で推定
3. 営業利益目標がある → 純利益 = 営業利益 × 直近実績の純利益率で推定
4. 売上目標のみ → 段階的に推定

返すJSON:
{
  "finalYear": "最終目標年度",
  "targetType": "pure_profit | operating_profit | ordinary_profit | sales",
  "targetValue": "目標値（億円）",
  "targetLabel": "表示用ラベル（例: 純利益目標）",
  "netProfit": "算出した純利益（億円）",
  "netProfitIsEstimated": true or false,
  "estimationNote": "推定の計算根拠",
  "shares": "発行済み株式数（万株）",
  "eps": "算出したEPS（円、小数第1位）",
  "notes": "補足事項"
}

見つからない場合はnullを返してください。`
            }
          ]
        })
      })
    });

    const data = await claudeRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = handler;
