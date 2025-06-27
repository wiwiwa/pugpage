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
      shadowRoot.innerHTML = renderPug(src, data);
    } else {
      // If src is omitted, re-render child content with data
      // This part needs more thought on how to re-render existing child content with new data.
      // For now, we'll just log a warning.
      console.warn('pug-page element without "src" attribute. Child content re-rendering with fetched data is not yet fully implemented.');
    }
  }
}

function renderPug(filePath, data) {
  return pug_pages(filePath)(data);
}

function onUrlChange(event) {
  const url = new URL(event&&event.target && event.target.href || window.location.href);
  const path = url.pathname;
  let pageFn = null;
  const pageArgs = Object.assign({}, Object.fromEntries(url.searchParams.entries()));
  if(path.endsWith('/'))
    pageFn = pug_pages(path+'index');
  if(!pageFn)
    pageFn = pug_pages(path);
  const segments = path.split('/').slice(1);
  if(segments.length>1){
    if(!pageFn){ // /a/b/c/show
      const path = '/' + segments.slice(0, segments.length-1).join('/');
      pageFn = pug_pages(path+'/show');
      if(pageFn)
        pageArgs.$args = [segments[segments.length-1]];
    }
    if(!pageFn){ // /a/c/b => /a/c?args=[b]
      const path = '/' + segments.slice(0, segments.length-2)
        .concat(segments[segments.length-1])
        .join('');
      pageFn = pug_pages(path);
      if(pageFn)
        pageArgs.$args = [segments[segments.length-2]];
    }
    if(!pageFn){
      for (let i = segments.length-1; i > 0; i--) {
        const path = '/' + segments.slice(0, i).join('');
        pageFn = pug_pages(path);
        if(pageFn){
          pageArgs.$args = segments.slice(i);
          break;
        }
      }
    }
  }
  if(!pageFn)
    return console.info(`No Pug page found for path: ${path}`);
  let html = pageFn(pageArgs);
  window.document.body.innerHTML = html;
  event && event.preventDefault();
}

window.customElements.define('pug-page', PugPageElement);
window.addEventListener('popstate', onUrlChange);
window.addEventListener('pushstate', onUrlChange);
window.addEventListener('replacestate', onUrlChange);
window.document.body.addEventListener('click', (event) => {
  if (event.target.tagName === 'A' && event.target.hasAttribute('href'))
    onUrlChange(event);
});
onUrlChange();
