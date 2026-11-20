# get.showpilot.space tour (job 341): edit the profile and feature lists below, then run
# python3 scripts/build-site-tour.py site/index.html site/index.html
# Builds site/index.html for get.showpilot.space (job 341) from one list of
# profiles and their feature screens. Run: python3 gen_site.py <out.html>
import sys, html

E = html.escape
SHOT = {  # name -> (width, height)
    'event-web': (1600, 1000), 'event-web-phone': (600, 1298), 'tasks': (1600, 1000), 'tasks-phone': (600, 1298),
    'rooms': (1600, 1000), 'rooms-phone': (600, 1298), 'calendar': (1600, 1000), 'tech-home': (600, 1298), 'dayof-sheet': (600, 1298), 'logbook': (600, 1298), 'pilot-card': (600, 1298), 'book-act': (1600, 1000), 'book-rider': (1600, 1000), 'console': (1600, 1000), 'lighting-desk': (1600, 1000), 'wallets': (1600, 1000),
    'my-pilot': (1600, 1000), 'lighting-phone': (600, 1298),
    'load-template-phone': (600, 1298), 'calendar-phone': (600, 1298), 'book-act-phone': (600, 1298), 'wallets-phone': (600, 1298), 'book-rider-phone': (600, 1298), 'logbook-desk': (1600, 1000),
    # job 359
    'stage-plot-open': (1600, 1000), 'stage-plot-open-phone': (600, 1298), 'pkg-web': (1600, 1000), 'pkg-confirm': (1600, 1000),
    'pkg-confirm-phone': (600, 1298), 'ask-tech': (1600, 1000), 'ask-tech-phone': (600, 1298), 'venue-web': (1600, 1000),
    'venue-web-phone': (600, 1298), 'dayof-sheet-desk': (1600, 1000), 'dayof-contacts': (600, 1298), 'intake-send': (1600, 1000),
    'intake-send-phone': (600, 1298), 'intake-form': (1600, 1000), 'intake-form-phone': (600, 1298), 'my-template': (1600, 1000),
    'event-load': (1600, 1000),
    # job 374
    'mgmt-home': (1600, 1000), 'mgmt-home-phone': (600, 1298), 'acts-templates': (1600, 1000), 'acts-calendar': (1600, 1000),
    'acts-templates-phone': (600, 1298), 'acts-calendar-phone': (600, 1298), 'djmode': (1600, 1000), 'djmode-phone': (600, 1298),
    # job 375
    # job 408
    'rig-pool': (1600, 1000), 'rig-build': (1600, 1000), 'rig-cues': (1600, 1000), 'rig-build-phone': (600, 1298), 'rig-cues-phone': (600, 1298),
    'book-template': (1600, 1000), 'book-template-phone': (600, 1298), 'djmode-set': (1600, 1000), 'djmode-upload': (1600, 1000), 'djmode-upload-phone': (600, 1298),
}

