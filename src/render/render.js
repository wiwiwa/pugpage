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

// === User State ===
var __AUTH_SESSION_KEY = "pugpage.authHeader.session";
var __AUTH_LOCAL_KEY = "pugpage.authHeader.local";

function __readAuthHeader() {
  var session = sessionStorage.getItem(__AUTH_SESSION_KEY);
  if (session !== null) return session;
  var local = localStorage.getItem(__AUTH_LOCAL_KEY);
  if (local !== null) return local;
  return null;
}

function __clearAuthStorage() {
  sessionStorage.removeItem(__AUTH_SESSION_KEY);
  localStorage.removeItem(__AUTH_LOCAL_KEY);
}

window.$user = {
  name: "",
  roles: [],
  lang: null,
  loginUrl: "/login",
  setAuthHeader: function (value, persistent) {
    __clearAuthStorage();
    if (value === null) return;
    if (persistent) {
      localStorage.setItem(__AUTH_LOCAL_KEY, value);
    } else {
      sessionStorage.setItem(__AUTH_SESSION_KEY, value);
    }
  },
  logout: function () {
    var url = this.loginUrl;
    this.name = "";
    this.roles = [];
    this.lang = null;
    this.loginUrl = "/login";
    __clearAuthStorage();
    window.navigateTo(url);
  }
};

// === Reactive Scope ===
var __rerendering = false;

function createScope(initial) {
  var dirty = false;
  var scope = new Proxy(Object.create(null), {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop))
        return target[prop];
      if (prop in window) return window[prop];
    },
    set(target, prop, value) {
      if (__rerendering && Object.prototype.hasOwnProperty.call(target, prop))
        return true;
      if (target[prop] !== value) {
        target[prop] = value;
        dirty = true;
      }
      return true;
    }
  });
  if (initial) Object.assign(scope, initial);
  return {
    scope,
    isDirty() { return dirty; },
    clearDirty() { dirty = false; }
  };
}

function __findScopeProxy(elm) {
  var el = elm;
  while (el) {
    if (el.__scope) return el.__scope.scope;
    el = el.parentElement;
  }
  return null;
}
window.__findScopeProxy = __findScopeProxy;

function __handlerScope(scope) {
  return new Proxy(scope, { has() { return true; } });
}
window.__handlerScope = __handlerScope;

function __rerenderOnEvent(elm) {
  var el = elm;
  while (el) {
    if (el.__scope && el.__tpl) {
      if (el.__scope.isDirty()) {
        el.__scope.clearDirty();
        __rerendering = true;
        try { renderScope(el, el.__tpl, el.__scope); }
        finally { __rerendering = false; }
      }
      return;
    }
    el = el.parentElement;
  }
}
window.__rerenderOnEvent = __rerenderOnEvent;

function renderScope(element, tplFn, scopeTracker) {
  try {
    var vnode = tplFn(scopeTracker.scope);
  } catch (e) {
    console.error("renderScope template error:", e);
    return;
  }
  if (Array.isArray(vnode)) vnode = h("div", vnode);
  if (element._childVdom) {
    element._childVdom = __patch(element._childVdom, vnode || h("div"));
  } else {
    element.innerHTML = "";
    var mount = document.createElement("div");
    element.appendChild(mount);
    element._childVdom = __patch(mount, vnode || h("div"));
  }
  __initScopedForms(element);
}

var __RESERVED_KEYS = { $rest: true, $user: true, $page: true };

async function fetchIntoScope(restUrl, scopeTracker, fetchOpts) {
  var url = new URL(restUrl, window.location.href);
  var sameOrigin = url.origin === window.location.origin;
  var opts = fetchOpts || { headers: { "Accept": "application/json" } };

  if (sameOrigin) {
    opts.credentials = "same-origin";
    var auth = __readAuthHeader();
    if (auth) opts.headers["Authorization"] = auth;
  }

  var res;
  try {
    res = await fetch(url.href, opts);
  } catch (e) {
    scopeTracker.scope.$rest = { status: 0, data: { error: e.message }, loading: false, headers: {} };
    return null;
  }

  var data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON response */ }

  var h = res.headers;
  scopeTracker.scope.$rest = {
    status: res.status,
    data: data,
    loading: false,
    get headers() {
      var obj = {};
      h.forEach(function(v, k) { obj[k] = v; });
      return obj;
    }
  };
  if (res.ok && data) {
    for (var key in data) {
      if (!__RESERVED_KEYS[key]) scopeTracker.scope[key] = data[key];
    }
  }

  return res;
}

function __initFormScope(form) {
  var rest = form.getAttribute("rest");
  form.__scope = createScope({ $user: window.$user, $page: window.__pugpage_page || {}, $rest: { status: null, data: null } });

  if (form.__tpl) renderScope(form, form.__tpl, form.__scope);

  if (rest) {
    fetchIntoScope(rest, form.__scope).then(function () {
      if (form.__scope.isDirty()) {
        form.__scope.clearDirty();
        renderScope(form, form.__tpl, form.__scope);
      }
    });
  }
}

