import * as Handlebars from "handlebars";

it("should pass", () => {
  const template = Handlebars.compile("{{content}}");
  const resp = template({
    content: "Hello World",
  });
  expect(resp).toBe("Hello World");
});

const TEMPLATE = `{{#each selections}}
{{this}}
{{/each}}{{^selection}}{{content}}{{/selection}}`;

it("repeats", () => {
  const template = Handlebars.compile(TEMPLATE);
  const resp = template({
    content: "Hello World",
    selections: ["a", "b", "c"],
    selection: "d",
  });
  expect(resp).toBe("a\nb\nc\n");
});

it("get the content", () => {
  const template = Handlebars.compile(TEMPLATE);
  const resp = template({
    content: "Hello World",
    selections: [],
    selection: undefined,
  });
  expect(resp).toBe("Hello World");
});
