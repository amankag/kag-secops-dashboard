import { useState, useMemo, useContext, createContext, useEffect, useCallback } from "react";

// Point this at your FastAPI backend. Change if you deploy it somewhere else.
const API_BASE = "http://localhost:8000";

const InfoContext = createContext({ openInfo: null, setOpenInfo: () => {} });

const C = {
  bg: "#0f1120", sidebar: "#14172b", card: "#1b1f38", cardHover: "#232a52",
  border: "#282d52", text: "#e8eaf6", muted: "#8b8fb3",
  purple: "#7c5cbf", purpleLight: "#a78bfa", teal: "#14b8a6", tealLight: "#5eead4",
  red: "#ef4444", redLight: "#fca5a5", yellow: "#f59e0b", yellowLight: "#fcd34d",
  green: "#10b981", greenLight: "#6ee7b7",
};

// Your Get-InactiveUsers.ps1 CSV may name this column differently (e.g.
// LastSignInDateTime). This tries a few likely names before falling back to
// a generic label, so nothing breaks if the exact header differs -- just
// add your real column name to this list if needed.
function describeInactivity(u) {
  return u.DaysInactive || u.LastSignInDateTime || u.LastSignIn || u.Status || "Inactive 30+ days";
}

// Admin/service accounts often have no Department set in Entra ID. Without
// this, a user like that would be counted in overall totals but invisible
// in every per-department view (radar, chart, breakdowns), making those
// numbers look wrong even though the underlying math was fine.
function getDept(u) {
  return (u.Department && String(u.Department).trim()) || "Unassigned";
}

const INFO = {
  score: "A composite score out of 100. MFA coverage is worth up to 50 points, license coverage up to 30, and service health up to 20.",
  mfa: "Users who have not registered a multi factor authentication method in Microsoft Entra ID.",
  inactive: "Users who have never signed in to the tenant, based on Microsoft Graph sign in activity.",
  licensed: "Users currently assigned at least one Microsoft 365 license.",
  topdept: "The department with the highest count for the currently selected chart metric, compared side by side across MFA gaps, inactivity and licensing.",
  health: "Live status of core Microsoft 365 services, pulled from the Microsoft Graph service health API.",
  mfacov: "Percentage of all users with MFA enabled, measured against a 100% target.",
  licusage: "Percentage of all users holding an assigned Microsoft 365 license.",
  mfadeptradar: "Percentage of MFA enabled users within each department, useful for spotting which teams lag behind.",
  inactivityrate: "Percentage of all users who have never signed in, broken down by department.",
  atrisk: "Users combining two risk factors at once: no MFA registered and no sign in activity ever recorded. A single missing control is a gap, both together mean a compromised account could go unnoticed.",
};

function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

// Closed smooth curve through the radar points, so departments sitting at 0%
// blend into a rounded blob shape instead of a sharp spike straight to the
// center like a plain straight-line polygon would produce.
function smoothClosedPath(pts) {
  if (pts.length < 3) return "";
  const n = pts.length;
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  d.push("Z");
  return d.join(" ");
}

function scoreColor(score) {
  if (score < 40) return C.red;
  if (score < 70) return C.yellow;
  return C.green;
}

function Ring({ pct, color, size = 70, label, sub, strokeWidth = 7 }) {
  const r = (size / 2) - strokeWidth - 3, circ = 2 * Math.PI * r, cxy = size / 2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={C.border} strokeWidth={strokeWidth} />
        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
          strokeLinecap="round" transform={`rotate(-90 ${cxy} ${cxy})`} style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x={cxy} y={cxy + size * 0.05} textAnchor="middle" fill={color} fontSize={size * 0.2} fontWeight="700">{pct}%</text>
      </svg>
      {label && (
        <div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
        </div>
      )}
    </div>
  );
}

const ICONS = {
  home: <path d="M3 10.5L12 4l9 6.5M5 9.5V19h5v-5h4v5h5V9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  bell: <path d="M12 3a5 5 0 00-5 5v3.5L5 15h14l-2-3.5V8a5 5 0 00-5-5zM9.5 18a2.5 2.5 0 005 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  people: <path d="M8 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16.5 8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM15 14c2.5.3 4 1.8 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  logout: <path d="M9 21H4V3h5M16 17l5-5-5-5M20 12H9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  search: <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  refresh: <path d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.5 3.5M19.5 9A8 8 0 005 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
};

function NavIcon({ children, active, label, onClick, badge }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      title={label} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", width: 40, height: 40, borderRadius: 10, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: active ? `linear-gradient(135deg, ${C.purple}, ${C.teal})` : hover ? C.cardHover : "transparent",
        color: active ? "#fff" : C.muted, cursor: "pointer", transition: "all .2s ease", marginBottom: 6,
      }}
    >
      {children}
      {badge > 0 && (
        <div style={{
          position: "absolute", top: -2, right: -2, background: C.red, color: "#fff", fontSize: 9,
          fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15, display: "flex",
          alignItems: "center", justifyContent: "center", padding: "0 3px",
        }}>{badge}</div>
      )}
    </div>
  );
}

