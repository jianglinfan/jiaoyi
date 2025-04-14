import React, { useEffect, useState, useRef } from "react";

const BINANCE_TICKER_API = "https://api.binance.com/api/v3/ticker/24hr";
const BINANCE_KLINE_API = "https://api.binance.com/api/v3/klines";

function calculateMACD(closes) {
  const EMA = (data, period) => {
    const k = 2 / (period + 1);
    let ema = data[0];
    return data.map((price, i) => {
      if (i === 0) return price;
      ema = price * k + ema * (1 - k);
      return ema;
    });
  };
  const ema12 = EMA(closes, 12);
  const ema26 = EMA(closes, 26);
  const macdLine = ema12.map((val, idx) => val - ema26[idx]);
  const signalLine = EMA(macdLine, 9);
  const histogram = macdLine.map((val, idx) => val - signalLine[idx]);
  return { macdLine, signalLine, histogram };
}

function MiniChart({ symbol }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    async function fetchChart() {
      try {
        const res = await fetch(`${BINANCE_KLINE_API}?symbol=${symbol}&interval=1m&limit=20`);
        const kline = await res.json();
        setData(kline.map(k => parseFloat(k[4])));
      } catch {
        setData([]);
      }
    }
    fetchChart();
  }, [symbol]);

  return (
    <svg width="80" height="40">
      {data.map((price, i) => {
        if (i === 0) return null;
        const x1 = (i - 1) * 4;
        const x2 = i * 4;
        const y1 = 40 - ((data[i - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data))) * 40;
        const y2 = 40 - ((price - Math.min(...data)) / (Math.max(...data) - Math.min(...data))) * 40;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth="1" />;
      })}
    </svg>
  );
}

export default function ShortTermBreakoutScanner() {
  const [timestamp, setTimestamp] = useState(null);
  const [bigCaps, setBigCaps] = useState([]);
  const [smallCaps, setSmallCaps] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(BINANCE_TICKER_API);
        const data = await res.json();
        const filtered = data.filter(item => item.symbol.endsWith("USDT") && !item.symbol.includes("UP") && !item.symbol.includes("DOWN"));

        const enriched = await Promise.all(
          filtered.map(async (item) => {
            const marketCap = parseFloat(item.quoteVolume);
            const price = parseFloat(item.lastPrice);
            const volume = parseFloat(item.quoteVolume);
            const change = parseFloat(item.priceChangePercent);

            try {
              const res = await fetch(`${BINANCE_KLINE_API}?symbol=${item.symbol}&interval=1m&limit=100`);
              const kline = await res.json();
              const closes = kline.map(k => parseFloat(k[4]));
              const macd = calculateMACD(closes);
              const macdPositive = macd.macdLine.at(-1) > macd.signalLine.at(-1);
              const trendUp = closes.at(-1) > closes[0];
              const percent = (closes.at(-1) - closes.at(-2)) / closes.at(-2) * 100;
              const score = (trendUp ? 20 : 0) + (macdPositive ? 20 : 0) + (percent > 0.3 ? 10 : 0);
              const signal = macdPositive && trendUp ? "建议买多" : !macdPositive && !trendUp ? "建议卖空" : "观望";
              return {
                symbol: item.symbol,
                price,
                volume,
                change,
                marketCap,
                macd: macdPositive ? "金叉" : "死叉",
                macdColor: macdPositive ? "green" : "red",
                trend: trendUp ? "上升" : "震荡",
                percent1m: percent.toFixed(2),
                score,
                signal
              };
            } catch {
              return {
                symbol: item.symbol,
                price,
                volume,
                change,
                marketCap,
                macd: "-",
                macdColor: "#888",
                trend: "-",
                percent1m: "-",
                score: 0,
                signal: "-"
              };
            }
          })
        );

        const big = enriched.filter(e => e.marketCap >= 1_000_000_000).sort((a, b) => b.score - a.score).slice(0, 10);
        const small = enriched.filter(e => e.marketCap < 1_000_000_000).sort((a, b) => b.score - a.score).slice(0, 10);
        setBigCaps(big);
        setSmallCaps(small);
        setTimestamp(Date.now());
      } catch (err) {
        console.error("Failed to fetch and process data", err);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const renderTable = (title, data) => (
    <div style={{ marginBottom: "2rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>{title}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th style={th}>币种</th>
            <th style={th}>K线</th>
            <th style={th}>涨幅</th>
            <th style={th}>成交额</th>
            <th style={th}>最新价</th>
            <th style={th}>趋势</th>
            <th style={th}>MACD</th>
            <th style={th}>1m涨</th>
            <th style={th}>得分</th>
            <th style={th}>操作建议</th>
          </tr>
        </thead>
        <tbody>
          {data.map(t => (
            <tr key={t.symbol}>
              <td style={td}>{t.symbol}</td>
              <td style={td}><MiniChart symbol={t.symbol} /></td>
              <td style={{ ...td, color: t.change > 0 ? "green" : "red" }}>{t.change.toFixed(2)}%</td>
              <td style={td}>{(t.volume / 1_000_000).toFixed(2)}M</td>
              <td style={td}>{t.price}</td>
              <td style={{ ...td, color: t.trend === "上升" ? "green" : "#888" }}>{t.trend}</td>
              <td style={{ ...td, color: t.macdColor }}>{t.macd}</td>
              <td style={td}>{t.percent1m}%</td>
              <td style={{ ...td, fontWeight: "bold", color: t.score >= 50 ? "green" : t.score >= 30 ? "orange" : "#888" }}>{t.score}</td>
              <td style={{ ...td, color: t.signal.includes("买多") ? "green" : t.signal.includes("卖空") ? "red" : "#888" }}>{t.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "1rem" }}>📊 策略信号热力榜（分市值）</h2>
      {timestamp && (
        <p style={{ fontSize: "14px", color: "#888" }}>更新时间：{new Date(timestamp).toLocaleTimeString()}</p>
      )}
      {renderTable("🟢 大盘币（市值 ≥ 10亿）", bigCaps)}
      {renderTable("🟠 小盘币（市值 < 10亿）", smallCaps)}
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px",
  borderBottom: "2px solid #ccc",
};

const td = {
  padding: "10px",
  borderBottom: "1px solid #eee",
};