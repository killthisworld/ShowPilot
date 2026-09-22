import re, sys

path = "src/pages/GigRooms.jsx"
with open(path) as f:
    content = f.read()

old = '''      const senderIds = [...new Set((data || []).map((m) => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: people } = await supabase
          .from("user_preferences")
          .select("user_id, display_name, profile_photo_url, card_share_token")
          .in("user_id", senderIds);
        const map = {};
        (people || []).forEach((p) => {
          map[p.user_id] = { displayName: p.display_name, photoUrl: p.profile_photo_url, cardToken: p.card_share_token };
        });
        if (!cancelled) setSenderProfiles((prev) => ({ ...prev, ...map }));
      }
    };
    loadMessages();

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeRoomId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          const senderId = payload.new.sender_id;
          setSenderProfiles((prev) => {
            if (prev[senderId]) return prev;
            supabase.from("user_preferences").select("display_name, profile_photo_url, card_share_token").eq("user_id", senderId).maybeSingle()
              .then(({ data }) => {
                if (data) {
                  setSenderProfiles((p) => ({
                    ...p,
                    [senderId]: { displayName: data.display_name, photoUrl: data.profile_photo_url, cardToken: data.card_share_token },
                  }));
                }
              });
            return prev;
          });
        }
      )
      .subscribe();'''

new = '''      // user_preferences is locked down to "view your own row only", so a
      // direct select here would silently return nothing for anyone else's
      // profile. get_conversation_member_profiles is a SECURITY DEFINER RPC
      // that checks you're actually a participant in this room and, if so,
      // returns the public card fields for everyone in it.
      const { data: people, error: peopleError } = await supabase.rpc(
        "get_conversation_member_profiles",
        { p_conversation_id: activeRoomId }
      );
      if (peopleError) { console.error(peopleError); return; }
      const map = {};
      (people || []).forEach((p) => {
        map[p.user_id] = { displayName: p.display_name, photoUrl: p.profile_photo_url, cardToken: p.card_share_token };
      });
      if (!cancelled) setSenderProfiles((prev) => ({ ...prev, ...map }));
    };
    loadMessages();

    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeRoomId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          const senderId = payload.new.sender_id;
          setSenderProfiles((prev) => {
            if (prev[senderId]) return prev;
            supabase.rpc("get_conversation_member_profiles", { p_conversation_id: activeRoomId })
              .then(({ data }) => {
                const map = {};
                (data || []).forEach((p) => {
                  map[p.user_id] = { displayName: p.display_name, photoUrl: p.profile_photo_url, cardToken: p.card_share_token };
                });
                setSenderProfiles((p) => ({ ...p, ...map }));
              });
            return prev;
          });
        }
      )
      .subscribe();'''

count = content.count(old)
if count != 1:
    print(f"ERROR: matched {count} times (expected 1) - aborting, no changes written.")
    sys.exit(1)

content = content.replace(old, new)
with open(path, "w") as f:
    f.write(content)
print("Patched successfully.")
