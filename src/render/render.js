function renderPug(filePath, data) {
  return pug_pages(filePath)(data);
}

class PugPageElement extends window.HTMLElement {
  async connectedCallback() {
    const src = this.getAttribute('src');
    const rest = this.getAttribute('rest');
    let data = {};

    if (rest) {
      try {
        const response = await window.fetch(rest);
        data = await response.json();
      } catch (error) {
        console.error('Error fetching REST data:', error);
      }
    }

    if (src) {
      const shadowRoot = this.attachShadow({ mode: 'open' });
      shadowRoot.innerHTML = renderPug(src,data);
    } else {
      // If src is omitted, re-render child content with data
      // This part needs more thought on how to re-render existing child content with new data.
      // For now, we'll just log a warning.
      console.warn('pug-page element without "src" attribute. Child content re-rendering with fetched data is not yet fully implemented.');
    }
  }
}

window.customElements.define('pug-page', PugPageElement);
