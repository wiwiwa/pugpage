// === VDOM Runtime ===
// Loaded after dist.js which assigns window.__pugpage with bundle data

import { init, h, attributesModule, classModule, propsModule, styleModule, eventListenersModule } from "https://cdn.jsdelivr.net/npm/snabbdom@3.6.3/build/index.js";

var __patch = init([attributesModule, classModule, propsModule, styleModule, eventListenersModule]);

window.$h = h;

// === Helpers ===
window.$s = function $s(v) { return v == null ? '' : String(v); };
window.$v = function $v(fn) { try { return fn(); } catch(e) { if (e instanceof ReferenceError) console.warn('PugPage:', e.message); return ''; } };

function __initRegistries() {
  var data = window.__pugpage;
  window.__pugpage = null;
  var _ref = data || {};
  var pageCases = _ref.pageCases || {};
  var componentCases = _ref.componentCases || {};
  var pagePaths = _ref.pagePaths || [];
  var componentPaths = _ref.componentPaths || [];

  function buildRegistry(cases) {
    var cache = {};
    function lookup(filePath) {
      if (cache[filePath]) return cache[filePath];
      var raw = cases[filePath];
      if (raw) {
        var fn = function(data) { return raw(data); };
        fn.init = raw.init || null;
        cache[filePath] = fn;
        return fn;
      }
      return null;
    }
    lookup.__cache = cache;
    return lookup;
  }

  window.pug_components = buildRegistry(componentCases);
  window.pug_components.__paths = componentPaths;

  var componentLookup = window.pug_components;
  var pageLookup = buildRegistry(pageCases);
  window.pug_pages = function(filePath) {
    var result = pageLookup(filePath);
    if (!result) result = componentLookup(filePath);
    return result;
  };
  window.pug_pages.__cache = pageLookup.__cache;
  window.pug_pages.__paths = pagePaths;

  window.__layout_map = data.layoutMap || {};
  window.__layout_chain = data.layoutChain || {};
  window.pug_i18n = data.pugI18n || {};
  window.__lang_default = data.langDefault || "en";
}

__initRegistries();

// === Auth State ===
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

// === User State ===
window.$user = new Proxy({
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
}, {
  set(t, prop, value) {
    t[prop] = value;
    if (prop !== "lang" && prop !== "lang_default") return true;
    updatePage();
    return true;
  }
});
if (window.__lang_default) window.$user.lang_default = window.__lang_default;

// === i18n ===
window.$T = function $T(key, scopeI18n, scope) {
  if (scope) scope.$user; // trigger dep tracking for reactivity
  var lang = window.$user.lang;
  var langDefault = window.$user.lang_default || "en";
  var base = lang ? lang.split("_")[0] : "";
  var entry = scopeI18n && scopeI18n[key];
  if (!entry) return key;
  var result = entry[lang] || (base && entry[base]) || entry[langDefault] || key;
  if (scope && result.indexOf('#{') !== -1) {
    result = result.replace(/#\{([^}]+)\}/g, function(_, expr) {
      var val = scope[expr.trim()];
      return val != null ? String(val) : "";
    });
  }
  return result;
};

// === Page State ===
window.$page = { path: "", args: [], params: {} };

// === Navigation Counter ===


// === Scope Architecture ===
// createRenderScope returns a scope proxy directly (no tracker object).
// Runtime-owned fields stored on scope target: $renderFn, $element,
// $templateKey, $dirty, $scheduled, $deps, $parentScope, $vnode.
// Proxy get: only $user, $page, $args, $params, window — no general window fallback.
// Compiled templates use window.$h(), window.$s(), window.$v() explicitly.

var __RUNTIME_FIELDS = {
  $dirty: 1, $scheduled: 1, $deps: 1, $renderFn: 1,
  $element: 1, $templateKey: 1, $parentScope: 1,
  $vnode: 1, $titles: 1, $title: 1, $definingInputs: 1, $_target: 1
};

