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
    console.error("Error loading pub configuration", error);

    const eventsContainer = document.getElementById("events");
    if (eventsContainer) {
      eventsContainer.innerHTML =
        "<p class=\"error-message\">Unable to load pub configuration. Please try again later.</p>";
    }

    return;
  }

  const pub = pubs[pubKey];
  if (!pub) {
    console.warn(`Pub configuration not found for key: ${pubKey}`);

    const eventsContainer = document.getElementById("events");
    if (eventsContainer) {
      eventsContainer.innerHTML = "<p class=\"error-message\">Pub configuration not found.</p>";
    }

    return;
  }

  // Apply branding
  document.body.style.backgroundColor = pub.colors.secondary;
  document.body.style.color = pub.colors.text;
  document.querySelector("header").style.background = pub.colors.primary;
  document.getElementById("logo").src = pub.logo;
  document.getElementById("pub-name").textContent = pub.name;

  // Placeholder: Codex will implement iCal parsing here
  document.getElementById("events").innerHTML = "<p>Events will load here...</p>";
}

loadPubConfig();
