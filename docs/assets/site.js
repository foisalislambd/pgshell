(function () {
  var btn = document.getElementById("nav-toggle");
  var panel = document.getElementById("nav-panel");
  if (!btn || !panel) return;
  btn.addEventListener("click", function () {
    var open = panel.classList.toggle("hidden") === false;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();
