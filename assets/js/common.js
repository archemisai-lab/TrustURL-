// Shared by every page: dynamic copyright year.
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
