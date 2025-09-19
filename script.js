const THEME_LINK_ID = "pub-theme";
const NORWEGIAN_LOCALE = "nb-NO";
const WEEKDAY_FORMAT_OPTIONS = { weekday: "long" };
const MONTH_DAY_FORMAT_OPTIONS = { month: "short", day: "numeric" };
const DAY_FORMAT_OPTIONS = { day: "numeric" };

function ensureThemeStylesheet(themePath) {
  const existingLink = document.getElementById(THEME_LINK_ID);

  if (themePath) {
    const resolvedHref = new URL(themePath, window.location.href).href;

    if (existingLink) {
      if (existingLink.href !== resolvedHref) {
        existingLink.href = themePath;
      }
    } else {
      const link = document.createElement("link");
      link.id = THEME_LINK_ID;
      link.rel = "stylesheet";
      link.href = themePath;
      document.head.appendChild(link);
    }
  } else if (existingLink) {
    existingLink.remove();
  }
}

function applyColorVariables(pub) {
  const rootStyle = document.documentElement.style;
  const colors = pub.colors || {};
  const colorMappings = [
    ["--app-background", colors.secondary],
    ["--app-text-color", colors.text],
    ["--app-header-background", colors.primary],
  ];

  if (pub.theme) {
    colorMappings.forEach(([name]) => {
      rootStyle.removeProperty(name);
    });
    return;
  }

  colorMappings.forEach(([name, value]) => {
    if (value) {
      rootStyle.setProperty(name, value);
    } else {
      rootStyle.removeProperty(name);
    }
  });
}

function applyBranding(pubKey, pub) {
  document.body.dataset.pub = pubKey;
  document.body.dataset.theme = pub.theme ? "custom" : "default";

  ensureThemeStylesheet(pub.theme);
  applyColorVariables(pub);

  const logoEl = document.getElementById("logo");
  if (logoEl && pub.logo) {
    logoEl.src = pub.logo;
    logoEl.alt = `${pub.name || "Puben"}-logo`;
  }

  const nameEl = document.getElementById("pub-name");
  if (nameEl) {
    nameEl.textContent = pub.name || "";
  }
}

async function loadPubConfig() {
  const urlParams = new URLSearchParams(window.location.search);
  const pubKey = urlParams.get("pub") || "sportsbaren";

  let pubs;
  try {
    const res = await fetch("pubs.json");

    if (!res.ok) {
      throw new Error(`Failed to load pub configuration: ${res.status} ${res.statusText}`);
    }

    pubs = await res.json();
  } catch (error) {
    console.error("Feil under lasting av puboppsett", error);

    const eventsContainer = document.getElementById("events");
    if (eventsContainer) {
      eventsContainer.innerHTML =
        "<p class=\"error-message\">Kunne ikke laste inn puboppsettet. Prøv igjen senere.</p>";
    }

    return;
  }

  const pub = pubs[pubKey];
  if (!pub) {
    console.warn(`Fant ikke puboppsett for nøkkel: ${pubKey}`);

    const eventsContainer = document.getElementById("events");
    if (eventsContainer) {
      eventsContainer.innerHTML = "<p class=\"error-message\">Fant ikke puboppsett.</p>";
    }

    return;
  }

  applyBranding(pubKey, pub);

  await renderEventsForView(pub);
}

async function renderEventsForView(pub) {
  const view = document.body.dataset.view || "sidebar";
  const eventsContainer = document.getElementById("events");

  if (!eventsContainer) {
    return;
  }

  const calendarUrl = pub.ical || pub.sourceIcal;
  if (!calendarUrl) {
    eventsContainer.innerHTML =
      "<p class=\"error-message\">Det er ikke konfigurert noen kalender for denne puben.</p>";
    return;
  }

  const requestUrl = /^https?:/i.test(calendarUrl)
    ? calendarUrl
    : new URL(calendarUrl, window.location.href).toString();

  let icsText = "";
  try {
    const response = await fetch(requestUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }

    icsText = await response.text();
  } catch (error) {
    console.error("Feil ved henting av kalenderfeed", error);
    eventsContainer.innerHTML =
      "<p class=\"error-message\">Kunne ikke laste inn arrangementer akkurat nå. Prøv igjen senere.</p>";
    return;
  }

  const events = parseICalEvents(icsText);

  if (view === "weekly") {
    renderWeeklyEvents(events);
  } else {
    renderSidebarEvents(events);
  }
}

