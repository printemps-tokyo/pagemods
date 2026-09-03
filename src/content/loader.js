// Content scripts declared in the manifest are classic scripts, so this is
// the one file that is not an ES module. It only pulls in the real entry
// point, which is exposed through web_accessible_resources.
(async () => {
  try {
    await import(chrome.runtime.getURL("src/content/main.js"));
  } catch (error) {
    console.warn("pagemods: could not load the content module", error);
  }
})();
