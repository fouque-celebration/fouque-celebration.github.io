import nodemailer from "npm:nodemailer@6.9.16";

// Supabase Edge Functions block outbound ports 25/587, so Gmail is reached over implicit TLS on 465.
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const user = Deno.env.get("GMAIL_USER") || "eli.ws.kollman@gmail.com";
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    console.error("mail: GMAIL_USER / GMAIL_APP_PASSWORD not set");
    return false;
  }
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });
    await transport.sendMail({
      from: `"Celebrating Jean-Pierre Fouque" <${user}>`,
      replyTo: Deno.env.get("REPLY_TO") ?? "eli.ws.kollman@gmail.com",
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (e) {
    console.error("mail: send failed", e instanceof Error ? e.message : e);
    return false;
  }
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