var SCOPE_GLOBALS = ["Math", "console", "Date", "JSON", "Array", "Object", "String", "Number", "Boolean", "Error", "parseInt", "parseFloat", "isNaN", "isFinite", "undefined", "NaN", "Infinity", "encodeURIComponent", "decodeURIComponent", "Promise", "Symbol", "Map", "Set", "RegExp", "document", "fetch", "URL", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"];

function createRenderScope(element, templateKey, renderFn, initFn, initial) {
  var target = Object.assign(Object.create(null), {
    $element: element,
    $renderFn: renderFn,
    $templateKey: templateKey,
    $dirty: false,
    $scheduled: false,
    $deps: new Set(),
    $childScopes: [],
    $parentScope: __findScopeProxy(element.parentElement) || window.pug_router,
    $vnode: null,
    $titles: [],
    $title: null,
    $_target: null,
  }, initial);
  target.$_target = target;

  var __tHolder = { __s: null };
  target.__tProxy = new Proxy(__tHolder, {
    get(t, key) {
      if (typeof key !== "string") return undefined;
      t.__s.$user;
      return window.$T(key, t.__s.$i18n, t.__s);
    },
    set() { throw new Error("Cannot assign to T"); }
  });

  var scope = new Proxy(target, {
    has(t, prop) {
      if (typeof prop === "string" && prop.charAt(0) === "$" && prop.charAt(1) === "$") return prop in t;
      return true;
    },
    get(t, prop) {
      if (prop === "$titles") t.$deps.add("$titles");
      if (Object.prototype.hasOwnProperty.call(t, prop))
        return t[prop];
      switch (prop) {
        case "$user": t.$deps.add("$user"); return window.$user;
        case "$i18n": return t.$i18n;
        case "$T": return t.__tProxy;
        case "$page": t.$deps.add("$page"); return window.$page;
        case "$args": return window.$page.args;
        case "$params": return window.$page.params;
        case "window": return window;
        default:
          if (typeof prop !== "string" || prop.charAt(0) === "$") return undefined;
          if (SCOPE_GLOBALS.indexOf(prop) !== -1) return window[prop];
          return undefined;
      }
    },
    set(t, prop, value) {
      if (typeof prop === "string" && prop.charAt(0) === "$" && prop !== "$title") {
        return true;
      }
      if (t[prop] !== value) {
        t[prop] = value;
        if (!__RUNTIME_FIELDS[prop]) markDirty(scope);
        if (prop === "$title") propagateTitleChange(scope);
      }
      return true;
    }
  });

  __tHolder.__s = scope;

  target.$parentScope.$_target.$childScopes.push(scope);

  if (initFn) {
    var initProxy = new Proxy(target, {
    has(t, prop) {
      if (typeof prop === "string" && prop.charAt(0) === "$" && prop.charAt(1) === "$") return prop in t;
      return true;
    },
      get(t, p) {
        if (Object.prototype.hasOwnProperty.call(t, p)) return t[p];
        switch (p) {
          case "$user": return window.$user;
          case "$page": return window.$page;
          case "window": return window;
        default:
          if (typeof p !== "string" || p.charAt(0) === "$") return undefined;
          if (SCOPE_GLOBALS.indexOf(p) !== -1) return window[p];
          return undefined;
      }
      },
      set(t, p, v) { t[p] = v; return true; }
    });
    initFn(initProxy);
  }

  return scope;
}

function markDirty(scope) {
  var t = scope.$_target;
  if (!t.$dirty) t.$dirty = true;
  if (!t.$scheduled && t.$element) {
    t.$scheduled = true;
    queueMicrotask(function () {
      flushRender(scope);
    });
  }
}

function flushRender(scope) {
  var t = scope.$_target;
  t.$scheduled = false;
  if (t.$dirty && t.$element) {
    t.$dirty = false;
    scope.$renderFn(scope);
  }
}

// === Scope Reuse and Disposal ===

function shouldCreateScope(scope, definingInputs) {
  if (!scope) return true;
  var prev = scope.$definingInputs;
  if (!prev) return true;
  var keys = Object.keys(definingInputs);
  for (var i = 0; i < keys.length; i++) {
    if (prev[keys[i]] !== definingInputs[keys[i]]) return true;
  }
  return false;
}

function createOrReuseScope(element, templateKey, renderFn, initFn, initial, definingInputs) {
  var existing = element.__scope || null;
  if (existing && existing.$templateKey === templateKey && !shouldCreateScope(existing, definingInputs)) {
    return existing;
  }
  if (existing) scopeDisposal(existing);
  var scope = createRenderScope(element, templateKey, renderFn, initFn, initial);
  if (definingInputs) scope.$_target.$definingInputs = definingInputs;
  return scope;
}

function scopeDisposal(scope) {
  var t = scope.$_target;
  if (t.$title != null) {
    t.$title = null;
    propagateTitleChange(scope);
  }
  var parent = t.$parentScope;
  var siblings = parent.$_target.$childScopes;
  var idx = siblings.indexOf(scope);
  if (idx !== -1) siblings.splice(idx, 1);
  t.$childScopes = [];
  t.$dirty = false;
  t.$scheduled = false;
  t.$vnode = null;
  var el = t.$element;
  if (el) el.__scope = null;
  t.$element = null;
}
window.scopeDisposal = scopeDisposal;

function propagateTitleChange(scope) {
  var t = scope.$_target;

  var chain = [];
  if (t.$title != null) chain.push(t.$title);
  if (t.$titles.length > 0) chain = chain.concat(t.$titles);

  if (!t.$parentScope) {
    documentTitle(chain);
    return;
  }

  var propagating = chain;
  var current = t.$parentScope;
  while (current) {
    var ct = current.$_target;
    var changed = !titlesEqual(propagating, ct.$titles);
    ct.$titles = propagating;
    if (changed) {
      if (ct.$deps && ct.$deps.has("$titles")) markDirty(current);
    }
    if (!ct.$parentScope) {
      var fullChain = [];
      if (ct.$title != null) fullChain.push(ct.$title);
      fullChain = fullChain.concat(ct.$titles);
      documentTitle(fullChain);
      return;
    }
    propagating = [];
    if (ct.$title != null) propagating.push(ct.$title);
    propagating = propagating.concat(ct.$titles);
    current = ct.$parentScope;
  }
}

// === Scope Utilities ===

function __findScopeProxy(elm) {
  var el = elm;
  while (el) {
    if (el.__scope) return el.__scope;
    el = el.parentElement;
  }
  return null;
}
window.__findScopeProxy = __findScopeProxy;

function __handlerScope(scope) {
  return new Proxy(scope, {
    has(t, prop) {
      if (typeof prop === "string" && prop.charAt(0) === "$" && prop.charAt(1) === "$") return prop in t;
      return true;
    },
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      switch (prop) {
        case "$user": return window.$user;
        case "$page": return window.$page;
        case "window": return window;
        default:
          if (typeof prop !== "string" || prop.charAt(0) === "$") return undefined;
          if (SCOPE_GLOBALS.indexOf(prop) !== -1) return window[prop];
          return undefined;
      }
    }
  });
}
window.__handlerScope = __handlerScope;

