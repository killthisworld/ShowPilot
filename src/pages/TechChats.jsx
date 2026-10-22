import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import useIsDesktop from "@/hooks/useIsDesktop";
import CompanyChats from "@/components/showpilot/CompanyChats";
import CompanyChatsDesk from "@/components/showpilot/CompanyChatsDesk";
import BottomTabs from "@/components/showpilot/BottomTabs";
import { fetchMyIcons } from "@/lib/eventIcons";

// Chats for audio / lighting accounts (job 121): the same page the company
// phone layout has under its Chats tab. Every chat you're in across your
// events (newest first, unread on top, each on its event's photo), then your
// upcoming events' rooms. It needs your events (own + linked) for the photos
// and the rooms list, so it loads them the same way Home does.
const SHOW_FIELDS = "id, share_token, event_name, band_name, date, venue, icon_url, event_type";

export default function TechChats() {
  const { preferences } = usePreferences();
  const isDesktop = useIsDesktop();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [ownRes, linkRes, myIcons] = await Promise.all([
          supabase.from("shows").select(SHOW_FIELDS).eq("owner_id", user.id).eq("archived", false),
          supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
          fetchMyIcons().catch(() => ({})),
        ]);
        const linked = await Promise.all((linkRes.data || []).map(async ({ share_token }) => {
          const { data } = await supabase.rpc("get_shared_gig", { p_token: share_token });
          return data ? { ...data, share_token } : null;
        }));
        const all = [...(ownRes.data || []), ...linked.filter(Boolean)].map((g) => ({ ...g, icon_url: myIcons[g.id] || g.icon_url }));
        if (alive) setGigs(all);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Desktop: the company desktop Chats page as is (one screen, no page
  // scroll), beside the tech rail.
  if (isDesktop) {
    return (
      <>
        <CompanyChatsDesk preferences={preferences} gigs={gigs} gigsLoading={loading} />
        <BottomTabs />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-28">
      <CompanyChats preferences={preferences} gigs={gigs} gigsLoading={loading} />
      <BottomTabs />
    </div>
  );
}
