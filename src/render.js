let document = null;
let pugFunction = null;

export function renderInit(doc, pugFunc) {
  document = doc;
  pugFunction = pugFunc;
  document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML = renderPug('/index', { title: 'Hello World' });
  });
}

export function renderPug(filePath, data) {
  return pugFunction(filePath)(data);
}