function __rerenderOnEvent(elm) {
  var el = elm;
  while (el) {
    if (el.__scope && el.__scope.$renderFn) {
      el.__scope.$_target.$dirty = false;
      el.__scope.$renderFn(el.__scope);
      return;
    }
    el = el.parentElement;
  }
}
window.__rerenderOnEvent = __rerenderOnEvent;

// === Render ===

function __flattenVnodes(arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    if (Array.isArray(arr[i])) {
      var flat = __flattenVnodes(arr[i]);
      for (var j = 0; j < flat.length; j++) out.push(flat[j]);
    } else if (arr[i] != null) {
      out.push(arr[i]);
    }
  }
  return out;
}

function patchVdomInto(element, vnode) {
  if (Array.isArray(vnode)) vnode = h("div", __flattenVnodes(vnode));
  if (element._childVdom) {
    element._childVdom = __patch(element._childVdom, vnode || h("div"));
  } else {
    element.innerHTML = "";
    var mount = document.createElement("div");
    element.appendChild(mount);
    element._childVdom = __patch(mount, vnode || h("div"));
  }
  return vnode;
}

// makeRenderFn creates a renderFn closure for a given element + template.
// renderFn(scope): creates scope when null, renders, returns scope.
function makeRenderFn(element, tplFn) {
  return function renderFn(scope) {
    var vnode;
    var prevSlotScope = window.__slotScope;
    window.__slotScope = scope;
    try {
      vnode = tplFn(scope);
    } catch (e) {
      console.error("renderScope template error:", e);
      window.__slotScope = prevSlotScope;
      return scope;
    }
    window.__slotScope = prevSlotScope;
    vnode = patchVdomInto(element, vnode);
    scope.$_target.$vnode = vnode;
    initScopedForms(element);
    if (window.pug_router && element !== window.pug_router) {
      var rootPage = window.pug_router.querySelector("pug-page");
      if (rootPage && rootPage.__scope) {
        var _rt = rootPage.__scope.$_target;
        var _rc = [];
        if (_rt.$title) _rc.push(_rt.$title);
        if (_rt.$titles) _rc = _rc.concat(_rt.$titles);
        documentTitle(_rc);
      }
    }
    return scope;
  };
}

