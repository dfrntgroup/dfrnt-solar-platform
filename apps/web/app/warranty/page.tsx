import { Static } from "@/components/Static";
export const metadata = { title: "Warranty" };
export default function Page() {
  return (
    <Static eyebrow="Warranty" title="What's covered, and for how long.">
      <table className="lines"><tbody>
        <tr><td>Panels</td><td className="r">25-year product, 30-year performance (manufacturer)</td></tr>
        <tr><td>Inverters</td><td className="r">10 years (manufacturer)</td></tr>
        <tr><td>Batteries</td><td className="r">10 years, 70% capacity (manufacturer)</td></tr>
        <tr><td>Installation workmanship</td><td className="r">10 years (DFRNT Solar)</td></tr>
      </tbody></table>
      <p>If something stops working, tell us on your system page or <a href="/contact">here</a>. We deal with the manufacturer and the installer for you.</p>
      <p className="small muted">[placeholder — warranty terms pending legal review]</p>
    </Static>
  );
}
