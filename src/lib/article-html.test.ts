import { describe, expect, it } from "vitest";
import { articleHtml, articlePlainText, wordCount } from "./article-html";

describe("articleHtml", () => {
  it("turns simple markdown into LinkedIn-friendly HTML", () => {
    const md = "# The playbook\n\nMost firms lose trust **early**.\nSecond line.\n\n- One list\n- Two *items*\n\n1. First\n2. Second\n\n> A quote\n\n### Small heading";
    expect(articleHtml(md)).toBe(
      "<h2>The playbook</h2><p>Most firms lose trust <strong>early</strong>.<br>Second line.</p>" +
        "<ul><li>One list</li><li>Two <em>items</em></li></ul><ol><li>First</li><li>Second</li></ol>" +
        "<blockquote>A quote</blockquote><h3>Small heading</h3>",
    );
  });

  it("escapes any HTML in the text and only links http(s)", () => {
    expect(articleHtml('<script>alert("x")</script> [site](https://example.com) [bad](javascript:alert(1))')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; <a href="https://example.com">site</a> [bad](javascript:alert(1))</p>',
    );
  });

  it("leaves snake_case and maths alone", () => {
    expect(articleHtml("use file_name_here and 2*3*4")).toBe("<p>use file_name_here and 2*3*4</p>");
  });

  it("gives plain text and a word count", () => {
    expect(articlePlainText("## Title\n- a **b**\n[x](https://y.z)")).toBe("Title\n• a b\nx (https://y.z)");
    expect(wordCount(" one two\nthree ")).toBe(3);
  });
});