// === Title Chain ===

function titlesEqual(a, b) {
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].href !== b[i].href) return false;
  }
  return true;
}

function documentTitle(titles) {
  if (!titles || titles.length === 0) { document.title = ""; return; }
  var current = "";
  for (var i = 0; i < titles.length; i++) {
    var label = titles[i].label;
    if (!label) continue;
    if (!current) {
      current = label;
    } else {
      current = (document.titleFn || function (p, c) { return p + " | " + c; })(label, current);
    }
  }
  document.title = current;
}

// === REST ===

async function fetchIntoScope(restUrl, scope, fetchOpts) {
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
    scope.$_target.$rest = { status: 0, data: { error: e.message }, loading: false, headers: {} };
    return null;
  }

  var data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON response */ }

  var hdrs = res.headers;
  scope.$_target.$rest = {
    status: res.status,
    data: data,
    loading: false,
    get headers() {
      var obj = {};
      hdrs.forEach(function (v, k) { obj[k] = v; });
      return obj;
    }
  };
  if (res.ok && data) {
    mergeRestData(scope, data);
  }

  return res;
}

function mergeRestData(scope, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  for (var key in data) {
    if (key.charAt(0) !== "$") {
      scope[key] = data[key];
    }
  }
}

// === Scoped Forms ===

function initFormScope(form) {
  var rest = form.getAttribute("rest");
  var tplFn = form.$formBodyFn;
  var initFn = form.$formBodyInit;
  var formBodyId = form.$formBodyId;
  var renderFn = makeRenderFn(form, tplFn);
  var definingInputs = { $formBodyId: formBodyId, rest: rest || null };

  if (form.__scope && !shouldCreateScope(form.__scope, definingInputs)) {
    var parentScope = __findScopeProxy(form.parentElement);
    var parentI18n = parentScope ? parentScope.$_target.$i18n : window.pug_i18n;
    __setupI18n(form.__scope, parentI18n);
    form.__scope.$_target.$dirty = false;
    renderFn(form.__scope);
    return;
  }
  if (form.__scope) scopeDisposal(form.__scope);

  form.__scope = createRenderScope(
    form, null, renderFn, initFn,
    { $titles: [], $rest: { status: null, data: null, loading: !!rest, headers: {} } }
  );
  form.__scope.$_target.$definingInputs = definingInputs;
  renderFn(form.__scope);
  var parentScope = __findScopeProxy(form.parentElement);
  var parentI18n = parentScope ? parentScope.$_target.$i18n : window.pug_i18n;
  __setupI18n(form.__scope, parentI18n);

  if (rest) {
    fetchIntoScope(rest, form.__scope).then(function () {
      form.__scope.$_target.$dirty = false;
      renderFn(form.__scope);
    });
  }
}

function initScopedForms(root) {
  var forms = root.querySelectorAll("form");
  for (var i = 0; i < forms.length; i++) {
    if (forms[i].$needsFormScope) {
      initFormScope(forms[i]);
    }
  }
}

// === Routing ===

window.renderSlot = function() {
  var scope = window.__slotScope;
  if (!scope) return null;
  var el = scope.$element;
  if (el) {
    var chain = el.__routeChain;
    var currentIndex = el.__routeIndex || 0;
    var nextIndex = currentIndex + 1;
    if (chain && nextIndex < chain.length) {
      var entry = chain[nextIndex];
      return h("pug-page", {
        key: entry.key,
        $tplFn: entry.fn,
        $initFn: entry.initFn || null,
        $routeChain: chain,
        $routeIndex: nextIndex,
        $i18n_parent: scope.$_target.$i18n || null,
        hook: PUG_PAGE_HOOK
      });
    }
  }
  return scope.$content || null;
};

