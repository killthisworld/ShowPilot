import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Copy, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManagerLinksPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [shareMenuLink, setShareMenuLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [generatingFor, setGeneratingFor] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) { setLoading(false); return; }
      const { data: reqs, error } = await supabase
        .from("tour_manager_requests")
        .select("*")
        .eq("engineer_user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) { console.error(error); setLoading(false); return; }

      const ids = (reqs || []).map((r) => r.id);
      let openersByRequest = {};
      if (ids.length > 0) {
        const { data: openers, error: openerError } = await supabase
          .from("opener_requests")
          .select("*")
          .in("tour_manager_request_id", ids)
          .order("order_index", { ascending: true });
        if (openerError) console.error(openerError);
        else {
          (openers || []).forEach((o) => {
            if (!openersByRequest[o.tour_manager_request_id]) openersByRequest[o.tour_manager_request_id] = [];
            openersByRequest[o.tour_manager_request_id].push(o);
          });
        }
      }

      setRequests((reqs || []).map((r) => ({ ...r, openers: openersByRequest[r.id] || [] })));
      setLoading(false);
    };
    init();
  }, []);

  const generateOpenerLink = async (request) => {
    if (!user) return;
    setGeneratingFor(request.id);
    try {
      const nextOrder = (request.openers?.length || 0) + 1;
      const { data, error } = await supabase
        .from("opener_requests")
        .insert({
          tour_manager_request_id: request.id,
          engineer_user_id: user.id,
          order_index: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;

      setRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, openers: [...r.openers, data] } : r)));

      const url = `${window.location.origin}/opener-intake?token=${data.invite_token}`;
      setShareMenuLink({ url, label: `Opener ${nextOrder} Link` });
    } catch (e) {
      console.error(e);
    }
    setGeneratingFor(null);
  };

  const handleConfirmedDelete = async () => {
    if (!confirmAction) return;
    setDeleting(true);
    try {
      if (confirmAction.type === "manager") {
        const { error } = await supabase.from("tour_manager_requests").delete().eq("id", confirmAction.target.id);
        if (error) throw error;
        setRequests((prev) => prev.filter((r) => r.id !== confirmAction.target.id));
      } else if (confirmAction.type === "opener") {
        const { error } = await supabase.from("opener_requests").delete().eq("id", confirmAction.target.opener.id);
        if (error) throw error;
        setRequests((prev) =>
          prev.map((r) =>
            r.id === confirmAction.target.requestId
              ? { ...r, openers: r.openers.filter((o) => o.id !== confirmAction.target.opener.id) }
              : r
          )
        );
      } else if (confirmAction.type === "all") {
        const ids = requests.map((r) => r.id);
        const { error } = await supabase.from("tour_manager_requests").delete().in("id", ids);
        if (error) throw error;
        setRequests([]);
      }
      setConfirmAction(null);
    } catch (e) {
      console.error(e);
    }
    setDeleting(false);
  };

  const handleCopy = () => {
    if (!shareMenuLink) return;
    navigator.clipboard.writeText(shareMenuLink.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShareMore = async () => {
    if (!shareMenuLink) return;
    const url = shareMenuLink.url;
    setShareMenuLink(null);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Import Link", url });
      } catch (e) {
        // user cancelled — nothing to do
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-10">
      {confirmAction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-semibold text-base mb-1">
              {confirmAction.type === "all" ? "Delete all manager links?" : confirmAction.type === "opener" ? "Delete this opener link?" : "Delete this manager link?"}
            </p>
            <p className="text-white/40 text-sm mb-4">
              {confirmAction.type === "all"
                ? "This removes every manager link and their opener links. No one will be able to access those URLs anymore."
                : confirmAction.type === "manager"
                ? "This also removes any opener links tied to it. No one will be able to access these URLs anymore."
                : "The other openers keep working — only this one loses access."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Cancel
              </Button>
              <Button onClick={handleConfirmedDelete} disabled={deleting} className="flex-1 bg-red-500 text-white hover:bg-red-600">
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {shareMenuLink && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-4 sm:pb-0" onClick={() => setShareMenuLink(null)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-2 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 pt-3 pb-2">
              <h3 className="text-white font-bold text-base">{shareMenuLink.label}</h3>
              <p className="text-white/40 text-xs mt-0.5">Share this with the opener. Their set info will be added to this gig once submitted.</p>
            </div>
            <button onClick={handleCopy} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-white/5 text-left">
              {copied ? <Check className="w-4 h-4 text-[#8CFF3D]" /> : <Copy className="w-4 h-4 text-[#8CFF3D]" />}
              <span className="text-white text-sm font-medium">{copied ? "Copied!" : "Copy Link"}</span>
            </button>
            {typeof navigator !== "undefined" && navigator.share && (
              <button onClick={handleShareMore} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-white/5 text-left">
                <Copy className="w-4 h-4 text-white/60" />
                <span className="text-white text-sm font-medium">More Options...</span>
              </button>
            )}
            <button onClick={() => setShareMenuLink(null)} className="w-full text-center py-3 mt-1 text-white/40 hover:text-white text-sm border-t border-[#2a2a2a]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between gap-3 px-4 py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/60 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-white">Manager Links</h1>
          </div>
          {requests.length > 0 && (
            <button onClick={() => setConfirmAction({ type: "all" })} className="text-red-400/70 hover:text-red-400 text-xs font-medium">
              Delete All
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        {requests.length === 0 ? (
          <p className="text-center text-white/40 py-16 text-sm">No manager links sent yet</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="bg-[#161616] rounded-2xl border border-[#222] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{r.band_name || "Pending"}</p>
                  <p className="text-white/40 text-xs">{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${r.status === "submitted" ? "bg-[#8CFF3D]/15 text-[#8CFF3D]" : "bg-white/10 text-white/40"}`}>
                    {r.status === "submitted" ? "Submitted" : "Pending"}
                  </span>
                  <button onClick={() => setConfirmAction({ type: "manager", target: r })} className="p-1 text-white/20 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {r.openers.length > 0 && (
                <div className="space-y-1.5 mt-2 mb-2">
                  {r.openers.map((o) => (
                    <div key={o.id} className="w-full flex items-center gap-2 bg-[#111] rounded-lg px-3 py-2">
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="text-white/70 text-xs truncate">Opener {o.order_index}{o.band_name ? ` — ${o.band_name}` : ""}</span>
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ml-2 ${o.status === "submitted" ? "bg-[#8CFF3D]/15 text-[#8CFF3D]" : "bg-white/10 text-white/40"}`}>
                          {o.status === "submitted" ? "Submitted" : "Pending"}
                        </span>
                      </div>
                      <button onClick={() => setConfirmAction({ type: "opener", target: { opener: o, requestId: r.id } })} className="p-1 text-white/20 hover:text-red-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={() => generateOpenerLink(r)}
                disabled={generatingFor === r.id}
                variant="outline"
                size="sm"
                className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D] mt-1"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {generatingFor === r.id ? "Generating..." : "Generate Opener Link"}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
