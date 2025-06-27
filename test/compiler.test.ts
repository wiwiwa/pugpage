import {compileDirectory} from '../src/compiler.ts';
import {assertMatch} from 'jsr:@std/assert';
import {JSDOM} from 'npm:jsdom';

// Add global declaration for pug_pages with type unknown
declare global {
  var pug_pages: unknown;
}

Deno.test('compiler.compile', async () => {
    const js = await compileDirectory('test/pages');
    globalThis.pug_pages = new Function(js+"\nreturn pug_pages;")();

    const dom = new JSDOM('', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    dom.window.fetch = async (url:string) => {
      const file = import.meta.resolve(url)
      return { json: async () => JSON.parse(Deno.readTextFileSync(new URL(file).pathname)) };
    };
    await import('../src/render/render.js');

    const document = dom.window.document;
    assertMatch(document.body.textContent, /Hello/);

    const showUser = document.querySelector('a.showUser');
    showUser?.click();
    assertMatch(document.body.textContent, /1000/);
});
