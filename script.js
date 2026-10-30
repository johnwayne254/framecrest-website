(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");

  menuButton?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });

  nav?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    });
  });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Add the studio's WhatsApp number in international format: digits only, no + or spaces.
  const whatsappNumber = "";
  const whatsappLinks = document.querySelectorAll("[data-whatsapp]");
  const whatsappIsConfigured = /^\d{8,15}$/.test(whatsappNumber);

  whatsappLinks.forEach(link => {
    if (whatsappIsConfigured) {
      link.href = "https://wa.me/" + whatsappNumber + "?text=" +
        encodeURIComponent("Hello FrameCrest, I'd like to discuss a project.");
      link.target = "_blank";
      link.rel = "noopener";
    } else {
      link.href = "contact.html#contact-form";
      link.addEventListener("click", () => {
        const status = document.getElementById("form-status");
        if (status) status.textContent =
          "WhatsApp will be activated as soon as the studio contact number is added.";
      });
      if (link.classList.contains("floating-whatsapp")) link.hidden = true;
    }
  });

  // Add the studio's Instagram profile URL here before launch.
  const instagramUrl = "";
  if (instagramUrl) {
    document.querySelectorAll("[data-instagram]").forEach(link => link.href = instagramUrl);
  } else {
    document.querySelectorAll("[data-instagram]").forEach(link => link.hidden = true);
  }

  // Create a Formspree form and paste its endpoint here to activate enquiries.
  const formspreeEndpoint = "";
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const submitButton = form?.querySelector('button[type="submit"]');

  form?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!formspreeEndpoint) {
      if (status) status.textContent =
        "The enquiry form is ready for setup. Its secure submission service will be connected before launch.";
      return;
    }

    if (!form.reportValidity()) return;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
    }
    if (status) status.textContent = "Sending your enquiry…";

    try {
      const response = await fetch(formspreeEndpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });

      if (!response.ok) throw new Error("The form service returned an error.");

      form.reset();
      if (status) status.textContent =
        "Thank you. Your enquiry has been sent successfully.";
    } catch (error) {
      if (status) status.textContent =
        "We couldn't send your enquiry. Please try again or contact us directly.";
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  });
})();