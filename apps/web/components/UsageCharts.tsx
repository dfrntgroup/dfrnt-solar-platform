// S3: two small average-day charts (summer, winter): what the home uses each half-hour vs what the recommended panels make.
import { seasonDay, type UsageProfile, type YieldCity } from "@dfrnt/engine";

function Day({ title, use, pv }: { title: string; use: number[]; pv: number[] }) {
  const W = 300, H = 120, pad = 18;
  const max = Math.max(0.2, ...use, ...pv) * 1.1;
  const x = (i: number) => pad + (i / 47) * (W - pad - 4);
  const y = (v: number) => H - 16 - (v / max) * (H - 30);
  const bw = (W - pad - 4) / 48 - 1;
  const pvPath = pv.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const useDay = use.reduce((s, v) => s + v, 0), pvDay = pv.reduce((s, v) => s + v, 0);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="small" style={{ fontWeight: 700 }}>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}: uses ${useDay.toFixed(1)} kWh, new panels make ${pvDay.toFixed(1)} kWh`}>
        {use.map((v, i) => <rect key={i} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, H - 16 - y(v))} fill="var(--ink, #111)" opacity={0.75} />)}
        {pvDay > 0 && <path d={pvPath} fill="none" stroke="var(--teal, #0a8f86)" strokeWidth={2.5} />}
        <line x1={pad} x2={W - 4} y1={H - 16} y2={H - 16} stroke="#999" strokeWidth={1} />
        {[0, 6, 12, 18, 24].map((h) => <text key={h} x={x(Math.min(47, h * 2))} y={H - 3} fontSize={9} textAnchor="middle" fill="#666">{h === 0 ? "12am" : h === 12 ? "12pm" : h === 24 ? "12am" : h < 12 ? `${h}am` : `${h - 12}pm`}</text>)}
      </svg>
      <div className="small muted">Uses {useDay.toFixed(1)} kWh{pvDay > 0 ? ` · new panels make ${pvDay.toFixed(1)} kWh` : ""}</div>
    </figure>
  );
}

export function UsageCharts({ profile, panelKw, loc }: { profile: UsageProfile; panelKw: number; loc: YieldCity }) {
  const s = seasonDay(profile, "summer", panelKw, loc), w = seasonDay(profile, "winter", panelKw, loc);
  if (!s.has && !w.has) return null;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {s.has && <Day title="Average summer day" use={s.use} pv={s.pv} />}
        {w.has && <Day title="Average winter day" use={w.use} pv={w.pv} />}
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Bars: power your home took from the grid each half-hour. {panelKw > 0 ? "Line: what the recommended panels would make." : ""}</p>
    </div>
  );
}
