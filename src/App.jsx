import React, { useEffect, useState } from "react";

const BINANCE_TICKER_API = "https://api.binance.com/api/v3/ticker/24hr";
const BINANCE_KLINE_API = "https://api.binance.com/api/v3/klines";

export default function ShortTermBreakoutScanner() {
  const [topBreakouts, setTopBreakouts] = useState([]);
  const [timestamp, setTimestamp] = useState(0);

  useEffect(() => {
    const fetchBreakouts = async () => {
      try {
        const tickerRes = await fetch(BINANCE_TICKER_API);
        const tickerData = await tickerRes.json();
        const usdtPairs = tickerData.filter(
          (item) => item.symbol.endsWith("USDT") && !item.symbol.includes("UP") && !item.symbol.includes("DOWN")
        );

        const filtered = usdtPairs
          .map((item) => ({
            symbol: item.symbol,
            change: parseFloat(item.priceChangePercent),
            volume: parseFloat(item.quoteVolume),
            lastPrice: parseFloat(item.lastPrice),
          }))
          .filter((item) => item.change > 1.5 && item.volume > 1000000)
          .slice(0, 10);

        const klinePromises = filtered.map(async (item) => {
          try {
            const klineRes = await fetch(
              `${BINANCE_KLINE_API}?symbol=${item.symbol}&interval=5m&limit=2`
            );
            const klineData = await klineRes.json();
            const [prev, latest] = klineData;
            const open = parseFloat(latest[1]);
            const close = parseFloat(latest[4]);
            const percent = ((close - open) / open) * 100;
            return { ...item, change5m: percent.toFixed(2) };
          } catch {
            return { ...item, change5m: "-" };
          }
        });

        const results = await Promise.all(klinePromises);
        setTopBreakouts(results);
        setTimestamp(Date.now());
      } catch (error) {
        console.error("Error fetching breakout data:", error);
      }
    };

    fetchBreakouts();
    const interval = setInterval(fetchBreakouts, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "1rem", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "1rem" }}>
        🚀 超短线突破信号筛选器（实时，每5秒更新）
      </h2>
      <p style={{ fontSize: "14px", color: "#888", marginBottom: "1rem" }}>
        更新时间：{new Date(timestamp).toLocaleTimeString()}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={thStyle}>币种</th>
              <th style={thStyle}>涨幅(24h)</th>
              <th style={thStyle}>5分钟涨幅</th>
              <th style={thStyle}>当前价格</th>
              <th style={thStyle}>成交额(USDT)</th>
            </tr>
          </thead>
          <tbody>
            {topBreakouts.map((item) => (
              <tr key={item.symbol}>
                <td style={tdStyle}>{item.symbol}</td>
                <td style={{ ...tdStyle, color: "green", fontWeight: "500" }}>{item.change.toFixed(2)}%</td>
                <td style={tdStyle}>{item.change5m}%</td>
                <td style={tdStyle}>{item.lastPrice.toFixed(4)}</td>
                <td style={tdStyle}>{(item.volume / 1_000_000).toFixed(2)}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "1px solid #ccc",
};

const tdStyle = {
  padding: "10px",
  borderBottom: "1px solid #eee",
};
