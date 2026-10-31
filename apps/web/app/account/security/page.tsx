import { AdminShell } from "@/components/Admin";
import { MfaEnrol } from "@/components/Mfa";
import { devAuth, requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function Security() {
  const me = await requireStaff();
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Two-factor sign-in</h1>
      {devAuth() ? <div className="note">Not available with the local dev sign-in.</div> : <MfaEnrol />}
    </AdminShell>
  );
}
