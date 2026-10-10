import { supabase } from "@/api/supabaseClient";

// Calls the `eventbrite` edge function with the signed-in user's session.
// Returns the JSON body, or throws an Error with a readable message.
export async function eventbriteCall(action, params = {}) {
  const { data, error } = await supabase.functions.invoke("eventbrite", { body: { action, ...params } });
  if (!error) return data;
  let message = "Something went wrong talking to Eventbrite. Try again.";
  try {
    const body = await error.context?.json?.();
    if (body?.error) message = body.error;
  } catch { /* keep the default */ }
  throw new Error(message);
}
