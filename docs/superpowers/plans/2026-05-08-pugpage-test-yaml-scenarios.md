# PugPage Test YAML Scenarios

## Summary

Redesign `pugpage test` YAML around scenarios, named test cases, and ordered action groups. This gives readable reports, supports nested organization, and allows multi-phase flows without introducing a full scripting DSL.

## YAML Shape

```yaml
auth:
  redirect anonymous user:
    - goto: /
      url: /login
      text: Login
      has: "button[type=submit]"

  wrong then correct password:
    - goto: /login
      fill:
        - .password: wrong
      click: "button[type=submit]"
      text: Invalid credentials
      has: p.error

    - fill:
        - .password: demo
      click: "button[type=submit]"
      wait: a.logout
      url: /
      text: Logout

user:
  show user:
    - goto: /user/1000
      wait: li
      text: demo
      has: [li, style]
```

## Structure Rules

- Top-level keys are scenarios, such as `auth`, `user`, or `dashboard`.
- Nested map keys are group names or test case names.
- A test case is any key whose value is a list.
- Each test case list contains one or more action groups.
- Each action group is an object.
- Action groups run in list order.
- If an action group omits `goto`, it continues from the current page state.
- Report names use the full path, for example `auth > wrong then correct password`.

## Action Group Keys

- `goto` — navigate to a route or absolute URL.
- `fill` — ordered list of one-selector maps, for example `- .password: demo`.
- `select` — ordered list of one-selector maps.
- `click` — selector string or selector array. Use this for buttons, links, checkboxes, and radios.
- `wait` — selector string or selector array; waits for visible CSS selectors.
- `waitText` — text string or text array; waits for body text.
- `url` — final route assertion after redirects/navigation.
- `status` — main document response status assertion.
- `text` — text string or text array that must appear in the page body.
- `has` — CSS selector string or selector array that must exist.
- `no` — CSS selector string or selector array that must not exist.
- `timeout` — timeout in milliseconds for this action group.

Inside one action group, keys run in fixed order: `goto`, `fill`, `select`, `click`, `wait`, `waitText`, then assertions.

## Notes

- Selectors with YAML-special characters should be quoted, for example `"input[name=password]"`.
- Checkbox/radio state can be asserted with CSS selectors, for example `has: "input[name=enabled]:checked"` or `no: "input[name=disabled]:checked"`.
- Assertions auto-wait up to the action group timeout.
- The format intentionally avoids free-form JavaScript in v1.
- `README.md` should document this as the end-user test format.
