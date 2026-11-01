import Link from "next/link";
import { SELLER } from "@/lib/legal";
import { getSetting } from "@/lib/settings";
import { publishedReviews, MIN_FOR_AVERAGE } from "@/lib/reviews";

/** C4: proof where the decision is made. Only shows facts that are filled in (Ops → Settings); nothing is assumed. */
export async function Trust({ installer }: { installer?: { business_name: string; licence_no: string | null; saa_accreditation: string | null } | null }) {
  const t = await getSetting("trust");
  const rv = await publishedReviews(1).catch(() => ({ count: 0, average: null, rows: [] }));
  const rows: [string, React.ReactNode][] = [];
  if (installer) rows.push(["Installer", <>{installer.business_name}{installer.licence_no ? ` · electrical licence ${installer.licence_no}` : ""}{installer.saa_accreditation ? ` · SAA ${installer.saa_accreditation}` : ""}</>]);
  else rows.push(["Installer", "A licensed electrician with Solar Accreditation Australia accreditation, named before you pay"]);
  if (t.licence) rows.push(["Licence", t.licence]);
  if (t.accreditations) rows.push(["Accreditation", t.accreditations]);
  if (t.insurance) rows.push(["Insurance", t.insurance]);
  rows.push(["Business", `${SELLER.name}, trading as ${SELLER.trading} · ABN ${SELLER.abn}`]);
  rows.push(["Your money", "10 business days to cancel for any reason, full refund"]);
  if (rv.count >= MIN_FOR_AVERAGE && rv.average) rows.push(["Reviews", <><Link href="/reviews">{rv.average} out of 5 from {rv.count} customers</Link></>]);
  return (
    <div className="card" style={{ marginTop: 14, padding: 14 }}>
      <strong>Who you&apos;re buying from</strong>
      {t.founder_line && <span className="small muted">{t.founder_line} <Link href="/about">Our story</Link></span>}
      {t.founder_video && <a className="link small" href={t.founder_video} target="_blank" rel="noreferrer">Watch: why we started DFRNT Solar</a>}
      <table className="incl" style={{ marginTop: 6 }}><tbody>{rows.map(([k, v]) => <tr key={k}><td className="k">{k}</td><td className="small">{v}</td></tr>)}</tbody></table>
      <p className="small" style={{ margin: "6px 0 0" }}><Link href="/installs">Real installs</Link> · <Link href="/reviews">Reviews</Link> · <a href={`tel:${SELLER.phone.replace(/\s/g, "")}`}>{SELLER.phone}</a></p>
    </div>
  );
}
