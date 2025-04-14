import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">🚀 超短线突破信号筛选器（实时，每5秒更新）</h2>
      <p className="text-sm text-muted-foreground mb-2">更新时间：{new Date(timestamp).toLocaleTimeString()}</p>
      <Card className="shadow-xl">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>币种</TableHead>
                <TableHead>涨幅(24h)</TableHead>
                <TableHead>5分钟涨幅</TableHead>
                <TableHead>当前价格</TableHead>
                <TableHead>成交额(USDT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topBreakouts.map((item) => (
                <TableRow key={item.symbol}>
                  <TableCell>{item.symbol}</TableCell>
                  <TableCell className="text-green-600 font-medium">{item.change.toFixed(2)}%</TableCell>
                  <TableCell>{item.change5m}%</TableCell>
                  <TableCell>{item.lastPrice.toFixed(4)}</TableCell>
                  <TableCell>{(item.volume / 1_000_000).toFixed(2)}M</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
