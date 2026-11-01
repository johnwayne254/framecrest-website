(() => {
  const config = window.FRAMECREST_CONFIG || {};
  const cleanPhone = String(config.whatsappNumber || "").replace(/\D/g, "");
  const whatsappReady = /^\d{8,15}$/.test(cleanPhone);
  const formSubmitEmail = String(config.formSubmitEmail || "").trim();
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

  // Configure the project enquiry form to deliver through FormSubmit.
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const submitButton = form?.querySelector('button[type="submit"]');
  const formEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formSubmitEmail);
  const formSubmitEndpoint = formEmailIsValid
    ? "https://formsubmit.co/ajax/" + formSubmitEmail
    : "";

  if (form && submitButton) {
    if (!formEmailIsValid) {
      submitButton.disabled = true;
      submitButton.textContent = "Enquiry form unavailable";
      if (status) status.textContent =
        "The enquiry form is temporarily unavailable. Please email FrameCrest directly.";
    } else {
      submitButton.disabled = false;
      submitButton.textContent = "Send project enquiry ↗";
      if (status) status.textContent =
        "Your enquiry will be sent to FrameCrest. We use the details only to review and respond to your project request.";
    }
  }

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!formEmailIsValid || !form) return;
    if (!form.reportValidity()) return;

    // FormSubmit uses this hidden honeypot field to filter automated submissions.
    if (form.querySelector('[name="_honey"]')?.value) return;

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Sending…";
    if (status) status.textContent = "Sending your project enquiry…";

    try {
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload._replyto = String(formData.get("email") || "");
      payload._subject = "New FrameCrest Studios project enquiry";

      const response = await fetch(formSubmitEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        result = {};
      }
      if (!response.ok || String(result.success).toLowerCase() === "false") {
        throw new Error(result.message || "The form service returned an error.");
      }

      form.reset();
      if (status) status.textContent =
        "Thank you. Your project enquiry has been submitted. We'll respond using the email address you provided.";
      submitButton.textContent = "Enquiry submitted";
    } catch (error) {
      if (status) status.textContent =
        "We couldn't submit your enquiry just now. Please try again or email framecrest.media@gmail.com.";
      submitButton.disabled = false;
      submitButton.textContent = "Try again ↗";
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
