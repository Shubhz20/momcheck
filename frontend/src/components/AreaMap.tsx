import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertOctagon, AlertTriangle, Check, Hospital, MapPinned } from "lucide-react";
import type { AreaMap as AreaMapData, Risk } from "../api/types";
import { Card, SectionHeader } from "./ui";

// Status colours (reserved meaning; always shown with an icon + label in the key and the tooltip)
const RISK: Record<Risk, { color: string; label: string }> = {
  high: { color: "#dc2626", label: "Danger sign: act now" },
  watch: { color: "#f59e0b", label: "Needs a visit" },
  normal: { color: "#059669", label: "Doing well" },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Her area: each mother as a pin coloured by risk, and the health centre and hospital she refers to. */
export function AreaMap({ data }: { data: AreaMapData }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ref.current || data.women.length === 0) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const points: L.LatLngExpression[] = [];
    for (const f of data.facilities) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:#0f766e;color:white;font:600 13px/1 Inter,system-ui;border:2px solid white;box-shadow:0 1px 4px rgb(0 0 0/.3)">${f.kind === "hospital" ? "H" : "+"}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([f.lat, f.lng], { icon, keyboard: false })
        .bindTooltip(`<b>${esc(f.name)}</b><br>${f.kind === "hospital" ? "Hospital for emergencies" : "Health centre"}`, { direction: "top" })
        .addTo(map);
      points.push([f.lat, f.lng]);
    }
    // Danger last, so red pins sit on top
    const order: Risk[] = ["normal", "watch", "high"];
    for (const risk of order) {
      for (const w of data.women.filter((x) => x.risk === risk)) {
        const m = L.circleMarker([w.lat, w.lng], {
          radius: risk === "high" ? 10 : 8,
          color: "#ffffff",
          weight: 2,
          fillColor: RISK[risk].color,
          fillOpacity: 1,
        })
          .bindTooltip(`<b>${esc(w.name)}</b><br>${esc(w.village)}<br>${RISK[risk].label}`, { direction: "top" })
          .addTo(map);
        m.on("click", () => navigate(`/women/${w.id}`));
        points.push([w.lat, w.lng]);
      }
    }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    return () => {
      map.remove();
    };
  }, [data, navigate]);

  if (data.women.length === 0) return null;
  const count = (r: Risk) => data.women.filter((w) => w.risk === r).length;

  return (
    <section>
      <SectionHeader title="Your area" subtitle="Tap a mother to open her profile" action={<MapPinned className="size-5 text-muted" />} />
      <Card className="overflow-hidden">
        <div ref={ref} className="h-72 w-full md:h-80" role="img" aria-label="Map of the mothers in your area and their risk" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <AlertOctagon className="size-3.5 text-red-600" /> {count("high")} danger sign
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-amber-500" /> {count("watch")} needs a visit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5 text-emerald-600" /> {count("normal")} doing well
          </span>
          {data.facilities.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Hospital className="size-3.5 text-brand-700" /> H hospital · + health centre
            </span>
          )}
          {data.unplaced > 0 && <span>{data.unplaced} without a location</span>}
        </div>
      </Card>
    </section>
  );
}
