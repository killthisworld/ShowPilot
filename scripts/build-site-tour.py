# get.showpilot.space tour (job 341): edit the profile and feature lists below, then run
# python3 scripts/build-site-tour.py site/index.html site/index.html
# Builds site/index.html for get.showpilot.space (job 341) from one list of
# profiles and their feature screens. Run: python3 gen_site.py <out.html>
import sys, html

E = html.escape
SHOT = {  # name -> (width, height)
    'event-web': (1600, 1000), 'event-web-phone': (600, 1298), 'tasks': (1600, 1000), 'tasks-phone': (600, 1298),
    'rooms': (1600, 1000), 'rooms-phone': (600, 1298), 'calendar': (1600, 1000), 'tech-home': (600, 1298),
    'dayof': (600, 1298), 'dayof-sheet': (600, 1298), 'logbook': (600, 1298), 'pilot-card': (600, 1298),
    'dj-tools': (1600, 556), 'bookings': (1600, 1000), 'book-act': (1600, 1000), 'book-rider': (1600, 1000),
    'stage-plot': (1600, 1000), 'console': (1600, 1000), 'lighting-desk': (1600, 1000), 'wallets': (1600, 1000),
    'my-pilot': (1600, 1000), 'load-template': (1600, 1000), 'lighting-phone': (600, 1298),
    'load-template-phone': (600, 1298), 'template-stage': (1200, 1263),
    'bookings-phone': (600, 1298), 'calendar-phone': (600, 1298), 'book-act-phone': (600, 1298),
    'dj-tools-phone': (600, 1298), 'stage-plot-phone': (600, 1298), 'wallets-phone': (600, 1298),
    'template-stage-phone': (600, 1298), 'book-rider-phone': (600, 1298), 'dayof-desk': (1600, 1000), 'logbook-desk': (1600, 1000),
}

# Each feature: key, title, line, desktop shot, phone shot(s), alt text.
F = {
  'web': ('One page per event', 'Every profile around the show, and how ready each one is.', 'event-web', ['event-web-phone'], 'The event web: the event in the middle with Venue, Manager, Artist, Audio and Lights around it, the board and the flight log.'),
  'bookings': ('Bookings and Ask a tech', "See what's coming in and what's booked. Ask a tech if they're free with one link.", 'bookings', ['bookings-phone'], "Bookings with the Ask a tech sheet open: pick audio or lighting and send them a link."),
  'loadvenue': ('Load your venue template', 'Your room filled in once. Tap Load and it fills the event.', 'load-template', ['load-template-phone'], 'The Load Venue picker listing saved venue templates.'),
  'tasks': ('Tasks with due dates', "Hand out what needs doing, and see who has it and when it's due.", 'tasks', ['tasks-phone'], 'Tasks in a column for each profile, each with a due date and who has claimed it.'),
  'rooms': ('Chat rooms', 'A room for everyone on the event, plus one for each profile.', 'rooms', ['rooms-phone'], "The event's General chat room with messages from the manager, venue and engineer."),
  'calendar': ('Calendar', "Every event you're on, with its photo filling the day.", 'calendar', ['calendar-phone'], 'The month calendar with each event photo filling its day.'),
  'dayof': ('Day sheets and PDFs', 'Send a day-of link to door staff or a driver. Each sheet saves as a PDF.', 'dayof-desk', ['dayof', 'dayof-sheet'], 'A day-of package and its schedule sheet with Save PDF.'),
  'book': ('Book a date from your template', 'Book a date opens as a web around your act, with your contact and tech rider already filled in from your template.', 'book-act', ['book-act-phone'], 'Book a date as a web around the act: contact and tech rider already done from the template, the rest still to fill in.'),
  'stagetpl': ('Your stage plot, built once', 'Put each member on the stage with what they play. It goes with your template everywhere.', 'template-stage', ['template-stage-phone'], 'The stage builder in My Templates: each member placed on the stage with their instruments.'),
  'rider': ('Tech rider with your stage plot', 'The stage plot and inputs from your template ride along with every booking.', 'book-rider', ['book-rider-phone'], 'Book a date, Tech rider: the Show Pilot stage plot from My Template, 5 members and 7 inputs.'),
  'dj': ('DJ Tools', 'Set links for each DJ. WAVs land in your own Google Drive.', 'dj-tools', ['dj-tools-phone'], 'DJ Tools: a set link with the running order and which DJs have sent their set.'),
  'console': ('Your shows like a console', 'Every show you work as a strip, with its tasks and status at a glance.', 'console', ['tech-home'], 'The audio console home: the coming week as channel strips, and the home screen on a phone.'),
  'stage': ('The interactive stage plot', "Each act's stage as they built it: who stands where, what they play, and how they monitor.", 'stage-plot', ['stage-plot-phone'], 'The stage plot for an act: members on the stage, and each one routed to IEM or wedge.'),
  'loadinvite': ('Invited? Load your template', 'When you join an event, tap Load and your saved info fills your part.', 'load-template', ['load-template-phone'], 'The Load Venue picker on an event someone invited you to.'),
  'wallets': ("Fellow pilots' wallets", "Save the crew you meet into wallets: by venue, tour or team.", 'wallets', ['wallets-phone'], "Fellow Pilots: wallets for a venue, a tour and a lighting crew, and the saved ID cards."),
  'pilot': ('Your pilot card', 'A card with your name, role and contact that people save to their wallet.', 'my-pilot', ['pilot-card'], 'A pilot card being set up, and the shared card on a phone.'),
  'logbook': ('Logbook', "Every show you've worked, by month, as stars you can share.", 'logbook-desk', ['logbook', 'pilot-card'], 'The logbook as stars for the month, and a shared pilot card.'),
  'lightdesk': ('Lighting desk and cue pads', 'Your to-do as a desk with GO, and your shows as cue pads on the phone.', 'lighting-desk', ['lighting-phone'], 'The lighting desk with a NOW bar and GO, and cue pads on a phone.'),
}

