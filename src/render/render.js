// === VDOM Runtime ===
// Loaded after dist.js which provides window globals: pug_pages, h, __s, __v, pug_layout_map, pug_layout_chain

import { init, h, attributesModule, classModule, propsModule, styleModule, eventListenersModule } from "https://cdn.jsdelivr.net/npm/snabbdom@3.6.3/build/index.js";

var __patch = init([attributesModule, classModule, propsModule, styleModule, eventListenersModule]);

window.h = h;

// === State ===
var __currentVdom = null;
var __container = null;
var __currentLayout = null;

// Layout metadata from bundle (graceful fallback for test scope)
var __layout_map = typeof pug_layout_map !== "undefined" ? pug_layout_map : {};
var __layout_chain = typeof pug_layout_chain !== "undefined" ? pug_layout_chain : {};

// === User State (T19) ===
window.__pugpage_user = window.__pugpage_user || { roles: [], lang: null };
window.__pugpage_setUser = function (user) {
  window.__pugpage_user = user;
};

// === Mount/Patch Orchestrator (T15) ===
function renderPage(vnode) {
  if (!__container) {
    document.body.innerHTML = "";
    __container = document.createElement("div");
    document.body.appendChild(__container);
    __currentVdom = __patch(__container, vnode);
  } else {
    __currentVdom = __patch(__currentVdom, vnode);
  }
}

// === Layout Composition (T18) ===
function composeWithLayout(contentVnode, layoutPath) {
  if (!layoutPath) return contentVnode;
  var layoutFn = pug_pages(layoutPath);
  if (!layoutFn) return contentVnode;

  var parentLayout = __layout_chain[layoutPath] || null;
  var innerContent = layoutFn({ __content: contentVnode });

  return composeWithLayout(innerContent, parentLayout);
}

// === Route Resolver (T16) ===
var __pageFn = null;
var __pageArgs = null;

function onUrlChange() {
  var url = new URL(window.location.href);
  var path = url.pathname;
  var pageFn = null;
  var pageArgs = Object.assign(
    {},
    Object.fromEntries(url.searchParams.entries()),
  );

  if (path.endsWith("/")) pageFn = pug_pages(path + "index");
  if (!pageFn) pageFn = pug_pages(path);

  var segments = path.split("/").slice(1);
  if (segments.length > 1) {
    if (!pageFn) {
      var p = "/" + segments.slice(0, segments.length - 1).join("/");
      pageFn = pug_pages(p + "/show");
      if (pageFn) pageArgs.$args = [segments[segments.length - 1]];
    }
    if (!pageFn) {
      var p = "/" + segments.slice(0, segments.length - 2)
        .concat(segments[segments.length - 1])
        .join("/");
      pageFn = pug_pages(p);
      if (pageFn) pageArgs.$args = [segments[segments.length - 2]];
    }
    if (!pageFn) {
      for (var i = segments.length - 1; i > 0; i--) {
        var p = "/" + segments.slice(0, i).join("/");
        pageFn = pug_pages(p);
        if (pageFn) {
          pageArgs.$args = segments.slice(i);
          break;
        }
      }
    }
  }

  if (!pageFn) {
    pageFn = pug_pages("/404");
  }
  if (!pageFn) return console.info("No Pug page found for path:", path);

  pageArgs.$page = {
    path: path,
    args: pageArgs.$args || [],
    params: Object.fromEntries(url.searchParams.entries()),
  };

  // T19: $user injection
  pageArgs.$user = window.__pugpage_user;

  __pageFn = pageFn;
  __pageArgs = pageArgs;

  // T18: Layout composition
  var resolvedPath = null;
  for (var rp in __layout_map) {
    var pageCheck = pug_pages(rp);
    if (pageCheck === pageFn) {
      resolvedPath = rp;
      break;
    }
  }
  // Fallback: find the resolved path from URL matching
  if (!resolvedPath) resolvedPath = path;

  var targetLayout = __layout_map[resolvedPath] || null;

  if (targetLayout && targetLayout === __currentLayout) {
    var contentContainer = document.getElementById("__pug_content__");
    if (contentContainer) {
      var pageHtml = pageFn(pageArgs);
      var newContent = h("div#__pug_content__", {}, pageHtml);
      __patch(contentContainer.__vnode || contentContainer, newContent);
      return;
    }
  }

  __currentLayout = targetLayout;
  var pageHtml = pageFn(pageArgs);
  var composedHtml = composeWithLayout(pageHtml, targetLayout);
  renderPage(composedHtml);
}

