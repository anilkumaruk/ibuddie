import { useState, useEffect, useRef } from "react";
import {
  Home, BookOpen, Users, UserCog, Megaphone, Building2, Search, Bell, ChevronDown, Menu, X, LogOut,
  ExternalLink, RefreshCw, GraduationCap, TriangleAlert, Mail,
} from "lucide-react";
import { INK, INK_SOFT, TEXT, MUTED, BORDER, PAPER } from "./theme.js";
import { BrandLogo } from "./ui.jsx";

// Sidebar + top bar for the staff portal (layout from the approved dashboard design).

const SIDEBAR_WIDTH = 248;

function navItems(isAdmin) {
  return [
    { key: "overview", label: "Overview", icon: Home },
    { key: "classes", label: isAdmin ? "Classes" : "My Classes", icon: BookOpen },
    { key: "students", label: "Students", icon: Users },
    ...(isAdmin ? [{ key: "teachers", label: "Teachers", icon: UserCog }] : []),
    { key: "announcements", label: "Announcements", icon: Megaphone },
  ];
}

export function Sidebar({ data, page, onNavigate, open, onClose, isMobile }) {
  const isAdmin = data.role === "admin";
  const body = (
    <div style={{ width: SIDEBAR_WIDTH, height: "100%", background: "#FBFBFE", borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", padding: "20px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 22 }}>
        <BrandLogo size={24} />
        {isMobile && <X size={20} color={MUTED} style={{ cursor: "pointer" }} onClick={onClose} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: INK_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Building2 size={20} color={INK} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.college.name}</div>
          <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[data.college.city, isAdmin ? "College admin" : "Teacher"].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems(isAdmin).map((item) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => { onNavigate(item.key); if (isMobile) onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 11, border: "none", cursor: "pointer",
                fontSize: 14, fontWeight: active ? 600 : 500, fontFamily: "inherit", textAlign: "left",
                background: active ? "linear-gradient(135deg, #5B3FE0, #4A32C2)" : "transparent",
                color: active ? "#FFFFFF" : TEXT, boxShadow: active ? "0 6px 14px rgba(91,63,224,0.25)" : "none",
              }}
            >
              <item.icon size={18} /> {item.label}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <a href="/" target="_blank" rel="noreferrer" style={{ textDecoration: "none", background: PAPER, borderRadius: 14, padding: 14, display: "block" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, color: TEXT }}>
          <GraduationCap size={17} color={INK} /> Student app <ExternalLink size={13} color={MUTED} style={{ marginLeft: "auto" }} />
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 }}>See what your students see. They join classes from My College.</div>
      </a>
    </div>
  );

  if (!isMobile) return <div style={{ position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>{body}</div>;
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,16,60,0.35)", zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ height: "100%", width: SIDEBAR_WIDTH, boxShadow: "8px 0 24px rgba(20,16,60,0.15)" }}>{body}</div>
    </div>
  );
}

function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, active]);
}

const popover = {
  position: "absolute", top: "calc(100% + 8px)", background: "#FFFFFF", borderRadius: 14, border: `1px solid ${BORDER}`,
  boxShadow: "0 12px 32px rgba(20,16,60,0.14)", zIndex: 50, padding: 6,
};

