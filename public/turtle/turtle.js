window.TurtleGame = {
  updateSanMood(ratio) {
    document.body.classList.toggle("san-warning", ratio <= 0.3 && ratio > 0.2);
    document.body.classList.toggle("san-danger", ratio <= 0.2 && ratio > 0.1);
    document.body.classList.toggle("san-critical", ratio <= 0.1);
  },
  clearSanMood() {
    document.body.classList.remove("san-warning", "san-danger", "san-critical", "san-mood-off");
  },
};
