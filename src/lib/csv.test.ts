import { describe, expect, it } from "vitest";
import { parseCsv, rowsFromCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, commas in quotes and blank lines", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n\nd,e,f\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });
});

describe("rowsFromCsv", () => {
  it("reads LinkedIn's Connections export, notes and all", () => {
    const text = [
      "Notes:",
      '"When exporting your connection data, you may notice that some of the email addresses are missing."',
      "",
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      "Sarah,Chen,https://www.linkedin.com/in/sarahchen,,Bright Agency,Ops Director,12 Sep 2026",
    ].join("\n");
    expect(rowsFromCsv(text)).toEqual([
      { name: "Sarah Chen", linkedinUrl: "https://www.linkedin.com/in/sarahchen", company: "Bright Agency", jobTitle: "Ops Director" },
    ]);
  });

  it("reads a sheet with a Name column", () => {
    expect(rowsFromCsv("Name,Title,Company\nTom Whitfield,CEO,Pixel Forge")).toEqual([
      { name: "Tom Whitfield", linkedinUrl: "", company: "Pixel Forge", jobTitle: "CEO" },
    ]);
  });

  it("reads plain rows in order when there is no header", () => {
    expect(rowsFromCsv("Amir Hassan,https://linkedin.com/in/amir,Tidewater,Founder")).toEqual([
      { name: "Amir Hassan", linkedinUrl: "https://linkedin.com/in/amir", company: "Tidewater", jobTitle: "Founder" },
    ]);
  });
});