P = [
  ('venue', 'Venue', '#60A5FA', 'Run every night at your room from one place, and have the acts and techs fill in what you need.', '$25–$50 a month, by capacity and shows a year',
   ['web', 'bookings', 'loadvenue', 'tasks', 'rooms', 'calendar', 'dayof']),
  ('band', 'Artist / DJ', '#EF4444', 'Advance your shows, send techs what they need, and keep the road details in one place. DJs: pick Artist.', '$15 a month, includes 1 act',
   ['book', 'stagetpl', 'rider', 'web', 'rooms', 'dj', 'calendar']),
  ('manager', 'Manager', '#EF4444', 'Run the artist side of the shows you manage. Booking is part of this profile.', '$15 a month, +$5 for each extra act',
   ['book', 'rider', 'stagetpl', 'web', 'tasks', 'dj', 'dayof']),
  ('engineer', 'Audio engineer', '#8CFF3D', "Know what every show needs before you get there, and keep a record of the work you've done.", '$10 a month',
   ['console', 'stage', 'loadinvite', 'wallets', 'pilot', 'logbook', 'rooms']),
  ('lighting', 'Lighting tech', '#8CFF3D', 'Run lighting with everything you need for the show in front of you, on your phone.', '$10 a month',
   ['lightdesk', 'web', 'loadinvite', 'wallets', 'pilot', 'logbook', 'rooms']),
]

def img(name, alt, lazy=True):
    w, h = SHOT[name]
    return f'<img src="/shots/{name}.webp" width="{w}" height="{h}"{" loading=\"lazy\"" if lazy else ""} alt="{E(alt)}">'

def browser(name, alt, cls=''):
    w, h = SHOT[name]
    return (f'<figure class="browser{cls}" style="--ar:{w / h:.3f}"><div class="browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>showpilot.space</span></div>'
            f'{img(name, alt)}</figure>')

def phone(name, alt, cls=''):
    return f'<figure class="phone{cls}">{img(name, alt)}</figure>'

def slide(pid, i, fk, first):
    # Each slide holds the desktop screen and the phone screen(s); the
    # Desktop / Mobile switch above the tour picks which one shows.
    title, line, desk, phones, alt = F[fk]
    sid = f'p-{pid}-{i}'
    hid = '' if first else ' hidden'
    d = browser(desk, alt)
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
    return f'''
      <div class="tour" data-tour="{pid}" style="--c:{color}"{'' if first else ' hidden'}>
        <div class="tour-side">
          <div class="seat"><p class="seat-name">{E(label)}</p><p class="seat-pitch">{E(pitch)}</p><p class="seat-price">{E(price.upper())}</p></div>
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
      <p class="sub">Each profile has its own Show Pilot. Pick yours, switch between desktop and phone, then tap a feature to see it, or let it play through. These are real screens with a made-up demo event.</p>
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
