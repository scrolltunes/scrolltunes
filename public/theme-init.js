// Blocking script to prevent theme flash on page load
// This runs before React hydration to set the correct theme class
;(() => {
  let isDark = true // Default to dark theme
  try {
    const stored = localStorage.getItem("scrolltunes-preferences")
    const prefs = stored ? JSON.parse(stored) : {}
    const mode = prefs.themeMode || "system"
    isDark =
      mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  } catch {
    // localStorage unavailable or invalid JSON - use dark theme default
  }
  document.documentElement.classList.add(isDark ? "dark" : "light")
  document.documentElement.style.backgroundColor = isDark ? "#070A12" : "#FAF7F2"
})()
