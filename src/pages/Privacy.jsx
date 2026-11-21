import React from "react";
import { Link } from "react-router-dom";

// The privacy policy (job 449, 2026-11-21): public at /privacy, no sign-in.
// Google needs it to publish Show Pilot's sign-in / Drive app (it must be on
// the same domain as the home page and say how Google user data is used).
// Keep it true to what the app does: when something here changes in the app
// (new connected service, payments, analytics), update this page too.
const UPDATED = "November 21, 2026";
const CONTACT = "showpilot.team@gmail.com";

function H({ children }) {
  return <h2 className="m-0 mt-9 mb-3 text-[19px] font-bold text-white">{children}</h2>;
}
function P({ children }) {
  return <p className="m-0 mb-3 text-[15.5px] leading-relaxed text-white/80">{children}</p>;
}
function L({ items }) {
  return (
    <ul className="m-0 mb-3 pl-5 flex flex-col gap-1.5 text-[15.5px] leading-relaxed text-white/80 list-disc">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <main className="max-w-[720px] mx-auto px-5 py-10 sm:py-14">
        <a href="https://get.showpilot.space" className="text-[13px] tracking-[0.14em] font-bold" style={{ color: "#8CFF3D" }}>SHOWPILOT</a>
        <h1 className="m-0 mt-4 text-[34px] leading-tight font-bold">Privacy policy</h1>
        <p className="m-0 mt-2 text-[14px] text-white/50">Last updated {UPDATED}</p>

        <P>
          <br />
          Show Pilot helps venues, artists, managers, audio engineers, lighting techs and DJs plan and run live events
          together. This page explains what information Show Pilot keeps, why, who can see it, and the choices you have.
          Show Pilot is run by Klean Studios. Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </P>

        <H>What we keep</H>
        <L items={[
          "Your account: your email address, the name you use, your profile type (venue, artist, engineer and so on), your profile photo and the details you add to your profile and digital card.",
          "Your work in Show Pilot: events, dates, lineups, set times, stage plots, input lists, riders, cue sheets, templates, booking packages and offers, tasks, notes, reminders and chats.",
          "Files you upload, such as photos, stage plots, riders, contracts and other documents.",
          "Details other people send you through Show Pilot links (for example an act filling in an intake form or a booking package), and contact details you add for people you work with.",
          "If you turn on lock-screen alerts, the push address your phone or browser gives us so we can send them.",
          "Basic technical records our hosting providers keep automatically, such as when a request was made and error logs, used to keep the service running and secure.",
        ]} />
        <P>Some things, such as personal reminders, saved offline copies and display preferences, stay on your own device and are not sent to us.</P>

        <H>How we use it</H>
        <L items={[
          "To run Show Pilot: show your events and work to you and to the people you share them with, keep everyone on an event up to date, and send the emails, links and alerts you ask for.",
          "To keep accounts and links secure and to fix problems.",
          "To answer you when you contact us.",
        ]} />
        <P>We do not sell your information, we do not show ads, and we do not use your information or your files to train AI models.</P>

        <H>Who can see it</H>
        <L items={[
          "People you work with in Show Pilot: what you put on an event is visible to the people on that event, and what you send with a link is visible to whoever has the link. Your public digital card is visible to anyone you share it with.",
          "Service providers that run Show Pilot for us: Supabase (database, sign-in and file storage), Vercel (hosting the website), our email delivery provider, and the browser push services that deliver alerts. They process data only to provide their service to us.",
          "Services you choose to connect, such as Google (sign-in and Google Drive) and Eventbrite: we exchange only what's needed for the feature you turned on.",
          "If the law requires it, or to protect the safety of people or the service.",
        ]} />

        <H>Google sign-in and Google Drive</H>
        <P>
          If you sign in with Google, Google shares your name, email address and profile picture with Show Pilot. We use
          them only to create and sign in to your account and to show your name and picture in the app.
        </P>
        <P>
          If you're a DJ and connect Google Drive, Show Pilot asks for the narrowest Drive permission Google offers
          (<span className="whitespace-nowrap">drive.file</span>). With it, Show Pilot can only see and change files and
          folders that Show Pilot itself creates in your Drive. It cannot see or open anything else in your Drive. We use
          it only to:
        </P>
        <L items={[
          "make a \"Show Pilot\" folder in your Drive, with a folder for each event and each act on your sets;",
          "let the artists you send a set link upload their audio files straight into those folders (the files go from their browser to Google, not through Show Pilot's servers);",
          "name the files in play order, and move a file to your Drive's bin when the artist removes it.",
        ]} />
        <P>
          To keep this working while you're away (artists often upload days after you send the link), we store the access
          Google gives us on our servers, where only Show Pilot's own back end can read it. It never reaches anyone's
          browser. We keep your Google email to show you which account is connected. We don't share Google user data with
          anyone, and we don't use it for anything other than the features above.
        </P>
        <P>
          You can disconnect at any time from the Drive icon in DJ mode: we cancel the access with Google and delete it
          from our servers. The files already in your Drive stay there and are yours. You can also remove Show Pilot's
          access from your Google Account settings.
        </P>
        <P>
          Show Pilot's use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements.
        </P>

        <H>How long we keep it</H>
        <P>
          We keep your information while your account is open, so your events and history are there when you need them.
          If you delete something, it's removed from Show Pilot. If you'd like your account and its information deleted,
          email us and we'll delete it, except for anything we have to keep by law. Information you shared with other
          people (for example details on an event that's on their calendar) may stay in their copy.
        </P>

        <H>Your choices</H>
        <L items={[
          "See and change your information in the app, or ask us for a copy.",
          "Turn alerts on or off in Settings, and disconnect Google Drive or Eventbrite at any time.",
          "Ask us to correct or delete your information by emailing us.",
        ]} />

        <H>Security</H>
        <P>
          Information travels over encrypted connections, access to it is limited by account, and links that share
          something use long random codes. No service is perfectly secure, so please keep your password private and only
          share links with people you trust.
        </P>

        <H>Children</H>
        <P>Show Pilot is for people 16 and older. We don't knowingly collect information from children.</P>

        <H>Changes</H>
        <P>If we change this policy, we'll update this page and the date at the top, and tell you in the app when the change matters.</P>

        <H>Contact</H>
        <P>Klean Studios · <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></P>

        <p className="m-0 mt-10 text-[13px] text-white/40">
          <a className="underline" href="https://get.showpilot.space">About Show Pilot</a>
          <span className="mx-2">·</span>
          <Link className="underline" to="/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