function SearchableList({ items, fields, renderRow, placeholder }) {
  const [q, setQ] = useState("");
  const filtered = q ? items.filter((it) => fields.some((f) => String(it[f] || "").toLowerCase().includes(q.toLowerCase()))) : items;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px", marginBottom: 10 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" style={{ color: C.muted, flexShrink: 0 }}>{ICONS.search}</svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || "Search"}
          style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12, width: "100%" }} />
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{filtered.length} of {items.length}</div>
      {filtered.map(renderRow)}
      {filtered.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: "10px 0" }}>No matches.</div>}
    </div>
  );
}

// A small "i" icon. Clicking toggles a text popover and never bubbles up to
// whatever card or overlay it sits inside, so it never triggers expand/close.
function InfoIcon({ text, id, style }) {
  const { openInfo, setOpenInfo } = useContext(InfoContext);
  const open = openInfo === id;
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        onClick={(e) => { e.stopPropagation(); setOpenInfo(open ? null : id); }}
        title="What is this?"
        style={{
          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, fontStyle: "italic", cursor: "pointer",
          color: open ? "#fff" : C.muted, background: open ? C.purple : "transparent",
          border: `1px solid ${open ? C.purple : C.border}`, transition: "all .15s ease",
        }}
      >i</div>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 24, right: 0, width: 230, background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 10, fontSize: 11, color: C.text, lineHeight: 1.5, zIndex: 40, boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        }}>{text}</div>
      )}
    </div>
  );
}

// Shared uniform overlay used both by card expansion and by chart point
// clicks. Closes only via the close button or a click on the backdrop.
function ExpandOverlay({ isOpen, onClose, accent, title, subtitle, infoText, id, children }) {
  if (!isOpen) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(6,7,15,0.7)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        perspective: "1200px", animation: "kagFade .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 560px)", maxHeight: "74vh", background: C.card,
          border: `1px solid ${accent || C.purple}`, borderRadius: 16, padding: 22,
          display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,.55)",
          animation: "kagFlip .35s cubic-bezier(.2,.8,.3,1)", transformStyle: "preserve-3d",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {infoText && <InfoIcon text={infoText} id={id} />}
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function ExpandableCard({ id, expandedId, onExpand, onClose, accent, style = {}, title, subtitle, children, expandedChildren, plain }) {
  const [hover, setHover] = useState(false);
  const isOpen = expandedId === id;
  const { background: customBg, ...layoutStyle } = style;

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onClick={() => onExpand(id)}
        style={{ position: "relative", height: "100%", cursor: "pointer", ...layoutStyle }}
      >
        {/* Clipped shell: background, border and the center out glow all live
            here so nothing can render past the card's own rounded corners. */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14, overflow: "hidden",
          background: customBg || (hover ? C.cardHover : (plain ? "transparent" : C.card)),
          border: plain ? "none" : `1px solid ${hover ? accent || C.purple : C.border}`,
          transform: hover ? "scale(1.02)" : "scale(1)", transition: "all .18s ease",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: `radial-gradient(circle at 50% 50%, ${accent || C.purple}45 0%, transparent 68%)`,
            opacity: hover ? 1 : 0, transform: hover ? "scale(1)" : "scale(0.2)",
            transition: "opacity .4s ease, transform .55s cubic-bezier(.2,.8,.3,1)",
          }} />
        </div>
        {/* Unclipped layer: the info icon and its popover sit here, free to
            overflow the card bounds if the text needs more room. */}
        <InfoIcon text={INFO[id]} id={id} style={{ position: "absolute", top: plain ? 2 : 10, right: plain ? 2 : 10, zIndex: 2 }} />
        <div style={{ position: "relative", padding: plain ? "10px 8px" : 18, paddingRight: plain ? 20 : 26 }}>{children}</div>
      </div>

      <ExpandOverlay isOpen={isOpen} onClose={onClose} accent={accent} title={title} subtitle={subtitle} infoText={INFO[id]} id={id}>
        {expandedChildren}
      </ExpandOverlay>
    </>
  );
}

