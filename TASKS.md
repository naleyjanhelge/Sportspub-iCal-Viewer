# Sportspub iCal Viewer – Task List

This file tracks development tasks for Codex or contributors.

---

## Core Tasks
- [ ] Implement iCal (.ics) fetching in `script.js` using the calendar URL from `pubs.json`
- [ ] Parse iCal data and extract:
  - Event title
  - Event start time & end time
  - Event description (optional)
- [ ] Display parsed events inside `<div id="events"></div>` in both `index.html` and `weekly.html`

## Sidebar View (index.html)
- [ ] Render only today's or the next upcoming events
- [ ] Keep layout compact and vertical for sidebar screens

## Weekly View (weekly.html)
- [ ] Render all events for the current week
- [ ] Full-width layout, optimized for TV display

## Branding
- [x] Load pub config from `pubs.json`
- [x] Apply primary/secondary/text colors dynamically
- [x] Display pub logo from assets folder

## Future Enhancements
- [ ] Add caching for iCal feed (optional, for performance)
- [ ] Add filtering options (e.g., only football matches)
- [ ] Auto-scroll when there are many events
