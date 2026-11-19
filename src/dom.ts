/** A small element builder. Text is always set as text, never as HTML. */

type Child = Node | string | null | undefined | false;

export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Readonly<Record<string, string>> = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    // An empty value means no attribute, so callers can pass a conditional class.
    if (value !== "") node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
