import {compileDirectory} from '../src/compiler.ts';
import {renderInit, renderPug} from '../src/render.js';
import {DOMParser} from "jsr:@b-fuze/deno-dom";
import {assertMatch} from 'jsr:@std/assert';

Deno.test('compiler.compile', async () => {
    const js = await compileDirectory('test');
    const document = new DOMParser().parseFromString(`<!DOCTYPE html><body></body>`, 'text/html');
    const pugFunction = new Function(js)();
    renderInit(document, pugFunction);
    document.body.innerHTML = renderPug('/index', {title: 'Test Page'});
    assertMatch(document.textContent, /Test/);
});
