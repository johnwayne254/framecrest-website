(() => {
  const config = window.FRAMECREST_CONFIG || {};
  const cleanPhone = String(config.whatsappNumber || "").replace(/\D/g, "");
  const whatsappReady = /^\d{8,15}$/.test(cleanPhone);
  const formEndpoint = String(config.formspreeEndpoint || "").trim();
  const instagramUrl = String(config.instagramUrl || "").trim();

  // Mobile navigation
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");

  const closeMenu = () => {
    nav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    menuButton?.setAttribute("aria-label", "Open navigation");
  };

  menuButton?.addEventListener("click", () => {
    const open = nav?.classList.toggle("open") || false;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });

  nav?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("click", event => {
    if (nav?.classList.contains("open") &&
        !nav.contains(event.target) &&
        !menuButton?.contains(event.target)) closeMenu();
  });

  // Highlight the current page in the navigation.
  const currentPage = location.pathname.split("/").pop() || "index.html";
  nav?.querySelectorAll("a[href]").forEach(link => {
    const linkPage = link.getAttribute("href").split("#")[0];
    if (linkPage === currentPage || (currentPage === "" && linkPage === "index.html")) {
      link.setAttribute("aria-current", "page");
    }
  });

  // Keep the footer year current.
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // WhatsApp stays hidden until a real business number is configured.
  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    if (whatsappReady) {
      link.href = "https://wa.me/" + cleanPhone + "?text=" +
        encodeURIComponent("Hello FrameCrest, I'd like to discuss a project.");
      link.removeAttribute("aria-disabled");
      link.removeAttribute("title");
      if (link.classList.contains("floating-whatsapp")) link.hidden = false;
    } else {
      if (link.classList.contains("floating-whatsapp")) {
        link.hidden = true;
      } else {
        link.href = "contact.html#contact-form";
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("title", "WhatsApp contact will be added soon");
        const label = link.querySelector("span");
        link.textContent = "WhatsApp contact will be available soon";
        if (label) link.appendChild(label);
      }
    }
  });

  // Only show social links when a real studio profile is configured.
  document.querySelectorAll("[data-instagram]").forEach(link => {
    if (instagramUrl) {
      link.href = instagramUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  });

  // Configure the form only after its real Formspree endpoint is supplied.
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const submitButton = form?.querySelector('button[type="submit"]');
  const endpointIsValid = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(formEndpoint);

  if (form && submitButton) {
    if (!endpointIsValid) {
      submitButton.disabled = true;
      submitButton.textContent = "Enquiry form coming soon";
      if (status) status.textContent =
        "The online enquiry form is being connected. It will accept submissions once the secure form service is configured.";
    } else {
      submitButton.disabled = false;
    }
  }

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!endpointIsValid) return;
    if (!form.reportValidity()) return;

    // Honeypot: quietly reject automated form submissions.
    if (form.querySelector('[name="_gotcha"]')?.value) return;

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Sending…";
    if (status) status.textContent = "Sending your enquiry securely…";

    try {
      const response = await fetch(formEndpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("The form service returned an error.");

      form.reset();
      if (status) status.textContent =
        "Thank you. Your enquiry has been sent successfully. We'll be in touch.";
      submitButton.textContent = "Enquiry sent";
    } catch (error) {
      if (status) status.textContent =
        "We couldn't send your enquiry. Please try again in a moment.";
      submitButton.disabled = false;
      submitButton.textContent = "Try again";
    } finally {
      submitButton.removeAttribute("aria-busy");
    }
  });

  // Selected-work image preview: open each gallery image in an accessible lightbox.
  const workLightbox = document.getElementById("work-lightbox");
  const workLightboxImage = document.getElementById("work-lightbox-image");
  const workLightboxCaption = document.getElementById("work-lightbox-caption");
  const workLightboxClose = workLightbox?.querySelector(".work-lightbox-close");

  if (workLightbox && workLightboxImage && workLightboxCaption &&
      typeof workLightbox.showModal === "function") {
    document.querySelectorAll(".work-image-open").forEach(link => {
      link.addEventListener("click", event => {
        const thumbnail = link.querySelector("img");
        if (!thumbnail) return;

        event.preventDefault();
        workLightboxImage.src = link.href;
        workLightboxImage.alt = thumbnail.alt || "Selected FrameCrest property image";
        workLightboxCaption.textContent =
          link.dataset.lightboxTitle || thumbnail.alt || "Selected work";

        workLightbox.showModal();
        workLightboxClose?.focus();
      });
    });

    workLightboxClose?.addEventListener("click", () => {
      workLightbox.close();
    });

    workLightbox.addEventListener("click", event => {
      if (event.target === workLightbox) workLightbox.close();
    });

    workLightbox.addEventListener("close", () => {
      workLightboxImage.removeAttribute("src");
      workLightboxImage.alt = "";
      workLightboxCaption.textContent = "";
    });
  }

  // Gentle reveal effects; content remains visible if the browser lacks the API.
  if ("IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const revealItems = document.querySelectorAll(
      ".page-hero, .section-heading, .work-card, .services-list article, " +
      ".approach-image, .approach-copy, .process-grid article, .contact-intro, .contact-form"
    );
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealItems.forEach(item => {
      item.classList.add("will-reveal");
      observer.observe(item);
    });
  }
})();
