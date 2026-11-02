import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@dfrnt/db";
import { Header, Footer } from "@/components/Header";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";

type Row = { id: string; business_name: string; contact_name: string; saa_accreditation: string | null; licence_no: string | null; insurance_expiry: Date | null; ranges: string[]; completed: number; since: Date };

async function load(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db()`
    select i.id, i.business_name, i.contact_name, i.saa_accreditation, i.licence_no, i.insurance_expiry, i.created_at as since,
           array(select lower(x)::text || '–' || (upper(x) - 1)::text from unnest(i.postcode_ranges) x) as ranges,
           (select count(*)::int from quotes q where q.installer_id = i.id and q.status in ('installed','lodged','settled','complete')) as completed
    from installers i where i.id = ${id} and i.active and not i.is_test`;
  return (r as unknown as Row) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  return { title: r ? `${r.business_name}, DFRNT Solar installer` : "Installer" };
}

/** A16: public installer profile. Facts we hold and have checked; nothing invented. */
export default async function InstallerProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const r = await load((await params).id);
  if (!r) notFound();
  const postcode = await sitePostcode(await searchParams);
  const first = r.contact_name.split(" ")[0];
  const insured = r.insurance_expiry && new Date(r.insurance_expiry) > new Date();
  return (
    <>
      <Header postcode={postcode} back={`/installers/${r.id}`} />
      <section><div className="wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow">Your installer</p>
        <h1>{r.business_name}</h1>
        <p className="lead">{first} and the team install DFRNT Solar systems as our licensed subcontractor. We check their paperwork before they get a job, and again every time it renews.</p>
        <table className="incl"><tbody>
          <tr><td className="k">Electrical licence</td><td>{r.licence_no ? `${r.licence_no} · checked by us` : "Being checked"}</td></tr>
          <tr><td className="k">Accreditation</td><td>{r.saa_accreditation ? `SAA accredited · ${r.saa_accreditation}` : "Being checked"}</td></tr>
          <tr><td className="k">Insurance</td><td>{insured ? `Current public liability to ${new Date(r.insurance_expiry!).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}, checked by us` : "Being checked"}</td></tr>
          <tr><td className="k">Installs with us</td><td>{r.completed > 0 ? `${r.completed} completed` : "New to DFRNT Solar"}</td></tr>
          <tr><td className="k">Covers postcodes</td><td>{r.ranges.length ? r.ranges.map((x) => x.replace(/^(\d+)–\1$/, "$1")).join(", ") : "On request"}</td></tr>
          <tr><td className="k">Working with us since</td><td>{new Date(r.since).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</td></tr>
        </tbody></table>
        <div className="card mint" style={{ marginTop: 24 }}>
          <h3>Your installer prices the job before you pay.</h3>
          <p className="muted">{first} looks at your photos and confirms the price. If something on the day differs from the photos, you approve any change before work goes ahead.</p>
          <Link className="link" href="/how-it-works">How it works</Link>
        </div>
      </div></section>
      <Footer />
    </>
  );
}