function GlobalSearch({ data, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  useClickOutside(boxRef, () => setOpen(false), open);

  // ⌘K / Ctrl+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = q.trim().toLowerCase();
  const results = !query ? [] : [
    ...data.students.filter((s) => s.name.toLowerCase().includes(query) || (s.rollNo || "").toLowerCase().includes(query)).slice(0, 5)
      .map((s) => ({ kind: "student", id: s.uid, label: s.name, sub: s.rollNo ? `Roll ${s.rollNo}` : "Student" })),
    ...data.classes.filter((c) => c.name.toLowerCase().includes(query) || c.joinCode.toLowerCase().includes(query)).slice(0, 3)
      .map((c) => ({ kind: "class", id: c.id, label: c.name, sub: `${c.summary.students} students · ${c.exam}` })),
    ...(data.teachers || []).filter((t) => t.name.toLowerCase().includes(query) || (t.email || "").toLowerCase().includes(query)).slice(0, 3)
      .map((t) => ({ kind: "teacher", id: t.uid, label: t.name, sub: t.email || "Staff" })),
  ];
  const ICON = { student: Users, class: BookOpen, teacher: UserCog };

  function pick(r) {
    onPick(r);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={boxRef} style={{ position: "relative", flex: "1 1 320px", maxWidth: 520 }}>
      <Search size={16} color={MUTED} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0]);
          if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        }}
        placeholder="Search students, classes, teachers…"
        style={{ width: "100%", padding: "11px 56px 11px 40px", borderRadius: 12, border: `1px solid ${BORDER}`, background: "#FFFFFF", fontSize: 13.5, color: TEXT, fontFamily: "inherit" }}
      />
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: MUTED, background: PAPER, borderRadius: 6, padding: "2px 6px", pointerEvents: "none" }}>⌘ K</span>
      {open && query && (
        <div style={{ ...popover, left: 0, right: 0 }}>
          {results.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 13, color: MUTED }}>No matches for "{q}"</div>
          ) : results.map((r) => {
            const Icon = ICON[r.kind];
            return (
              <button key={`${r.kind}-${r.id}`} onClick={() => pick(r)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = PAPER; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <Icon size={16} color={INK} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: TEXT }}>{r.label}</span>
                  <span style={{ display: "block", fontSize: 12, color: MUTED }}>{r.sub}</span>
                </span>
                <span style={{ fontSize: 11, color: MUTED, textTransform: "capitalize" }}>{r.kind}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ attentionCount, inviteCount, onAttention, onInvites }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const items = [
    attentionCount > 0 && { icon: TriangleAlert, text: `${attentionCount} student${attentionCount > 1 ? "s" : ""} need${attentionCount > 1 ? "" : "s"} attention`, onClick: onAttention },
    inviteCount > 0 && { icon: Mail, text: `${inviteCount} invite${inviteCount > 1 ? "s" : ""} waiting to be accepted`, onClick: onInvites },
  ].filter(Boolean);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications" style={{ position: "relative", width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Bell size={18} color={TEXT} />
        {items.length > 0 && <span style={{ position: "absolute", top: 8, right: 9, width: 8, height: 8, borderRadius: "50%", background: "#E5484D", border: "2px solid #FFFFFF" }} />}
      </button>
      {open && (
        <div style={{ ...popover, right: 0, width: 280 }}>
          {items.length === 0 ? (
            <div style={{ padding: "12px", fontSize: 13, color: MUTED }}>You're all caught up.</div>
          ) : items.map((it) => (
            <button key={it.text} onClick={() => { it.onClick(); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: "none", background: "transparent", borderRadius: 10, cursor: "pointer", fontSize: 13, color: TEXT, textAlign: "left", fontFamily: "inherit" }}>
              <it.icon size={16} color={INK} /> {it.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, role, onSignOut, compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const name = user.displayName || user.email || "Staff";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "transparent", cursor: "pointer", padding: 4, fontFamily: "inherit" }}>
        {user.photoURL
          ? <img src={user.photoURL} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 38, height: 38, borderRadius: "50%", background: INK_SOFT, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{name[0].toUpperCase()}</div>}
        {!compact && (
          <span style={{ textAlign: "left" }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: TEXT, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ display: "block", fontSize: 12, color: MUTED }}>{role === "admin" ? "College Admin" : "Teacher"}</span>
          </span>
        )}
        <ChevronDown size={16} color={MUTED} />
      </button>
      {open && (
        <div style={{ ...popover, right: 0, width: 230 }}>
          {user.email && <div style={{ padding: "8px 12px 10px", fontSize: 12, color: MUTED, borderBottom: `1px solid ${BORDER}`, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>}
          <a href="/" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", fontSize: 13, color: TEXT, textDecoration: "none", borderRadius: 10 }}>
            <ExternalLink size={15} /> Open student app
          </a>
          <button onClick={onSignOut} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", fontSize: 13, color: "var(--ib-red, #B23B3B)", border: "none", background: "transparent", cursor: "pointer", borderRadius: 10, fontFamily: "inherit" }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ data, user, isMobile, onOpenMenu, onSearchPick, onRefresh, onSignOut, attentionCount, onAttention, onInvites }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(247,247,251,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BORDER}`, padding: isMobile ? "10px 12px" : "12px 28px", display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }}>
      {isMobile && (
        <button onClick={onOpenMenu} aria-label="Open menu" style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Menu size={18} color={TEXT} />
        </button>
      )}
      <GlobalSearch data={data} onPick={onSearchPick} />
      <div style={{ flex: 1 }} />
      {!isMobile && (
        <button onClick={onRefresh} aria-label="Refresh" title="Refresh data" style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RefreshCw size={17} color={TEXT} />
        </button>
      )}
      <NotificationBell attentionCount={attentionCount} inviteCount={data.invites.length} onAttention={onAttention} onInvites={onInvites} />
      <UserMenu user={user} role={data.role} onSignOut={onSignOut} compact={isMobile} />
    </div>
  );
}
