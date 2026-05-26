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

    const prompt = [
      "この資料から最終年度の業績目標を読み取り、EPSを算出してください。JSONのみで返してください。",
      "",
      "抽出ルール:",
      "1. 純利益目標がある場合はそのまま使用",
      "2. 経常利益目標がある場合は純利益を直近実績の純利益率で推定",
      "3. 営業利益目標がある場合は純利益を直近実績の純利益率で推定",
      "4. 売上目標のみの場合は段階的に推定",
      "",
      "返すJSON形式:",
      "{",
      '  "finalYear": "最終目標年度",',
      '  "targetType": "pure_profit または operating_profit または ordinary_profit または sales",',
      '  "targetValue": "目標値(億円、数値のみ)",',
      '  "targetLabel": "表示用ラベル(例:純利益目標)",',
      '  "netProfit": "算出した純利益(億円、数値のみ)",',
      '  "netProfitIsEstimated": true または false,',
      '  "estimationNote": "推定した場合の計算根拠",',
      '  "shares": "発行済み株式数(万株、数値のみ)",',
      '  "eps": "算出したEPS(円、小数第1位)",',
      '  "notes": "その他補足事項"',
      "}",
      "",
      "情報が見つからない場合はnullを返してください。"
    ].join("\n");

    const requestBody = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
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
              text: prompt
            }
          ]
        }
      ]
    };

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await claudeRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = handler;
