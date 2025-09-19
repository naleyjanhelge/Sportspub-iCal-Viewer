# Sportspub iCal Viewer

A lightweight event display system for sports pubs.  
Uses Google Calendar (iCal feed) as the data source.  
Supports multiple pubs via a JSON config file.

---

## 🚀 Features
- **Sidebar Page** – compact layout for screens and sidebars.
- **Weekly Page** – full-screen view for all events of the current week.
- **Multi-Pub Support** – branding and calendar URLs defined in `pubs.json`.
- **Google Calendar Integration** – events will be fetched from an iCal feed.
- **Cached Calendar Feeds** – remote iCal sources are mirrored to local files for faster, more reliable loading.

---

## 📂 Project Structure
```
sportspub-ical-viewer/
│── index.html        # Sidebar event view
│── weekly.html       # Weekly event view
│── style.css         # Shared base styles
│── script.js         # Loads pub config and events
│── pubs.json         # Sports pub configurations
│── feeds/            # Cached iCal feeds fetched locally
│── scripts/
│    └── prefetch-icals.mjs  # Fetches and caches iCal feeds
│── .github/workflows/update-icals.yml  # Daily refresh automation
│── assets/
│    └── sportsbaren-logo.png
│── README.md
│── TASKS.md          # Development TODO list
```

---

## 🖥️ Usage
- Open: `index.html?pub=sportsbaren` for the sidebar view.
- Open: `weekly.html?pub=sportsbaren` for the weekly view.
- Add more pubs by editing `pubs.json` and dropping a logo in `/assets/`.

### Calendar feed requirements
- Each pub entry must provide a **public** iCal feed URL that responds with a standard `.ics` file.
- The feed should be the "basic" Google Calendar export (or similar) so the link ends with `.ics` and returns text in [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) format.
- Example: `https://calendar.google.com/calendar/ical/.../public/basic.ics`.

---

## 🔄 Cached feeds & automation
- Run `node scripts/prefetch-icals.mjs` to download each pub's `sourceIcal` feed into `feeds/<pub>.ics` and update `pubs.json` so the `ical` field points at the cached file.
- The original remote URL is preserved in a `sourceIcal` property for each pub, allowing the fetch script to refresh the cache without losing the reference.
- A scheduled workflow (`.github/workflows/update-icals.yml`) runs every day at **14:00 UTC** to refresh the cached feeds and commit any changes back to the repository.
- To change the refresh cadence (or disable it entirely), edit the workflow's `schedule` cron expression or comment out the trigger. The workflow can also be disabled from the GitHub Actions tab if you prefer manual updates only.

---

## 📄 License
MIT License – free to use and modify.
