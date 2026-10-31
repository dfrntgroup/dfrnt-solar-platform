import { quote } from "@dfrnt/engine";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function Home() {
  const q = quote(
    { familyKey: "solax_x1vast", panelSku: "PNL-RISEN-475", panelCount: 21, batteryModules: 3, stacks: 1, backup: "none",
      phases: 1, postcode: "4551", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false,
      installDate: "2026-11-15", preferInverterSku: "INV-SOLAX-VAST-10K", inverterMeterIntegration: true },
    { asOf: "2026-11-01" },
  );
  const s = q.stack;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <p style={{ letterSpacing: 2, fontSize: 12, color: "#526669" }}>DFRNT SOLAR · BUILD PREVIEW</p>
      <h1 style={{ fontSize: 40, margin: "8px 0 24px" }}>One price. <span style={{ color: "#008e89" }}>Installed.</span></h1>
      <p>{q.config.summary}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <tbody>
          {[
            ["Hardware", s.hardware_ex_gst], ["Installation", s.installation_ex_gst], ["System price ex GST", s.price_ex_gst],
            ["GST", s.gst], ["Total inc GST", s.price_inc_gst], ["Less assignment of STCs", -s.less_stcs], ["You pay", s.amount_payable],
          ].map(([k, v]) => (
            <tr key={k as string} style={{ borderTop: "1px solid #dce6e3" }}>
              <td style={{ padding: "10px 0" }}>{k}</td>
              <td style={{ padding: "10px 0", textAlign: "right", fontWeight: k === "You pay" ? 700 : 400 }}>{aud(v as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#526669", marginTop: 24 }}>
        Live from the pricing engine · rules {q.versions.rules} · rebate locked to {q.window.lock_until}
      </p>
    </main>
  );
}
