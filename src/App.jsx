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
        i += outcome ? 20 : 1;
      } else {
        i++;
      }
    }

    return { symbol, wins, losses, total, config };
  } catch {
    return { symbol, wins: 0, losses: 0, total: 0, config };
  }
}

export default function ShortTermBreakoutScanner() {
  // ...保持原样，无需修改
}

// ...保持页面渲染逻辑不变