# Each feature: key, title, line, desktop shot(s), phone shot(s), alt text.
# Several desktop shots show as steps, cascaded, each named on its window bar
# as (shot, step label).
F = {
  'web': ('One page per event', 'Every profile around the show, and how ready each one is.', 'event-web', ['event-web-phone'], 'The event web: the event in the middle with Venue, Artist / Mgmt and Audio / Lights around it, the board with the set list pinned and the run of show, and the flight log.'),
  'pkgin': ('Packages in, dates and techs', 'An artist or manager sends a package. Confirm a date, then ask a tech you trust.', [('pkg-web', '1 · Their package comes in'), ('pkg-confirm', '2 · Confirm a date'), ('ask-tech', '3 · Ask a tech')], ['pkg-confirm-phone', 'ask-tech-phone'], 'A booking package from an artist manager, the three dates they want with one picked to confirm, and Ask a tech with the techs you have worked with.'),
  'loadvenue': ('Your venue as a web', 'Your room filled in once, every section a circle. It fills each event, and acts and techs can open it.', 'venue-web', ['venue-web-phone'], 'The Foundry Hall as a web: venue and address, load-in, schedule, Wi-Fi and power, house gear and hospitality, with House gear open.'),
  'tasks': ('Tasks with due dates', "Hand out what needs doing, and see who has it and when it's due.", 'tasks', ['tasks-phone'], 'Tasks in a column for each profile, each with a due date and who has claimed it.'),
  'rooms': ('Chat rooms', 'A room for everyone on the event, plus one for each profile.', 'rooms', ['rooms-phone'], "The event's General chat room with messages from the manager, venue and engineer."),
  'calendar': ('Calendar', "Every event you're on, with its photo filling the day.", 'calendar', ['calendar-phone'], 'The venue calendar: each event photo filling its day, with Neon Harbor picked and its tasks and run of show beside it.'),
  'dayof': ('Day sheets and PDFs', 'Send a day-of link to door staff or a driver. Each sheet saves as a PDF.', 'dayof-sheet-desk', ['dayof-sheet', 'dayof-contacts'], 'The day-of schedule and the contact sheet, each with Save PDF.'),
  'book': ('Book a date from your template', 'Fill in your act once. Book a date opens with your act, contact and tech rider already done, so only the dates and the deal are left.', [('book-template', '1 · Your template, filled in once'), ('book-act', '2 · Book a date: already filled in')], ['book-template-phone', 'book-act-phone'], 'My Templates for Neon Harbor, then Book a date with The act, Tech rider and Your contact already ticked from the template; dates wanted and Send to still needed.'),
  'stagetpl': ('Your stage plot, built once', 'Put each member on the stage. Open a line for their inputs: Mic or DI, +48V, and IEM or monitor.', 'stage-plot-open', ['stage-plot-open-phone'], "The stage plot with Marcus Dade's line open: vocals, guitar on a mic, acoustic on a DI with +48V, and a monitor."),
  'rider': ('Tech rider with your stage plot', 'The stage plot and inputs from your template ride along with every booking.', 'book-rider', ['book-rider-phone'], 'Book a date, Tech rider: the Show Pilot stage plot from My Template, 5 members and 9 inputs.'),
  'home': ('Your shows as tickets', 'Every show you have coming up, as a ticket, month by month.', 'mgmt-home', ['mgmt-home-phone'], 'The management home: the coming months as tickets, each with its date, venue and fan page, and Needs me on a phone.'),
  'acts': ('Manage multiple acts', 'Every act you manage in one template. Pick an act to see just its shows.', [('acts-templates', '1 · All your acts, one template'), ('acts-calendar', '2 · Pick an act, see its shows')], ['acts-templates-phone', 'acts-calendar-phone'], 'My Templates with Your acts: Neon Harbor, Copper Lights and Paper Satellites, then the calendar with Neon Harbor picked.'),
  'djmode': ('DJ Mode', 'Switch on DJ Mode: each night is a set, each act gets its own link, and their WAVs land in your Google Drive.', [('djmode', '1 · Your sets'), ('djmode-set', '2 · A link for each act'), ('djmode-upload', '3 · The act sends their set')], ['djmode-phone', 'djmode-upload-phone'], 'DJ Mode: the sets by month, Afterglow Club Night open with its running order and a Copy link for each act, then the page Nightjar opens from that link to add their WAVs in play order.'),
  'console': ('Your shows like a console', 'Every show you work as a strip, with its tasks and status at a glance.', 'console', ['tech-home'], 'The audio console home: the coming week as channel strips, and the home screen on a phone.'),
  'stage': ('The interactive stage plot', "Each act's stage as they built it. Open a member's line for their inputs: Mic or DI, +48V, and IEM or monitor.", 'stage-plot-open', ['stage-plot-open-phone'], "The stage plot with Marcus Dade's line open: vocals, guitar on a mic, acoustic on a DI with +48V, and a monitor."),
  'intake': ('Send intake forms', 'Send an act one link. They fill in their act, members and inputs, and it lands on your event.', [('intake-send', '1 · You make the link'), ('intake-form', '2 · The act fills it in')], ['intake-send-phone', 'intake-form-phone'], "Performer Intake: picking the event and asking for tracks, then the form the act gets from Sam Ortiz with role, artist and set, members and inputs, notes and contact."),
  'loadinvite': ('Invited? Load your template', 'When you join an event, tap Load Template and your saved info fills your part.', 'event-load', ['load-template-phone'], 'Load Venue over an event: pick a saved venue and its details fill the event.'),
  'wallets': ("Fellow pilots' wallets", "Save the crew you meet into wallets: by venue, tour or team.", 'wallets', ['wallets-phone'], "Fellow Pilots: wallets for a venue, a tour and a lighting crew, and the saved ID cards."),
  'pilot': ('Your pilot card', 'A card with your name, role and contact that people save to their wallet.', 'my-pilot', ['pilot-card'], 'A pilot card being set up, and the shared card on a phone.'),
  'logbook': ('Logbook', "Every show you've worked, by month, as stars you can share.", 'logbook-desk', ['logbook', 'pilot-card'], 'The logbook as stars for the month, and a shared pilot card.'),
  'lightdesk': ('Your shows as a lighting desk', 'Each show this week is a playback: who has confirmed, its tasks and chat, and a fader that fills as the show gets ready.', 'lighting-desk', ['lighting-phone'], 'The lighting desk: this week as playbacks, each with VEN / MGR / LX, tasks, chat, a ready fader and GO; on the phone, the same playbacks under your show counts.'),
  'rig': ('Rig the stage in 3D', 'Build each venue\'s stage once: trusses, lights, LED walls, risers and the band. Save looks as cues and play them on the stage.', [('rig-pool', '1 · Your stages'), ('rig-build', '2 · Build the rig'), ('rig-cues', '3 · Play your cues')], ['rig-build-phone', 'rig-cues-phone'], 'Rig the stage: the stage pool, The Foundry Hall built in 3D with three trusses of lights, an LED wall, a drum riser and the band, then the Chorus hit cue playing in pink.'),
}

