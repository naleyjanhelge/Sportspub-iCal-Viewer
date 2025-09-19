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

---

## 📂 Project Structure
```
sportspub-ical-viewer/
│── index.html        # Sidebar event view
│── weekly.html       # Weekly event view
│── style.css         # Shared base styles
│── script.js         # Loads pub config (branding only for now)
│── pubs.json         # Sports pub configurations
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

---

## 📄 License
MIT License – free to use and modify.