function resolvePage(path, queryParams) {
  var pageFn = null;
  var pageArgs = {};

  if (path.endsWith("/")) pageFn = pug_pages(path + "index");
  if (!pageFn) pageFn = pug_pages(path);
  if (!pageFn && (pageFn = pug_pages(path + "/index"))) {
    history.replaceState(null, "", path + "/");
  }

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

  if (!pageFn) return null;

  window.$page = {
    path: path,
    args: pageArgs.$args || [],
    params: Object.fromEntries(queryParams.entries()),
  };

  return { pageFn: pageFn };
}

function buildLayoutList(pageTemplate) {
  var layouts = [];
  var current = __layout_map[pageTemplate] || null;
  while (current) {
    layouts.unshift(current);
    current = __layout_chain[current] || null;
  }
  return layouts;
}

function __setupI18n(scope, parentI18n) {
  const ownI18n = scope.$_target.$i18n;
  if(ownI18n)
    Object.setPrototypeOf(ownI18n, parentI18n||null);
  else
    scope.$_target.$i18n = Object.create(parentI18n||null);
}

// === pug-router ===

window.pug_router = null;

// === pug-page Mount ===

function __mountPage(el) {
  if (el._loaded) return;
  el._loaded = true;

  if (el.__tplFn) {
    __mountFromRouter(el);
  } else {
    __loadFromSrc(el);
  }
}

function __mountFromRouter(el) {
  var rest = el.getAttribute("rest");
  var hasFormBody = !!el.$formBodyFn;

  if (hasFormBody) {
    var renderFn = makeRenderFn(el, el.$formBodyFn);
    el.__scope = createRenderScope(
      el, null, renderFn, el.$formBodyInit,
      { $titles: [], $rest: { status: null, data: null, loading: !!rest, headers: {} } }
    );
    renderFn(el.__scope);
    __setupI18n(el.__scope, el.__i18n_parent || window.pug_i18n);

    if (rest) {
      fetchIntoScope(rest, el.__scope).then(function () {
        el.__scope.$_target.$dirty = false;
        renderFn(el.__scope);
      });
    }
  } else {
    var renderFn = makeRenderFn(el, el.__tplFn);
    el.__scope = createRenderScope(
      el, null, renderFn, el.__initFn,
      { $titles: [] }
    );
    renderFn(el.__scope);
    __setupI18n(el.__scope, el.__i18n_parent || window.pug_i18n);
  }

  if (el.parentNode === window.pug_router) {
    var _t = el.__scope.$_target;
    var _chain = [];
    if (_t.$title) _chain.push(_t.$title);
    if (_t.$titles) _chain = _chain.concat(_t.$titles);
    documentTitle(_chain);
  }
}

async function __loadFromSrc(el) {
  var src = el.getAttribute("src");
  var rest = el.getAttribute("rest");
  var hasFormBody = !!el.$formBodyFn;
  var tplFn = hasFormBody ? el.$formBodyFn : null;
  var initFn = hasFormBody ? el.$formBodyInit : null;
  var renderFn = tplFn ? makeRenderFn(el, tplFn) : null;

  el.__scope = createRenderScope(
    el, null, renderFn, initFn,
    { $titles: [], $rest: { status: null, data: null, loading: !!(rest && !hasFormBody), headers: {} } }
  );

  if (hasFormBody) {
    if (renderFn) renderFn(el.__scope);
    __setupI18n(el.__scope, el.__i18n_parent || window.pug_i18n);
    if (rest) {
      var res = await fetchIntoScope(rest, el.__scope);
      if (res && res.status === 401) {
        window.$user.logout();
        return;
      }
      el.__scope.$_target.$dirty = false;
      renderFn(el.__scope);
    }
  } else if (rest) {
    var res = await fetchIntoScope(rest, el.__scope);
    if (res && res.status === 401) {
      window.$user.logout();
      return;
    }
  }

  if (src) {
    var resolvedSrc = src;
    if (src.charAt(0) !== "/") {
      var currentPath = window.location.pathname;
      var dir = currentPath.substring(0, currentPath.lastIndexOf("/") + 1);
      resolvedSrc = dir + src;
    }
    if (resolvedSrc.endsWith(".pug")) resolvedSrc = resolvedSrc.slice(0, -4);
    var pageFn = pug_pages(resolvedSrc);
    if (pageFn) {
      el.__tplFn = pageFn;
      var srcRenderFn = makeRenderFn(el, pageFn);
      el.__scope.$_target.$renderFn = srcRenderFn;
      srcRenderFn(el.__scope);
    }
  }
}

