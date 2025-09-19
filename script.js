async function loadPubConfig() {
  const urlParams = new URLSearchParams(window.location.search);
  const pubKey = urlParams.get("pub") || "sportsbaren";

  const res = await fetch("pubs.json");
  const pubs = await res.json();

  const pub = pubs[pubKey];
  if (!pub) {
    document.body.innerHTML = "<p>Pub configuration not found.</p>";
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
