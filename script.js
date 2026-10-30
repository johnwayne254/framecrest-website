(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  menuButton?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });
  nav?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  }));
  document.getElementById("year").textContent = new Date().getFullYear();

  // Replace with FrameCrest's WhatsApp number in international format, without + or spaces.
  const whatsappNumber = "254700000000";
  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    link.href = "https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent("Hello FrameCrest, I'd like to discuss a project.");
  });

  // Add your real Instagram profile URL here before launch.
  const instagramUrl = "https://www.instagram.com/";
  document.querySelectorAll("[data-instagram]").forEach(link => link.href = instagramUrl);

  // The form is intentionally inactive until a real Formspree endpoint is configured.
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    status.textContent = "The contact form is not connected yet. Please use WhatsApp for now.";
  });
})();