// Snabbdom hook data for router-driven pug-page elements
var PUG_PAGE_HOOK = {
  create: function (_, vn) {
    vn.elm.__tplFn = vn.data.$tplFn || null;
    vn.elm.__initFn = vn.data.$initFn || null;
    vn.elm.__routeChain = vn.data.$routeChain || null;
    vn.elm.__routeIndex = vn.data.$routeIndex || 0;
    vn.elm.__i18n_parent = vn.data.$i18n_parent || null;
  },
  insert: function (vn) {
    __mountPage(vn.elm);
  },
  update: function (oldVn, vn) {
    vn.elm.__tplFn = vn.data.$tplFn || null;
    vn.elm.__initFn = vn.data.$initFn || null;
    vn.elm.__routeChain = vn.data.$routeChain || null;
    vn.elm.__routeIndex = vn.data.$routeIndex || 0;
    if (vn.elm.__scope && vn.elm.__tplFn && vn.elm._loaded) {
      vn.elm.__scope.$_target.$titles = [];
      vn.elm.__scope.$_target.$dirty = false;
      var renderFn = makeRenderFn(vn.elm, vn.elm.__tplFn);
      vn.elm.__scope.$_target.$renderFn = renderFn;
      renderFn(vn.elm.__scope);
      if (vn.elm.parentNode === window.pug_router) {
        var _pt = vn.elm.__scope.$_target;
        var _pc = [];
        if (_pt.$title) _pc.push(_pt.$title);
        if (_pt.$titles) _pc = _pc.concat(_pt.$titles);
        documentTitle(_pc);
      }
    }
  },
  destroy: function (vn) {
    if (vn.elm.__scope) scopeDisposal(vn.elm.__scope);
  }
};

// === Route Rendering ===

function buildRouteEntry(pageFn, layoutList, routeKey, pageTemplate) {
  var routeChain = [];

  for (var i = 0; i < layoutList.length; i++) {
    var layoutTemplate = layoutList[i];
    var layoutFn = pug_pages(layoutTemplate);
    if (layoutFn) {
      routeChain.push({ key: "layout:" + layoutTemplate, fn: layoutFn, initFn: layoutFn.init });
    }
  }

  routeChain.push({ key: "route:" + routeKey + ":" + pageTemplate, fn: pageFn, initFn: pageFn.init });

  var first = routeChain[0];
  return h("pug-page", {
    key: first.key,
    $tplFn: first.fn,
    $initFn: first.initFn || null,
    $routeChain: routeChain,
    $routeIndex: 0,
    hook: PUG_PAGE_HOOK
  });
}

function onUrlChange() {
  var url = new URL(window.location.href);
  var path = url.pathname;
  var resolved = resolvePage(path, url.searchParams);
  if (!resolved) return console.info("No Pug page found for path:", path);

  var pageFn = resolved.pageFn;

  // Find the resolved page template key
  var resolvedPath = null;
  var paths = pug_pages.__paths || [];
  for (var i = 0; i < paths.length; i++) {
    if (pug_pages(paths[i]) === pageFn) {
      resolvedPath = paths[i];
      break;
    }
  }
  if (!resolvedPath) resolvedPath = path;

  // Build layout list
  var layoutList = buildLayoutList(resolvedPath);

  var routeKey = url.pathname + url.search;

  var routeEntry = buildRouteEntry(pageFn, layoutList, routeKey, resolvedPath);

  // Patch the router
  if (!window.pug_router) {
    window.pug_router = document.createElement("pug-router");
    document.body.innerHTML = "";
    document.body.appendChild(window.pug_router);
    Object.assign(window.pug_router, { _childVdom: null, $childScopes: [], $_target: window.pug_router, $parentScope: null });
  }

  if (window.pug_router._childVdom) {
    window.pug_router._childVdom = __patch(window.pug_router._childVdom, routeEntry);
  } else {
    window.pug_router.innerHTML = "";
    var mount = document.createElement("div");
    window.pug_router.appendChild(mount);
    window.pug_router._childVdom = __patch(mount, routeEntry);
  }

  initScopedForms(window.pug_router);
}

