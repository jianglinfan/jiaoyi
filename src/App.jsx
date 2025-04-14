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

async function backtest(symbol, config = { macdWeight: 20, trendWeight: 20, percentThreshold: 0.3, percentWeight: 10, scoreThreshold: 50, tpRate: 0.01, slRate: 0.015 }) {
  try {
    const res = await fetch(`${BINANCE_KLINE_API}?symbol=${symbol}&interval=1m&limit=1000`);
    const data = await res.json();
    let wins = 0;
    let losses = 0;
    let total = 0;
    let i = 50;

    const results = [];

    while (i < data.length - 1) {
      const window = data.slice(i - 50, i);
      const closes = window.map(k => parseFloat(k[4]));
      const macd = calculateMACD(closes);
      const macdPositive = macd.macdLine.at(-1) > macd.signalLine.at(-1);
      const trendUp = closes.at(-1) > closes[0];
      const percent = (closes.at(-1) - closes.at(-2)) / closes.at(-2) * 100;

      const score = (trendUp ? config.trendWeight : 0) +
                    (macdPositive ? config.macdWeight : 0) +
                    (percent > config.percentThreshold ? config.percentWeight : 0);

      if (score >= config.scoreThreshold) {
        total++;
        const entry = parseFloat(data[i][4]);
        const tp = entry * (1 + config.tpRate);
        const sl = entry * (1 - config.slRate);
        let outcome = null;

        for (let j = i + 1; j < Math.min(i + 21, data.length); j++) {
          const price = parseFloat(data[j][4]);
          if (price >= tp) {
            wins++;
            outcome = 'win';
            break;
          } else if (price <= sl) {
            losses++;
            outcome = 'loss';
            break;
          }
        }
        results.push({ index: i, score, outcome: outcome || 'unknown', entry, tp, sl });
        i += outcome ? 20 : 1;
      } else {
        i++;
      }
    }

    return { symbol, wins, losses, total, config, results };
  } catch {
    return { symbol, wins: 0, losses: 0, total: 0, config, results: [] };
  }
}

export default function ShortTermBreakoutScanner() {
  const [tickers, setTickers] = useState([]);
  const [timestamp, setTimestamp] = useState(null);
  const [scored, setScored] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(BINANCE_TICKER_API);
        const data = await res.json();
        const list = data
          .filter(item => item.symbol.endsWith("USDT") && !item.symbol.includes("UP") && !item.symbol.includes("DOWN"))
          .map(item => ({
            symbol: item.symbol,
            change: parseFloat(item.priceChangePercent),
            volume: parseFloat(item.quoteVolume),
            lastPrice: parseFloat(item.lastPrice),
          }))
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 20);

        setTickers(list);
        setTimestamp(Date.now());

        const scoredList = await Promise.all(
          list.map(async (item) => {
            try {
              const res = await fetch(`${BINANCE_KLINE_API}?symbol=${item.symbol}&interval=1m&limit=100`);
              const kline = await res.json();
              const closes = kline.map(k => parseFloat(k[4]));
              const macd = calculateMACD(closes);
              const macdPositive = macd.macdLine.at(-1) > macd.signalLine.at(-1);
              const trendUp = closes.at(-1) > closes[0];
              const percent = (closes.at(-1) - closes.at(-2)) / closes.at(-2) * 100;
              const score = (trendUp ? 20 : 0) + (macdPositive ? 20 : 0) + (percent > 0.3 ? 10 : 0);
              return { ...item, macd: macdPositive ? "金叉" : "死叉", trend: trendUp ? "上升" : "震荡", score: score, percent1m: percent.toFixed(2) };
            } catch {
              return { ...item, macd: "-", trend: "-", score: 0, percent1m: "-" };
            }
          })
        );

        setScored(scoredList.sort((a, b) => b.score - a.score));
      } catch (err) {
        console.error("Failed to fetch ticker data", err);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "1rem" }}>🔥 热度榜 & 策略信号打分（Top 20 币种）</h2>
      {timestamp && (
        <p style={{ fontSize: "14px", color: "#888" }}>
          更新时间：{new Date(timestamp).toLocaleTimeString()}
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr style={{ backgroundColor: "#f0f0f0" }}>
            <th style={th}>币种</th>
            <th style={th}>涨幅</th>
            <th style={th}>成交额 (USDT)</th>
            <th style={th}>最新价格</th>
            <th style={th}>趋势</th>
            <th style={th}>MACD</th>
            <th style={th}>1m涨幅</th>
            <th style={th}>得分</th>
          </tr>
        </thead>
        <tbody>
          {scored.map(t => (
            <tr key={t.symbol}>
              <td style={td}>{t.symbol}</td>
              <td style={{ ...td, color: t.change > 0 ? "green" : "red" }}>{t.change.toFixed(2)}%</td>
              <td style={td}>{(t.volume / 1_000_000).toFixed(2)}M</td>
              <td style={td}>{t.lastPrice}</td>
              <td style={{ ...td, color: t.trend === "上升" ? "green" : "#888" }}>{t.trend}</td>
              <td style={td}>{t.macd}</td>
              <td style={td}>{t.percent1m}%</td>
              <td style={{ ...td, fontWeight: "bold", color: t.score >= 50 ? "green" : t.score >= 30 ? "orange" : "#888" }}>{t.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