function __initScopedForms(root) {
  var forms = root.querySelectorAll("form");
  for (var i = 0; i < forms.length; i++) {
    if (forms[i].__needsScope && !forms[i].__scope) {
      __initFormScope(forms[i]);
    }
  }
}

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

function navigateToUrl(url) {
  var targetUrl = new URL(url, window.location.href);
  if (targetUrl.origin !== window.location.origin) {
    window.location.assign(targetUrl.href);
    return;
  }

  history.pushState(null, "", targetUrl.href);
}

window.navigateTo = function (url) {
  navigateToUrl(url);
};

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
    if (pageFn && !pageArgs.$args && segments.length > 0) {
      pageArgs.$args = segments;
    }
  }
  if (!pageFn) return console.info("No Pug page found for path:", path);

  pageArgs.$page = {
    path: path,
    args: pageArgs.$args || [],
    params: Object.fromEntries(url.searchParams.entries()),
  };

  pageArgs.$user = window.$user;

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
      __initScopedForms(document.body);
      return;
    }
  }

  __currentLayout = targetLayout;
  var pageHtml = pageFn(pageArgs);
  var composedHtml = composeWithLayout(pageHtml, targetLayout);
  renderPage(composedHtml);
  __initScopedForms(document.body);
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
    this.__scope = createScope({ $user: window.$user, $page: window.__pugpage_page || {}, $rest: { status: null, data: null, loading: true, headers: {} } });

    if (this.__tpl) renderScope(this, this.__tpl, this.__scope);

    if (rest) {
      var res = await fetchIntoScope(rest, this.__scope);
      if (res && res.status === 401) {
        var restUrl = new URL(rest, window.location.href);
        if (restUrl.origin === window.location.origin) {
          window.$user.logout();
          return;
        }
      }
      if (this.__scope.isDirty()) {
        this.__scope.clearDirty();
        renderScope(this, this.__tpl, this.__scope);
      }
    } else if (src) {
      var pageFn = pug_pages(src);
      if (pageFn) {
        var vnode = pageFn(this.__scope.scope);
        if (this._childVdom) {
          this._childVdom = __patch(this._childVdom, vnode);
        } else {
          this.innerHTML = "";
          var mount = document.createElement("div");
          this.appendChild(mount);
          this._childVdom = __patch(mount, vnode);
        }
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
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var target = event.target.closest("a");
    if (!target || !target.hasAttribute("href")) return;
    if (target.getAttribute("target") === "_blank") return;
    if (target.origin !== window.location.origin) return;
    event.preventDefault();
    var href = target.getAttribute("href");
    if (href.charAt(0) !== "#")
      navigateToUrl(target.href);
  });

  document.body.addEventListener("submit", async function (event) {
    var form = event.target;
    if (form.tagName !== "FORM") return;
    var action = form.getAttribute("action");
    var href = form.getAttribute("href");

    if (form.__scope && action) {
      event.preventDefault();
      var formData = new FormData(form);
      var data = {};
      for (var entry of formData.entries()) {
        data[entry[0]] = entry[1];
      }

      var method = (form.method || "POST").toUpperCase();
      var fetchOpts = { method: method, headers: { "Accept": "application/json" } };
      var fetchUrl = action;

      if (method === "GET") {
        var qs = new URLSearchParams(data).toString();
        if (qs) fetchUrl = action + "?" + qs;
      } else {
        var enctype = form.enctype || "application/x-www-form-urlencoded";
        if (enctype === "multipart/form-data") {
          fetchOpts.body = formData;
        } else {
          fetchOpts.headers["Content-Type"] = "application/json";
          fetchOpts.body = JSON.stringify(data);
        }
      }

      var res = await fetchIntoScope(fetchUrl, form.__scope, fetchOpts);
      if (form.__scope.isDirty()) {
        form.__scope.clearDirty();
        renderScope(form, form.__tpl, form.__scope);
      }

      if (href && res && res.ok) {
        history.pushState(null, "", href);
      }
      return;
    }

    if (!href) return;

    event.preventDefault();

    var formData = new FormData(form);
    var data = {};
    for (var entry of formData.entries()) {
      data[entry[0]] = entry[1];
    }

    try {
      var method = (form.method || "POST").toUpperCase();
      var fetchOpts = { method: method, headers: { "Accept": "application/json" } };
      var fetchUrl = action;

      if (method === "GET") {
        var qs = new URLSearchParams(data).toString();
        if (qs) fetchUrl = action + "?" + qs;
      } else {
        var enctype = form.enctype || "application/x-www-form-urlencoded";
        if (enctype === "multipart/form-data") {
          fetchOpts.body = formData;
        } else {
          fetchOpts.headers["Content-Type"] = "application/json";
          fetchOpts.body = JSON.stringify(data);
        }
      }

      var response = await fetch(fetchUrl, fetchOpts);

      if (response.ok) {
        var detail = { headers: {} };
        response.headers.forEach(function(v, k) { detail.headers[k] = v; });
        try { detail.data = await response.json(); } catch (e) { /* ignore */ }
        form.dispatchEvent(new CustomEvent("rest", { detail: detail, bubbles: true }));
        if (href) history.pushState(null, "", href);
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