// === Navigation ===

window.navigateTo = function (url) {
  var targetUrl = new URL(url, window.location.href);
  if (targetUrl.origin !== window.location.origin) {
    window.location.assign(targetUrl.href);
    return;
  }
  history.pushState(null, "", targetUrl.href);
  onUrlChange();
};

function updatePage() {
  if (window.pug_router) {
    var children = window.pug_router.$childScopes;
    for (var i = 0; i < children.length; i++) {
      markMatchingScopes(children[i]);
    }
  }
}

function markMatchingScopes(scope) {
  if (!scope || !scope.$deps) return;
  if (scope.$deps.has("$user") || scope.$deps.has("$page")) {
    markDirty(scope);
  }
  var children = scope.$_target.$childScopes;
  for (var i = 0; i < children.length; i++) {
    markMatchingScopes(children[i]);
  }
}

window.updatePage = updatePage;

// === Component Registration ===

function __resolveComponentTemplate(compName) {
  var tplFn = pug_components(compName);
  if (tplFn) return tplFn;
  tplFn = pug_pages("/components/" + compName);
  if (tplFn) return tplFn;
  var allPaths = (pug_components.__paths || []).concat(pug_pages.__paths || []);
  for (var i = 0; i < allPaths.length; i++) {
    if (allPaths[i].endsWith("/" + compName)) {
      tplFn = pug_pages(allPaths[i]) || pug_components(allPaths[i]);
      if (tplFn) return tplFn;
    }
  }
  return null;
}

function __mountComponent(el) {
  if (el._rendered) return;
  el._rendered = true;
  var tplFn = __resolveComponentTemplate(el.tagName.toLowerCase());
  if (!tplFn) return;
  var initFn = tplFn.init || null;
  var initial = { $titles: [] };
  if (el.$attrs) {
    for (var k in el.$attrs) {
      initial[k] = el.$attrs[k];
    }
  }
  initial.$content = el.$content || null;
  var renderFn = makeRenderFn(el, tplFn);
  el.__scope = createRenderScope(el, null, renderFn, initFn, initial);
  renderFn(el.__scope);
  var parentScope = __findScopeProxy(el.parentElement);
  var parentI18n = parentScope ? parentScope.$_target.$i18n : window.pug_i18n;
  __setupI18n(el.__scope, parentI18n);
  initScopedForms(el);
}

function __updateComponent(el) {
  if (!el.__scope) return;
  if (el.$attrs) {
    for (var k in el.$attrs) {
      el.__scope[k] = el.$attrs[k];
    }
  }
  el.__scope.$content = el.$content || null;
  el.__scope.$renderFn(el.__scope);
}

window.__mountComponent = __mountComponent;
window.__updateComponent = __updateComponent;
window.__mountPage = __mountPage;

// === Boot ===

function __boot() {
  document.body.addEventListener("click", function (event) {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var target = event.target.closest("a");
    if (!target || !target.hasAttribute("href")) return;
    var href = target.getAttribute("href");
    if (!href || href.charAt(0) === "#") { event.preventDefault(); return; }
    if (target.getAttribute("target") === "_blank") return;
    if (target.hasAttribute("download")) return;
    if (target.origin !== window.location.origin) return;
    event.preventDefault();
    window.navigateTo(target.href);
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
      form.__scope.$_target.$dirty = false;
      form.__scope.$renderFn(form.__scope);

      if (href && res && res.ok) {
        window.navigateTo(href);
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
        response.headers.forEach(function (v, k) { detail.headers[k] = v; });
        try { detail.data = await response.json(); } catch (e) { /* ignore */ }
        form.dispatchEvent(new CustomEvent("rest", { detail: detail, bubbles: true }));
        if (href) window.navigateTo(href);
      }
    } catch (e) {
      console.error("Form submission error:", e);
    }
  });

  window.addEventListener("popstate", onUrlChange);

  onUrlChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", __boot);
} else {
  __boot();
}