function unfoldICalLines(icsText) {
  const lines = icsText.split(/\r?\n/);
  const unfolded = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.slice(1);
      }
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function decodeICalText(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseICalDate(value, params = {}) {
  const isDateValue = params.VALUE === "DATE" || /^\d{8}$/.test(value);

  if (isDateValue) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return { date: new Date(year, month, day), allDay: true };
  }

  const hasTime = value.includes("T");
  const datePart = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  let timePart = "00:00:00";

  if (hasTime) {
    const timeIndex = value.indexOf("T") + 1;
    const hours = value.slice(timeIndex, timeIndex + 2) || "00";
    const minutes = value.slice(timeIndex + 2, timeIndex + 4) || "00";
    const seconds = value.slice(timeIndex + 4, timeIndex + 6) || "00";
    timePart = `${hours}:${minutes}:${seconds}`;
  }

  const isoDate = `${datePart}T${timePart}`;
  if (value.endsWith("Z")) {
    return { date: new Date(`${isoDate}Z`), allDay: false };
  }

  return { date: new Date(isoDate), allDay: false };
}

function parseICalEvents(icsText) {
  const unfoldedLines = unfoldICalLines(icsText);
  const events = [];

  let currentEvent = null;

  for (const rawLine of unfoldedLines) {
    const line = rawLine.trim();

    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent && currentEvent.dtstart) {
        const startData = parseICalDate(currentEvent.dtstart.value, currentEvent.dtstart.params);

        if (Number.isNaN(startData.date.getTime())) {
          currentEvent = null;
          continue;
        }

        let endDate = null;
        let allDay = startData.allDay;

        if (currentEvent.dtend) {
          const endData = parseICalDate(currentEvent.dtend.value, currentEvent.dtend.params);
          endDate = Number.isNaN(endData.date.getTime()) ? null : endData.date;
          allDay = allDay || endData.allDay;

          if (allDay && endDate) {
            // For all-day events the DTEND is exclusive; shift back one day to keep within bounds.
            const adjusted = new Date(endDate);
            adjusted.setDate(adjusted.getDate() - 1);
            adjusted.setHours(23, 59, 59, 999);
            endDate = adjusted;
          }
        }

        events.push({
          title: currentEvent.summary || "Arrangement uten tittel",
          description: currentEvent.description || "",
          location: currentEvent.location || "",
          start: startData.date,
          end: endDate,
          allDay,
        });
      }

      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const namePart = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    const nameSegments = namePart.split(";");
    const property = nameSegments[0].toUpperCase();
    const params = {};

    for (let i = 1; i < nameSegments.length; i += 1) {
      const [paramName, paramValue] = nameSegments[i].split("=");
      if (paramName && paramValue) {
        params[paramName.toUpperCase()] = paramValue;
      }
    }

    switch (property) {
      case "SUMMARY":
        currentEvent.summary = decodeICalText(value);
        break;
      case "DESCRIPTION":
        currentEvent.description = decodeICalText(value);
        break;
      case "LOCATION":
        currentEvent.location = decodeICalText(value);
        break;
      case "DTSTART":
        currentEvent.dtstart = { value, params };
        break;
      case "DTEND":
        currentEvent.dtend = { value, params };
        break;
      default:
        break;
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}

function getStartOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getCurrentWeekRange(referenceDate = new Date()) {
  const start = getStartOfDay(referenceDate);
  const weekday = start.getDay();
  const mondayIndex = (weekday + 6) % 7; // Convert Sunday=0 to Monday=0
  start.setDate(start.getDate() - mondayIndex);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return { start, end };
}

function formatWeekRange(start, end) {
  const inclusiveEnd = new Date(end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

  const sameYear = start.getFullYear() === inclusiveEnd.getFullYear();
  const sameMonth = sameYear && start.getMonth() === inclusiveEnd.getMonth();

  if (sameYear && sameMonth) {
    const startText = start.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);
    const endText = inclusiveEnd.toLocaleDateString(NORWEGIAN_LOCALE, DAY_FORMAT_OPTIONS);
    return `${startText} – ${endText}, ${start.getFullYear()}`;
  }

  if (sameYear) {
    const startText = start.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);
    const endText = inclusiveEnd.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);
    return `${startText} – ${endText}, ${start.getFullYear()}`;
  }

  const startText = start.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);
  const endText = inclusiveEnd.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);
  return `${startText} ${start.getFullYear()} – ${endText} ${inclusiveEnd.getFullYear()}`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatEventTime(event) {
  if (event.allDay) {
    return "Hele dagen";
  }

  const eventStart = event.start;
  return eventStart.toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderWeeklyEvents(events) {
  const eventsContainer = document.getElementById("events");
  if (!eventsContainer) {
    return;
  }

  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const weekRangeElement = document.getElementById("week-range");
  if (weekRangeElement) {
    weekRangeElement.textContent = formatWeekRange(weekStart, weekEnd);
  }

  const weekEvents = events.filter((event) => {
    const eventStart = event.start;
    const eventEnd = event.end || event.start;
    return eventStart < weekEnd && eventEnd >= weekStart;
  });

  eventsContainer.innerHTML = "";
  let renderedDayCount = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const dayStart = new Date(weekStart);
    dayStart.setDate(weekStart.getDate() + offset);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayEvents = weekEvents
      .filter((event) => {
        const eventStart = event.start;
        const eventEnd = event.end || event.start;
        return eventStart < dayEnd && eventEnd >= dayStart;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (dayEvents.length === 0) {
      continue;
    }

    const daySection = document.createElement("section");
    daySection.className = "weekday";

    if (isSameDay(dayStart, new Date())) {
      daySection.classList.add("is-today");
    }

    const header = document.createElement("div");
    header.className = "weekday-header";

    const nameEl = document.createElement("h2");
    nameEl.className = "weekday-name";
    nameEl.textContent = dayStart.toLocaleDateString(NORWEGIAN_LOCALE, WEEKDAY_FORMAT_OPTIONS);

    const dateEl = document.createElement("span");
    dateEl.className = "weekday-date";
    dateEl.textContent = dayStart.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);

    header.append(nameEl, dateEl);

    const list = document.createElement("div");
    list.className = "events-list";

    dayEvents.forEach((event) => {
      const eventEl = document.createElement("article");
      eventEl.className = "event";

      const timeEl = document.createElement("time");
      timeEl.className = "event-time";
      timeEl.dateTime = event.start.toISOString();
      timeEl.textContent = formatEventTime(event);
      eventEl.appendChild(timeEl);

      const titleEl = document.createElement("h3");
      titleEl.className = "event-title";
      titleEl.textContent = event.title;
      eventEl.appendChild(titleEl);

      if (event.location) {
        const locationEl = document.createElement("p");
        locationEl.className = "event-location";
        locationEl.textContent = event.location;
        eventEl.appendChild(locationEl);
      }

      if (event.description) {
        const descriptionEl = document.createElement("p");
        descriptionEl.className = "event-description";
        descriptionEl.textContent = event.description;
        eventEl.appendChild(descriptionEl);
      }

      list.appendChild(eventEl);
    });

    daySection.append(header, list);
    eventsContainer.appendChild(daySection);
    renderedDayCount += 1;
  }

  if (renderedDayCount === 0) {
    eventsContainer.classList.add("is-empty");

    const emptyMessage = document.createElement("p");
    emptyMessage.className = "no-events";
    emptyMessage.textContent = "Ingen planlagte arrangementer denne uken.";
    eventsContainer.appendChild(emptyMessage);
  } else {
    eventsContainer.classList.remove("is-empty");
  }
}

function renderSidebarEvents(events) {
  const eventsContainer = document.getElementById("events");
  if (!eventsContainer) {
    return;
  }

  const now = new Date();
  const upcomingEvents = events.filter((event) => {
    if (event.end) {
      return event.end >= now;
    }
    return event.start >= now;
  });

  if (upcomingEvents.length === 0) {
    eventsContainer.innerHTML = "<p class=\"no-events\">Ingen kommende arrangementer.</p>";
    return;
  }

  upcomingEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  const dayBuckets = new Map();

  upcomingEvents.forEach((event) => {
    const eventStart = event.start;
    const eventEnd = event.end || event.start;

    let currentDay = getStartOfDay(eventStart);
    const lastDay = getStartOfDay(eventEnd);

    while (currentDay.getTime() <= lastDay.getTime()) {
      const dayKey = currentDay.getTime();
      if (!dayBuckets.has(dayKey)) {
        dayBuckets.set(dayKey, []);
      }
      dayBuckets.get(dayKey).push(event);

      const nextDay = new Date(currentDay);
      nextDay.setDate(currentDay.getDate() + 1);
      currentDay = nextDay;
    }
  });

  dayBuckets.forEach((bucket) => {
    bucket.sort((a, b) => a.start.getTime() - b.start.getTime());
  });

  const todayStart = getStartOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  const sortedBucketKeys = Array.from(dayBuckets.keys()).sort((a, b) => a - b);
  const lastEventDayKey =
    sortedBucketKeys.length > 0 ? sortedBucketKeys[sortedBucketKeys.length - 1] : todayStart.getTime();

  const fragment = document.createDocumentFragment();

  const MAX_DAYS_TO_RENDER = 6;
  const REQUIRED_DAY_COUNT = Math.min(2, MAX_DAYS_TO_RENDER);
  let dayCursor = new Date(todayStart);
  let daysRendered = 0;

  while (
    daysRendered < REQUIRED_DAY_COUNT ||
    (daysRendered < MAX_DAYS_TO_RENDER && dayCursor.getTime() <= lastEventDayKey)
  ) {
    const dayStart = new Date(dayCursor);
    const dayKey = dayStart.getTime();
    const dayEvents = dayBuckets.get(dayKey) || [];

    const daySection = document.createElement("section");
    daySection.className = "sidebar-day";
    if (isSameDay(dayStart, now)) {
      daySection.classList.add("is-today");
    }

    const heading = document.createElement("div");
    heading.className = "sidebar-day-heading";

    const titleEl = document.createElement("h2");
    titleEl.className = "sidebar-day-title";
    const isToday = isSameDay(dayStart, todayStart);
    const isTomorrow = isSameDay(dayStart, tomorrowStart);
    titleEl.textContent = isToday
      ? "I dag"
      : isTomorrow
        ? "I morgen"
        : dayStart.toLocaleDateString(NORWEGIAN_LOCALE, WEEKDAY_FORMAT_OPTIONS);

    const dateEl = document.createElement("span");
    dateEl.className = "sidebar-day-date";
    dateEl.textContent = dayStart.toLocaleDateString(NORWEGIAN_LOCALE, MONTH_DAY_FORMAT_OPTIONS);

    heading.append(titleEl, dateEl);
    daySection.appendChild(heading);

    if (dayEvents.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "sidebar-no-events";
      emptyMessage.textContent = "Ingen planlagte arrangementer.";
      daySection.appendChild(emptyMessage);
    } else {
      const list = document.createElement("ul");
      list.className = "sidebar-event-list";

      dayEvents.forEach((event) => {
        const item = document.createElement("li");
        item.className = "sidebar-event";

        const timeEl = document.createElement("time");
        timeEl.className = "event-time";
        timeEl.dateTime = event.start.toISOString();
        timeEl.textContent = formatEventTime(event);
        item.appendChild(timeEl);

        const info = document.createElement("div");
        info.className = "sidebar-event-info";

        const eventTitleEl = document.createElement("h3");
        eventTitleEl.className = "event-title";
        eventTitleEl.textContent = event.title;
        info.appendChild(eventTitleEl);

        if (event.location) {
          const locationEl = document.createElement("p");
          locationEl.className = "event-location";
          locationEl.textContent = event.location;
          info.appendChild(locationEl);
        }

        if (event.description) {
          const descriptionEl = document.createElement("p");
          descriptionEl.className = "event-description";
          descriptionEl.textContent = event.description;
          info.appendChild(descriptionEl);
        }

        item.appendChild(info);
        list.appendChild(item);
      });

      daySection.appendChild(list);
    }

    fragment.appendChild(daySection);

    dayCursor.setDate(dayCursor.getDate() + 1);
    daysRendered += 1;

    if (daysRendered >= MAX_DAYS_TO_RENDER) {
      break;
    }
  }

  eventsContainer.innerHTML = "";
  eventsContainer.appendChild(fragment);
}

loadPubConfig();
