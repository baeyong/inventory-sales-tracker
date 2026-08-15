import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Landing point for emailed auth links (password recovery, confirmations).
 * Supabase sends either a PKCE `code` or a `token_hash` + `type` pair
 * depending on the email template, so handle both. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only ever redirect to a path on this site — an attacker-supplied absolute
  // URL here would turn the login flow into an open redirect.
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/dashboard";

  const supabase = await createClient();
  let reason: string;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    reason = `code exchange failed: ${error.message}`;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    reason = `token verify failed: ${error.message}`;
  } else if (searchParams.get("error_description")) {
    // Supabase itself rejected the link before we ever saw it.
    reason = searchParams.get("error_description")!;
  } else {
    // Nothing usable arrived. Most often the email template is sending the
    // implicit flow, which puts tokens in the URL fragment — and fragments are
    // never sent to the server, so this handler sees an empty query string.
    reason =
      "the link carried no code or token — check the Supabase email template";
  }

  console.error(
    `[auth/callback] ${reason} · received params: [${[...searchParams.keys()].join(", ") || "none"}]`
  );

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      `That link didn't work (${reason}). Request a new one.`
    )}`
  );
}
