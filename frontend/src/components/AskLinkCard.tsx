import { useEffect, useState } from "react";
import { Copy, ExternalLink, MessageCircleHeart, RefreshCw, Share2 } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "./Toast";
import { Button, Card, SectionHeader } from "./ui";

/**
 * Her personal "Ask MomCheck" link: she opens it on her phone (or scans the QR printed on her card)
 * and talks to MomCheck whenever she's worried. What she says reaches her ASHA.
 */
export function AskLinkCard({ beneficiaryId, name, initialToken }: { beneficiaryId: number; name: string; initialToken: string | null }) {
  const toast = useToast();
  const [token, setToken] = useState(initialToken);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The public address mothers use (a deployment behind another host can set window.__PUBLIC_ORIGIN)
  const origin = (window as unknown as { __PUBLIC_ORIGIN?: string }).__PUBLIC_ORIGIN || window.location.origin;
  const url = token ? `${origin}/m/${token}` : null;
  const first = name.split(" ")[0];

  useEffect(() => {
    if (!url) return setQr(null);
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { margin: 1, width: 320, color: { dark: "#134e4a", light: "#ffffff" } }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const make = async (rotate = false) => {
    if (rotate && !window.confirm(`Make a new link for ${first}? The old link will stop working.`)) return;
    setBusy(true);
    try {
      const r = await api.askLink(beneficiaryId, rotate);
      setToken(r.token);
      if (rotate) toast.success("New link made");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy her link:", url);
    }
  };

  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`${first}, if you are worried about your health or your baby, talk to MomCheck in your language any time: ${url}`)}`
    : "#";

  return (
    <section>
      <SectionHeader title="Her Ask MomCheck link" subtitle="She can talk to MomCheck any time" />
      <Card className="p-4">
        {!token ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">
              Give {first} her own link. When she's worried she opens it on her phone and asks MomCheck in her language. Danger signs reach you
              straight away.
            </p>
            <Button onClick={() => void make()} loading={busy} icon={<MessageCircleHeart className="size-4" />}>
              Make her link
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {qr && <img src={qr} alt={`QR code for ${first}'s Ask MomCheck link`} className="size-36 shrink-0 rounded-xl ring-1 ring-line" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Print the QR on her card or send the link. It works in any phone browser, no app.</p>
              <p className="mt-2 truncate rounded-lg bg-stone-50 px-2.5 py-1.5 font-mono text-xs text-ink">{url}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void copy()} icon={<Copy className="size-3.5" />}>
                  Copy
                </Button>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-stone-50"
                >
                  <Share2 className="size-3.5" /> WhatsApp
                </a>
                <a
                  href={url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-stone-50"
                >
                  <ExternalLink className="size-3.5" /> Open as {first}
                </a>
                <Button variant="ghost" size="sm" onClick={() => void make(true)} loading={busy} icon={<RefreshCw className="size-3.5" />}>
                  New link
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