P = [
  ('venue', 'Venue', '#60A5FA', 'Run every night at your room from one place, and have the acts and techs fill in what you need.', '',
   ['web', 'pkgin', 'loadvenue', 'tasks', 'rooms', 'calendar', 'dayof']),
  # Artist and management are one profile (job 374); DJs switch on DJ Mode.
  ('artist', 'Artist / Mgmt', '#EF4444', 'Book and advance your shows, for one act or many, and send techs what they need. DJs: switch on DJ Mode.', '',
   ['home', 'acts', 'book', 'rider', 'web', 'tasks', 'djmode']),
  # Audio and lighting are one profile (job 374).
  ('tech', 'Audio / Lighting', '#8CFF3D', "Know what every show needs before you get there, run it from your phone, and keep a record of the work you've done.", '',
   ['console', 'lightdesk', 'rig', 'intake', 'stage', 'loadinvite', 'wallets', 'pilot', 'logbook']),
]

def img(name, alt, lazy=True):
    w, h = SHOT[name]
    return f'<img src="/shots/{name}.webp" width="{w}" height="{h}"{" loading=\"lazy\"" if lazy else ""} alt="{E(alt)}">'

def browser(name, alt, cls='', bar='showpilot.space', style=''):
    w, h = SHOT[name]
    return (f'<figure class="browser{cls}" style="--ar:{w / h:.3f}{style}"><div class="browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>{E(bar)}</span></div>'
            f'{img(name, alt)}</figure>')

# Steps on the desktop (job 359): the windows cascade from top left to bottom
# right, the last step in front. In units of one window's width: each step
# moves DX right and DY down; a window is 1/1.6 tall plus its bar (~.07).
STACK = {2: (0.42, 0.2), 3: (0.3, 0.17)}
def stack(steps, alt):
    n = len(steps)
    dx, dy = STACK[n]
    W, H = 1 + (n - 1) * dx, 1 / 1.6 + 0.07 + (n - 1) * dy
    figs = ''.join(browser(name, alt if k == n - 1 else label, ' step', label,
                           f';left:{k * dx / W * 100:.2f}%;top:{k * dy / H * 100:.2f}%;width:{100 / W:.2f}%;z-index:{k + 1}')
                   for k, (name, label) in enumerate(steps))
    return f'<div class="stack" style="--ar:{W / H:.3f}">{figs}</div>' 

def phone(name, alt, cls=''):
    return f'<figure class="phone{cls}">{img(name, alt)}</figure>'