// Clickable bars. Clicking a row reveals exactly which people or items make
// up that count, so numbers like "2 of 3" are never ambiguous about who they
// refer to. Reused for department breakdowns, the security score, and the
// chart's per department detail overlay.
function BreakdownBars({ rows, color }) {
  const [selected, setSelected] = useState(null);
  return (
    <div>
      {rows.map((r, i) => {
        const barColor = r.color || color;
        const pct = r.total > 0 ? (r.count / r.total) * 100 : 0;
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div onClick={() => setSelected(selected === r.label ? null : r.label)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{r.label}</span><span style={{ color: barColor, fontWeight: 700 }}>{r.count} of {r.total}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .3s ease" }} />
              </div>
              {r.detail && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{r.detail}</div>}
            </div>
            {selected === r.label && (
              <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${barColor}` }}>
                {(!r.users || r.users.length === 0)
                  ? <div style={{ fontSize: 11, color: C.muted, padding: "3px 0" }}>{r.emptyText || "Nothing to show here."}</div>
                  : r.users.map((u, j) => (
                    <div key={j} style={{ fontSize: 11, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                      <span>{u.name}</span><span style={{ color: barColor }}>{u.status}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const btnBase = {
  height: 30, padding: "0 14px", borderRadius: 8, fontSize: 11, cursor: "pointer",
  display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
};

const rowStyle = { fontSize: 12, padding: "7px 0", display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.border}` };

export default function App() {
  const [view, setView] = useState("overview");
  const [metric, setMetric] = useState("mfa");
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [readIds, setReadIds] = useState(new Set());
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [openInfo, setOpenInfo] = useState(null);

  // Live data from the FastAPI backend, replacing the sample arrays used
  // during design review.
  const [mfaUsers, setMfaUsers] = useState([]);
  const [licenseUsers, setLicenseUsers] = useState([]);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    const [mfaRes, licRes, inactRes, healthRes] = await Promise.all([
      fetch(`${API_BASE}/api/mfa-status`),
      fetch(`${API_BASE}/api/license-report`),
      fetch(`${API_BASE}/api/inactive-users`),
      fetch(`${API_BASE}/api/service-health`),
    ]);
    if (!mfaRes.ok || !licRes.ok || !inactRes.ok || !healthRes.ok) {
      throw new Error("The backend rejected one of the API calls. Is uvicorn running on port 8000?");
    }
    const [mfa, lic, inact, health] = await Promise.all([mfaRes.json(), licRes.json(), inactRes.json(), healthRes.json()]);
    setMfaUsers(mfa.users || []);
    setLicenseUsers(lic.users || []);
    setInactiveUsers(inact.users || []);
    setServices(health.services || []);
    setLastUpdated(new Date());
    setError(null);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await fetchAll();
    } catch (e) {
      setError(e.message || "Could not reach the backend.");
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Re-runs every PowerShell script on the backend, then re-fetches.
      await fetch(`${API_BASE}/api/refresh`, { method: "POST" });
      await fetchAll();
    } catch (e) {
      setError(e.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    loadInitial();
    // Keep notifications and every metric reasonably current without
    // requiring a manual click. Adjust the interval to taste.
    const interval = setInterval(handleRefresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => setExpandedId(null);

  const depts = useMemo(() => [...new Set(mfaUsers.map(getDept))], [mfaUsers]);
  const deptLookup = useMemo(() => Object.fromEntries(mfaUsers.map((u) => [u.DisplayName, getDept(u)])), [mfaUsers]);

  const chartData = useMemo(() => depts.map((d) => {
    let value = 0;
    if (metric === "mfa") value = mfaUsers.filter((u) => getDept(u) === d && u.MFAStatus === "Not Registered").length;
    if (metric === "inactive") value = inactiveUsers.filter((u) => deptLookup[u.DisplayName] === d).length;
    if (metric === "licensed") value = licenseUsers.filter((u) => deptLookup[u.DisplayName] === d && u.LicenseStatus === "Licensed").length;
    return { label: d, value };
  }), [metric, depts, deptLookup, mfaUsers, inactiveUsers, licenseUsers]);

  const total = mfaUsers.length;
  const enabled = mfaUsers.filter((u) => u.MFAStatus === "Enabled").length;
  const notRegisteredUsers = mfaUsers.filter((u) => u.MFAStatus === "Not Registered");
  const notRegistered = notRegisteredUsers.length;
  const coveragePercent = total ? Math.round((enabled / total) * 100) : 0;
  const licensedUsers = licenseUsers.filter((u) => u.LicenseStatus === "Licensed");
  const licensed = licensedUsers.length;
  const licensePercent = total ? Math.round((licensed / total) * 100) : 0;
  const inactiveTotal = inactiveUsers.length;
  const inactivePercent = total ? Math.round((inactiveTotal / total) * 100) : 0;
  const degraded = services.filter((s) => s.status !== "serviceOperational").length;

  const atRiskUsers = notRegisteredUsers.filter((u) => inactiveUsers.some((i) => i.DisplayName === u.DisplayName));
  const atRiskPercent = total ? Math.round((atRiskUsers.length / total) * 100) : 0;

  const mfaPoints = (coveragePercent / 100) * 50;
  const licensePoints = (licensePercent / 100) * 30;
  const healthPoints = Math.max(20 - degraded * 7, 0);
  const securityScore = Math.round(mfaPoints + licensePoints + healthPoints);
  const scColor = scoreColor(securityScore);

  const W = 560, H = 170, PAD = 30;
  const max = Math.max(...chartData.map((d) => d.value), 1);
  const points = chartData.map((d, i) => ({
    x: PAD + (i * (W - PAD * 2)) / (chartData.length - 1 || 1),
    y: H - PAD - (d.value / max) * (H - PAD * 2), ...d,
  }));
  const linePath = smoothPath(points);
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z` : "";
  const gridLines = [0, 0.5, 1].map((f) => ({ y: H - PAD - f * (H - PAD * 2), val: Math.round(max * f) }));

  const radarSize = 220, rPad = 46, cx = radarSize / 2, cy = radarSize / 2, rMax = radarSize / 2 - rPad;
  const radarVals = depts.map((d) => {
    const users = mfaUsers.filter((u) => getDept(u) === d);
    const en = users.filter((u) => u.MFAStatus === "Enabled").length;
    return users.length ? Math.round((en / users.length) * 100) : 0;
  });
  const angleStep = depts.length ? (2 * Math.PI) / depts.length : 0;
  const buildRadarCoords = (size, r) => depts.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const rr = (radarVals[i] / 100) * r;
    return { x: size / 2 + rr * Math.cos(angle), y: size / 2 + rr * Math.sin(angle) };
  });

  const downloadCSV = () => {
    const rows = ["Department,Value"].concat(chartData.map((d) => `${d.label},${d.value}`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kag-secops-${metric}-by-department.csv`; a.click();
  };

  const topDept = chartData.length ? [...chartData].sort((a, b) => b.value - a.value)[0] : { label: "—", value: 0 };

  const notifications = [
    notRegistered > 0 && { icon: "🔒", color: C.redLight, text: `${notRegistered} users have not registered MFA`, sub: "Security, action needed" },
    inactiveTotal > 0 && { icon: "⏳", color: C.yellowLight, text: `${inactiveTotal} users inactive 30+ days`, sub: "Identity lifecycle" },
    degraded > 0 && { icon: "⚠️", color: C.yellow, text: `${degraded} services degraded (${services.filter(s => s.status !== "serviceOperational").map(s => s.service).join(", ")})`, sub: "Service health" },
    (total - licensed) > 0 && { icon: "📄", color: C.tealLight, text: `${total - licensed} users unlicensed`, sub: "Licensing" },
  ].filter(Boolean);
  const unreadCount = notifications.filter((_, i) => !readIds.has(i)).length;
  const markRead = (i) => setReadIds((prev) => new Set(prev).add(i));

  const combinedUsers = mfaUsers.map((u) => ({
    name: u.DisplayName, dept: u.Department, mfa: u.MFAStatus,
    license: licenseUsers.find((l) => l.DisplayName === u.DisplayName)?.LicenseStatus,
    inactive: inactiveUsers.some((i) => i.DisplayName === u.DisplayName),
  })).filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || (u.dept || "").toLowerCase().includes(search.toLowerCase()));

  const deptTable = depts.map((d) => ({
    dept: d,
    mfaGaps: mfaUsers.filter((u) => getDept(u) === d && u.MFAStatus === "Not Registered").length,
    inactive: inactiveUsers.filter((u) => deptLookup[u.DisplayName] === d).length,
    licensed: licenseUsers.filter((u) => deptLookup[u.DisplayName] === d && u.LicenseStatus === "Licensed").length,
    size: mfaUsers.filter((u) => getDept(u) === d).length,
  }));

  const radarDeptRows = depts.map((d) => {
    const users = mfaUsers.filter((u) => getDept(u) === d);
    return {
      label: d, count: users.filter((u) => u.MFAStatus === "Enabled").length, total: users.length,
      users: users.map((u) => ({ name: u.DisplayName, status: u.MFAStatus })),
    };
  });
  const inactivityDeptRows = depts.map((d) => {
    const deptInactive = inactiveUsers.filter((u) => deptLookup[u.DisplayName] === d);
    const size = deptTable.find((dt) => dt.dept === d)?.size || 0;
    return { label: d, count: deptInactive.length, total: size, users: deptInactive.map((u) => ({ name: u.DisplayName, status: describeInactivity(u) })) };
  });
  const atRiskDeptRows = depts.map((d) => {
    const deptAtRisk = atRiskUsers.filter((u) => getDept(u) === d);
    const size = deptTable.find((dt) => dt.dept === d)?.size || 0;
    return { label: d, count: deptAtRisk.length, total: size, users: deptAtRisk.map((u) => ({ name: u.DisplayName, status: "No MFA, inactive" })) };
  });

  const scoreRows = [
    { label: "MFA coverage", count: Math.round(mfaPoints), total: 50, color: C.purpleLight,
      detail: `${coveragePercent}% of users enrolled`,
      users: notRegisteredUsers.map((u) => ({ name: u.DisplayName, status: "No MFA" })), emptyText: "Everyone has MFA enrolled." },
    { label: "License coverage", count: Math.round(licensePoints), total: 30, color: C.tealLight,
      detail: `${licensePercent}% of users licensed`,
      users: licenseUsers.filter((u) => u.LicenseStatus !== "Licensed").map((u) => ({ name: u.DisplayName, status: "Unlicensed" })), emptyText: "Everyone is licensed." },
    { label: "Service health", count: Math.round(healthPoints), total: 20, color: degraded === 0 ? C.green : C.yellow,
      detail: `${degraded} of ${services.length} services degraded`,
      users: services.filter((s) => s.status !== "serviceOperational").map((s) => ({ name: s.service, status: s.status === "serviceDegradation" ? "Degraded" : "Outage" })), emptyText: "All services operational." },
  ];

  // Chart point click opens a shared overlay, driven by expandedId prefixed
  // "point-" so it never collides with the fixed card ids above.
  const openPointLabel = expandedId && expandedId.startsWith("point-") ? expandedId.slice(6) : null;
  const openPointDept = deptTable.find((d) => d.dept === openPointLabel);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg, color: C.muted, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14 }}>
        Loading live tenant data...
      </div>
    );
  }

  return (
    <InfoContext.Provider value={{ openInfo, setOpenInfo }}>
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      <style>{`
        @keyframes kagFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kagFlip { from { opacity: 0; transform: rotateY(75deg) scale(.94) } to { opacity: 1; transform: rotateY(0deg) scale(1) } }
        @keyframes kagSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ width: 68, background: C.sidebar, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", borderRight: `1px solid ${C.border}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.purple}, ${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, marginBottom: 28 }}>KAG</div>
        <NavIcon active={view === "overview"} label="Overview" onClick={() => setView("overview")}><svg width="18" height="18" viewBox="0 0 24 24">{ICONS.home}</svg></NavIcon>
        <NavIcon active={view === "notifications"} label="Notifications" onClick={() => setView("notifications")} badge={unreadCount}><svg width="18" height="18" viewBox="0 0 24 24">{ICONS.bell}</svg></NavIcon>
        <NavIcon active={view === "directory"} label="Employee directory" onClick={() => setView("directory")}><svg width="18" height="18" viewBox="0 0 24 24">{ICONS.people}</svg></NavIcon>
        <div style={{ flex: 1 }} />
        <NavIcon label="Sign out"><svg width="18" height="18" viewBox="0 0 24 24">{ICONS.logout}</svg></NavIcon>
      </div>

      {view === "notifications" && (
        <div style={{ flex: 1, padding: "24px 28px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Notifications</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>{unreadCount} unread. Click one to mark it as seen.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
            {notifications.map((n, i) => {
              const isRead = readIds.has(i);
              return (
                <div key={i} onClick={() => markRead(i)} style={{
                  background: isRead ? C.bg : C.card, border: `1px solid ${isRead ? C.border : n.color}`,
                  borderRadius: 14, padding: 16, cursor: "pointer", opacity: isRead ? 0.55 : 1, transition: "all .2s ease",
                }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 18, filter: isRead ? "grayscale(1)" : "none" }}>{n.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isRead ? C.muted : C.text }}>{n.text}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{n.sub}{isRead ? " · seen" : ""}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {notifications.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No alerts, everything looks healthy.</div>}
          </div>
        </div>
      )}

      {view === "directory" && (
        <div style={{ flex: 1, padding: "24px 28px" }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Employee directory</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{combinedUsers.length} of {total} users shown</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 16, maxWidth: 340 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" style={{ color: C.muted }}>{ICONS.search}</svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or department"
              style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12, width: "100%" }} />
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1.3fr 1.3fr 1.3fr", padding: "10px 16px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${C.border}` }}>
              <div>Name</div><div>Department</div><div>MFA</div><div>License</div><div>Activity</div>
            </div>
            {combinedUsers.map((u, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1.3fr 1.3fr 1.3fr", padding: "10px 16px", fontSize: 12, borderBottom: i < combinedUsers.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div>{u.name}</div><div style={{ color: C.muted }}>{u.dept}</div>
                <div style={{ color: u.mfa === "Enabled" ? C.greenLight : C.redLight }}>{u.mfa}</div>
                <div style={{ color: u.license === "Licensed" ? C.tealLight : C.muted }}>{u.license}</div>
                <div style={{ color: u.inactive ? C.yellowLight : C.greenLight }}>{u.inactive ? "Never signed in" : "Active"}</div>
              </div>
            ))}
            {combinedUsers.length === 0 && <div style={{ padding: 16, fontSize: 12, color: C.muted }}>No users match.</div>}
          </div>
        </div>
      )}

      {view === "overview" && (
        <div style={{ flex: 1, padding: "24px 28px" }}>
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>KAG SecOps Dashboard</div>
              <div style={{ fontSize: 12, color: C.muted }}>Real time visibility into the KAGSecOps tenant, straight from Microsoft Graph</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {lastUpdated && <span style={{ fontSize: 11, color: C.muted }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              <button onClick={handleRefresh} disabled={refreshing} style={{
                ...btnBase, background: "transparent", border: `1px solid ${C.border}`, color: C.text,
                opacity: refreshing ? 0.6 : 1, cursor: refreshing ? "default" : "pointer",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" style={{ animation: refreshing ? "kagSpin 1s linear infinite" : "none" }}>{ICONS.refresh}</svg>
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: C.redLight }}>{error}</span>
              <button onClick={loadInitial} style={{ ...btnBase, background: C.red, border: "none", color: "#fff", flexShrink: 0 }}>Retry</button>
            </div>
          )}

          {total === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
              No user data yet. Make sure the FastAPI backend is running on {API_BASE} and the PowerShell scripts have produced their CSV reports.
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gridTemplateRows: "auto auto auto", gap: 20 }}>
            <div style={{ gridColumn: 1, gridRow: 1, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 14 }}>
              <ExpandableCard id="score" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={scColor}
                style={{ background: `linear-gradient(135deg, ${scColor}22, ${C.card})` }}
                title="Security score breakdown" subtitle="How each factor contributes to the overall score"
                expandedChildren={
                  <div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: scColor, marginBottom: 16 }}>{securityScore}<span style={{ fontSize: 16, color: C.muted }}> / 100</span></div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Click a factor to see who or what</div>
                    <BreakdownBars rows={scoreRows} />
                  </div>
                }
              >
                <div style={{ fontSize: 34, fontWeight: 800, color: scColor }}>{securityScore}</div>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Security Score</div>
                <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", background: C.border }}>
                  <div style={{ width: `${mfaPoints}%`, background: C.purpleLight }} />
                  <div style={{ width: `${licensePoints}%`, background: C.tealLight }} />
                  <div style={{ width: `${healthPoints}%`, background: degraded === 0 ? C.green : C.yellow }} />
                </div>
              </ExpandableCard>

              <ExpandableCard id="mfa" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.redLight}
                title="Users without MFA" subtitle={`${notRegistered} of ${total} users need to register`}
                expandedChildren={
                  <SearchableList items={notRegisteredUsers} fields={["DisplayName", "Department"]} placeholder="Search by name or department"
                    renderRow={(u, i) => <div key={i} style={rowStyle}><span>{u.DisplayName}</span><span style={{ color: C.muted }}>{u.Department}</span></div>} />
                }
              >
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>MFA Gaps</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.redLight }}>{notRegistered}</div>
                <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>▲ needs action</div>
              </ExpandableCard>

              <ExpandableCard id="inactive" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.yellowLight}
                title="Inactive users" subtitle={`${inactiveTotal} users have never signed in`}
                expandedChildren={
                  <SearchableList items={inactiveUsers} fields={["DisplayName", "Department"]} placeholder="Search by name or department"
                    renderRow={(u, i) => <div key={i} style={rowStyle}><span>{u.DisplayName}</span><span style={{ color: C.muted }}>{u.Department}</span></div>} />
                }
              >
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Inactive Users</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.yellowLight }}>{inactiveTotal}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>never signed in</div>
              </ExpandableCard>

              <ExpandableCard id="licensed" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.tealLight}
                title="Licensed users" subtitle={`${licensed} of ${total} users hold a license`}
                expandedChildren={
                  <SearchableList items={licenseUsers} fields={["DisplayName", "LicenseStatus"]} placeholder="Search by name or status"
                    renderRow={(u, i) => <div key={i} style={rowStyle}><span>{u.DisplayName}</span><span style={{ color: u.LicenseStatus === "Licensed" ? C.tealLight : C.muted }}>{u.LicenseStatus}</span></div>} />
                }
              >
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Licensed</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.tealLight }}>{licensed}</div>
                <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>▼ {total - licensed} unlicensed</div>
              </ExpandableCard>
            </div>

            <div style={{ gridColumn: 2, gridRow: "1 / 4", display: "flex", flexDirection: "column", gap: 20 }}>
              <ExpandableCard id="mfadeptradar" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.tealLight}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
                title="MFA coverage by department" subtitle="Percentage of MFA enabled users, department by department"
                expandedChildren={
                  <div>
                    {depts.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                        <svg width="260" height="260" viewBox="0 0 260 260">
                          {[0.33, 0.66, 1].map((f, i) => (
                            <circle key={i} cx={130} cy={130} r={90 * f} fill="none" stroke={C.border} strokeWidth="1" />
                          ))}
                          {depts.map((d, i) => {
                            const angle = i * angleStep - Math.PI / 2;
                            const lx = 130 + 112 * Math.cos(angle), ly = 130 + 112 * Math.sin(angle);
                            return (
                              <g key={d}>
                                <line x1={130} y1={130} x2={130 + 90 * Math.cos(angle)} y2={130 + 90 * Math.sin(angle)} stroke={C.border} strokeWidth="1" />
                                <text x={lx} y={ly} textAnchor="middle" fontSize="11" fill={C.muted}>{d}</text>
                              </g>
                            );
                          })}
                          <path d={smoothClosedPath(buildRadarCoords(260, 90))} fill={C.teal} fillOpacity="0.25" stroke={C.tealLight} strokeWidth="2.5" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>By department, click to see who</div>
                    <BreakdownBars rows={radarDeptRows} color={C.tealLight} />
                  </div>
                }
              >
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>MFA coverage by department</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Percent of users with MFA enabled</div>
                {depts.length > 0 ? (
                  <div style={{ maxWidth: 220, margin: "0 auto" }}>
                    <svg width="100%" viewBox={`0 0 ${radarSize} ${radarSize}`}>
                      {[0.33, 0.66, 1].map((f, i) => (
                        <circle key={i} cx={cx} cy={cy} r={rMax * f} fill="none" stroke={C.border} strokeWidth="1" />
                      ))}
                      {depts.map((d, i) => {
                        const angle = i * angleStep - Math.PI / 2;
                        const x = cx + rMax * Math.cos(angle), y = cy + rMax * Math.sin(angle);
                        const lx = cx + (rMax + 22) * Math.cos(angle), ly = cy + (rMax + 22) * Math.sin(angle);
                        return (
                          <g key={d}>
                            <line x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth="1" />
                            <text x={lx} y={ly} textAnchor="middle" fontSize="9" fill={C.muted}>{d}</text>
                            <text x={lx} y={ly + 11} textAnchor="middle" fontSize="8" fill={C.tealLight}>{radarVals[i]}%</text>
                          </g>
                        );
                      })}
                      <path d={smoothClosedPath(buildRadarCoords(radarSize, rMax))} fill={C.teal} fillOpacity="0.25" stroke={C.tealLight} strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.muted }}>No department data on the MFA report yet.</div>
                )}
              </ExpandableCard>

              <div style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Statistics</div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>Click a metric for the full breakdown</div>

                <ExpandableCard id="inactivityrate" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.yellowLight} plain
                  title="Inactivity breakdown" subtitle={`${inactiveTotal} of ${total} users have never signed in`}
                  style={{ marginBottom: 8 }}
                  expandedChildren={
                    <div>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                        <Ring pct={inactivePercent} color={C.yellowLight} size={140} strokeWidth={11} />
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>By department, click to see who</div>
                      <BreakdownBars rows={inactivityDeptRows} color={C.yellowLight} />
                    </div>
                  }
                >
                  <Ring pct={inactivePercent} color={C.yellowLight} label="Inactivity Rate" sub={`${inactiveTotal} never signed in`} />
                </ExpandableCard>

                <ExpandableCard id="atrisk" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.redLight} plain
                  title="Compounded risk" subtitle={`${atRiskUsers.length} users have no MFA and have never signed in`}
                  expandedChildren={
                    <div>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                        <Ring pct={atRiskPercent} color={C.redLight} size={140} strokeWidth={11} />
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>By department, click to see who</div>
                      <BreakdownBars rows={atRiskDeptRows} color={C.redLight} />
                    </div>
                  }
                >
                  <Ring pct={atRiskPercent} color={C.redLight} label="At Risk Users" sub={`${atRiskUsers.length} with no MFA, never signed in`} />
                </ExpandableCard>
              </div>
            </div>

            <div style={{ gridColumn: 1, gridRow: 2, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Users by department</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Grouped from live MFA, license and inactivity reports. Hover or click a point for detail.</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
                    {["mfa", "inactive", "licensed"].map((m) => (
                      <button key={m} onClick={() => setMetric(m)} style={{
                        ...btnBase, background: metric === m ? C.purple : "transparent",
                        color: metric === m ? "#fff" : C.muted, border: "none",
                      }}>{m === "mfa" ? "MFA Gaps" : m === "inactive" ? "Inactive" : "Licensed"}</button>
                    ))}
                  </div>
                  <button onClick={downloadCSV} style={{ ...btnBase, background: "transparent", border: `1px solid ${C.border}`, color: C.text }}>⬇ CSV</button>
                </div>
              </div>
              {depts.length > 0 ? (
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.purple} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={C.purple} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {gridLines.map((g, i) => (
                    <g key={i}>
                      <line x1={PAD} y1={g.y} x2={W - PAD + 10} y2={g.y} stroke={C.border} strokeWidth="1" strokeDasharray="3 4" />
                      <text x={4} y={g.y + 3} fontSize="9" fill={C.muted}>{g.val}</text>
                    </g>
                  ))}
                  <path d={areaPath} fill="url(#areaFill)" />
                  <path d={linePath} fill="none" stroke={C.purpleLight}
                    strokeWidth={hoveredPoint !== null ? 3.2 : 2.5} style={{ transition: "stroke-width .15s ease" }} />
                  {points.map((p, i) => {
                    const isHover = hoveredPoint === i;
                    return (
                      <g key={i}>
                        {/* generous invisible hit target, much easier to hover/click than the visible dot */}
                        <circle cx={p.x} cy={p.y} r={14} fill="transparent" style={{ cursor: "pointer" }}
                          onMouseEnter={() => setHoveredPoint(i)} onMouseLeave={() => setHoveredPoint(null)}
                          onClick={() => setExpandedId(`point-${p.label}`)} />
                        <circle cx={p.x} cy={p.y} r={4} fill={isHover ? C.purpleLight : C.bg} stroke={C.purpleLight}
                          strokeWidth={isHover ? 3 : 2} pointerEvents="none"
                          style={{
                            transformOrigin: `${p.x}px ${p.y}px`, transform: isHover ? "scale(1.7)" : "scale(1)",
                            transition: "transform .15s ease, fill .15s ease",
                            filter: isHover ? `drop-shadow(0 0 6px ${C.purpleLight})` : "none",
                          }} />
                        <text x={p.x} y={p.y - (isHover ? 14 : 10)} textAnchor="middle" fontSize={isHover ? 12 : 10}
                          fontWeight="700" fill={isHover ? "#fff" : C.purpleLight} pointerEvents="none"
                          style={{ transition: "all .15s ease" }}>{p.value}</text>
                        <text x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill={isHover ? C.text : C.muted} pointerEvents="none">{p.label}</text>
                      </g>
                    );
                  })}
                </svg>
              ) : (
                <div style={{ fontSize: 12, color: C.muted, padding: "24px 0" }}>No department data available yet.</div>
              )}
            </div>

            <div style={{ gridColumn: 1, gridRow: 3, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <ExpandableCard id="topdept" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.purpleLight}
                title="Departments compared" subtitle="MFA gaps, inactivity and licensing side by side"
                expandedChildren={
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", fontSize: 10, color: C.muted, textTransform: "uppercase", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                      <div>Department</div><div>MFA gaps</div><div>Inactive</div><div>Licensed</div>
                    </div>
                    {deptTable.map((d, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", fontSize: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>{d.dept} <span style={{ color: C.muted, fontSize: 10 }}>({d.size})</span></div>
                        <div style={{ color: C.redLight }}>{d.mfaGaps}</div>
                        <div style={{ color: C.yellowLight }}>{d.inactive}</div>
                        <div style={{ color: C.tealLight }}>{d.licensed}</div>
                      </div>
                    ))}
                  </div>
                }
              >
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>TOP DEPARTMENT</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{topDept.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{topDept.value} flagged</div>
              </ExpandableCard>

              <ExpandableCard id="health" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={degraded ? C.yellowLight : C.greenLight}
                title="Service health" subtitle={`${degraded} of ${services.length} services degraded`}
                expandedChildren={
                  <SearchableList items={services} fields={["service"]} placeholder="Search by service name"
                    renderRow={(s, i) => {
                      const op = s.status === "serviceOperational", deg = s.status === "serviceDegradation";
                      const color = op ? C.green : deg ? C.yellow : C.red;
                      return <div key={i} style={rowStyle}><span>{s.service}</span><span style={{ color }}>{op ? "Operational" : deg ? "Degraded" : "Outage"}</span></div>;
                    }} />
                }
              >
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>SERVICE HEALTH</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: degraded ? C.yellowLight : C.greenLight }}>{degraded} degraded</div>
                <div style={{ fontSize: 11, color: C.muted }}>of {services.length} checked</div>
              </ExpandableCard>

              <ExpandableCard id="mfacov" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.redLight}
                title="MFA status, all users" subtitle={`${coveragePercent}% coverage, target 100%`}
                expandedChildren={
                  <SearchableList items={mfaUsers} fields={["DisplayName", "Department"]} placeholder="Search by name or department"
                    renderRow={(u, i) => <div key={i} style={rowStyle}><span>{u.DisplayName}</span><span style={{ color: u.MFAStatus === "Enabled" ? C.greenLight : C.redLight }}>{u.MFAStatus}</span></div>} />
                }
              >
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>MFA COVERAGE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.redLight }}>{coveragePercent}%</div>
                <div style={{ fontSize: 11, color: C.muted }}>target 100%</div>
              </ExpandableCard>

              <ExpandableCard id="licusage" expandedId={expandedId} onExpand={setExpandedId} onClose={close} accent={C.tealLight}
                title="License status, all users" subtitle={`${licensed} of ${total} licensed`}
                expandedChildren={
                  <SearchableList items={licenseUsers} fields={["DisplayName", "LicenseStatus"]} placeholder="Search by name or status"
                    renderRow={(u, i) => <div key={i} style={rowStyle}><span>{u.DisplayName}</span><span style={{ color: u.LicenseStatus === "Licensed" ? C.tealLight : C.muted }}>{u.LicenseStatus}</span></div>} />
                }
              >
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>LICENSE USAGE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.tealLight }}>{licensePercent}%</div>
                <div style={{ fontSize: 11, color: C.muted }}>{licensed} of {total}</div>
              </ExpandableCard>
            </div>
          </div>
          )}

          <ExpandOverlay isOpen={!!openPointLabel} onClose={close} accent={C.purpleLight}
            title={`${openPointLabel} breakdown`} subtitle="Click a bar to see who">
            {openPointDept && (
              <BreakdownBars rows={[
                {
                  label: "MFA gaps", count: openPointDept.mfaGaps, total: openPointDept.size, color: C.redLight,
                  users: mfaUsers.filter((u) => getDept(u) === openPointLabel && u.MFAStatus === "Not Registered").map((u) => ({ name: u.DisplayName, status: "No MFA" })),
                  emptyText: "Everyone here has MFA enrolled.",
                },
                {
                  label: "Inactive users", count: openPointDept.inactive, total: openPointDept.size, color: C.yellowLight,
                  users: inactiveUsers.filter((u) => deptLookup[u.DisplayName] === openPointLabel).map((u) => ({ name: u.DisplayName, status: describeInactivity(u) })),
                  emptyText: "Everyone here has signed in recently.",
                },
                {
                  label: "Licensed users", count: openPointDept.licensed, total: openPointDept.size, color: C.tealLight,
                  users: licenseUsers.filter((u) => deptLookup[u.DisplayName] === openPointLabel && u.LicenseStatus === "Licensed").map((u) => ({ name: u.DisplayName, status: "Licensed" })),
                  emptyText: "No one here is licensed yet.",
                },
              ]} />
            )}
          </ExpandOverlay>
        </div>
      )}
    </div>
    </InfoContext.Provider>
  );
}
