(() => {
  const config = window.FRAMECREST_CONFIG || {};
  const cleanPhone = String(config.whatsappNumber || "254717719639").replace(/\D/g, "");
  const whatsappReady = /^\d{8,15}$/.test(cleanPhone);
  const formSubmitEmail = String(config.formSubmitEmail || "framecrest.media@gmail.com").trim();
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

  // Keep the enquiry form on FormSubmit's standard POST flow.
  // This avoids AJAX/CORS failures and works even if optional config.js is cached or unavailable.
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const submitButton = form?.querySelector('button[type="submit"]');
  const formEmailIsValid = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(formSubmitEmail);

  if (form && submitButton && formEmailIsValid) {
    form.action = "https://formsubmit.co/" + formSubmitEmail;
    form.method = "POST";
    submitButton.disabled = false;
    if (status) status.textContent =
      "Your enquiry will be sent to FrameCrest. We will reply using the email address you provide.";
  } else if (form && submitButton) {
    submitButton.disabled = true;
    if (status) status.textContent =
      "The enquiry form is temporarily unavailable. Please email framecrest.media@gmail.com directly.";
  }

  // Interactive before/after photo-editing comparison on the Services page.
  document.querySelectorAll(".before-after-frame").forEach(frame => {
    const range = frame.querySelector(".before-after-range");
    if (!range) return;
    const updateComparison = () => {
      const value = Math.min(100, Math.max(0, Number(range.value)));
      frame.style.setProperty("--split", value + "%");
      range.setAttribute("aria-valuetext", value + " percent edited, " + (100 - value) + " percent original");
    };
    range.addEventListener("input", updateComparison);
    updateComparison();
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
