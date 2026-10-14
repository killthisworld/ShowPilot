import React, { useEffect, useState } from "react";
import { User, Plus, X, ArrowLeftRight } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { savedAccounts, switchToAccount, addAnotherAccount, forgetAccount } from "@/lib/accounts";

// "Accounts" in the Settings drawer: the other accounts signed in on this
// device, one tap to switch (no password), plus Add another account. The
// current account is the profile card above, so it isn't repeated here.
export default function AccountSwitcher({ currentUserId }) {
  const [list, setList] = useState(() => savedAccounts());
  const [busy, setBusy] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refresh = () => setList(savedAccounts());
    window.addEventListener("showpilot:accounts", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("showpilot:accounts", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  const others = list.filter((a) => a.id !== currentUserId);

  const switchTo = async (a) => {
    setBusy(a.id);
    setMessage("");
    const r = await switchToAccount(a.id);
    if (!r.ok) {
      setBusy(null);
      setList(savedAccounts());
      // Its sign-in expired: sign in to it again (the current account stays saved).
      setMessage(`${a.name || a.email} needs its password again.`);
      if (r.email) setTimeout(() => { addAnotherAccount(r.email); }, 900);
    }
  };

  return (
    <div className="mb-4">
      <span className="block text-[9px] tracking-[0.14em] text-white/45 mb-1" style={{ fontFamily: SCENE_MONO }}>
        {others.length ? "SWITCH ACCOUNT" : "ACCOUNTS"}
      </span>
      <div className="rounded-lg border border-[#1f1f1f] bg-[#111] overflow-hidden divide-y divide-[#1c1c1c]">
        {others.map((a) => {
          const style = ACCOUNT_TYPE_STYLES[a.account_type] || ACCOUNT_TYPE_STYLES.engineer;
          const Icon = style.icon;
          const removing = confirmRemove === a.id;
          return (
            <div key={a.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <button type="button" onClick={() => switchTo(a)} disabled={!!busy} className="flex-1 min-w-0 flex items-center gap-2.5 text-left disabled:opacity-60" aria-label={`Switch to ${a.name || a.email}`}>
                <span className="w-9 h-9 rounded-full bg-[#1a1a1a] overflow-hidden flex items-center justify-center shrink-0" style={{ boxShadow: `0 0 0 1.5px ${style.color}` }}>
                  {a.photo ? <img src={a.photo} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-white/35" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-white leading-tight truncate">{a.name || a.email}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: style.color }}>
                    <Icon className="w-3 h-3" /> {style.label.toUpperCase()}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-[10px] tracking-[0.1em] text-[#8CFF3D] shrink-0" style={{ fontFamily: SCENE_MONO }}>
                  {busy === a.id ? "SWITCHING..." : <><ArrowLeftRight className="w-3.5 h-3.5" /> SWITCH</>}
                </span>
              </button>
              {removing ? (
                <span className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => { forgetAccount(a.id); setConfirmRemove(null); }} className="text-[11px] font-bold px-2 py-1 rounded-md" style={{ background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.5)", color: "#FF8A8A" }}>Remove</button>
                  <button type="button" onClick={() => setConfirmRemove(null)} className="text-[11px] text-white/50 hover:text-white">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(a.id)} aria-label={`Remove ${a.name || a.email} from this device`} className="p-1 text-white/30 hover:text-white/70 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => addAnotherAccount()} disabled={!!busy} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] disabled:opacity-60">
          <span className="w-9 h-9 rounded-full border border-dashed border-[#3a3a3a] flex items-center justify-center shrink-0"><Plus className="w-4 h-4 text-white/60" /></span>
          <span className="text-[14px] font-semibold text-white/80">Add another account</span>
        </button>
      </div>
      {others.length > 0 && <p className="mt-1.5 text-white/35 text-[11px] leading-snug">Switch without a password. Remove takes an account off this device only.</p>}
      {message && <p className="mt-1.5 text-[12px] text-[#F59E0B]">{message}</p>}
    </div>
  );
}