// === pug-page Composition (T17) ===
class PugPageElement extends HTMLElement {
  constructor() {
    super();
    this._childVdom = null;
  }

  connectedCallback() {
    if (this.parentNode === document.body && !__container) return;
    if (this._loaded) return;
    this._loaded = true;
    this._load();
  }

  async _load() {
    var src = this.getAttribute("src");
    var rest = this.getAttribute("rest");
    var data = {};

    // T19: inject $user and $page into pug-page data
    data.$user = window.__pugpage_user;
    data.$page = window.__pugpage_page || {};

    if (rest) {
      try {
        var res = await fetch(rest, { headers: { "Accept": "application/json" } });
        data = await res.json();
        data.$user = window.__pugpage_user;
        data.$page = window.__pugpage_page || {};
      } catch (e) {
        console.error("Error fetching REST data:", e);
      }
    }

    if (src) {
      var pageFn = pug_pages(src);
      if (pageFn) {
        var vnode = pageFn(data);
        if (this._childVdom) {
          this._childVdom = __patch(this._childVdom, vnode);
        } else {
          this.innerHTML = "";
          var mount = document.createElement("div");
          this.appendChild(mount);
          this._childVdom = __patch(mount, vnode);
        }
      }
    } else if (rest && this.__tpl) {
      var tplResult;
      try { tplResult = this.__tpl(data); } catch(e) { console.error("pug-page __tpl error:", e); return; }
      var vnode = Array.isArray(tplResult) ? h("div", tplResult) : tplResult;
      if (this._childVdom) {
        this._childVdom = __patch(this._childVdom, vnode || h("div"));
      } else {
        this.innerHTML = "";
        var mount = document.createElement("div");
        this.appendChild(mount);
        this._childVdom = __patch(mount, vnode || h("div"));
      }
    }
  }
}

// === Event Listeners ===
customElements.define("pug-page", PugPageElement);

window.addEventListener("popstate", onUrlChange);

var _pushState = history.pushState;
history.pushState = function () {
  _pushState.apply(this, arguments);
  window.dispatchEvent(new Event("pushstate"));
};

var _replaceState = history.replaceState;
history.replaceState = function () {
  _replaceState.apply(this, arguments);
  window.dispatchEvent(new Event("replacestate"));
};

window.addEventListener("pushstate", onUrlChange);
window.addEventListener("replacestate", onUrlChange);

// === Initialize ===
function __boot() {
  document.body.addEventListener("click", function (event) {
    var target = event.target.closest("a");
    if (
      target &&
      target.hasAttribute("href") &&
      target.origin === window.location.origin
    ) {
      event.preventDefault();
      history.pushState(null, "", target.href);
    }
  });

  document.body.addEventListener("submit", async function (event) {
    var form = event.target;
    if (form.tagName !== "FORM") return;

    event.preventDefault();

    var action = form.getAttribute("action");
    var href = form.getAttribute("href");

    var formData = new FormData(form);
    var data = {};
    for (var entry of formData.entries()) {
      data[entry[0]] = entry[1];
    }

    try {
      var response = await fetch(action, {
        method: form.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok && href) {
        history.pushState(null, "", href);
      }
    } catch (e) {
      console.error("Form submission error:", e);
    }
  });

  onUrlChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", __boot);
} else {
  __boot();
}