def slide(pid, i, fk, first):
    # Each slide holds the desktop screen and the phone screen(s); the
    # Desktop / Mobile switch above the tour picks which one shows.
    title, line, desk, phones, alt = F[fk]
    sid = f'p-{pid}-{i}'
    hid = '' if first else ' hidden'
    d = stack(desk, alt) if isinstance(desk, list) else browser(desk, alt)
    ps = phones[:2]
    m = ''.join(phone(n, (title + ' on a phone') if k == 0 else title) for k, n in enumerate(ps))
    two = ' two' if len(ps) > 1 else ''
    return (f'<div class="slide" role="tabpanel" id="{sid}" aria-labelledby="t-{pid}-{i}"{hid}>'
            f'<div class="v-desk">{d}</div><div class="v-phone{two}">{m}</div></div>')

def tour(pid, label, color, pitch, price, feats, first):
    tabs = []
    for i, fk in enumerate(feats):
        title, line, *_ = F[fk]
        sel = 'true' if i == 0 else 'false'
        ti = '' if i == 0 else ' tabindex="-1"'
        tabs.append(f'<button type="button" role="tab" class="tour-tab" id="t-{pid}-{i}" aria-controls="p-{pid}-{i}" aria-selected="{sel}"{ti}>'
                    f'<span class="n">{i+1:02d}</span><span class="tt">{E(title)}<small>{E(line)}</small></span><span class="meter"><span></span></span></button>')
    slides = ''.join(slide(pid, i, fk, i == 0) for i, fk in enumerate(feats))
    n = len(feats)
    # Prices live in the Pricing section only (job 371), not under each profile.
    return f'''
      <div class="tour" data-tour="{pid}" style="--c:{color}"{'' if first else ' hidden'}>
        <div class="tour-side">
          <div class="seat"><p class="seat-name">{E(label)}</p><p class="seat-pitch">{E(pitch)}</p></div>
          <div class="tour-list" role="tablist" aria-label="{E(label)} features">{''.join(tabs)}</div>
        </div>
        <div class="tour-stage">
          {slides}
          <div class="tour-nav">
            <button type="button" class="round" data-prev aria-label="Previous feature"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
            <button type="button" class="round" data-play aria-label="Pause the slideshow"><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg><svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg></button>
            <button type="button" class="round" data-next aria-label="Next feature"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
            <span class="tour-count mono" aria-live="polite"><b data-count>01</b> / {n:02d}</span>
          </div>
        </div>
      </div>'''

seat_tabs = ''.join(
    f'<button type="button" class="tab" data-seat="{pid}" style="--c:{c}" aria-pressed="{"true" if k == 0 else "false"}"><span class="dot"></span>{E(label)}</button>'
    for k, (pid, label, c, *_r) in enumerate(P))
tours = ''.join(tour(pid, label, c, pitch, price, feats, k == 0) for k, (pid, label, c, pitch, price, feats) in enumerate(P))

page = open(sys.argv[1]).read()
start = page.index('<!--TOUR-->'); end = page.index('<!--/TOUR-->') + len('<!--/TOUR-->')
block = f'''<!--TOUR-->
<section id="tour" class="band" data-view="desktop">
  <div class="wrap stack-36">
    <div class="head wide">
      <p class="kicker">INSIDE THE APP</p>
      <h2>Pick your seat and take a look around.</h2>
      <p class="sub">Each profile has its own Show Pilot. Pick yours, switch between desktop and phone, then tap a feature to see it, or let it play through. These are real screens with a made-up demo event. Tap a screen to see it full size.</p>
    </div>
    <div class="tour-bar">
      <div class="tabs seats" role="group" aria-label="Choose a profile">{seat_tabs}</div>
      <div class="viewsw" role="group" aria-label="Show the desktop or the phone screens">
        <button type="button" data-view="desktop" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>Desktop</button>
        <button type="button" data-view="mobile" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>Mobile</button>
      </div>
    </div>
    {tours}
  </div>
</section>
<!--/TOUR-->'''
open(sys.argv[2], 'w').write(page[:start] + block + page[end:])
print('ok', len(page[:start] + block + page[end:]))
